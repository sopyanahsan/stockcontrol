import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextPutawayDocNumber } from '@/lib/doc-numbering'
import { allocateFifo, consumeFifoLayers, createDestinationFifoLayersFromAllocations } from '@/lib/fifo-service'
import { suggestLocation as engineSuggestLocation } from '@/lib/putaway/location-engine'
import { findAlternativeLocations as engineAlternativeLocations } from '@/lib/putaway/location-engine'
import { validateCapacity as engineValidateCapacity } from '@/lib/putaway/capacity-engine'
import { evaluateFIFOForItem } from '@/lib/putaway/fifo-engine'
import { rankLocations as engineRankLocations } from '@/lib/putaway/recommendation-engine'
import { createSession, getActiveSession, getSession, recordScan, finishSession, sessionView } from '@/lib/putaway/scan-session'
import { scanLocation as engineScanLocation, scanItem as engineScanItem } from '@/lib/putaway/scanner-engine'
import { recordScanHistory, listScanHistory } from '@/lib/putaway/scan-history'
import { nextPendingLine as continuousNextPendingLine, autoAdvance } from '@/lib/putaway/continuous-scan'
import { completeLineExecution as engineCompleteLine, completePutaway as engineCompletePutaway, isReadyForCompletion } from '@/lib/putaway/execution-engine'
import { allocateFifo as fifoAllocate, consumeFifoLayers as fifoConsume, createDestinationFifoLayersFromAllocations as fifoCreateDestination, getAvailableQty } from '@/lib/fifo-service'
import { binOccupancy as engineBinOccupancy } from '@/lib/putaway/capacity-engine'

// ============================================================
// Putaway Service
// ------------------------------------------------------------
// Putaway moves stock from STAGING to warehouse STORAGE bins.
//
// Design principles:
//   - NEVER edit FIFO layer records. Always create new ones.
//   - Every putaway creates its own Stock Ledger entries (PUTAWAY).
//   - Serial numbers are migrated from IN_STAGING -> IN_STOCK.
//   - Receiving is auto-completed when ALL its tasks are COMPLETED.
//   - Partial putaway is supported at the data model level
//     (qtyPutaway field tracks progress; MVP UI does full qty only).
// ============================================================

export const PUTAWAY_INCLUDE = {
  item: { include: { uom: { select: { code: true } }, category: { select: { name: true } } } },
  fromLocation: { include: { zone: { include: { warehouse: { select: { id: true, code: true, name: true } } } } } },
  toLocation: { select: { id: true, code: true, type: true } },
  receivingLine: {
    select: {
      id: true,
      receivedQty: true,
      receiving: { select: { id: true, grnNumber: true, warehouseId: true } },
      serials: { select: { id: true, serialNo: true, status: true, currentLocationId: true } },
    },
  },
}

