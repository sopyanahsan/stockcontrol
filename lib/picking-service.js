import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { allocateFifo, getFifoLayers } from '@/lib/fifo-service'
import { validateItem, validateLocation, validateSerial } from '@/lib/stock-validation'
import { nextPickingNumber } from '@/lib/doc-numbering'

// ============================================================
// Picking Service
// ------------------------------------------------------------
// FIFO-suggested picking without consumption.
// - PickingOrder → PickingOrderLine → PickingTask
// - FIFO layers are READ ONLY for suggestion; qtyRemaining untouched
// - Stock ledger is NOT written during picking
// - Serial numbers selected but remain IN_STOCK until Shipping
// ============================================================

// ---------- RBAC ----------
const canCreate = (role) => ['STOCK_CONTROL', 'SUPERVISOR', 'ADMINISTRATOR'].includes(role)

// ---------- INCLUDE shapes ----------
export const PICKING_INCLUDE = {
  lines: {
    include: {
      item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
      tasks: {
        include: {
          location: { select: { id: true, code: true, name: true } },
          serials: { select: { id: true, serialNo: true, pickedAt: true } },
        },
        orderBy: { sequence: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  },
}

export const PICKING_LIST_INCLUDE = {
  lines: {
    select: { id: true, itemId: true, qtyOrdered: true, qtyPicked: true, status: true },
  },
}

// ---------- LIST ----------
export async function listPickingOrders({ status, warehouseId, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status
  if (warehouseId) where.warehouseId = warehouseId

  const orders = await prisma.pickingOrder.findMany({
    where,
    include: PICKING_LIST_INCLUDE,
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: Math.min(take, 500),
  })

  // PickingOrder stores user ids as plain scalars (no relation fields),
  // so resolve names via a supplementary lookup.
  const ids = [...new Set(orders.flatMap((o) => [o.createdById, o.assignedToId]).filter(Boolean))]
  const userMap = ids.length
    ? Object.fromEntries(
        (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u])
      )
    : {}

  return orders.map((o) => ({
    ...o,
    createdBy: o.createdById ? { id: o.createdById, name: userMap[o.createdById] || null } : null,
    assignedTo: o.assignedToId ? { id: o.assignedToId, name: userMap[o.assignedToId] || null } : null,
  }))
}

// ---------- GET ----------
export async function getPickingOrder(id) {
  return prisma.pickingOrder.findUnique({
    where: { id },
    include: PICKING_INCLUDE,
  })
}

// ---------- CREATE DRAFT ----------
export async function createPickingOrder({ user, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions to create picking orders')

  const { lines = [], warehouseId, priority, notes } = body

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('At least one line item is required')
  }

  // Resolve warehouse for doc numbering
  let whCode = 'WH00'
  if (warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } })
    if (!wh) throw new Error('Warehouse not found')
    whCode = wh.code
  }

  return prisma.$transaction(async (tx) => {
    const pickingNumber = await nextPickingNumber(whCode, tx)

    const order = await tx.pickingOrder.create({
      data: {
        pickingNumber,
        status: 'DRAFT',
        priority: priority || 'NORMAL',
        warehouseId: warehouseId || null,
        createdById: user.id,
        notes: notes || null,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            qtyOrdered: Number(l.qtyOrdered),
            remarks: l.remarks || null,
          })),
        },
      },
      include: PICKING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'CREATE',
      module: 'PICKING',
      entityType: 'PickingOrder',
      entityId: order.id,
      description: `Created picking order ${pickingNumber} with ${lines.length} line(s)`,
      after: { pickingNumber, lineCount: lines.length },
    })

    return order
  })
}

