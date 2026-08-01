import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { allocateFifo, consumeFifoLayers, createDestinationFifoLayersFromAllocations } from '@/lib/fifo-service'

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