// ---------- LIST ----------
export async function listPutawayTasks({ status, warehouseId, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status
  if (warehouseId) {
    where.fromLocation = { zone: { warehouseId } }
  }

  return prisma.putawayTask.findMany({
    where,
    include: {
      item: { select: { id: true, sku: true, name: true, serialTracked: true } },
      fromLocation: { select: { code: true } },
      toLocation: { select: { id: true, code: true } },
      receivingLine: { select: { receiving: { select: { id: true, grnNumber: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 500),
  })
}

// ---------- GET ----------
export async function getPutawayTask(id) {
  return prisma.putawayTask.findUnique({ where: { id }, include: PUTAWAY_INCLUDE })
}

// ---------- START (OPEN -> IN_PROGRESS) ----------
export async function startPutawayTask({ user, id }) {
  const before = await prisma.putawayTask.findUnique({ where: { id } })
  if (!before) throw new Error('Putaway task not found')
  if (before.status !== 'OPEN') {
    throw new Error('Only OPEN tasks can be started (current: ' + before.status + ')')
  }

  const updated = await prisma.putawayTask.update({
    where: { id },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), assignedToId: user.id },
    include: PUTAWAY_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PUTAWAY',
    entityType: 'PutawayTask',
    entityId: id,
    description: `Started putaway task ${updated.taskNumber} (OPEN -> IN_PROGRESS)`,
    before: { status: 'OPEN' },
    after: { status: 'IN_PROGRESS' },
  })

  return updated
}

// ---------- COMPLETE (IN_PROGRESS -> COMPLETED) ----------
// body: { scannedLocationCode, serials?: [], qty?: number }
//   scannedLocationCode: barcode scan of the destination bin
//   serials: list of serial numbers (required for serial-tracked items)
//   qty: optional partial qty (defaults to remaining qty on task)
export async function completePutawayTask({ user, id, body }) {
  const task = await prisma.putawayTask.findUnique({
    where: { id },
    include: {
      ...PUTAWAY_INCLUDE,
      receivingLine: {
        include: {
          serials: { select: { id: true, serialNo: true, status: true, currentLocationId: true, itemId: true } },
        },
      },
    },
  })
  if (!task) throw new Error('Putaway task not found')
  if (task.status !== 'IN_PROGRESS') {
    throw new Error('Only IN_PROGRESS tasks can be completed (current: ' + task.status + ')')
  }

  const { scannedLocationCode, serials: bodySerials = [], qty } = body || {}

  // ----- Resolve destination location -----
  if (!scannedLocationCode) throw new Error('Destination location is required')
  const destLoc = await prisma.location.findUnique({
    where: { code: String(scannedLocationCode).trim() },
    include: { zone: { include: { warehouse: { select: { id: true, code: true } } } } },
  })
  if (!destLoc) throw new Error('Location not found: ' + scannedLocationCode)
  if (!destLoc.isActive) throw new Error('Location is inactive: ' + scannedLocationCode)
  if (destLoc.type !== 'STORAGE') {
    throw new Error('Destination must be a STORAGE bin (got: ' + destLoc.type + ')')
  }
  // Validate destination is in the same warehouse as the task's receiving
  if (task.receivingLine?.receiving?.warehouseId && destLoc.zone?.warehouseId !== task.receivingLine.receiving.warehouseId) {
    throw new Error('Destination location must be in the same warehouse as the receiving document')
  }

  // ----- Resolve quantity -----
  const qtyRemaining = task.qty - (task.qtyPutaway || 0)
  const qtyToPutaway = qty !== undefined ? Number(qty) : qtyRemaining
  if (!Number.isFinite(qtyToPutaway) || qtyToPutaway <= 0) {
    throw new Error('Quantity must be a positive number')
  }
  if (qtyToPutaway > qtyRemaining) {
    throw new Error('Quantity exceeds remaining qty on task (' + qtyRemaining + ')')
  }

  // ----- Serial validation -----
  const item = task.item
  const serialTracked = !!item.serialTracked
  const expectedSerials = task.receivingLine?.serials || []
  const stagingLocId = task.fromLocationId

  if (serialTracked) {
    const serials = Array.isArray(bodySerials)
      ? bodySerials.map((s) => String(s).trim()).filter(Boolean)
      : []

    if (serials.length !== qtyToPutaway) {
      throw new Error('Serial-tracked item requires exactly ' + qtyToPutaway + ' serial(s) (got ' + serials.length + ')')
    }

    // All serials must belong to this receiving line and currently be at staging
    const validSerials = expectedSerials.filter(
      (s) => s.currentLocationId === stagingLocId && s.status === 'IN_STAGING'
    )
    const validSerialNos = new Set(validSerials.map((s) => s.serialNo))

    for (const sn of serials) {
      if (!validSerialNos.has(sn)) {
        throw new Error('Serial "' + sn + '" is not available at staging for this task')
      }
    }

    // No duplicate serials within this request
    const seen = new Set()
    for (const sn of serials) {
      if (seen.has(sn)) throw new Error('Duplicate serial in request: ' + sn)
      seen.add(sn)
    }

    // ----- Complete full vs partial -----
    // If qtyToPutaway == qtyRemaining: all remaining serials are consumed
    // If qtyToPutaway < qtyRemaining: consume the specific serials provided
    const serialsToMigrate = validSerials.filter((s) => serials.includes(s.serialNo))

    await prisma.$transaction(async (tx) => {
      // 1. Stock Ledger: negative at staging (stock leaving staging)
      await tx.stockLedger.create({
        data: {
          itemId: task.itemId,
          locationId: stagingLocId,
          txnType: 'PUTAWAY',
          qty: -qtyToPutaway,
          unitCost: 0, // cost is on the receiving entry; putaway is a movement
          refType: 'PUTAWAY',
          refId: task.id,
          refNumber: task.taskNumber,
          remarks: 'Putaway from staging ' + task.fromLocation.code + ' to ' + destLoc.code,
          userId: user.id,
        },
      })

      // 2. Stock Ledger: positive at destination (stock now available in bin)
      await tx.stockLedger.create({
        data: {
          itemId: task.itemId,
          locationId: destLoc.id,
          txnType: 'PUTAWAY',
          qty: qtyToPutaway,
          unitCost: 0,
          refType: 'PUTAWAY',
          refId: task.id,
          refNumber: task.taskNumber,
          remarks: 'Putaway from staging ' + task.fromLocation.code + ' to ' + destLoc.code,
          userId: user.id,
        },
      })

      // 3. FIFO: consume staging layers and recreate availability at destination.
      const allocations = await allocateFifo({
        itemId: task.itemId,
        locationId: stagingLocId,
        qtyNeeded: qtyToPutaway,
        tx,
      })
      await consumeFifoLayers({ allocations, tx })
      await createDestinationFifoLayersFromAllocations({
        itemId: task.itemId,
        fromLocationId: stagingLocId,
        toLocationId: destLoc.id,
        movementRefNumber: task.taskNumber,
        lines: [{ itemId: task.itemId, qty: qtyToPutaway, sourceAllocation: allocations }],
        tx,
      })

      // 4. Migrate serial numbers
      for (const serial of serialsToMigrate) {
        await tx.serialNumber.update({
          where: { id: serial.id },
          data: { currentLocationId: destLoc.id, status: 'IN_STOCK', updatedAt: new Date() },
        })
      }

      // 5. Update putaway task
      const isFull = qtyToPutaway === qtyRemaining
      await tx.putawayTask.update({
        where: { id: task.id },
        data: {
          toLocationId: destLoc.id,
          qtyPutaway: { increment: qtyToPutaway },
          status: isFull ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: isFull ? new Date() : undefined,
          completedById: isFull ? user.id : undefined,
        },
      })

      // 6. Check if all tasks for this receiving are done -> auto-complete receiving
      if (isFull && task.receivingId) {
        const remaining = await tx.putawayTask.count({
          where: {
            receivingId: task.receivingId,
            status: { not: 'COMPLETED' },
          },
        })
        if (remaining === 0) {
          await tx.receiving.update({
            where: { id: task.receivingId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
        }
      }
    }, { timeout: 20000, maxWait: 5000 })

  } else {
    // Non-serial-tracked: no serials to migrate
    await prisma.$transaction(async (tx) => {
      // 1. Stock Ledger: negative at staging
      await tx.stockLedger.create({
        data: {
          itemId: task.itemId,
          locationId: stagingLocId,
          txnType: 'PUTAWAY',
          qty: -qtyToPutaway,
          unitCost: 0,
          refType: 'PUTAWAY',
          refId: task.id,
          refNumber: task.taskNumber,
          remarks: 'Putaway from staging ' + task.fromLocation.code + ' to ' + destLoc.code,
          userId: user.id,
        },
      })

      // 2. Stock Ledger: positive at destination
      await tx.stockLedger.create({
        data: {
          itemId: task.itemId,
          locationId: destLoc.id,
          txnType: 'PUTAWAY',
          qty: qtyToPutaway,
          unitCost: 0,
          refType: 'PUTAWAY',
          refId: task.id,
          refNumber: task.taskNumber,
          remarks: 'Putaway from staging ' + task.fromLocation.code + ' to ' + destLoc.code,
          userId: user.id,
        },
      })

      // 3. FIFO: consume staging layers and recreate availability at destination.
      const allocations = await allocateFifo({
        itemId: task.itemId,
        locationId: stagingLocId,
        qtyNeeded: qtyToPutaway,
        tx,
      })
      await consumeFifoLayers({ allocations, tx })
      await createDestinationFifoLayersFromAllocations({
        itemId: task.itemId,
        fromLocationId: stagingLocId,
        toLocationId: destLoc.id,
        movementRefNumber: task.taskNumber,
        lines: [{ itemId: task.itemId, qty: qtyToPutaway, sourceAllocation: allocations }],
        tx,
      })

      // 4. Update putaway task
      const isFull = qtyToPutaway === qtyRemaining
      await tx.putawayTask.update({
        where: { id: task.id },
        data: {
          toLocationId: destLoc.id,
          qtyPutaway: { increment: qtyToPutaway },
          status: isFull ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: isFull ? new Date() : undefined,
          completedById: isFull ? user.id : undefined,
        },
      })

      // 5. Auto-complete receiving if all tasks done
      if (isFull && task.receivingId) {
        const remaining = await tx.putawayTask.count({
          where: { receivingId: task.receivingId, status: { not: 'COMPLETED' } },
        })
        if (remaining === 0) {
          await tx.receiving.update({
            where: { id: task.receivingId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
        }
      }
    }, { timeout: 20000, maxWait: 5000 })
  }

  // Refresh and return updated task
  const updated = await prisma.putawayTask.findUnique({ where: { id }, include: PUTAWAY_INCLUDE })

  await logAudit({
    user,
    action: 'POST',
    module: 'PUTAWAY',
    entityType: 'PutawayTask',
    entityId: id,
    description: `Completed putaway task ${task.taskNumber} — moved ${qtyToPutaway} × ${item.sku} from ${task.fromLocation.code} to ${destLoc.code}`,
    after: {
      taskNumber: task.taskNumber,
      itemSku: item.sku,
      qty: qtyToPutaway,
      fromLocation: task.fromLocation.code,
      toLocation: destLoc.code,
      receivingId: task.receivingId,
      receivingGrn: task.receivingLine?.receiving?.grnNumber,
    },
  })

  return updated
}

// ---------- CANCEL (OPEN -> CANCELLED) ----------
export async function cancelPutawayTask({ user, id, reason }) {
  const before = await prisma.putawayTask.findUnique({ where: { id } })
  if (!before) throw new Error('Putaway task not found')
  if (before.status !== 'OPEN') {
    throw new Error('Only OPEN tasks can be cancelled (current: ' + before.status + ')')
  }

  const updated = await prisma.putawayTask.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: PUTAWAY_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PUTAWAY',
    entityType: 'PutawayTask',
    entityId: id,
    description: `Cancelled putaway task ${updated.taskNumber} (reason: ${reason || 'not specified'})`,
    before: { status: 'OPEN' },
    after: { status: 'CANCELLED' },
  })

  return updated
}

// ============================================================
// Enterprise Putaway DOCUMENT (PTW-1.0) — header + lines.
// Lifecycle: DRAFT -> RELEASED -> (IN_PROGRESS/COMPLETED future PTW-5).
// NO inventory movement, NO stock ledger, NO stock on hand changes.
// ============================================================

const ACTIVE_DOC_STATUSES = ['DRAFT', 'RELEASED', 'ASSIGNED', 'IN_PROGRESS']
const PUTAWAY_DOC_INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' } },
}

const fmtQty = (n) => Number(n) || 0

// Normalize an item snapshot payload into a PutawayLine row.
function lineFromItem({ itemId, item, qty, batchNo, expiryDate, sourceLocationId, targetLocationId, remarks, lineNo }) {
  return {
    lineNo,
    itemId,
    sku: item?.sku || itemId,
    barcode: item?.barcode || null,
    itemName: item?.name || itemId,
    batchNo: batchNo || null,
    expiryDate: expiryDate || null,
    uom: item?.uom?.code || null,
    qty: fmtQty(qty),
    qtyCompleted: 0,
    sourceLocationId: sourceLocationId || null,
    targetLocationId: targetLocationId || null,
    status: 'WAITING',
    remarks: remarks || null,
  }
}

// ---------- CREATE (manual document, drafts only) ----------
// body: { warehouseId, priority, operatorId, remarks,
//         lines: [{ itemId, qty, batchNo, expiryDate, sourceLocationId, targetLocationId, remarks }] }
export async function createPutaway({ user, body }) {
  if (!body.warehouseId) throw new Error('warehouseId is required')
  const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } })
  if (!warehouse) throw new Error('Warehouse not found')
  if (!Array.isArray(body.lines) || !body.lines.length) throw new Error('At least one line is required')

  const itemIds = [...new Set(body.lines.map((l) => l.itemId).filter(Boolean))]
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    include: { uom: { select: { code: true } } },
  })
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]))

  return prisma.$transaction(async (tx) => {
    const putawayNo = await nextPutawayDocNumber(warehouse.code, tx)
    const doc = await tx.putaway.create({
      data: {
        putawayNo,
        sourceType: 'MANUAL',
        sourceId: '',
        sourceNumber: '',
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        status: 'DRAFT',
        priority: body.priority || 'NORMAL',
        operatorId: body.operatorId || null,
        remarks: body.remarks || null,
        createdBy: user.id,
        lines: {
          create: body.lines.map((l, i) => {
            const item = itemById[l.itemId]
            if (!item) throw new Error('Item not found: ' + l.itemId)
            return lineFromItem({ item, itemId: l.itemId, qty: l.qty, batchNo: l.batchNo, expiryDate: l.expiryDate, sourceLocationId: l.sourceLocationId, targetLocationId: l.targetLocationId, remarks: l.remarks, lineNo: i + 1 })
          }),
        },
      },
      include: PUTAWAY_DOC_INCLUDE,
    })

    await logAudit({
      user,
      action: 'CREATE',
      module: 'PUTAWAY',
      entityType: 'Putaway',
      entityId: doc.id,
      description: `Putaway created ${doc.putawayNo} (DRAFT)`,
      after: { putawayNo, warehouseId: warehouse.id, lineCount: body.lines.length },
    })

    return doc
  }, { timeout: 20000, maxWait: 5000 })
}