// ---------- UPDATE DRAFT ----------
export async function updatePickingOrder({ user, id, body }) {
  const before = await prisma.pickingOrder.findUnique({ where: { id }, include: { lines: true } })
  if (!before) throw new Error('Picking order not found')
  if (before.status !== 'DRAFT') throw new Error('Only DRAFT orders can be edited (current: ' + before.status + ')')

  const { lines, notes, priority, warehouseId } = body

  return prisma.$transaction(async (tx) => {
    // Replace lines if provided
    if (Array.isArray(lines)) {
      await tx.pickingOrderLine.deleteMany({ where: { pickingOrderId: id } })
      for (const l of lines) {
        await tx.pickingOrderLine.create({
          data: {
            pickingOrderId: id,
            itemId: l.itemId,
            qtyOrdered: Number(l.qtyOrdered),
            remarks: l.remarks || null,
          },
        })
      }
    }

    const updated = await tx.pickingOrder.update({
      where: { id },
      data: {
        notes: notes !== undefined ? notes : before.notes,
        priority: priority || before.priority,
        warehouseId: warehouseId !== undefined ? warehouseId : before.warehouseId,
      },
      include: PICKING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'PICKING',
      entityType: 'PickingOrder',
      entityId: id,
      description: `Updated picking order ${before.pickingNumber}`,
      before: { notes: before.notes, lineCount: before.lines.length },
      after: { notes: updated.notes, lineCount: updated.lines.length },
    })

    return updated
  })
}

// ---------- GENERATE FIFO SUGGESTIONS ----------
// Reads FIFO layers to generate PickingTasks — does NOT modify FIFO qtyRemaining.
export async function generateFifoSuggestions({ user, id }) {
  const order = await prisma.pickingOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: { item: true },
      },
    },
  })
  if (!order) throw new Error('Picking order not found')
  if (order.status !== 'DRAFT') throw new Error('Only DRAFT orders can generate suggestions (current: ' + order.status + ')')

  return prisma.$transaction(async (tx) => {
    const tasks = []

    for (const line of order.lines) {
      const qtyNeeded = Number(line.qtyOrdered)
      let remaining = qtyNeeded

      // Get FIFO layers for this item
      const layers = await tx.fifoLayer.findMany({
        where: { itemId: line.itemId, qtyRemaining: { gt: 0 } },
        orderBy: { receivedAt: 'asc' },
      })

      let seq = 1
      for (const layer of layers) {
        if (remaining <= 0) break

        const qtyFromLayer = Math.min(Number(layer.qtyRemaining), remaining)
        const locationId = layer.locationId

        // --- Duplicate active task prevention ---
        // Check: same item + location + status != COMPLETED
        const conflict = await tx.pickingTask.findFirst({
          where: {
            pickingLine: { itemId: line.itemId },
            locationId,
            status: { not: 'COMPLETED' },
            pickingLine: {
              pickingOrderId: { not: id }, // allow same order to be refreshed
            },
          },
        })

        if (conflict) {
          // Skip this layer — another active task exists for same item+location
          continue
        }

        // --- Check no duplicate active task for this SAME order ---
        const sameOrderConflict = await tx.pickingTask.findFirst({
          where: {
            locationId,
            status: { not: 'COMPLETED' },
            pickingLine: { itemId: line.itemId, pickingOrderId: id },
          },
        })

        if (sameOrderConflict) {
          // Task already exists for this item+location on this order
          // Instead of creating duplicate, update the existing task's qty
          const existing = await tx.pickingTask.findUnique({
            where: { id: sameOrderConflict.id },
            include: { pickingLine: { include: { item: true } } },
          })
          if (existing) {
            const newQty = existing.qty + qtyFromLayer
            await tx.pickingTask.update({
              where: { id: existing.id },
              data: { qty: newQty },
            })
            tasks.push({ ...existing, qty: newQty })
            remaining -= qtyFromLayer
            continue
          }
        }

        // --- Create new task ---
        const task = await tx.pickingTask.create({
          data: {
            pickingLineId: line.id,
            locationId,
            fifoLayerId: layer.id,
            sequence: seq++,
            qty: qtyFromLayer,
            status: 'OPEN',
          },
          include: {
            location: { select: { id: true, code: true, name: true } },
            pickingLine: {
              include: { item: { select: { id: true, sku: true, name: true, serialTracked: true } } },
            },
          },
        })
        tasks.push(task)
        remaining -= qtyFromLayer
      }

      if (remaining > 0) {
        throw new Error(
          'Insufficient FIFO stock for item ' + line.item.sku + '. Short by ' + remaining + ' units'
        )
      }
    }

    // Refresh and return order with all tasks
    const updated = await tx.pickingOrder.findUnique({
      where: { id },
      include: PICKING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'PICKING',
      entityType: 'PickingOrder',
      entityId: id,
      description: `Generated FIFO suggestions for ${updated.pickingNumber} — ${tasks.length} task(s) created`,
      after: { pickingNumber: updated.pickingNumber, taskCount: tasks.length },
    })

    return updated
  })
}

