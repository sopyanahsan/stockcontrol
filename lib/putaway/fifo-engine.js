import prisma from '@/lib/prisma'
import { getWarehouseStorageLocations } from './location-utils'

// ============================================================
// FIFO / FEFO Engine — evaluation only, no inventory movement.
// Orders candidate layers holding the same item:
//   - expiry exists  -> FEFO (nearest expiry first)
//   - otherwise      -> FIFO (oldest receivedAt first)
// ============================================================

// FIFO layers do not carry batchNo; it lives on ReceivingLine. Resolve the
// batch for each layer via its refNumber (the GRN).
export async function batchByReceivingRef(tx, itemId, refNumbers) {
  const refs = [...new Set(refNumbers.filter(Boolean))]
  if (!refs.length) return {}
  const rows = await tx.receiving.findMany({
    where: { grnNumber: { in: refs } },
    select: { grnNumber: true, lines: { where: { itemId }, select: { batchNo: true } } },
  })
  const map = {}
  for (const r of rows) map[r.grnNumber] = r.lines[0]?.batchNo || null
  return map
}

// ponytail: expiry is not tracked per FIFO layer, so FEFO approximates by
// oldest receivedAt. Real expiry-based FEFO needs expiry on layers (future).
export function evaluateFifoFefo({ layers, batchNo = null, expiryDate = null, batchByRef = {} }) {
  const method = expiryDate ? 'FEFO' : 'FIFO'
  const sorted = [...layers].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt))
  return {
    method,
    batch: batchNo || null,
    expiryDate: expiryDate || null,
    basis: method === 'FEFO'
      ? 'Expiry detected — nearest expiry preferred (approximated by oldest receivedAt)'
      : 'FIFO — oldest stock layer first',
    candidates: sorted.map((l) => ({
      locationId: l.locationId,
      locationCode: l.location?.code,
      receivedAt: l.receivedAt,
      refNumber: l.refNumber,
      qtyRemaining: l.qtyRemaining,
      batch: batchByRef[l.refNumber] || null,
    })),
  }
}

// Fetch the item's live layers across the warehouse and evaluate FIFO/FEFO.
export async function evaluateFIFOForItem({ itemId, warehouseId, batchNo = null, expiryDate = null }) {
  const storage = await getWarehouseStorageLocations(warehouseId)
  const locIds = storage.map((l) => l.id)
  if (!locIds.length) return { method: expiryDate ? 'FEFO' : 'FIFO', basis: 'No storage locations', candidates: [] }

  const layers = await prisma.fifoLayer.findMany({
    where: { itemId, qtyRemaining: { gt: 0 }, locationId: { in: locIds } },
    include: { location: { select: { id: true, code: true } } },
    orderBy: { receivedAt: 'asc' },
  })
  const batchByRef = await batchByReceivingRef(prisma, itemId, layers.map((l) => l.refNumber))
  return evaluateFifoFefo({ layers, batchNo, expiryDate, batchByRef })
}