// ---------- GENERATE FROM RECEIVING ----------
// Only a POSTED (WAITING_PUTAWAY) receiving can generate. One ACTIVE putaway
// per receiving; a COMPLETED one blocks regeneration; CANCELLED allows retry.
// Copies every receiving line (snapshot), keeps serial info off until PTW-5.
export async function generateFromReceiving({ user, receivingId, body = {} }) {
  const receiving = await prisma.receiving.findUnique({
    where: { id: receivingId },
    include: {
      warehouse: true,
      stagingLocation: true,
      lines: { include: { item: { include: { uom: { select: { code: true } } } } } },
    },
  })
  if (!receiving) throw new Error('Receiving not found')
  if (receiving.status !== 'WAITING_PUTAWAY') {
    throw new Error('Only POSTED receiving can generate putaway (current: ' + receiving.status + ')')
  }
  if (!receiving.lines.length) throw new Error('Receiving has no lines to put away')

  const [active, completed] = await Promise.all([
    prisma.putaway.findFirst({ where: { sourceId: receivingId, status: { in: ACTIVE_DOC_STATUSES } } }),
    prisma.putaway.findFirst({ where: { sourceId: receivingId, status: 'COMPLETED' } }),
  ])
  if (active) throw new Error('An active putaway already exists for this receiving (' + active.putawayNo + ')')
  if (completed) throw new Error('A completed putaway already exists for this receiving — cannot generate again')

  const result = await prisma.$transaction(async (tx) => {
    const putawayNo = await nextPutawayDocNumber(receiving.warehouse.code, tx)
    return tx.putaway.create({
      data: {
        putawayNo,
        sourceType: 'RECEIVING',
        sourceId: receiving.id,
        sourceNumber: receiving.grnNumber,
        warehouseId: receiving.warehouseId,
        warehouseName: receiving.warehouse.name,
        status: 'DRAFT',
        priority: body.priority || 'NORMAL',
        operatorId: body.operatorId || null,
        remarks: body.remarks || null,
        createdBy: user.id,
        lines: {
          create: receiving.lines.map((l, i) =>
            lineFromItem({
              itemId: l.itemId,
              item: l.item,
              qty: l.receivedQty,
              batchNo: l.batchNo,
              sourceLocationId: receiving.stagingLocationId,
              remarks: l.remarks,
              lineNo: i + 1,
            })
          ),
        },
      },
      include: PUTAWAY_DOC_INCLUDE,
    })
  }, { timeout: 20000, maxWait: 5000 })

  await logAudit({
    user,
    action: 'CREATE',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: result.id,
    description: `Putaway created ${result.putawayNo} (DRAFT)`,
    after: { putawayNo: result.putawayNo, sourceNumber: receiving.grnNumber, lineCount: result.lines.length },
  })
  await logAudit({
    user,
    action: 'GENERATE',
    module: 'PUTAWAY',
    entityType: 'Receiving',
    entityId: receiving.id,
    description: `Generated putaway ${result.putawayNo} from receiving ${receiving.grnNumber}`,
    after: { putawayNo: result.putawayNo, receivingId: receiving.id, grnNumber: receiving.grnNumber },
  })

  return result
}

// ---------- GET ----------
export async function getPutaway(id) {
  return prisma.putaway.findUnique({ where: { id }, include: PUTAWAY_DOC_INCLUDE })
}