// ---------- ASSIGN PICKER ----------
export async function assignPicker({ user, id, assignedToId }) {
  const order = await prisma.pickingOrder.findUnique({ where: { id } })
  if (!order) throw new Error('Picking order not found')
  if (!['DRAFT', 'ASSIGNED'].includes(order.status)) {
    throw new Error('Only DRAFT or ASSIGNED orders can be reassigned (current: ' + order.status + ')')
  }

  const updated = await prisma.pickingOrder.update({
    where: { id },
    data: { status: 'ASSIGNED', assignedToId: assignedToId || null },
    include: PICKING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PICKING',
    entityType: 'PickingOrder',
    entityId: id,
    description: `Assigned picking order ${updated.pickingNumber} (status → ASSIGNED)`,
    after: { pickingNumber: updated.pickingNumber, assignedToId },
  })

  return updated
}

// ---------- START PICKING ----------
export async function startPickingOrder({ user, id }) {
  const order = await prisma.pickingOrder.findUnique({
    where: { id },
    include: { lines: { include: { tasks: true } } },
  })
  if (!order) throw new Error('Picking order not found')
  if (order.status !== 'ASSIGNED') {
    throw new Error('Only ASSIGNED orders can be started (current: ' + order.status + ')')
  }
  if (order.lines.some((l) => l.tasks.length === 0)) {
    throw new Error('Cannot start — one or more lines have no picking tasks. Generate FIFO suggestions first.')
  }

  const updated = await prisma.pickingOrder.update({
    where: { id },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
    include: PICKING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PICKING',
    entityType: 'PickingOrder',
    entityId: id,
    description: `Started picking order ${updated.pickingNumber} (ASSIGNED → IN_PROGRESS)`,
    after: { pickingNumber: updated.pickingNumber },
  })

  return updated
}

