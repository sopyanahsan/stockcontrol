import prisma from '@/lib/prisma'
import { allocateFifo, consumeFifoLayers, createDestinationFifoLayersFromAllocations } from '@/lib/fifo-service'
import { validateItem, validateLocation, validateStock, validateTransfer } from '@/lib/stock-validation'
import { nextMovementNumber } from '@/lib/doc-numbering'
import { logAudit } from '@/lib/audit'

// ---------- RBAC helpers ----------
const canCreate = (role) => ['STOCK_CONTROL', 'SUPERVISOR', 'ADMINISTRATOR'].includes(role)
const canCancel = (role) => ['SUPERVISOR', 'ADMINISTRATOR'].includes(role)

// ---------- Derive warehouse from a location ----------
async function getWarehouseCode(locationId) {
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    include: { zone: { include: { warehouse: true } } },
  })
  return loc?.zone?.warehouse?.code || 'WH00'
}

// ==================== LIST ====================
export async function listMovements({ status, warehouseId, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status
  if (warehouseId) {
    const locIds = (
      await prisma.location.findMany({
        where: { zone: { warehouseId } },
        select: { id: true },
      })
    ).map((l) => l.id)
    where.lines = { some: { OR: [{ fromLocationId: { in: locIds } }, { toLocationId: { in: locIds } }] } }
  }

  const [movements, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      include: {
        lines: true,
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.stockTransfer.count({ where }),
  ])

  return { data: movements, total }
}

// ==================== GET SINGLE ====================
export async function getMovement(id) {
  return prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, uom: { select: { code: true } }, serialTracked: true } },
          fromLocation: { select: { id: true, code: true, name: true } },
          toLocation: { select: { id: true, code: true, name: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      reasonCode: true,
    },
  })
}

// ==================== CREATE DRAFT ====================
export async function createMovement({ user, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions to create movements')
  const { lines = [], remarks } = body
  validateTransfer({ lines })

  // Resolve location warehouse for doc numbering
  const toLocationId = lines[0]?.toLocationId
  if (!toLocationId) throw new Error('At least one line with a destination location is required')
  const whCode = await getWarehouseCode(toLocationId)

  return prisma.$transaction(async (tx) => {
    const transferNumber = await nextMovementNumber(whCode, tx)

    const movement = await tx.stockTransfer.create({
      data: {
        transferNumber,
        status: 'DRAFT',
        remarks: remarks || null,
        createdById: user.id,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            fromLocationId: l.fromLocationId,
            toLocationId: l.toLocationId,
            qty: Number(l.qty),
          })),
        },
      },
      include: {
        lines: {
          include: {
            item: { select: { sku: true, name: true } },
            fromLocation: { select: { code: true } },
            toLocation: { select: { code: true } },
          },
        },
        createdBy: { select: { name: true } },
      },
    })

    logAudit({
      user,
      action: 'CREATE',
      module: 'MOVEMENT',
      entityType: 'StockTransfer',
      entityId: movement.id,
      description: `Created movement ${transferNumber}`,
      after: movement,
    })

    return movement
  })
}

