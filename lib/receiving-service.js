import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextGrnNumber, nextPutawayNumber } from '@/lib/doc-numbering'

// ============================================================
// Receiving Service
// ------------------------------------------------------------
// Status flow:  DRAFT -> RECEIVING -> WAITING_PUTAWAY -> COMPLETED
//                             \-> CANCELLED (DRAFT/RECEIVING only)
// ============================================================

export const RECEIVING_INCLUDE = {
  warehouse: { select: { id: true, code: true, name: true } },
  stagingLocation: { select: { id: true, code: true, type: true } },
  lines: {
    include: {
      item: { include: { uom: { select: { code: true } } } },
      serials: { select: { id: true, serialNo: true, status: true } },
      putawayTasks: { select: { id: true, taskNumber: true, status: true, toLocationId: true } },
    },
  },
}

async function resolveStagingLocation(warehouseId, stagingLocationId, tx = prisma) {
  if (stagingLocationId) {
    const loc = await tx.location.findFirst({
      where: { id: stagingLocationId, isActive: true, type: 'STAGING', zone: { warehouseId } },
    })
    if (!loc) throw new Error('Staging location invalid, inactive, or not in this warehouse')
    return loc
  }
  // Auto-pick first active STAGING location in this warehouse
  const loc = await tx.location.findFirst({
    where: { isActive: true, type: 'STAGING', zone: { warehouseId } },
    orderBy: { code: 'asc' },
  })
  if (!loc) throw new Error('No active STAGING location found for this warehouse')
  return loc
}

// ---------- CREATE DRAFT ----------
export async function createReceivingDraft({ user, body }) {
  if (!body.warehouseId) throw new Error('warehouseId is required')
  const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } })
  if (!warehouse) throw new Error('Warehouse not found')

  const lines = Array.isArray(body.lines) ? body.lines : []

  return await prisma.$transaction(async (tx) => {
    const staging = await resolveStagingLocation(warehouse.id, body.stagingLocationId, tx)
    const grnNumber = await nextGrnNumber(warehouse.code, tx)

    const receiving = await tx.receiving.create({
      data: {
        grnNumber,
        warehouseId: warehouse.id,
        stagingLocationId: staging.id,
        supplier: body.supplier || null,
        refDocument: body.refDocument || null,
        remarks: body.remarks || null,
        status: 'DRAFT',
        createdById: user.id,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            expectedQty: Number(l.expectedQty) || 0,
            receivedQty: 0,
            unitCost: Number(l.unitCost) || 0,
            batchNo: l.batchNo || null,
            remarks: l.remarks || null,
          })),
        },
      },
      include: RECEIVING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'CREATE',
      module: 'RECEIVING',
      entityType: 'Receiving',
      entityId: receiving.id,
      description: `Created receiving draft ${receiving.grnNumber} for ${warehouse.code}`,
      after: { grnNumber, warehouseId: warehouse.id, stagingLocationId: staging.id, supplier: receiving.supplier, refDocument: receiving.refDocument, lineCount: lines.length },
    })

    return receiving
  })
}

// ---------- UPDATE DRAFT (lines + header fields) ----------
export async function updateReceivingDraft({ user, id, body }) {
  const before = await prisma.receiving.findUnique({ where: { id }, include: { lines: true } })
  if (!before) throw new Error('Receiving not found')
  if (before.status !== 'DRAFT') throw new Error('Only DRAFT receiving can be edited (current status: ' + before.status + ')')

  return await prisma.$transaction(async (tx) => {
    let stagingLocationId = before.stagingLocationId
    if (body.stagingLocationId && body.stagingLocationId !== before.stagingLocationId) {
      const staging = await resolveStagingLocation(before.warehouseId, body.stagingLocationId, tx)
      stagingLocationId = staging.id
    }

    // Replace lines wholesale if provided (draft-only)
    if (Array.isArray(body.lines)) {
      await tx.receivingLine.deleteMany({ where: { receivingId: id } })
      for (const l of body.lines) {
        await tx.receivingLine.create({
          data: {
            receivingId: id,
            itemId: l.itemId,
            expectedQty: Number(l.expectedQty) || 0,
            receivedQty: Number(l.receivedQty) || 0,
            unitCost: Number(l.unitCost) || 0,
            batchNo: l.batchNo || null,
            remarks: l.remarks || null,
          },
        })
      }
    }

    const updated = await tx.receiving.update({
      where: { id },
      data: {
        supplier: body.supplier ?? before.supplier,
        refDocument: body.refDocument ?? before.refDocument,
        remarks: body.remarks ?? before.remarks,
        stagingLocationId,
      },
      include: RECEIVING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'RECEIVING',
      entityType: 'Receiving',
      entityId: id,
      description: `Updated receiving draft ${updated.grnNumber}`,
      before: { supplier: before.supplier, refDocument: before.refDocument, lineCount: before.lines.length },
      after: { supplier: updated.supplier, refDocument: updated.refDocument, lineCount: updated.lines.length },
    })
    return updated
  })
}