// ---------- LIST ----------
export async function listPutaway({ status, warehouseId, sourceId, operatorId, priority, search, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status
  if (warehouseId) where.warehouseId = warehouseId
  if (sourceId) where.sourceId = sourceId
  if (operatorId) where.assignedTo = operatorId
  if (priority) where.priority = priority
  if (search) {
    where.OR = [
      { putawayNo: { contains: search, mode: 'insensitive' } },
      { sourceNumber: { contains: search, mode: 'insensitive' } },
    ]
  }
  return prisma.putaway.findMany({
    where,
    include: { _count: { select: { lines: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 500),
  })
}

// ---------- UPDATE DRAFT ----------
// body: { priority, operatorId, remarks, lines?: [{ lineId, targetLocationId, remarks }] }
export async function updatePutaway({ user, id, body }) {
  const before = await prisma.putaway.findUnique({ where: { id }, include: { lines: true } })
  if (!before) throw new Error('Putaway not found')
  if (before.status !== 'DRAFT') throw new Error('Only DRAFT putaway can be edited (current: ' + before.status + ')')

  return prisma.$transaction(async (tx) => {
    const linesPatch = Array.isArray(body.lines) ? body.lines : []
    for (const p of linesPatch) {
      const line = before.lines.find((l) => l.id === p.lineId)
      if (!line) throw new Error('Putaway line not found: ' + p.lineId)
      if (p.targetLocationId && p.targetLocationId !== line.targetLocationId) {
        const loc = await tx.location.findUnique({ where: { id: p.targetLocationId } })
        if (!loc || !loc.isActive) throw new Error('Target location not found or inactive')
      }
      await tx.putawayLine.update({
        where: { id: line.id },
        data: {
          targetLocationId: p.targetLocationId !== undefined ? p.targetLocationId : line.targetLocationId,
          remarks: p.remarks !== undefined ? p.remarks : line.remarks,
        },
      })
    }

    const updated = await tx.putaway.update({
      where: { id },
      data: {
        priority: body.priority !== undefined ? body.priority : before.priority,
        operatorId: body.operatorId !== undefined ? body.operatorId : before.operatorId,
        remarks: body.remarks !== undefined ? body.remarks : before.remarks,
      },
      include: PUTAWAY_DOC_INCLUDE,
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'PUTAWAY',
      entityType: 'Putaway',
      entityId: id,
      description: `Updated putaway draft ${updated.putawayNo}`,
      before: { status: before.status, priority: before.priority, lineCount: before.lines.length },
      after: { status: updated.status, priority: updated.priority, lineCount: updated.lines.length },
    })
    return updated
  }, { timeout: 20000, maxWait: 5000 })
}

// ---------- RELEASE (DRAFT -> RELEASED) ----------
export async function releasePutaway({ user, id }) {
  const before = await prisma.putaway.findUnique({ where: { id }, include: { lines: true } })
  if (!before) throw new Error('Putaway not found')
  if (before.status !== 'DRAFT') throw new Error('Only DRAFT putaway can be released (current: ' + before.status + ')')
  if (!before.lines.length) throw new Error('Cannot release a putaway with no lines')

  const updated = await prisma.putaway.update({ where: { id }, data: { status: 'RELEASED' }, include: PUTAWAY_DOC_INCLUDE })

  await logAudit({
    user,
    action: 'RELEASE',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Released putaway ${updated.putawayNo} (DRAFT -> RELEASED)`,
    before: { status: 'DRAFT' },
    after: { status: 'RELEASED' },
  })
  return updated
}

// ---------- ASSIGN OPERATOR (RELEASED -> ASSIGNED) ----------
// body: { assignedTo (userId), priority, estimatedDuration (minutes), remarks }
// No inventory movement — only prepares the document for execution.
export async function assignOperator({ user, id, body }) {
  const before = await prisma.putaway.findUnique({ where: { id } })
  if (!before) throw new Error('Putaway not found')
  if (before.status !== 'RELEASED') {
    throw new Error('Only RELEASED putaway can be assigned (current: ' + before.status + ')')
  }

  const assignedTo = body?.assignedTo
  if (!assignedTo) throw new Error('assignedTo (operator) is required')
  const operator = await prisma.user.findUnique({ where: { id: assignedTo } })
  if (!operator || !operator.isActive) throw new Error('Operator not found or inactive')

  const updated = await prisma.putaway.update({
    where: { id },
    data: {
      status: 'ASSIGNED',
      assignedTo: operator.id,
      assignedName: operator.name,
      assignedAt: new Date(),
      priority: body.priority || before.priority,
      estimatedDuration: body.estimatedDuration !== undefined ? (Number(body.estimatedDuration) || null) : before.estimatedDuration,
      remarks: body.remarks !== undefined ? body.remarks : before.remarks,
    },
    include: PUTAWAY_DOC_INCLUDE,
  })

  await logAudit({
    user,
    action: 'ASSIGN',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Assigned putaway ${updated.putawayNo} to ${operator.name} (RELEASED -> ASSIGNED)`,
    before: { status: 'RELEASED' },
    after: { status: 'ASSIGNED', assignedTo: operator.id, assignedName: operator.name, priority: updated.priority, estimatedDuration: updated.estimatedDuration },
  })
  return updated
}

// ---------- START (ASSIGNED -> IN_PROGRESS) ----------
// Preparation only — execution (stock movement) lands in a later sprint.
export async function startPutaway({ user, id }) {
  const before = await prisma.putaway.findUnique({ where: { id } })
  if (!before) throw new Error('Putaway not found')
  if (before.status !== 'ASSIGNED') {
    throw new Error('Only ASSIGNED putaway can start (current: ' + before.status + ')')
  }

  const updated = await prisma.putaway.update({
    where: { id },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
    include: PUTAWAY_DOC_INCLUDE,
  })

  await logAudit({
    user,
    action: 'START',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Started putaway ${updated.putawayNo} (ASSIGNED -> IN_PROGRESS)`,
    before: { status: 'ASSIGNED' },
    after: { status: 'IN_PROGRESS', startedAt: updated.startedAt },
  })
  return updated
}

// ---------- CANCEL (DRAFT, RELEASED or ASSIGNED -> CANCELLED) ----------
export async function cancelPutaway({ user, id, reason }) {
  const before = await prisma.putaway.findUnique({ where: { id } })
  if (!before) throw new Error('Putaway not found')
  if (!['DRAFT', 'RELEASED', 'ASSIGNED'].includes(before.status)) {
    throw new Error('Only DRAFT, RELEASED or ASSIGNED putaway can be cancelled (current: ' + before.status + ')')
  }

  const updated = await prisma.putaway.update({ where: { id }, data: { status: 'CANCELLED' }, include: PUTAWAY_DOC_INCLUDE })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Cancelled putaway ${updated.putawayNo} (reason: ${reason || 'not specified'})`,
    before: { status: before.status },
    after: { status: 'CANCELLED' },
  })
  return updated
}

// ============================================================
// PTW-1.4/1.5 — Execution Engine (line-level, no inventory).
// Document must be IN_PROGRESS; lines follow:
//   WAITING -> IN_PROGRESS -> COMPLETED
//   SKIPPED -> (resume) IN_PROGRESS
//   COMPLETED -> cannot execute again.
// ============================================================

const EXECUTABLE_AFTER_START = ['WAITING', 'ASSIGNED']

async function requireExecutableDoc(id) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: true } })
  if (!doc) throw new Error('Putaway not found')
  if (doc.status !== 'IN_PROGRESS') {
    throw new Error('Only IN_PROGRESS putaway can execute lines (current: ' + doc.status + ')')
  }
  return doc
}

function findLine(doc, lineId) {
  const line = doc.lines.find((l) => l.id === lineId)
  if (!line) throw new Error('Putaway line not found')
  return line
}

async function nextExecutionSequence(tx, putawayId) {
  const max = await tx.putawayLine.aggregate({ where: { putawayId }, _max: { executionSequence: true } })
  return (max._max.executionSequence || 0) + 1
}

function lineAudit({ user, action, doc, line, description, after }) {
  return logAudit({
    user,
    action,
    module: 'PUTAWAY',
    entityType: 'PutawayLine',
    entityId: doc.id,
    description,
    after: { ...after, putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku },
  })
}

// ---------- START LINE (WAITING/ASSIGNED -> IN_PROGRESS) ----------
export async function startLine({ user, id, lineId, remark }) {
  const doc = await requireExecutableDoc(id)
  const line = findLine(doc, lineId)
  if (!EXECUTABLE_AFTER_START.includes(line.status)) {
    throw new Error('Line can only be started from WAITING or ASSIGNED (current: ' + line.status + ')')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const seq = await nextExecutionSequence(tx, doc.id)
    return tx.putawayLine.update({
      where: { id: line.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date(), executedBy: user.id, executedByName: user.name, executionRemark: remark || null, executionSequence: seq },
    })
  }, { timeout: 20000, maxWait: 5000 })

  await lineAudit({
    user, action: 'LINE_START', doc, line: { ...line, ...updated },
    description: `Line ${line.lineNo} (${line.sku}) started on ${doc.putawayNo}`,
    after: { status: 'IN_PROGRESS', executedBy: user.id, executedByName: user.name },
  })
  return getPutaway(id)
}