// ==================== POST (EXECUTE) MOVEMENT ====================
// Executes the movement: validates FIFO, creates ledger entries, consumes
// source FIFO layers, creates destination FIFO layers — all in one transaction.
export async function postMovement({ user, id, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions to execute movements')

  const existing = await prisma.stockTransfer.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Movement not found')
  if (existing.status !== 'DRAFT') throw new Error('Only draft movements can be executed')

  const { lines: clientLines = [], remarks } = body || {}

  // Build line map from client payload
  const clientLineMap = {}
  for (const l of clientLines) {
    clientLineMap[l.id || l.lineId] = l
  }

  return prisma.$transaction(async (tx) => {
    const ledgerEntries = []
    const fifoOps = []

    for (const line of existing.lines) {
      const qty = Number(clientLineMap[line.id]?.qty ?? line.qty)

      // --- Validate item and locations ---
      await validateItem(line.itemId, tx)
      await validateLocation(line.fromLocationId, { tx })
      await validateLocation(line.toLocationId, { tx })
      await validateStock(line.itemId, line.fromLocationId, qty, tx)

      // --- Allocate FIFO from source location ---
      const allocations = await allocateFifo({
        itemId: line.itemId,
        locationId: line.fromLocationId,
        qtyNeeded: qty,
        tx,
      })

      // --- Consume FIFO from source layers ---
      await consumeFifoLayers({ allocations, tx })

      // --- Create destination FIFO layers (preserving FIFO identity) ---
      const destLayers = await createDestinationFifoLayersFromAllocations({
        itemId: line.itemId,
        fromLocationId: line.fromLocationId,
        toLocationId: line.toLocationId,
        movementRefNumber: existing.transferNumber,
        lines: [{ ...line, qty, sourceAllocation: allocations }],
        tx,
      })

      // --- Write Stock Ledger entries ---
      const avgUnitCost = allocations.length > 0
        ? allocations.reduce((sum, a) => sum + Number(a.fifoLayer.unitCost || 0), 0) / allocations.length
        : 0

      // TRANSFER_OUT on source location
      ledgerEntries.push(
        tx.stockLedger.create({
          data: {
            itemId: line.itemId,
            locationId: line.fromLocationId,
            txnType: 'TRANSFER_OUT',
            qty: -qty,
            unitCost: avgUnitCost,
            refType: 'MOVEMENT',
            refId: existing.id,
            refNumber: existing.transferNumber,
            userId: user.id,
          },
        })
      )

      // TRANSFER_IN on destination location
      ledgerEntries.push(
        tx.stockLedger.create({
          data: {
            itemId: line.itemId,
            locationId: line.toLocationId,
            txnType: 'TRANSFER_IN',
            qty,
            unitCost: avgUnitCost,
            refType: 'MOVEMENT',
            refId: existing.id,
            refNumber: existing.transferNumber,
            userId: user.id,
          },
        })
      )
    }

    // Execute all ledger writes
    await Promise.all(ledgerEntries)

    // Update movement status
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        postedAt: new Date(),
        approvedById: user.id,
        approvedAt: new Date(),
        remarks: remarks || existing.remarks || null,
      },
      include: {
        lines: {
          include: {
            item: { select: { sku: true, name: true } },
            fromLocation: { select: { code: true } },
            toLocation: { select: { code: true } },
          },
        },
        approvedBy: { select: { name: true } },
      },
    })

    logAudit({
      user,
      action: 'EXECUTE',
      module: 'MOVEMENT',
      entityType: 'StockTransfer',
      entityId: id,
      description: `Executed movement ${existing.transferNumber}`,
      after: updated,
    })

    return updated
  })
}

// ==================== CANCEL MOVEMENT ====================
export async function cancelMovement({ user, id, reason }) {
  if (!canCancel(user.role)) throw new Error('Only Supervisor or Administrator can cancel movements')

  const existing = await prisma.stockTransfer.findUnique({ where: { id } })
  if (!existing) throw new Error('Movement not found')
  if (existing.status === 'COMPLETED') throw new Error('Completed movements cannot be cancelled')
  if (existing.status === 'CANCELLED') throw new Error('Movement is already cancelled')

  const updated = await prisma.stockTransfer.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { lines: true },
  })

  logAudit({
    user,
    action: 'CANCEL',
    module: 'MOVEMENT',
    entityType: 'StockTransfer',
    entityId: id,
    description: `Cancelled movement ${existing.transferNumber}${reason ? ': ' + reason : ''}`,
    before: existing,
    after: updated,
  })

  return updated
}

// ==================== STOCK CARD (for Stock Card tab) ====================
// Returns ledger entries for an item with a running balance, sorted oldest→newest.
export async function getStockCard({ itemId, locationId, limit = 200 } = {}) {
  if (!itemId) throw new Error('getStockCard: itemId is required')

  const where = { itemId }
  if (locationId) where.locationId = locationId

  const entries = await prisma.stockLedger.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      location: { select: { code: true, name: true } },
      user: { select: { name: true } },
      reasonCode: { select: { code: true, description: true } },
    },
  })

  // Build running balance
  let runningQty = 0
  const withBalance = entries.map((e) => {
    runningQty += Number(e.qty)
    return { ...e, runningQty }
  })

  // Totals by location
  const byLocation = {}
  for (const e of entries) {
    if (!byLocation[e.locationId]) byLocation[e.locationId] = 0
    byLocation[e.locationId] += Number(e.qty)
  }

  const currentBalance = withBalance.length > 0 ? withBalance[withBalance.length - 1].runningQty : 0

  return {
    currentBalance,
    byLocation: Object.entries(byLocation).map(([locId, qty]) => ({ locationId: locId, qty })),
    entries: withBalance.reverse(), // newest first for display
  }
}

