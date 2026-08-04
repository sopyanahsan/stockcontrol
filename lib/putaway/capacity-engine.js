import prisma from '@/lib/prisma'
import { occupiedAtLocation } from './location-utils'

// ============================================================
// Capacity Engine — decides whether a location can accept a qty.
// Pure decision: input location + occupied + qty, output verdict.
// ============================================================

export function evaluateCapacity({ location, qty, occupied }) {
  const max = Number(location?.maxCapacity) || 0
  const occ = Math.max(0, Number(occupied) || 0)
  const base = { occupied: occ, maxCapacity: max, remaining: max > 0 ? max - occ : null }

  if (!location) return { ...base, allowPutaway: false, status: 'INVALID', reason: 'Location not found' }
  if (!location.isActive) return { ...base, allowPutaway: false, status: 'INACTIVE', reason: 'Location is inactive' }
  if (location.type !== 'STORAGE') {
    return { ...base, allowPutaway: false, status: 'WRONG_TYPE', reason: 'Not a storage bin (type: ' + location.type + ')' }
  }
  if (max <= 0) return { ...base, allowPutaway: true, status: 'UNLIMITED', reason: 'No capacity limit set' }

  const remaining = max - occ
  if (remaining <= 0) return { ...base, allowPutaway: false, status: 'FULL', reason: 'Capacity full' }
  if (Number(qty) > remaining) {
    return { ...base, allowPutaway: false, status: 'OVERFLOW', reason: `Qty ${qty} exceeds remaining capacity ${remaining}` }
  }
  return { ...base, allowPutaway: true, status: 'AVAILABLE', reason: `Remaining capacity ${remaining}` }
}

// Service wrapper — resolves the location + current occupancy from the DB.
export async function validateCapacity({ locationId, qty }) {
  const location = await prisma.location.findUnique({ where: { id: locationId } })
  const occupied = location ? await occupiedAtLocation(locationId) : 0
  return evaluateCapacity({ location, qty, occupied })
}

// Bin occupancy snapshot — derived from StockLedger + maxCapacity, never stored.
export async function binOccupancy({ locationId }) {
  const location = await prisma.location.findUnique({ where: { id: locationId } })
  if (!location) return null
  const currentQty = await occupiedAtLocation(locationId)
  const maxCapacity = Number(location.maxCapacity) || 0
  const occupied = currentQty
  const remaining = maxCapacity > 0 ? Math.max(0, maxCapacity - occupied) : null
  const utilizationPct = maxCapacity > 0 ? Math.round((occupied / maxCapacity) * 100) : null
  return {
    locationId,
    locationCode: location.code,
    currentQty: occupied,
    occupied,
    maxCapacity,
    remaining,
    utilizationPct,
  }
}
