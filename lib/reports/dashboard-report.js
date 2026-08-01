import prisma from '@/lib/prisma'
import { getStockOnHand } from '@/lib/stock'

// ============================================================
// Dashboard Report Service
// ------------------------------------------------------------
// READ ONLY — never modifies inventory, FIFO, or Ledger.
// Single public function: getDashboardReport(filters)
// All helpers are private (not exported).
// ============================================================

// ---------- Private helpers ----------

function startOfDay() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

async function queryKPIs({ warehouseId }) {
  const today = startOfDay()
  const thirtyDaysAgo = daysAgo(30)

  const [stockRows, todayMovements, receivingCount, putawayCount, pickingCount, packingCount, shippingCount, completedPickings] = await Promise.all([
    getStockOnHand(warehouseId ? { locationId: warehouseId } : {}),
    prisma.stockLedger.count({ where: { createdAt: { gte: today } } }),
    prisma.receiving.count({ where: warehouseId ? { warehouseId, createdAt: { gte: today } } : { createdAt: { gte: today } } }),
    warehouseId
      ? prisma.putawayTask.count({ where: { status: 'COMPLETED', completedAt: { gte: today }, receiving: { warehouseId } } })
      : prisma.putawayTask.count({ where: { status: 'COMPLETED', completedAt: { gte: today } } }),
    warehouseId
      ? prisma.pickingOrder.count({ where: { createdAt: { gte: today }, warehouseId } })
      : prisma.pickingOrder.count({ where: { createdAt: { gte: today } } }),
    warehouseId
      ? prisma.packingOrder.count({ where: { createdAt: { gte: today }, warehouseId } })
      : prisma.packingOrder.count({ where: { createdAt: { gte: today } } }),
    warehouseId
      ? prisma.shipment.count({ where: { createdAt: { gte: today }, warehouseId } })
      : prisma.shipment.count({ where: { createdAt: { gte: today } } }),
    warehouseId
      ? prisma.pickingOrder.count({ where: { status: 'COMPLETED', completedAt: { gte: today }, warehouseId } })
      : prisma.pickingOrder.count({ where: { status: 'COMPLETED', completedAt: { gte: today } } }),
  ])

  const totalUnits = stockRows.reduce((s, r) => s + r.qty, 0)
  const totalValue = stockRows.reduce((s, r) => s + r.qty * (r.item?.unitCost || 0), 0)

  const shippedOut = await prisma.stockLedger.aggregate({
    where: { txnType: 'SHIP_OUT', createdAt: { gte: thirtyDaysAgo } },
    _sum: { qty: true },
  })
  const inventoryTurnover = totalUnits > 0 ? parseFloat(((shippedOut._sum.qty || 0) / totalUnits).toFixed(2)) : 0

  const totalNonCancelled = await prisma.pickingOrder.count({
    where: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'CANCELLED' } },
  })
  const completed30 = await prisma.pickingOrder.count({
    where: { status: 'COMPLETED', completedAt: { gte: thirtyDaysAgo } },
  })
  const inventoryAccuracy = totalNonCancelled > 0 ? Math.round((completed30 / totalNonCancelled) * 100) : 100

  return {
    totalUnits: Math.round(totalUnits),
    totalValue: Math.round(totalValue),
    todayMovements,
    receivingToday: receivingCount,
    putawayToday: putawayCount,
    pickingToday: pickingCount,
    pickingCompletedToday: completedPickings,
    packingToday,
    shippingToday: shippingCount,
    inventoryTurnover,
    inventoryAccuracy,
  }
}

async function queryMovementTrend({ warehouseId, days = 30 }) {
  const dayMap = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dayMap[d.toISOString().slice(0, 10)] = { date: d.toISOString().slice(0, 10), inbound: 0, outbound: 0 }
  }

  const ledger = await prisma.stockLedger.findMany({
    where: { createdAt: { gte: daysAgo(days) } },
    select: { qty: true, createdAt: true },
  })

  for (const l of ledger) {
    const key = new Date(l.createdAt).toISOString().slice(0, 10)
    if (dayMap[key]) {
      if (l.qty >= 0) dayMap[key].inbound += l.qty
      else dayMap[key].outbound += Math.abs(l.qty)
    }
  }

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))
}

async function queryStockByCategory({ warehouseId }) {
  const stockRows = await getStockOnHand(warehouseId ? { locationId: warehouseId } : {})
  const byCategory = {}
  for (const r of stockRows) {
    const cat = r.item?.category || 'Uncategorized'
    byCategory[cat] = (byCategory[cat] || 0) + r.qty
  }
  return Object.entries(byCategory)
    .map(([name, qty]) => ({ name, qty: Math.round(qty) }))
    .sort((a, b) => b.qty - a.qty)
}

