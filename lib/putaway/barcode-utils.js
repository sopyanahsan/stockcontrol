import prisma from '@/lib/prisma'

// ============================================================
// Barcode Utils — normalize + auto-detect scanned codes.
// No UI coupling: USB scanners, keyboard entry and paste all
// arrive as plain text here.
// ============================================================

export function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

// Auto-detect a scanned code: LOCATION (by code), ITEM (by barcode / sku / id),
// or UNKNOWN.
export async function resolveScan(code) {
  const normalized = normalizeCode(code)
  if (!normalized) return { type: 'UNKNOWN', code: normalized, location: null, item: null }

  const [location, itemByBarcode, itemBySku, itemById] = await Promise.all([
    prisma.location.findUnique({ where: { code: normalized }, include: { zone: { select: { warehouseId: true } } } }),
    prisma.item.findFirst({ where: { barcode: normalized }, include: { category: true, uom: true } }),
    prisma.item.findUnique({ where: { sku: normalized }, include: { category: true, uom: true } }),
    prisma.item.findUnique({ where: { id: normalized }, include: { category: true, uom: true } }),
  ])

  const item = itemByBarcode || itemBySku || itemById
  if (location) return { type: 'LOCATION', code: normalized, location, item: null }
  if (item) return { type: 'ITEM', code: normalized, item, location: null }
  return { type: 'UNKNOWN', code: normalized, location: null, item: null }
}
