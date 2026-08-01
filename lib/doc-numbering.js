import prisma from '@/lib/prisma'

// ============================================================
// Centralized Document Number Generator
// ------------------------------------------------------------
// Format:  {PREFIX}-{WAREHOUSE_CODE}-{YYYYMM}-{NNNNNN}
// Example: GRN-WH01-202607-000001
// Rules:
//   - Sequence resets every month per (prefix, warehouse)
//   - Sequence is auto-generated, immutable, never re-used
//   - Concurrency-safe via Prisma atomic upsert with unique constraint
//   - Reusable for all modules: GRN, PUT, MOV, ADJ, CC, SO, ...
// ============================================================

const DEFAULT_PAD = 6

export const DOC_PREFIXES = {
  GRN: 'GRN',   // Goods Receipt Note (Receiving)
  PUT: 'PUT',   // Putaway Task
  MOV: 'MOV',   // Stock Movement / Transfer
  ADJ: 'ADJ',   // Stock Adjustment
  CC: 'CC',     // Cycle Count
  SO: 'SO',     // Stock Opname
  PICK: 'PICK', // Picking Order
  PACK: 'PACK', // Packing Order
  PKG: 'PKG',   // Package
  SHIP: 'SHIP', // Shipment
}

function yearMonth(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

function normalizeWarehouseCode(code) {
  return String(code || 'WH00').replace(/-/g, '').toUpperCase().slice(0, 12)
}

// tx is optional - pass the prisma transaction client when calling from inside prisma.$transaction
export async function nextDocNumber({ prefix, warehouseCode, tx, pad = DEFAULT_PAD }) {
  if (!prefix) throw new Error('doc-numbering: prefix is required')
  if (!warehouseCode) throw new Error('doc-numbering: warehouseCode is required')

  const client = tx || prisma
  const wh = normalizeWarehouseCode(warehouseCode)
  const ym = yearMonth()

  // Atomic upsert with increment on the unique constraint (prefix, warehouseCode, yearMonth)
  const row = await client.documentSequence.upsert({
    where: { prefix_warehouseCode_yearMonth: { prefix, warehouseCode: wh, yearMonth: ym } },
    update: { lastSeq: { increment: 1 } },
    create: { prefix, warehouseCode: wh, yearMonth: ym, lastSeq: 1 },
  })

  return `${prefix}-${wh}-${ym}-${String(row.lastSeq).padStart(pad, '0')}`
}

// Convenience wrappers
export const nextGrnNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.GRN, warehouseCode, tx })
export const nextPutawayNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.PUT, warehouseCode, tx })
export const nextMovementNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.MOV, warehouseCode, tx })
export const nextAdjustmentNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.ADJ, warehouseCode, tx })
export const nextCycleCountNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.CC, warehouseCode, tx })
export const nextPickingNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.PICK, warehouseCode, tx })
export const nextPackingNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.PACK, warehouseCode, tx })
export const nextPackageNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.PKG, warehouseCode, tx })
export const nextShipmentNumber = (warehouseCode, tx) => nextDocNumber({ prefix: DOC_PREFIXES.SHIP, warehouseCode, tx })