// ==================== MOVEMENT PREVIEW ====================
// Simulates what will happen when the movement is posted.
// Returns FIFO allocations and ledger entries WITHOUT writing to the database.
export async function previewMovement({ lines }) {
  if (!Array.isArray(lines) || lines.length === 0) return { allocations: [], ledgerEntries: [] }

  const allocations = []
  const ledgerEntries = []

  for (const line of lines) {
    const qty = Number(line.qty)
    if (!qty || qty <= 0) continue

    const item = await validateItem(line.itemId).catch(() => null)
    if (!item) continue

    const fromLoc = await validateLocation(line.fromLocationId).catch(() => null)
    const toLoc = await validateLocation(line.toLocationId).catch(() => null)
    if (!fromLoc || !toLoc) continue

    let fifoAlloc = []
    let avgCost = 0

    try {
      fifoAlloc = await allocateFifo({ itemId: line.itemId, locationId: line.fromLocationId, qtyNeeded: qty })

      // Simulate ledger entries (not written)
      avgCost = fifoAlloc.length > 0
        ? fifoAlloc.reduce((sum, a) => sum + Number(a.fifoLayer.unitCost || 0), 0) / fifoAlloc.length
        : 0
    } catch {
      fifoAlloc = []
    }

    allocations.push({
      lineId: line.id || line.lineId,
      itemId: line.itemId,
      itemSku: item?.sku,
      itemName: item?.name,
      fromLocationId: line.fromLocationId,
      fromLocationCode: fromLoc?.code,
      toLocationId: line.toLocationId,
      toLocationCode: toLoc?.code,
      qty,
      fifoLayers: fifoAlloc.map((a) => ({
        layerId: a.fifoLayer.id,
        refNumber: a.fifoLayer.refNumber,
        receivedAt: a.fifoLayer.receivedAt,
        unitCost: a.fifoLayer.unitCost,
        available: Number(a.fifoLayer.qtyRemaining),
        qtyToConsume: a.qtyToConsume,
      })),
      avgUnitCost: avgCost,
    })

    ledgerEntries.push(
      {
        txnType: 'TRANSFER_OUT',
        itemId: line.itemId,
        itemSku: item?.sku,
        locationId: line.fromLocationId,
        locationCode: fromLoc?.code,
        qty: -qty,
        unitCost: avgCost,
        refNumber: null,
      },
      {
        txnType: 'TRANSFER_IN',
        itemId: line.itemId,
        itemSku: item?.sku,
        locationId: line.toLocationId,
        locationCode: toLoc?.code,
        qty,
        unitCost: avgCost,
        refNumber: null,
      }
    )
  }

  return { allocations, ledgerEntries }
}

// ==================== STOCK CARD (filtered, for API) ====================
// Supports filtering by item, location, txnType, and date range.
export async function getStockCardEntries({ itemId, locationId, txnType, fromDate, toDate, limit = 200 } = {}) {
  const where = {}
  if (itemId) where.itemId = itemId
  if (locationId) where.locationId = locationId
  if (txnType) where.txnType = txnType
  if (fromDate || toDate) {
    where.createdAt = {}
    if (fromDate) where.createdAt.gte = new Date(fromDate)
    if (toDate) where.createdAt.lte = new Date(toDate + 'T23:59:59.999Z')
  }

  const entries = await prisma.stockLedger.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      item: { select: { sku: true, name: true } },
      location: { select: { code: true, name: true } },
      user: { select: { name: true } },
      reasonCode: { select: { code: true, description: true } },
    },
  })

  let runningQty = 0
  const withBalance = entries.map((e) => {
    runningQty += Number(e.qty)
    return { ...e, runningQty }
  })

  const currentBalance = withBalance.length > 0 ? withBalance[withBalance.length - 1].runningQty : 0

  return {
    currentBalance,
    entries: withBalance.reverse(), // newest first for display
    filters: { itemId, locationId, txnType, fromDate, toDate },
  }
}
