import prisma from '@/lib/prisma'
import { getWarehouseStorageLocations, nearestSort, occupiedAtLocation } from './location-utils'
import { evaluateCapacity } from './capacity-engine'
import { batchByReceivingRef, evaluateFifoFefo } from './fifo-engine'

// ============================================================
// Recommendation Score Engine — ranks candidate storage locations
// with weighted rules. Read-only; scores the results the Smart
// Location Engine already produces. Never writes inventory.
//
// Weights (total 100):
//   SAME_SKU 30, SAME_BATCH 20, CAPACITY 20, FIFO_FEFO 15,
//   DISTANCE 10, ZONE_PREFERENCE 5.
// ============================================================

export const RECOMMENDATION_WEIGHTS = {
  SAME_SKU: 30,
  SAME_BATCH: 20,
  CAPACITY: 20,
  FIFO_FEFO: 15,
  DISTANCE: 10,
  ZONE_PREFERENCE: 5,
}

export const RECOMMENDATION_MAX_SCORE = Object.values(RECOMMENDATION_WEIGHTS).reduce((s, w) => s + w, 0)

const STRATEGY_LABELS = {
  SAME_SKU: 'Same SKU consolidation',
  SAME_BATCH: 'Batch consolidation',
  CAPACITY: 'Capacity available',
  FIFO_FEFO: 'FIFO/FEFO match',
  DISTANCE: 'Nearest placement',
  ZONE_PREFERENCE: 'Zone preference',
}

// Distance between two positions in the code-sorted location list.
function codeGap(fromIndex, toIndex) {
  return Math.abs(fromIndex - toIndex)
}

async function buildContext({ itemId, qty, warehouseId, batchNo, expiryDate }) {
  const storage = await getWarehouseStorageLocations(warehouseId)
  const ordered = nearestSort(storage)
  const locIds = ordered.map((l) => l.id)

  const layers = locIds.length
    ? await prisma.fifoLayer.findMany({
        where: { itemId, qtyRemaining: { gt: 0 }, locationId: { in: locIds } },
        include: { location: { select: { id: true, code: true } } },
        orderBy: { receivedAt: 'asc' },
      })
    : []
  const batchByRef = await batchByReceivingRef(prisma, itemId, layers.map((l) => l.refNumber))
  const fifo = evaluateFifoFefo({ layers, batchNo, expiryDate, batchByRef })

  const occupied = {}
  await Promise.all(ordered.map(async (l) => { occupied[l.id] = await occupiedAtLocation(l.id) }))

  const layerByLoc = {}
  const zoneHasItem = new Set()
  const indexByLoc = {}
  const sameSkuIndexes = []
  ordered.forEach((l, i) => {
    indexByLoc[l.id] = i
    const here = layers.filter((x) => x.locationId === l.id)
    if (here.length) {
      layerByLoc[l.id] = here
      sameSkuIndexes.push(i)
      zoneHasItem.add(l.zoneId)
    }
  })

  return { ordered, layers, batchByRef, fifo, occupied, layerByLoc, zoneHasItem, indexByLoc, sameSkuIndexes }
}