// ---------- START RECEIVING (DRAFT -> RECEIVING) ----------
export async function startReceiving({ user, id }) {
  const before = await prisma.receiving.findUnique({ where: { id }, include: { lines: true } })
  if (!before) throw new Error('Receiving not found')
  if (before.status !== 'DRAFT') throw new Error('Only DRAFT can be started (current: ' + before.status + ')')
  if (!before.lines.length) throw new Error('Cannot start a receiving with no lines')

  const updated = await prisma.receiving.update({
    where: { id },
    data: { status: 'RECEIVING' },
    include: RECEIVING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'RECEIVING',
    entityType: 'Receiving',
    entityId: id,
    description: `Started receiving ${updated.grnNumber} (DRAFT -> RECEIVING)`,
    before: { status: 'DRAFT' },
    after: { status: 'RECEIVING' },
  })
  return updated
}

// ---------- POST RECEIVING (RECEIVING -> WAITING_PUTAWAY) ----------
// Business rules on post:
//   - Every line must have receivedQty > 0
//   - Serial-tracked items: number of unique serials must equal receivedQty
//   - No duplicate serials within transaction or across the DB
//   - Creates Stock Ledger entries into STAGING location
//   - Creates FIFO layers at STAGING (will be moved by Putaway)
//   - Creates SerialNumber records with status=IN_STAGING
//   - Generates one PutawayTask per line
//   - Full audit trail
export async function postReceiving({ user, id, body }) {
  const linesBody = Array.isArray(body?.lines) ? body.lines : [] // [{ lineId, receivedQty, serials?: [] }]

  const receiving = await prisma.receiving.findUnique({
    where: { id },
    include: { warehouse: true, stagingLocation: true, lines: { include: { item: true } } },
  })
  if (!receiving) throw new Error('Receiving not found')
  if (receiving.status !== 'RECEIVING') throw new Error('Only RECEIVING documents can be posted (current: ' + receiving.status + ')')

  // Merge posted qty and serials by line id
  const bodyByLine = Object.fromEntries(linesBody.map((l) => [l.lineId, l]))

  // ----- Validations (pre-flight) -----
  const allSerials = []
  const perLineData = []
  for (const line of receiving.lines) {
    const b = bodyByLine[line.id] || {}
    const receivedQty = Number(b.receivedQty ?? line.receivedQty) || 0
    if (receivedQty <= 0) throw new Error(`Line ${line.item.sku}: receivedQty must be > 0`)

    const serials = Array.isArray(b.serials) ? b.serials.map((s) => String(s).trim()).filter(Boolean) : []

    if (line.item.serialTracked) {
      if (serials.length !== receivedQty) {
        throw new Error(`Line ${line.item.sku}: serial-tracked item requires exactly ${receivedQty} serials (got ${serials.length})`)
      }
      const dupInLine = serials.find((s, i) => serials.indexOf(s) !== i)
      if (dupInLine) throw new Error(`Line ${line.item.sku}: duplicate serial '${dupInLine}' within line`)
    } else if (serials.length && serials.length !== receivedQty) {
      throw new Error(`Line ${line.item.sku}: if serials provided, count must equal receivedQty`)
    }

    allSerials.push(...serials.map((s) => ({ serialNo: s, itemId: line.itemId })))
    perLineData.push({ line, receivedQty, serials })
  }

  // Cross-line duplicate check in this posting
  const seen = new Set()
  for (const s of allSerials) {
    if (seen.has(s.serialNo)) throw new Error(`Duplicate serial '${s.serialNo}' within this receiving`)
    seen.add(s.serialNo)
  }
  // Global duplicate check against DB
  if (allSerials.length) {
    const existing = await prisma.serialNumber.findMany({
      where: { serialNo: { in: allSerials.map((s) => s.serialNo) } },
      select: { serialNo: true },
    })
    if (existing.length) throw new Error(`Serial(s) already exist in system: ${existing.map((e) => e.serialNo).join(', ')}`)
  }

  // ----- Post in a single transaction -----
  const result = await prisma.$transaction(async (tx) => {
    for (const { line, receivedQty, serials } of perLineData) {
      // Update line receivedQty
      await tx.receivingLine.update({ where: { id: line.id }, data: { receivedQty } })

      // Stock Ledger entry into staging
      await tx.stockLedger.create({
        data: {
          itemId: line.itemId,
          locationId: receiving.stagingLocationId,
          txnType: 'RECEIVING',
          qty: receivedQty,
          unitCost: line.unitCost,
          refType: 'RECEIVING',
          refId: receiving.id,
          refNumber: receiving.grnNumber,
          remarks: `Received into staging ${receiving.stagingLocation.code}`,
          userId: user.id,
        },
      })

      // FIFO layer at staging (to be moved on putaway)
      await tx.fifoLayer.create({
        data: {
          itemId: line.itemId,
          locationId: receiving.stagingLocationId,
          refNumber: receiving.grnNumber,
          qtyReceived: receivedQty,
          qtyRemaining: receivedQty,
          unitCost: line.unitCost,
        },
      })

      // Serial numbers
      for (const serialNo of serials) {
        await tx.serialNumber.create({
          data: {
            serialNo,
            itemId: line.itemId,
            receivingLineId: line.id,
            currentLocationId: receiving.stagingLocationId,
            status: 'IN_STAGING',
          },
        })
      }

      // Putaway task (one per line)
      const taskNumber = await nextPutawayNumber(receiving.warehouse.code, tx)
      await tx.putawayTask.create({
        data: {
          taskNumber,
          receivingId: receiving.id,
          receivingLineId: line.id,
          itemId: line.itemId,
          qty: receivedQty,
          fromLocationId: receiving.stagingLocationId,
          status: 'OPEN',
          createdById: user.id,
          remarks: `Auto-generated from ${receiving.grnNumber}`,
        },
      })
    }

    const posted = await tx.receiving.update({
      where: { id: receiving.id },
      data: {
        status: 'WAITING_PUTAWAY',
        postedById: user.id,
        postedAt: new Date(),
      },
      include: RECEIVING_INCLUDE,
    })
    return posted
  })

  await logAudit({
    user,
    action: 'POST',
    module: 'RECEIVING',
    entityType: 'Receiving',
    entityId: id,
    description: `Posted receiving ${receiving.grnNumber} to staging ${receiving.stagingLocation.code} (RECEIVING -> WAITING_PUTAWAY)`,
    after: {
      grnNumber: receiving.grnNumber,
      stagingLocation: receiving.stagingLocation.code,
      lines: perLineData.map((p) => ({ sku: p.line.item.sku, qty: p.receivedQty, serials: p.serials.length })),
    },
  })

  return result
}