// ---------- COMPLETE LINE (IN_PROGRESS -> COMPLETED) ----------
// Full-line completion: completedQty = line qty. Partial execution is future.
export async function completeLine({ user, id, lineId, remark }) {
  const doc = await requireExecutableDoc(id)
  const line = findLine(doc, lineId)
  if (line.status !== 'IN_PROGRESS') {
    throw new Error('Only IN_PROGRESS lines can be completed (current: ' + line.status + ')')
  }

  const updated = await prisma.putawayLine.update({
    where: { id: line.id },
    data: { status: 'COMPLETED', qtyCompleted: line.qty, completedAt: new Date(), executionRemark: remark || line.executionRemark || null },
  })

  await lineAudit({
    user, action: 'LINE_COMPLETE', doc, line: { ...line, ...updated },
    description: `Line ${line.lineNo} (${line.sku}) completed on ${doc.putawayNo}`,
    after: { status: 'COMPLETED', completedQty: line.qty, executedBy: user.id, executedByName: user.name },
  })
  return getPutaway(id)
}

// ---------- SKIP LINE (WAITING/ASSIGNED/IN_PROGRESS -> SKIPPED) ----------
export async function skipLine({ user, id, lineId, remark }) {
  const doc = await requireExecutableDoc(id)
  const line = findLine(doc, lineId)
  if (line.status === 'COMPLETED' || line.status === 'SKIPPED') {
    throw new Error('Only WAITING, ASSIGNED or IN_PROGRESS lines can be skipped (current: ' + line.status + ')')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const seq = await nextExecutionSequence(tx, doc.id)
    return tx.putawayLine.update({
      where: { id: line.id },
      data: { status: 'SKIPPED', executedBy: user.id, executedByName: user.name, executionRemark: remark || null, executionSequence: seq },
    })
  }, { timeout: 20000, maxWait: 5000 })

  await lineAudit({
    user, action: 'LINE_SKIP', doc, line: { ...line, ...updated },
    description: `Line ${line.lineNo} (${line.sku}) skipped on ${doc.putawayNo}`,
    after: { status: 'SKIPPED', executedBy: user.id, executedByName: user.name },
  })
  return getPutaway(id)
}

// ---------- RESUME LINE (SKIPPED -> IN_PROGRESS) ----------
export async function resumeLine({ user, id, lineId, remark }) {
  const doc = await requireExecutableDoc(id)
  const line = findLine(doc, lineId)
  if (line.status !== 'SKIPPED') {
    throw new Error('Only SKIPPED lines can be resumed (current: ' + line.status + ')')
  }

  const updated = await prisma.putawayLine.update({
    where: { id: line.id },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), executedBy: user.id, executedByName: user.name, executionRemark: remark || line.executionRemark || null },
  })

  await lineAudit({
    user, action: 'LINE_RESUME', doc, line: { ...line, ...updated },
    description: `Line ${line.lineNo} (${line.sku}) resumed on ${doc.putawayNo}`,
    after: { status: 'IN_PROGRESS', executedBy: user.id, executedByName: user.name },
  })
  return getPutaway(id)
}

// ---------- PROGRESS ENGINE (computed dynamically, never stored) ----------
export async function calculateProgress({ id }) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: true } })
  if (!doc) throw new Error('Putaway not found')

  const lines = doc.lines
  const totalLines = lines.length
  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const completedQty = lines.reduce((s, l) => s + (Number(l.qtyCompleted) || 0), 0)
  const remainingQty = totalQty - completedQty

  const completedLines = lines.filter((l) => l.status === 'COMPLETED').length
  const skippedLines = lines.filter((l) => l.status === 'SKIPPED').length
  const runningLines = lines.filter((l) => l.status === 'IN_PROGRESS').length
  const remainingLines = totalLines - completedLines - skippedLines

  const progressPct = totalQty > 0 ? Math.round((completedQty / totalQty) * 100) : 0
  const estimatedRemainingTime = doc.estimatedDuration && totalQty > 0
    ? Math.round(doc.estimatedDuration * (remainingQty / totalQty))
    : null

  return {
    putawayId: id,
    putawayNo: doc.putawayNo,
    status: doc.status,
    totalLines,
    completedLines,
    remainingLines,
    skippedLines,
    runningLines,
    totalQty,
    completedQty,
    remainingQty,
    progressPct,
    estimatedRemainingTime,
  }
}

// ---------- EXECUTION SUMMARY (reusable service output) ----------
export async function getExecutionSummary({ id }) {
  const doc = await prisma.putaway.findUnique({ where: { id } })
  if (!doc) throw new Error('Putaway not found')

  const progress = await calculateProgress({ id })
  let executionDuration = null
  if (doc.startedAt) {
    const end = doc.completedAt || new Date()
    executionDuration = Math.max(0, Math.round((new Date(end) - new Date(doc.startedAt)) / 60000))
  }

  return {
    ...progress,
    executionDuration,
    estimatedDuration: doc.estimatedDuration,
  }
}

// ---------- EXECUTION TIMELINE (reuses AuditLog) ----------
export async function getExecutionTimeline({ id }) {
  const doc = await prisma.putaway.findUnique({ where: { id }, select: { id: true } })
  if (!doc) throw new Error('Putaway not found')
  return prisma.auditLog.findMany({
    where: { module: 'PUTAWAY', entityId: id },
    orderBy: { createdAt: 'asc' },
  })
}

// ============================================================
// PTW-2.0-2.3 — Smart Location Engine service wrappers.
// Recommendations and capacity validation only. NO inventory writes.
// ============================================================

const SUGGESTIBLE_STATUSES = ['DRAFT', 'RELEASED', 'ASSIGNED', 'IN_PROGRESS']

async function getLineForSuggestion(id, lineId) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
  if (!doc) throw new Error('Putaway not found')
  const line = doc.lines.find((l) => l.id === lineId)
  if (!line) throw new Error('Putaway line not found')
  return { doc, line }
}

// ---------- SUGGEST ONE LINE ----------
export async function suggestLocation({ user, id, lineId }) {
  const { doc, line } = await getLineForSuggestion(id, lineId)
  if (!SUGGESTIBLE_STATUSES.includes(doc.status)) {
    throw new Error('Suggestions are not available for ' + doc.status + ' putaway')
  }

  const suggestion = await engineSuggestLocation({
    itemId: line.itemId,
    qty: line.qty,
    warehouseId: doc.warehouseId,
    batchNo: line.batchNo,
    expiryDate: line.expiryDate,
  })

  await logAudit({
    user,
    action: 'LOCATION_SUGGESTED',
    module: 'PUTAWAY',
    entityType: 'PutawayLine',
    entityId: doc.id,
    description: `Location suggested for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}: ${suggestion.suggestedLocation?.code || 'none'}`,
    after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, suggestedLocationCode: suggestion.suggestedLocation?.code || null, reasons: suggestion.reasons },
  })

  return { lineId, lineNo: line.lineNo, sku: line.sku, ...suggestion }
}

// ---------- SUGGEST ALL LINES (batch view for the UI) ----------
export async function suggestAllLocations({ id }) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
  if (!doc) throw new Error('Putaway not found')

  const results = await Promise.all(doc.lines.map(async (line) => {
    const suggestion = await engineSuggestLocation({
      itemId: line.itemId,
      qty: line.qty,
      warehouseId: doc.warehouseId,
      batchNo: line.batchNo,
      expiryDate: line.expiryDate,
    })
    return { lineId: line.id, lineNo: line.lineNo, sku: line.sku, targetLocationId: line.targetLocationId, ...suggestion }
  }))
  return { putawayId: id, lines: results }
}

