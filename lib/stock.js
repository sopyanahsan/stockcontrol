import prisma from '@/lib/prisma'

// BUSINESS RULE: current stock is ALWAYS calculated from StockLedger. Never stored, never edited.

export async function getStockOnHand({ itemId = null, locationId = null } = {}) {
  const where = {}
  if (itemId) where.itemId = itemId
  if (locationId) where.locationId = locationId

  const grouped = await prisma.stockLedger.groupBy({
    by: ['itemId', 'locationId'],
    where,
    _sum: { qty: true },
  })

  const rows = grouped.filter((g) => (g._sum.qty || 0) !== 0)
  if (rows.length === 0) return []

  const itemIds = [...new Set(rows.map((r) => r.itemId))]
  const locationIds = [...new Set(rows.map((r) => r.locationId))]

  const [items, locations] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: itemIds } }, include: { category: true, uom: true } }),
    prisma.location.findMany({ where: { id: { in: locationIds } }, include: { zone: { include: { warehouse: true } } } }),
  ])
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]))
  const locMap = Object.fromEntries(locations.map((l) => [l.id, l]))

  return rows.map((r) => ({
    itemId: r.itemId,
    locationId: r.locationId,
    qty: r._sum.qty || 0,
    item: itemMap[r.itemId]
      ? {
          sku: itemMap[r.itemId].sku,
          name: itemMap[r.itemId].name,
          category: itemMap[r.itemId].category?.name,
          uom: itemMap[r.itemId].uom?.code,
          minStock: itemMap[r.itemId].minStock,
          reorderPoint: itemMap[r.itemId].reorderPoint,
          unitCost: itemMap[r.itemId].unitCost,
        }
      : null,
    location: locMap[r.locationId]
      ? {
          code: locMap[r.locationId].code,
          type: locMap[r.locationId].type,
          zone: locMap[r.locationId].zone?.code,
          warehouse: locMap[r.locationId].zone?.warehouse?.code,
        }
      : null,
  }))
}

export async function getItemTotalStock(itemId) {
  const agg = await prisma.stockLedger.aggregate({ where: { itemId }, _sum: { qty: true } })
  return agg._sum.qty || 0
}

export async function getStockAtLocation(itemId, locationId) {
  const agg = await prisma.stockLedger.aggregate({ where: { itemId, locationId }, _sum: { qty: true } })
  return agg._sum.qty || 0
}