// Score a single location against the shared context.
export function scoreLocation({ location, qty, ctx }) {
  const { fifo, occupied, layerByLoc, zoneHasItem, indexByLoc, sameSkuIndexes } = ctx
  const reasons = []
  const warnings = []
  const factors = []
  let score = 0

  const layersHere = layerByLoc[location.id] || []
  const occ = occupied[location.id] || 0

  // SAME_SKU (30)
  if (layersHere.length) {
    score += RECOMMENDATION_WEIGHTS.SAME_SKU
    reasons.push('Same SKU')
    factors.push({ factor: 'SAME_SKU', score: RECOMMENDATION_WEIGHTS.SAME_SKU })
  }

  // SAME_BATCH (20)
  const hasSameBatch = layersHere.some((l) => ctx.batchNo && batchByRef?.[l.refNumber] === ctx.batchNo)
  if (hasSameBatch) {
    score += RECOMMENDATION_WEIGHTS.SAME_BATCH
    reasons.push('Same Batch')
    factors.push({ factor: 'SAME_BATCH', score: RECOMMENDATION_WEIGHTS.SAME_BATCH })
  }

  // CAPACITY (20)
  const cap = evaluateCapacity({ location, qty, occupied: occ })
  if (cap.allowPutaway) {
    if (cap.status === 'UNLIMITED') {
      score += 15
      reasons.push('Capacity Unlimited')
      factors.push({ factor: 'CAPACITY', score: 15 })
    } else if (cap.maxCapacity > 0) {
      const capScore = Math.round((cap.remaining / cap.maxCapacity) * RECOMMENDATION_WEIGHTS.CAPACITY)
      score += capScore
      reasons.push(`Capacity Available (${cap.remaining} free)`)
      factors.push({ factor: 'CAPACITY', score: capScore })
    }
  } else {
    warnings.push(cap.reason)
  }

  // FIFO_FEFO (15)
  const rank = fifo.candidates.findIndex((f) => f.locationId === location.id)
  if (rank === 0) {
    score += RECOMMENDATION_WEIGHTS.FIFO_FEFO
    reasons.push(`${fifo.method} Match`)
    factors.push({ factor: 'FIFO_FEFO', score: RECOMMENDATION_WEIGHTS.FIFO_FEFO })
  } else if (rank > 0) {
    score += 8
    reasons.push(`${fifo.method} Layer`)
    factors.push({ factor: 'FIFO_FEFO', score: 8 })
  }

  // DISTANCE (10) — near existing stock, code-order proxy
  const idx = indexByLoc[location.id]
  if (layersHere.length) {
    score += RECOMMENDATION_WEIGHTS.DISTANCE
    reasons.push('Near Existing Stock')
    factors.push({ factor: 'DISTANCE', score: RECOMMENDATION_WEIGHTS.DISTANCE })
  } else if (sameSkuIndexes.length) {
    const nearestGap = Math.min(...sameSkuIndexes.map((i) => codeGap(idx, i)))
    const maxGap = ctx.ordered.length - 1
    const distScore = maxGap > 0 ? Math.round(RECOMMENDATION_WEIGHTS.DISTANCE * (1 - nearestGap / maxGap)) : 5
    score += distScore
    reasons.push(`Distance ${nearestGap} to existing stock`)
    factors.push({ factor: 'DISTANCE', score: distScore })
  } else {
    score += 5
    reasons.push('Neutral Distance')
    factors.push({ factor: 'DISTANCE', score: 5 })
  }

  // ZONE_PREFERENCE (5)
  if (zoneHasItem.has(location.zoneId)) {
    score += RECOMMENDATION_WEIGHTS.ZONE_PREFERENCE
    reasons.push('Preferred Zone')
    factors.push({ factor: 'ZONE_PREFERENCE', score: RECOMMENDATION_WEIGHTS.ZONE_PREFERENCE })
  }

  if (!cap.allowPutaway && !warnings.includes(cap.reason)) warnings.push(cap.reason)
  if (warnings.length === 0 && score < 50) warnings.push('Low score')

  const top = [...factors].sort((a, b) => b.score - a.score)[0]
  const strategy = top ? (STRATEGY_LABELS[top.factor] || top.factor) : 'No dominant factor'

  return {
    location: { id: location.id, code: location.code, type: location.type },
    score: Math.min(100, score),
    available: cap.allowPutaway,
    reasons,
    warnings,
    strategy,
    capacity: { occupied: occ, maxCapacity: cap.maxCapacity, remaining: cap.remaining, status: cap.status },
    factors,
  }
}

// Rank every storage location for a putaway line.
export async function rankLocations({ itemId, qty, warehouseId, batchNo = null, expiryDate = null, take = 4 }) {
  const item = await prisma.item.findUnique({ where: { id: itemId }, include: { category: true, uom: true } })
  if (!item) throw new Error('Item not found')

  const ctx = await buildContext({ itemId, qty, warehouseId, batchNo, expiryDate })
  const ranked = ctx.ordered
    .map((location) => scoreLocation({ location, qty, ctx }))
    .sort((a, b) => (Number(b.available) - Number(a.available)) || (b.score - a.score))

  return {
    item: { id: item.id, sku: item.sku, name: item.name, category: item.category?.name, uom: item.uom?.code },
    warehouseId,
    primary: ranked[0] || null,
    alternatives: ranked.slice(1, take),
    ranked,
    weights: RECOMMENDATION_WEIGHTS,
  }
}