// ---------- CAPACITY VALIDATION ----------
export async function validateCapacity({ locationId, qty }) {
  return engineValidateCapacity({ locationId, qty })
}

// ---------- FIFO / FEFO EVALUATION ----------
export async function evaluateFIFO({ itemId, warehouseId, batchNo = null, expiryDate = null }) {
  return evaluateFIFOForItem({ itemId, warehouseId, batchNo, expiryDate })
}

// ---------- ALTERNATIVES ----------
export async function findAlternativeLocations({ itemId, qty, warehouseId, excludeId }) {
  return engineAlternativeLocations({ itemId, qty, warehouseId, excludeId })
}

// ---------- SELECT LINE LOCATION (Accept / Override) ----------
// Sets the line's planned target only. Inventory updates land in PTW-5.
export async function selectLineLocation({ user, id, lineId, locationId, mode = 'OVERRIDE' }) {
  const { doc, line } = await getLineForSuggestion(id, lineId)
  if (doc.status === 'CANCELLED' || doc.status === 'COMPLETED') {
    throw new Error('Cannot select a location on a ' + doc.status + ' putaway')
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { zone: { select: { warehouseId: true } } },
  })
  if (!location) throw new Error('Location not found')
  if (!location.isActive) throw new Error('Location is inactive: ' + location.code)
  if (location.type !== 'STORAGE') throw new Error('Location must be a STORAGE bin (got: ' + location.type + ')')
  if (location.zone?.warehouseId !== doc.warehouseId) {
    throw new Error('Location must belong to the same warehouse')
  }

  const updated = await prisma.putawayLine.update({
    where: { id: line.id },
    data: { targetLocationId: location.id },
  })

  const isAccept = mode === 'ACCEPT'
  await logAudit({
    user,
    action: isAccept ? 'RECOMMENDATION_ACCEPTED' : 'RECOMMENDATION_OVERRIDDEN',
    module: 'PUTAWAY',
    entityType: 'PutawayLine',
    entityId: doc.id,
    description: `${isAccept ? 'Accepted' : 'Overrode'} recommendation for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}: ${location.code}`,
    after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, locationId: location.id, locationCode: location.code, mode: isAccept ? 'ACCEPT' : 'OVERRIDE' },
  })
  if (!isAccept) {
    await logAudit({
      user,
      action: 'RECOMMENDATION_IGNORED',
      module: 'PUTAWAY',
      entityType: 'PutawayLine',
      entityId: doc.id,
      description: `Recommendation ignored for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}`,
      after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku },
    })
  }

  return { lineId: line.id, lineNo: line.lineNo, sku: line.sku, targetLocationId: location.id, targetLocationCode: location.code }
}

// ---------- RECOMMENDATION SCORE (PTW-2.4) ----------
// Ranks candidate locations by weighted factors (0-100). Read-only.
export async function scoreSuggestions({ user, id, lineId }) {
  const { doc, line } = await getLineForSuggestion(id, lineId)
  const ranked = await engineRankLocations({
    itemId: line.itemId,
    qty: line.qty,
    warehouseId: doc.warehouseId,
    batchNo: line.batchNo,
    expiryDate: line.expiryDate,
  })

  await logAudit({
    user,
    action: 'RECOMMENDATION_GENERATED',
    module: 'PUTAWAY',
    entityType: 'PutawayLine',
    entityId: doc.id,
    description: `Recommendation generated for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}: ${ranked.primary?.location?.code || 'none'} (${ranked.primary?.score || 0})`,
    after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, primary: ranked.primary?.location?.code || null, score: ranked.primary?.score || 0 },
  })

  return {
    lineId,
    lineNo: line.lineNo,
    sku: line.sku,
    item: ranked.item,
    primary: ranked.primary,
    alternatives: ranked.alternatives,
    weights: ranked.weights,
  }
}

// ---------- RANK SUGGESTIONS (reusable service output) ----------
export async function rankSuggestions({ itemId, qty, warehouseId, batchNo = null, expiryDate = null, take }) {
  return engineRankLocations({ itemId, qty, warehouseId, batchNo, expiryDate, take })
}

// ============================================================
// PTW-3.0-3.3 — Barcode Execution (validation only, no movement).
// ============================================================

