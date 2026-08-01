import prisma from '@/lib/prisma'

// ============================================================
// FIFO Allocation Engine
// ------------------------------------------------------------
// All functions accept an optional `tx` (Prisma transaction client)
// so they can be composed inside prisma.$transaction blocks.
// ============================================================

// ---------- Internal: consume part of a FIFO layer ----------
async function splitFifoLayer({ fifoLayer, qtyToConsume, tx }) {
  const { id, qtyRemaining } = fifoLayer
  const newRemaining = qtyRemaining - qtyToConsume

  if (newRemaining < 0) throw new Error('Consumption exceeds remaining qty on layer ' + id)

  if (newRemaining === 0) {
    // Fully consumed — update qtyRemaining to 0; do NOT delete
    await tx.fifoLayer.update({
      where: { id },
      data: { qtyRemaining: 0 },
    })
  } else {
    // Partially consumed — decrement qtyRemaining only
    await tx.fifoLayer.update({
      where: { id },
      data: { qtyRemaining: newRemaining },
    })
  }
}

// ---------- Allocate FIFO layers for an item/location ----------
// Finds the oldest layers (by receivedAt ASC) until qtyNeeded is satisfied.
// Returns an array of allocation slices: [{ fifoLayer, qtyToConsume }]
export async function allocateFifo({ itemId, locationId, qtyNeeded, tx = prisma }) {
  if (!itemId) throw new Error('allocateFifo: itemId is required')
  if (!locationId) throw new Error('allocateFifo: locationId is required')
  if (!qtyNeeded || qtyNeeded <= 0) throw new Error('allocateFifo: qtyNeeded must be positive')

  const layers = await tx.fifoLayer.findMany({
    where: {
      itemId,
      locationId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: { receivedAt: 'asc' },
  })

  if (layers.length === 0) throw new Error('No FIFO layers found for item ' + itemId + ' at location ' + locationId)

  const totalAvailable = layers.reduce((sum, l) => sum + Number(l.qtyRemaining), 0)
  if (totalAvailable < qtyNeeded) {
    throw new Error(
      'Insufficient FIFO stock. Available: ' + totalAvailable + ', Requested: ' + qtyNeeded
    )
  }

  const allocations = []
  let remaining = qtyNeeded

  for (const layer of layers) {
    if (remaining <= 0) break
    const qtyToConsume = Math.min(Number(layer.qtyRemaining), remaining)
    allocations.push({ fifoLayer: layer, qtyToConsume })
    remaining -= qtyToConsume
  }

  return allocations
}

// ---------- Consume FIFO layers (called inside a transaction) ----------
// Applies `allocateFifo` result to the database: decrements qtyRemaining,
// splits partial layers, and never deletes records.
export async function consumeFifoLayers({ allocations, tx = prisma }) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('consumeFifoLayers: no allocations provided')
  }

  for (const { fifoLayer, qtyToConsume } of allocations) {
    await splitFifoLayer({ fifoLayer, qtyToConsume, tx })
  }
}

// ---------- Create a FIFO layer at a location ----------
// For ADJUSTMENT_IN: creates a new layer with the given unit cost and "now" as receivedAt.
export async function createFifoLayer({
  itemId,
  locationId,
  qty,
  refNumber,
  unitCost = 0,
  receivedAt,
  tx = prisma,
}) {
  if (!itemId) throw new Error('createFifoLayer: itemId is required')
  if (!locationId) throw new Error('createFifoLayer: locationId is required')
  if (!qty || qty <= 0) throw new Error('createFifoLayer: qty must be positive')

  return tx.fifoLayer.create({
    data: {
      itemId,
      locationId,
      qtyReceived: qty,
      qtyRemaining: qty,
      refNumber: refNumber || null,
      unitCost: Number(unitCost) || 0,
      receivedAt: receivedAt || new Date(),
    },
  })
}

// ---------- Create destination FIFO layer from source allocations (FIFO identity preserved) ----------
// Merges allocations into one destination layer, preserving the OLDEST receivedAt
// and the first refNumber encountered.
export async function createDestinationFifoLayersFromAllocations({
  itemId,
  fromLocationId,
  toLocationId,
  movementRefNumber,
  lines,
  tx = prisma,
}) {
  if (!Array.isArray(lines) || lines.length === 0) return []

  const createdLayers = []

  for (const line of lines) {
    const { itemId: lineItemId, qty } = line
    if (!qty || qty <= 0) continue

    let oldestReceivedAt = null
    let firstRefNumber = movementRefNumber || 'MOVEMENT'
    let firstUnitCost = 0

    const sourceLayers = line.sourceAllocation || []

    for (const alloc of sourceLayers) {
      const { fifoLayer } = alloc
      if (!oldestReceivedAt || fifoLayer.receivedAt < oldestReceivedAt) {
        oldestReceivedAt = fifoLayer.receivedAt
        firstRefNumber = fifoLayer.refNumber || firstRefNumber
        firstUnitCost = Number(fifoLayer.unitCost || 0)
      }
    }

    const destLayer = await createFifoLayer({
      itemId: lineItemId,
      locationId: toLocationId,
      qty: Number(qty),
      refNumber: firstRefNumber,
      unitCost: firstUnitCost,
      receivedAt: oldestReceivedAt,
      tx,
    })

    createdLayers.push({ line, destFifoLayer: destLayer })
  }

  return createdLayers
}

// ---------- Get available FIFO layers for an item/location (for UI display) ----------
export async function getFifoLayers({ itemId, locationId, tx = prisma }) {
  return tx.fifoLayer.findMany({
    where: {
      itemId,
      ...(locationId ? { locationId } : {}),
      qtyRemaining: { gt: 0 },
    },
    orderBy: { receivedAt: 'asc' },
    include: {
      item: { select: { sku: true, name: true } },
      location: { select: { code: true, name: true } },
    },
  })
}

// ---------- Get total available qty for an item/location ----------
export async function getAvailableQty({ itemId, locationId, tx = prisma }) {
  const agg = await tx.fifoLayer.aggregate({
    where: { itemId, ...(locationId ? { locationId } : {}), qtyRemaining: { gt: 0 } },
    _sum: { qtyRemaining: true },
  })
  return Number(agg._sum.qtyRemaining || 0)
}