// ---------- EXECUTE PICK TASK ----------
// Validation order: Location → Item → Serial → Qty → Confirm
// body: { taskId, scannedLocationCode, scannedItemCode?, serials?: [], qty?: number }
export async function executePickTask({ user, id, body }) {
  const { taskId, scannedLocationCode, scannedItemCode, serials = [], qty } = body

  const task = await prisma.pickingTask.findUnique({
    where: { id: taskId },
    include: {
      pickingLine: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true } },
          pickingOrder: { select: { id: true, pickingNumber: true, status: true } },
        },
      },
      location: { select: { id: true, code: true, name: true } },
      serials: { select: { id: true, serialNo: true } },
    },
  })
  if (!task) throw new Error('Picking task not found')
  if (task.pickingLine.pickingOrder.id !== id) throw new Error('Task does not belong to this picking order')
  if (task.pickingLine.pickingOrder.status !== 'IN_PROGRESS') {
    throw new Error('Picking order is not IN_PROGRESS (current: ' + task.pickingLine.pickingOrder.status + ')')
  }
  if (task.status === 'COMPLETED') throw new Error('Task is already completed')
  if (task.status === 'SKIPPED') throw new Error('Task is skipped')

  // --- STEP 1: Validate Location ---
  if (!scannedLocationCode) throw new Error('Scanned location code is required')
  const loc = await prisma.location.findUnique({
    where: { code: String(scannedLocationCode).trim() },
  })
  if (!loc) throw new Error('Location not found: ' + scannedLocationCode)
  if (!loc.isActive) throw new Error('Location is inactive: ' + scannedLocationCode)
  if (loc.id !== task.locationId) {
    throw new Error('Wrong location. Expected: ' + task.location.code + ', Scanned: ' + loc.code)
  }

  // --- STEP 2: Validate Item ---
  if (scannedItemCode) {
    const item = await prisma.item.findFirst({
      where: { OR: [{ id: scannedItemCode }, { barcode: scannedItemCode }, { sku: scannedItemCode }] },
    })
    if (!item) throw new Error('Item not found: ' + scannedItemCode)
    if (item.id !== task.pickingLine.item.id) {
      throw new Error(
        'Wrong item. Expected: ' + task.pickingLine.item.sku + ', Scanned: ' + item.sku
      )
    }
  }

  // --- STEP 3: Validate Serials ---
  const item = task.pickingLine.item
  const serialTracked = !!item.serialTracked
  const qtyRemaining = Number(task.qty) - Number(task.qtyPicked)
  const qtyToPick = qty !== undefined ? Number(qty) : qtyRemaining

  if (qtyToPick <= 0) throw new Error('Quantity must be greater than zero')
  if (qtyToPick > qtyRemaining) throw new Error('Quantity exceeds remaining qty (' + qtyRemaining + ')')

  const scannedSerials = Array.isArray(serials)
    ? serials.map((s) => String(s).trim()).filter(Boolean)
    : []

  if (serialTracked) {
    if (scannedSerials.length !== qtyToPick) {
      throw new Error(
        'Serial-tracked item requires exactly ' + qtyToPick + ' serial(s) (provided: ' + scannedSerials.length + ')'
      )
    }

    // Validate each serial
    const existingSerialNos = new Set(task.serials.map((s) => s.serialNo))
    const seenInRequest = new Set()

    for (const sn of scannedSerials) {
      if (seenInRequest.has(sn)) throw new Error('Duplicate serial in request: ' + sn)
      seenInRequest.add(sn)

      if (existingSerialNos.has(sn)) throw new Error('Serial "' + sn + '" already picked on this task')

      const serial = await prisma.serialNumber.findUnique({
        where: { serialNo: sn },
        include: { item: { select: { id: true, sku: true } }, currentLocation: { select: { code: true } } },
      })
      if (!serial) throw new Error('Serial number not found: ' + sn)
      if (serial.itemId !== item.id) throw new Error('Serial "' + sn + '" belongs to item ' + serial.item.sku)
      if (serial.status !== 'IN_STOCK') throw new Error('Serial "' + sn + '" is not in stock (status: ' + serial.status + ')')
      if (serial.currentLocationId !== task.locationId) {
        throw new Error('Serial "' + sn + '" is at location ' + (serial.currentLocation?.code || 'unknown') + ', expected ' + task.location.code)
      }
    }
  } else if (scannedSerials.length > 0) {
    throw new Error('This item is not serial-tracked — serials should not be provided')
  }

  // --- STEP 4 & 5: Confirm pick ---
  const isFull = qtyToPick === qtyRemaining
  const isPartial = qtyToPick < qtyRemaining

  return prisma.$transaction(async (tx) => {
    // Update task
    const taskUpdate = {
      qtyPicked: { increment: qtyToPick },
      status: isFull ? 'COMPLETED' : 'IN_PROGRESS',
      pickedById: isFull ? user.id : undefined,
      pickedAt: isFull ? new Date() : undefined,
      startedAt: task.startedAt || new Date(),
    }
    await tx.pickingTask.update({ where: { id: taskId }, data: taskUpdate })

    // Create serial records
    for (const sn of scannedSerials) {
      await tx.pickingTaskSerial.create({
        data: { pickingTaskId: taskId, serialNo: sn },
      })
    }

    // Update line
    const line = task.pickingLine
    const newLineQtyPicked = Number(line.qtyPicked || 0) + qtyToPick
    const lineComplete = newLineQtyPicked >= Number(line.qtyOrdered)

    await tx.pickingOrderLine.update({
      where: { id: line.id },
      data: {
        qtyPicked: { increment: qtyToPick },
        status: lineComplete ? 'COMPLETED' : 'IN_PROGRESS',
      },
    })

    // Check if all lines done → complete order
    const remainingLines = await tx.pickingOrderLine.count({
      where: {
        pickingOrderId: id,
        status: { not: 'COMPLETED' },
      },
    })

    if (remainingLines === 0) {
      await tx.pickingOrder.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
    }

    // Refresh task
    const updatedTask = await tx.pickingTask.findUnique({
      where: { id: taskId },
      include: {
        location: { select: { id: true, code: true, name: true } },
        serials: { select: { id: true, serialNo: true, pickedAt: true } },
        pickingLine: {
          include: { item: { select: { id: true, sku: true, name: true, serialTracked: true } } },
        },
      },
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'PICKING',
      entityType: 'PickingTask',
      entityId: taskId,
      description:
        'Confirmed pick: ' +
        qtyToPick +
        ' × ' +
        item.sku +
        ' at ' +
        task.location.code +
        (isPartial ? ' (partial)' : ' (full)'),
      after: {
        taskId,
        qtyPicked: qtyToPick,
        itemSku: item.sku,
        locationCode: task.location.code,
        serials: scannedSerials,
        partial: isPartial,
        orderComplete: remainingLines === 0,
      },
    })

    return updatedTask
  })
}