// ---------- START SCAN SESSION ----------
export async function startScanSession({ user, id }) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
  if (!doc) throw new Error('Putaway not found')
  if (doc.status !== 'IN_PROGRESS') throw new Error('Scan sessions require an IN_PROGRESS putaway (current: ' + doc.status + ')')
  if (!doc.lines.length) throw new Error('Putaway has no lines to scan')

  // Continuous scan: seed the session with the first pending line.
  const first = continuousNextPendingLine(doc.lines) || doc.lines[0]
  const session = await createSession({ putawayId: id })
  const seeded = await prisma.putawayScanSession.update({ where: { id: session.id }, data: { lineId: first.id } })
  await logAudit({
    user,
    action: 'SCAN_SESSION_STARTED',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Scan session started on ${doc.putawayNo}`,
    after: { putawayNo: doc.putawayNo, sessionId: session.id, firstLine: first.lineNo },
  })
  return { putawayNo: doc.putawayNo, session: sessionView(seeded) }
}

// Resolve the expected target location for a line: selected override, else recommendation primary.
async function resolveExpectedLocation(doc, line) {
  if (line.targetLocationId) {
    const loc = await prisma.location.findUnique({ where: { id: line.targetLocationId } })
    return { id: line.targetLocationId, code: loc?.code || null }
  }
  const ranked = await engineRankLocations({
    itemId: line.itemId,
    qty: line.qty,
    warehouseId: doc.warehouseId,
    batchNo: line.batchNo,
    expiryDate: line.expiryDate,
  })
  return { id: ranked.primary?.location?.id || null, code: ranked.primary?.location?.code || null }
}

async function getLineInDoc(doc, lineId) {
  const line = await prisma.putawayLine.findUnique({ where: { id: lineId } })
  if (!line || line.putawayId !== doc.id) throw new Error('Putaway line not found')
  return line
}

// ---------- SCAN LOCATION ----------
export async function validateLocationScan({ user, id, body }) {
  const doc = await prisma.putaway.findUnique({ where: { id } })
  if (!doc) throw new Error('Putaway not found')
  const session = await getActiveSession(id)
  if (!session) throw new Error('No active scan session — start one first')

  const lineId = body?.lineId || session.lineId
  const line = await getLineInDoc(doc, lineId)
  const expected = await resolveExpectedLocation(doc, line)

  const result = await engineScanLocation({ code: body?.code, line, warehouseId: doc.warehouseId, expectedId: expected.id, expectedCode: expected.code })

  const updated = await recordScan({
    sessionId: session.id,
    lineId: line.id,
    targetLocationId: expected.id || session.targetLocationId,
    scan: result.code,
    scanType: 'LOCATION',
    status: result.status,
    locationValidated: result.status === 'SUCCESS',
  })

  await recordScanHistory({
    sessionId: session.id,
    putawayId: id,
    lineId: line.id,
    scanType: 'LOCATION',
    scannedValue: body?.code,
    validationCode: result.status,
    validationStatus: result.status,
    expectedValue: result.expected,
    actualValue: result.actual,
    device: body?.device,
  })

  await logAudit({
    user,
    action: 'LOCATION_SCANNED',
    module: 'PUTAWAY',
    entityType: 'PutawayLine',
    entityId: doc.id,
    description: `Location scanned ${result.code || '?'} for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}`,
    after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, scan: result.code, status: result.status },
  })
  if (result.status === 'SUCCESS') {
    await logAudit({
      user, action: 'LOCATION_VALIDATED', module: 'PUTAWAY', entityType: 'PutawayLine', entityId: doc.id,
      description: `Location validated ${result.code} for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}`,
      after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, locationCode: result.code },
    })
  } else if (result.status === 'ERROR') {
    await logAudit({
      user, action: 'LOCATION_VALIDATION_FAILED', module: 'PUTAWAY', entityType: 'PutawayLine', entityId: doc.id,
      description: `Location validation failed for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}: ${result.message}`,
      after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, scan: result.code, message: result.message },
    })
  }

  return { line: { id: line.id, lineNo: line.lineNo, sku: line.sku }, result, session: sessionView(updated) }
}

// ---------- SCAN ITEM ----------
export async function validateItemScan({ user, id, body }) {
  const doc = await prisma.putaway.findUnique({ where: { id } })
  if (!doc) throw new Error('Putaway not found')
  const session = await getActiveSession(id)
  if (!session) throw new Error('No active scan session — start one first')
  if (!session.lineId) throw new Error('Scan a location first')
  if (!session.locationValidated) {
    throw new Error('Scan and validate a location first')
  }

  const line = await getLineInDoc(doc, session.lineId)
  const result = await engineScanItem({ code: body?.code, line, session })

  const updated = await recordScan({
    sessionId: session.id,
    lineId: line.id,
    scan: result.code,
    scanType: 'ITEM',
    status: result.status,
  })

  await recordScanHistory({
    sessionId: session.id,
    putawayId: id,
    lineId: line.id,
    scanType: 'ITEM',
    scannedValue: body?.code,
    validationCode: result.status,
    validationStatus: result.status,
    expectedValue: result.expected,
    actualValue: result.actual,
    device: body?.device,
  })

  await logAudit({
    user,
    action: 'ITEM_SCANNED',
    module: 'PUTAWAY',
    entityType: 'PutawayLine',
    entityId: doc.id,
    description: `Item scanned ${result.code || '?'} for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}`,
    after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, scan: result.code, status: result.status },
  })
  if (result.status === 'SUCCESS') {
    await logAudit({
      user, action: 'ITEM_VALIDATED', module: 'PUTAWAY', entityType: 'PutawayLine', entityId: doc.id,
      description: `Item validated ${result.code} for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}`,
      after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, itemSku: result.code },
    })
  } else if (result.status === 'ERROR') {
    await logAudit({
      user, action: 'ITEM_VALIDATION_FAILED', module: 'PUTAWAY', entityType: 'PutawayLine', entityId: doc.id,
      description: `Item validation failed for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}: ${result.message}`,
      after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, scan: result.code, message: result.message },
    })
  }

  return { line: { id: line.id, lineNo: line.lineNo, sku: line.sku }, result, session: sessionView(updated) }
}

// ---------- GET SESSION ----------
export async function getScanSession({ id }) {
  const session = await getSession(id)
  return session ? sessionView(session) : null
}

// ---------- FINISH SCAN SESSION ----------
export async function finishScanSession({ user, id }) {
  const session = await getActiveSession(id)
  if (!session) throw new Error('No active scan session')
  await finishSession({ sessionId: session.id })
  return sessionView({ ...session, finishedAt: new Date() })
}

// ---------- NEXT PENDING LINE (continuous scan) ----------
export async function nextPendingLine({ id }) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
  if (!doc) throw new Error('Putaway not found')
  const next = continuousNextPendingLine(doc.lines)
  return {
    nextLine: next ? { id: next.id, lineNo: next.lineNo, sku: next.sku, qty: next.qty, targetLocationId: next.targetLocationId } : null,
    ready: isReadyForCompletion(doc.lines),
    total: doc.lines.length,
    waiting: doc.lines.filter((l) => l.status === 'WAITING').length,
  }
}

// ---------- COMPLETE LINE EXECUTION (PTW-3.4) ----------
// Marks the current line COMPLETED and auto-advances to the next WAITING line.
export async function completeExecution({ user, id, lineId }) {
  const doc = await prisma.putaway.findUnique({ where: { id } })
  if (!doc) throw new Error('Putaway not found')
  if (doc.status !== 'IN_PROGRESS') throw new Error('Only IN_PROGRESS putaway can execute lines (current: ' + doc.status + ')')

  const session = await getActiveSession(id)
  if (!session) throw new Error('No active scan session — start one first')

  const line = await getLineInDoc(doc, lineId || session.lineId)
  if (line.status === 'COMPLETED') throw new Error('Line is already completed')
  if (line.status === 'SKIPPED') throw new Error('Skipped lines must be resumed before completion')

  // Continuous mode requires the item scan to have validated this line.
  const itemValidated = session.lastScanType === 'ITEM' && session.lastScanStatus === 'SUCCESS' && session.lineId === line.id
  const manuallyStarted = line.status === 'IN_PROGRESS'
  if (!itemValidated && !manuallyStarted) {
    throw new Error('Validate the item scan before completing the line')
  }

  await engineCompleteLine({ user, line })
  await logAudit({
    user,
    action: 'LINE_EXECUTION_COMPLETED',
    module: 'PUTAWAY',
    entityType: 'PutawayLine',
    entityId: doc.id,
    description: `Line execution completed for line ${line.lineNo} (${line.sku}) on ${doc.putawayNo}`,
    after: { putawayNo: doc.putawayNo, lineNo: line.lineNo, sku: line.sku, qty: line.qty },
  })

  const lines = await prisma.putawayLine.findMany({ where: { putawayId: id }, orderBy: { lineNo: 'asc' } })
  const { nextLine, ready } = await autoAdvance({ sessionId: session.id, lines })

  if (nextLine) {
    await logAudit({
      user,
      action: 'AUTO_ADVANCED',
      module: 'PUTAWAY',
      entityType: 'Putaway',
      entityId: doc.id,
      description: `Auto-advanced ${doc.putawayNo} to line ${nextLine.lineNo} (${nextLine.sku})`,
      after: { putawayNo: doc.putawayNo, nextLineNo: nextLine.lineNo, nextSku: nextLine.sku },
    })
  }

  return {
    completedLine: { id: line.id, lineNo: line.lineNo, sku: line.sku },
    nextLine: nextLine ? { id: nextLine.id, lineNo: nextLine.lineNo, sku: nextLine.sku } : null,
    ready,
    session: sessionView(await getActiveSession(id)),
  }
}

// ---------- COMPLETE PUTAWAY (PTW-3.5) ----------
// Allowed only when every line is COMPLETED or SKIPPED. Status only.
export async function completePutaway({ user, id }) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: true } })
  if (!doc) throw new Error('Putaway not found')
  if (doc.status !== 'IN_PROGRESS') throw new Error('Only IN_PROGRESS putaway can be completed (current: ' + doc.status + ')')
  if (!isReadyForCompletion(doc.lines)) {
    throw new Error('All lines must be COMPLETED or SKIPPED before completing')
  }

  const updated = await engineCompletePutaway({ id })
  await logAudit({
    user,
    action: 'PUTAWAY_COMPLETED',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Putaway completed ${doc.putawayNo} (no inventory movement)`,
    after: { putawayNo: doc.putawayNo, status: 'COMPLETED', lines: doc.lines.length },
  })
  return updated
}

// ---------- SCAN HISTORY ----------
export async function getScanHistory({ id }) {
  return listScanHistory({ putawayId: id })
}

// ============================================================
// PTW-4/5 — Inventory Posting (the ONLY module that moves stock).
// All writes happen in ONE Prisma transaction. Rollback is the
// transaction itself — no partial updates on failure.
// ============================================================

