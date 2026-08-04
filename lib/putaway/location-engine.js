import prisma from '@/lib/prisma'
import { getWarehouseStorageLocations, nearestSort, occupiedAtLocation } from './location-utils'
import { evaluateCapacity } from './capacity-engine'
import { batchByReceivingRef, evaluateFifoFefo } from './fifo-engine'

// ============================================================
// Smart Location Engine — recommends storage locations for a
// putaway line. Read-only: NEVER writes inventory, stock ledger,
// FIFO layers, or location state.
//
// Selection priority:
//   1. Existing location with same SKU (oldest layer first — FIFO/FEFO)
//   2. Same batch (FIFO) when a batch number is given
//   3. Same batch (FEFO) when expiry exists
//   4. Nearest empty location
//   5. Nearest available location
// ============================================================

export async function suggestLocation({ itemId, qty, warehouseId, batchNo = null, expiryDate = null }) {
  const item = await prisma.item.findUnique({ where: { id: itemId }, include: { category: true, uom: true } })
  if (!item) throw new Error('Item not found')

  const storage = await getWarehouseStorageLocations(warehouseId)
  if (!storage.length) {
    return { suggestedLocation: null, alternatives: [], capacity: null, fifo: null, reasons: ['No active storage locations in this warehouse'], allowPutaway: false }
  }

  const locIds = storage.map((l) => l.id)
  const layers = await prisma.fifoLayer.findMany({
    where: { itemId, qtyRemaining: { gt: 0 }, locationId: { in: locIds } },
    include: { location: { select: { id: true, code: true } } },
    orderBy: { receivedAt: 'asc' },
  })
  const batchByRef = await batchByReceivingRef(prisma, itemId, layers.map((l) => l.refNumber))
  const fifo = evaluateFifoFefo({ layers, batchNo, expiryDate, batchByRef })

  const occupiedByLoc = {}
  await Promise.all(storage.map(async (l) => {
    occupiedByLoc[l.id] = await occupiedAtLocation(l.id)
  }))

  const layerByLoc = {}
  for (const l of layers) (layerByLoc[l.locationId] = layerByLoc[l.locationId] || []).push(l)

  const reasons = []
  const byCode = nearestSort(storage)
  const candidates = byCode.map((location) => ({
    location,
    occupied: occupiedByLoc[location.id] || 0,
    cap: evaluateCapacity({ location, qty, occupied: occupiedByLoc[location.id] || 0 }),
  }))
  const pass = candidates.filter((c) => c.cap.allowPutaway)

  // Priority 1-3: locations already holding this item, oldest layer first.
  const sameSku = pass.filter((c) => layerByLoc[c.location.id])
  const sameSkuOrdered = sameSku.sort((a, b) => {
    const fa = fifo.candidates.findIndex((f) => f.locationId === a.location.id)
    const fb = fifo.candidates.findIndex((f) => f.locationId === b.location.id)
    return (fa < 0 ? 999 : fa) - (fb < 0 ? 999 : fb)
  })

  let pick
  if (sameSkuOrdered.length) {
    pick = sameSkuOrdered[0]
    const b = fifo.candidates.find((f) => f.locationId === pick.location.id)
    reasons.push(`Existing stock at ${pick.location.code} — ${fifo.method} layer ${b ? new Date(b.receivedAt).toISOString().slice(0, 10) : ''}`)
  } else {
    pick = pass.find((c) => c.occupied === 0) || pass[0] || null
    if (pick) reasons.push(pick.occupied === 0 ? 'Nearest empty location' : 'Nearest available location with remaining capacity')
    else reasons.push('No location can accommodate the quantity')
  }

  if (pick) {
    reasons.push(pick.cap.reason)
    if (fifo.candidates.length && !sameSkuOrdered.length) reasons.push(fifo.basis)
  }

  const alternatives = pass.filter((c) => c !== pick).slice(0, 3).map((c) => ({
    location: { id: c.location.id, code: c.location.code, type: c.location.type },
    reason: c.cap.reason,
    capacity: { occupied: c.occupied, maxCapacity: c.cap.maxCapacity, remaining: c.cap.remaining, status: c.cap.status },
  }))

  return {
    item: { id: item.id, sku: item.sku, name: item.name, category: item.category?.name, uom: item.uom?.code },
    suggestedLocation: pick ? { id: pick.location.id, code: pick.location.code, type: pick.location.type } : null,
    alternatives,
    capacity: pick ? {
      occupied: pick.occupied,
      maxCapacity: pick.cap.maxCapacity,
      remaining: pick.cap.remaining,
      status: pick.cap.status,
      allowPutaway: pick.cap.allowPutaway,
      reason: pick.cap.reason,
    } : null,
    fifo,
    reasons,
    allowPutaway: !!pick,
  }
}

// Recompute and return the alternatives for a line, excluding the current pick.
export async function findAlternativeLocations({ itemId, qty, warehouseId, excludeId }) {
  const rec = await suggestLocation({ itemId, qty, warehouseId })
  return rec.alternatives.filter((a) => a.location.id !== excludeId)
}