// ---------- SKIP TASK ----------
export async function skipPickTask({ user, id, taskId, reason }) {
  const task = await prisma.pickingTask.findUnique({
    where: { id: taskId },
    include: {
      pickingLine: {
        include: {
          item: { select: { sku: true } },
          pickingOrder: { select: { id: true, pickingNumber: true, status: true } },
        },
      },
    },
  })
  if (!task) throw new Error('Picking task not found')
  if (task.pickingLine.pickingOrder.id !== id) throw new Error('Task does not belong to this order')
  if (task.pickingLine.pickingOrder.status !== 'IN_PROGRESS') throw new Error('Order not IN_PROGRESS')
  if (task.status !== 'OPEN' && task.status !== 'IN_PROGRESS') throw new Error('Cannot skip task with status: ' + task.status)

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.pickingTask.update({
      where: { id: taskId },
      data: { status: 'SKIPPED' },
    })
    // Mark line as partially done
    await tx.pickingOrderLine.update({
      where: { id: task.pickingLineId },
      data: {
        qtyPicked: { increment: task.qtyPicked },
        status: task.qtyPicked > 0 ? 'IN_PROGRESS' : 'SKIPPED',
      },
    })
    return t
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PICKING',
    entityType: 'PickingTask',
    entityId: taskId,
    description: 'Skipped picking task for ' + task.pickingLine.item.sku + ' at ' + task.locationId + (reason ? ': ' + reason : ''),
    after: { taskId, reason },
  })

  return updated
}

// ---------- COMPLETE ORDER (manual) ----------
export async function completePickingOrder({ user, id }) {
  const order = await prisma.pickingOrder.findUnique({
    where: { id },
    include: { lines: { include: { tasks: true } } },
  })
  if (!order) throw new Error('Picking order not found')
  if (order.status === 'COMPLETED') throw new Error('Order is already completed')
  if (order.status !== 'IN_PROGRESS') throw new Error('Only IN_PROGRESS orders can be completed (current: ' + order.status + ')')

  const updated = await prisma.pickingOrder.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: PICKING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'POST',
    module: 'PICKING',
    entityType: 'PickingOrder',
    entityId: id,
    description: `Completed picking order ${updated.pickingNumber}`,
    after: { pickingNumber: updated.pickingNumber },
  })

  return updated
}

// ---------- CANCEL ----------
export async function cancelPickingOrder({ user, id, reason }) {
  const order = await prisma.pickingOrder.findUnique({ where: { id } })
  if (!order) throw new Error('Picking order not found')
  if (!['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(order.status)) {
    throw new Error('Cannot cancel order with status: ' + order.status)
  }

  const updated = await prisma.pickingOrder.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: PICKING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PICKING',
    entityType: 'PickingOrder',
    entityId: id,
    description: 'Cancelled picking order ' + updated.pickingNumber + (reason ? ': ' + reason : ''),
    before: { status: order.status },
    after: { status: 'CANCELLED' },
  })

  return updated
}

// ---------- GET FIFO SUGGESTIONS FOR UI PREVIEW ----------
export async function previewFifoSuggestions({ itemId, qty, warehouseId }) {
  if (!itemId) throw new Error('itemId is required')
  if (!qty || qty <= 0) throw new Error('qty must be positive')

  const layers = await getFifoLayers({ itemId })
  const filtered = warehouseId
    ? layers.filter((l) => l.location?.zone?.warehouseId === warehouseId)
    : layers

  let remaining = Number(qty)
  const suggestions = []

  for (const layer of filtered) {
    if (remaining <= 0) break
    const qtyFrom = Math.min(Number(layer.qtyRemaining), remaining)
    suggestions.push({
      fifoLayerId: layer.id,
      locationId: layer.locationId,
      locationCode: layer.location?.code,
      locationName: layer.location?.name,
      qtyAvailable: Number(layer.qtyRemaining),
      qtyToPick: qtyFrom,
      refNumber: layer.refNumber,
      receivedAt: layer.receivedAt,
      unitCost: layer.unitCost,
    })
    remaining -= qtyFrom
  }

  return {
    suggestions,
    totalSuggested: Number(qty) - remaining,
    shortfall: remaining,
  }
}