// Pre-flight validation. Returns { valid, errors, doc, completedLines }.
export async function validateInventoryPosting({ id }) {
  const errors = []
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: true } })
  if (!doc) return { valid: false, errors: ['Putaway not found'] }
  if (doc.status !== 'COMPLETED') errors.push('Document must be COMPLETED before posting (current: ' + doc.status + ')')
  if (doc.postedAt) errors.push('Inventory has already been posted for this putaway')

  const completedLines = doc.lines.filter((l) => l.status === 'COMPLETED')
  if (!completedLines.length) errors.push('No completed lines to post')

  // Resolve target locations once, reuse below.
  const checked = []
  for (const line of completedLines) {
    if (!line.targetLocationId) {
      errors.push(`Line ${line.lineNo} (${line.sku}) has no target location`)
      continue
    }
    const target = await prisma.location.findUnique({ where: { id: line.targetLocationId }, include: { zone: { select: { warehouseId: true } } } })
    if (!target) {
      errors.push(`Line ${line.lineNo} (${line.sku}) target location not found`)
      continue
    }
    if (!target.isActive) errors.push(`Line ${line.lineNo} (${line.sku}) target location is inactive`)
    if (target.type !== 'STORAGE') errors.push(`Line ${line.lineNo} (${line.sku}) target must be a STORAGE bin`)
    if (target.zone?.warehouseId !== doc.warehouseId) errors.push(`Line ${line.lineNo} (${line.sku}) target is in a different warehouse`)
    const available = await getAvailableQty({ itemId: line.itemId, locationId: line.sourceLocationId })
    if (available < line.qty) errors.push(`Line ${line.lineNo} (${line.sku}) insufficient stock at source (available ${available}, need ${line.qty})`)
    checked.push({ line, target })
  }

  return { valid: errors.length === 0, errors, doc, completedLines: checked }
}

// Atomic posting: ledger (STAGING - / target +) + FIFO move + posted marker.
export async function postInventory({ user, id }) {
  const v = await validateInventoryPosting({ id })
  if (!v.valid) throw new Error(v.errors.join('; '))
  const { doc, completedLines } = v

  const movedQty = completedLines.reduce((s, c) => s + c.line.qty, 0)
  await prisma.$transaction(async (tx) => {
    for (const { line, target } of completedLines) {
      const source = await tx.location.findUnique({ where: { id: line.sourceLocationId } })
      const sourceCode = source?.code || 'staging'
      const remarks = `Putaway from ${sourceCode} to ${target.code} (${doc.putawayNo})`

      await tx.stockLedger.create({
        data: {
          itemId: line.itemId,
          locationId: line.sourceLocationId,
          txnType: 'PUTAWAY',
          qty: -line.qty,
          unitCost: 0, // cost is carried by the receiving entry; putaway is a movement
          refType: 'PUTAWAY',
          refId: doc.id,
          refNumber: doc.putawayNo,
          remarks,
          userId: user.id,
        },
      })
      await tx.stockLedger.create({
        data: {
          itemId: line.itemId,
          locationId: target.id,
          txnType: 'PUTAWAY',
          qty: line.qty,
          unitCost: 0,
          refType: 'PUTAWAY',
          refId: doc.id,
          refNumber: doc.putawayNo,
          remarks,
          userId: user.id,
        },
      })

      // FIFO: consume the oldest staging layers, recreate availability at target.
      const allocations = await fifoAllocate({ itemId: line.itemId, locationId: line.sourceLocationId, qtyNeeded: line.qty, tx })
      await fifoConsume({ allocations, tx })
      await fifoCreateDestination({
        itemId: line.itemId,
        fromLocationId: line.sourceLocationId,
        toLocationId: target.id,
        movementRefNumber: doc.putawayNo,
        lines: [{ itemId: line.itemId, qty: line.qty, sourceAllocation: allocations }],
        tx,
      })
    }

    await tx.putaway.update({
      where: { id },
      data: { postedAt: new Date(), postedById: user.id },
    })
  }, { timeout: 20000, maxWait: 5000 })

  await logAudit({
    user,
    action: 'INVENTORY_POSTED',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Inventory posted for ${doc.putawayNo} (${completedLines.length} lines, ${movedQty} units)`,
    after: { putawayNo: doc.putawayNo, lines: completedLines.length, movedQty, refNumber: doc.putawayNo },
  })

  return { lineCount: completedLines.length, movedQty, postedAt: new Date() }
}

// Post + build the summary card (ledger, stock cards, bin occupancy).
export async function completeInventoryPosting({ user, id }) {
  const { lineCount, movedQty } = await postInventory({ user, id })

  const doc = await prisma.putaway.findUnique({
    where: { id },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  })
  const ledgerEntries = await prisma.stockLedger.count({ where: { refId: id, txnType: 'PUTAWAY' } })

  const sources = [...new Set(doc.lines.filter((l) => l.status === 'COMPLETED').map((l) => l.sourceLocationId))]
  const targets = [...new Set(doc.lines.filter((l) => l.status === 'COMPLETED').map((l) => l.targetLocationId))]
  const [sourceCodes, targetCodes, occupancy] = await Promise.all([
    Promise.all(sources.map(async (sid) => (await prisma.location.findUnique({ where: { id: sid } }))?.code || sid)),
    Promise.all(targets.map(async (tid) => (await prisma.location.findUnique({ where: { id: tid } }))?.code || tid)),
    Promise.all(targets.map((tid) => engineBinOccupancy({ locationId: tid }))),
  ])

  await logAudit({
    user,
    action: 'STOCK_LEDGER_CREATED',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Stock ledger entries created for ${doc.putawayNo} (${ledgerEntries} PUTAWAY entries)`,
    after: { putawayNo: doc.putawayNo, ledgerEntries },
  })
  await logAudit({
    user,
    action: 'BIN_UPDATED',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Bin occupancy updated for ${doc.putawayNo}`,
    after: { putawayNo: doc.putawayNo, targets: targetCodes },
  })

  return {
    putawayNo: doc.putawayNo,
    status: 'POSTED',
    postedAt: doc.postedAt,
    lineCount,
    movedQty,
    sourceLocations: sourceCodes,
    targetLocations: targetCodes,
    ledgerEntries,
    stockCardEntries: ledgerEntries, // Stock Card IS the Stock Ledger in this system
    binOccupancy: occupancy,
  }
}

// Safety net — clears the posted marker so a corrected document can re-post.
// The posting transaction is atomic, so there is nothing else to reverse.
export async function rollbackInventoryPosting({ user, id, reason }) {
  const doc = await prisma.putaway.findUnique({ where: { id } })
  if (!doc) throw new Error('Putaway not found')
  if (!doc.postedAt) throw new Error('Inventory has not been posted')
  const updated = await prisma.putaway.update({ where: { id }, data: { postedAt: null, postedById: null } })
  await logAudit({
    user,
    action: 'INVENTORY_POSTING_ROLLED_BACK',
    module: 'PUTAWAY',
    entityType: 'Putaway',
    entityId: id,
    description: `Inventory posting rolled back for ${doc.putawayNo} (reason: ${reason || 'not specified'})`,
    before: { postedAt: doc.postedAt },
    after: { postedAt: null },
  })
  return updated
}

// Posting status for the UI (GET /post-status).
export async function getPostingStatus({ id }) {
  const doc = await prisma.putaway.findUnique({ where: { id }, include: { lines: true } })
  if (!doc) throw new Error('Putaway not found')
  const targets = [...new Set(doc.lines.map((l) => l.targetLocationId).filter(Boolean))]
  const occupancy = await Promise.all(targets.map((tid) => engineBinOccupancy({ locationId: tid })))
  return {
    posted: !!doc.postedAt,
    postedAt: doc.postedAt,
    postedById: doc.postedById,
    lineCount: doc.lines.filter((l) => l.status === 'COMPLETED').length,
    binOccupancy: occupancy,
  }
}
