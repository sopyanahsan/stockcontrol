import prisma from '@/lib/prisma'

// Shared location helpers for the Smart Location Engine.
// No business decisions live here — pure lookups + ordering.

export async function getWarehouseStorageLocations(warehouseId) {
  return prisma.location.findMany({
    where: { isActive: true, type: 'STORAGE', zone: { warehouseId } },
    include: { zone: { select: { id: true, warehouseId: true } } },
    orderBy: { code: 'asc' },
  })
}

// ponytail: no coordinate model in the DB; code order is the deterministic
// "nearest" proxy. Upgrade path: add position/location coordinates when the
// warehouse layout is digitised.
export function nearestSort(locations) {
  return [...locations].sort((a, b) => String(a.code).localeCompare(String(b.code)))
}

// Current stock at a location — derived from StockLedger (source of truth),
// never stored on the Location row.
export async function occupiedAtLocation(locationId) {
  const agg = await prisma.stockLedger.aggregate({ where: { locationId }, _sum: { qty: true } })
  return Math.max(0, Number(agg._sum.qty || 0))
}