// ---------- CANCEL (only DRAFT or RECEIVING) ----------
export async function cancelReceiving({ user, id, reason }) {
  const before = await prisma.receiving.findUnique({ where: { id } })
  if (!before) throw new Error('Receiving not found')
  if (!['DRAFT', 'RECEIVING'].includes(before.status)) {
    throw new Error('Only DRAFT or RECEIVING can be cancelled (current: ' + before.status + ')')
  }

  const updated = await prisma.receiving.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      remarks: reason ? `[CANCELLED] ${reason} | ${before.remarks || ''}` : before.remarks,
    },
    include: RECEIVING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'RECEIVING',
    entityType: 'Receiving',
    entityId: id,
    description: `Cancelled receiving ${updated.grnNumber} (reason: ${reason || 'not specified'}). GRN number remains reserved.`,
    before: { status: before.status },
    after: { status: 'CANCELLED' },
  })
  return updated
}

export async function listReceivings({ status, warehouseId, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status
  if (warehouseId) where.warehouseId = warehouseId

  return prisma.receiving.findMany({
    where,
    include: {
      warehouse: { select: { code: true, name: true } },
      stagingLocation: { select: { code: true } },
      lines: { select: { id: true, receivedQty: true, expectedQty: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 500),
  })
}

export async function getReceiving(id) {
  return prisma.receiving.findUnique({ where: { id }, include: RECEIVING_INCLUDE })
}