async function queryTopMovingItems({ warehouseId, limit = 10 }) {
  const start = daysAgo(30)
  const ledger = await prisma.stockLedger.groupBy({
    by: ['itemId'],
    where: { createdAt: { gte: start } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: 'desc' } },
    take: limit,
  })

  const itemIds = ledger.map((l) => l.itemId).filter(Boolean)
  if (!itemIds.length) return []

  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, name: true, category: { select: { name: true } } },
  })
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]))

  return ledger.map((l) => ({
    itemId: l.itemId,
    sku: itemMap[l.itemId]?.sku || '—',
    name: itemMap[l.itemId]?.name || '—',
    category: itemMap[l.itemId]?.category?.name || '—',
    totalMovement: Math.abs(Math.round(l._sum.qty || 0)),
  }))
}

async function queryDailyOperations({ warehouseId, days = 30 }) {
  const dayMap = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dayMap[d.toISOString().slice(0, 10)] = { date: d.toISOString().slice(0, 10), receiving: 0, putaway: 0, picking: 0, packing: 0, shipping: 0 }
  }

  const start = daysAgo(days)

  const [receivings, putaways, pickings, packings, shipments] = await Promise.all([
    prisma.receiving.findMany({ where: { createdAt: { gte: start }, status: 'COMPLETED' }, select: { createdAt: true } }),
    prisma.putawayTask.findMany({ where: { completedAt: { gte: start }, status: 'COMPLETED' }, select: { completedAt: true } }),
    prisma.pickingOrder.findMany({ where: { completedAt: { gte: start }, status: 'COMPLETED' }, select: { completedAt: true } }),
    prisma.packingOrder.findMany({ where: { completedAt: { gte: start }, status: 'COMPLETED' }, select: { completedAt: true } }),
    prisma.shipment.findMany({ where: { completedAt: { gte: start }, status: 'COMPLETED' }, select: { completedAt: true } }),
  ])

  for (const r of receivings) {
    const k = new Date(r.createdAt).toISOString().slice(0, 10)
    if (dayMap[k]) dayMap[k].receiving++
  }
  for (const t of putaways) {
    const k = new Date(t.completedAt).toISOString().slice(0, 10)
    if (dayMap[k]) dayMap[k].putaway++
  }
  for (const o of pickings) {
    const k = new Date(o.completedAt).toISOString().slice(0, 10)
    if (dayMap[k]) dayMap[k].picking++
  }
  for (const o of packings) {
    const k = new Date(o.completedAt).toISOString().slice(0, 10)
    if (dayMap[k]) dayMap[k].packing++
  }
  for (const s of shipments) {
    const k = new Date(s.completedAt).toISOString().slice(0, 10)
    if (dayMap[k]) dayMap[k].shipping++
  }

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))
}

async function queryLowStockItems({ warehouseId, limit = 20 }) {
  const stockRows = await getStockOnHand(warehouseId ? { locationId: warehouseId } : {})
  const perItem = {}
  for (const r of stockRows) {
    if (!perItem[r.itemId]) perItem[r.itemId] = { qty: 0, item: r.item }
    perItem[r.itemId].qty += r.qty
  }

  return Object.entries(perItem)
    .filter(([, v]) => v.item && v.qty <= (v.item.reorderPoint || 0))
    .map(([itemId, v]) => ({
      itemId,
      sku: v.item.sku,
      name: v.item.name,
      category: v.item.category,
      uom: v.item.uom,
      qty: Math.round(v.qty),
      reorderPoint: v.item.reorderPoint,
      minStock: v.item.minStock,
    }))
    .sort((a, b) => a.qty - b.qty)
    .slice(0, limit)
}

// ============================================================
// PUBLIC API — ONE function only
// ============================================================

/**
 * getDashboardReport
 *
 * Returns all executive dashboard data in one call.
 *
 * @param {object} filters
 * @param {string} [filters.warehouseId]
 * @returns {Promise<{ kpis, trend, byCategory, topItems, opsSummary, lowStock }>}
 */
export async function getDashboardReport({ warehouseId } = {}) {
  const [kpis, trend, byCategory, topItems, opsSummary, lowStock] = await Promise.all([
    queryKPIs({ warehouseId }),
    queryMovementTrend({ warehouseId, days: 30 }),
    queryStockByCategory({ warehouseId }),
    queryTopMovingItems({ warehouseId }),
    queryDailyOperations({ warehouseId, days: 30 }),
    queryLowStockItems({ warehouseId }),
  ])

  return { kpis, trend, byCategory, topItems, opsSummary, lowStock }
}
