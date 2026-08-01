import prisma from '@/lib/prisma'
import { getStockOnHand } from '@/lib/stock'

// ============================================================
// Inventory Report Service
// ------------------------------------------------------------
// READ ONLY — never modifies inventory, FIFO, or Ledger.
// Single public function: getInventoryReport(reportType, filters)
// All helpers are private (not exported).
// Reuses getStockOnHand from lib/stock.js
// ============================================================

const VALID_TYPES = ['stock-on-hand', 'stock-card', 'inventory-aging', 'fifo-aging', 'dead-stock']

// ---------- Private helpers ----------

function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function toAgeBucket(daysOld, buckets) {
  for (const boundary of buckets) {
    if (daysOld <= boundary.maxDays) return `${boundary.minDays}-${boundary.maxDays}`
  }
  return `${buckets[buckets.length - 1].minDays}+`
}

function computeBucketSummary(rows, buckets, qtyKey = 'qty') {
  const bucketTotals = {}
  for (const b of buckets) {
    const label = `${b.minDays}-${b.maxDays}`
    bucketTotals[label] = 0
  }

  const totalQty = rows.reduce((s, r) => s + (r[qtyKey] || 0), 0)
  for (const r of rows) {
    const daysOld = r.daysSinceActivity ?? r.daysOld ?? 0
    const label = toAgeBucket(daysOld, buckets)
    bucketTotals[label] = (bucketTotals[label] || 0) + (r[qtyKey] || 0)
  }

  return {
    buckets: Object.entries(bucketTotals).map(([label, qty]) => ({
      label,
      qty: Math.round(qty * 100) / 100,
      pct: totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0,
    })),
    totalQty: Math.round(totalQty * 100) / 100,
  }
}

// ----- Stock On Hand -----
async function queryStockOnHand({ locationId, itemId, categoryId, limit = 500, offset = 0 }) {
  const stockRows = await getStockOnHand(locationId ? { locationId } : {})

  let filtered = stockRows
  if (itemId) filtered = filtered.filter((r) => r.itemId === itemId)
  if (categoryId) filtered = filtered.filter((r) => r.item?.category === categoryId)

  const total = filtered.length
  const rows = filtered.slice(offset, offset + limit).map((r) => ({
    itemId: r.itemId,
    sku: r.item?.sku || '—',
    name: r.item?.name || '—',
    category: r.item?.category || '—',
    uom: r.item?.uom || '—',
    locationId: r.locationId,
    locationCode: r.location?.code || '—',
    locationType: r.location?.type || '—',
    zone: r.location?.zone || '—',
    warehouse: r.location?.warehouse || '—',
    qty: Math.round(r.qty * 100) / 100,
    unitCost: r.item?.unitCost || 0,
    totalValue: Math.round(r.qty * (r.item?.unitCost || 0) * 100) / 100,
    minStock: r.item?.minStock || 0,
    reorderPoint: r.item?.reorderPoint || 0,
    isLowStock: r.qty <= (r.item?.reorderPoint || 0),
  }))

  const grandTotalQty = rows.reduce((s, r) => s + r.qty, 0)
  const grandTotalValue = rows.reduce((s, r) => s + r.totalValue, 0)

  return { data: rows, total, grandTotalQty, grandTotalValue }
}

// ----- Stock Card — server-side running balance (ASC order for cumulative) -----
async function queryStockCard({ itemId, locationId, fromDate, toDate, limit = 200, offset = 0 }) {
  if (!itemId) throw new Error('itemId is required')

  const where = { itemId }
  if (locationId) where.locationId = locationId
  if (fromDate || toDate) {
    where.createdAt = {}
    if (fromDate) {
      const d = parseDate(fromDate)
      if (d) where.createdAt.gte = d
    }
    if (toDate) {
      const d = parseDate(toDate)
      if (d) { d.setHours(23, 59, 59, 999); where.createdAt.lte = d }
    }
  }

  const [entries, total] = await Promise.all([
    prisma.stockLedger.findMany({
      where,
      include: {
        item: { select: { sku: true, name: true } },
        location: { select: { code: true } },
        user: { select: { name: true } },
        reasonCode: { select: { code: true, description: true } },
      },
      orderBy: { createdAt: 'asc' },  // ASC for correct cumulative running balance
      take: limit,
      skip: offset,
    }),
    prisma.stockLedger.count({ where }),
  ])

  // Server-side running balance — ASC order means balance accumulates oldest → newest
  let balance = 0
  const rows = entries.map((e) => {
    balance += e.qty
    return {
      id: e.id,
      date: e.createdAt,
      txnType: e.txnType,
      refNumber: e.refNumber || '—',
      locationCode: e.location.code,
      qty: Math.round(e.qty * 100) / 100,
      unitCost: e.unitCost,
      balance: Math.round(balance * 100) / 100,
      refType: e.refType || '—',
      refId: e.refId || '—',
      reasonCode: e.reasonCode?.code || '—',
      reasonDescription: e.reasonCode?.description || '—',
      remarks: e.remarks || '—',
      user: e.user.name,
    }
  })

  return { data: rows, total }
}

// ----- Inventory Aging — configurable buckets -----
async function queryInventoryAging({ locationId, itemId, categoryId, fromDate, toDate, buckets, limit = 500, offset = 0 }) {
  // Default buckets: 0-30, 31-60, 61-90, 90+
  const ageBuckets = buckets || [
    { minDays: 0, maxDays: 30 },
    { minDays: 31, maxDays: 60 },
    { minDays: 61, maxDays: 90 },
    { minDays: 91, maxDays: 9999 },
  ]

  const stockRows = await getStockOnHand(locationId ? { locationId } : {})
  let filtered = stockRows
  if (itemId) filtered = filtered.filter((r) => r.itemId === itemId)
  if (categoryId) filtered = filtered.filter((r) => r.item?.category === categoryId)

  const itemIds = [...new Set(filtered.map((r) => r.itemId))]
  if (!itemIds.length) return { data: [], total: 0, summary: {} }

  const now = new Date()

  // Latest ledger entry per item for age calculation
  const latestLedger = {}
  const ledgerRows = await prisma.stockLedger.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  for (const r of ledgerRows) {
    if (!latestLedger[r.itemId]) latestLedger[r.itemId] = r.createdAt
  }

  const rows = filtered.map((r) => {
    const lastDate = latestLedger[r.itemId]
    const daysOld = lastDate ? Math.floor((now - new Date(lastDate)) / (1000 * 60 * 60 * 24)) : 999
    return {
      itemId: r.itemId,
      sku: r.item?.sku || '—',
      name: r.item?.name || '—',
      category: r.item?.category || '—',
      locationCode: r.location?.code || '—',
      qty: Math.round(r.qty * 100) / 100,
      lastActivityDate: lastDate,
      daysSinceActivity: daysOld,
      unitCost: r.item?.unitCost || 0,
      totalValue: Math.round(r.qty * (r.item?.unitCost || 0) * 100) / 100,
    }
  })

  const total = rows.length
  const sortedRows = rows.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity).slice(offset, offset + limit)
  const summary = {
    totalItems: total,
    totalValue: Math.round(rows.reduce((s, r) => s + r.totalValue, 0)),
    ...computeBucketSummary(rows, ageBuckets),
  }

  return { data: sortedRows, total, summary }
}

// ----- FIFO Aging -----
async function queryFifoAging({ locationId, itemId, warehouseId, limit = 500, offset = 0 }) {
  const where = { qtyRemaining: { gt: 0 } }
  if (itemId) where.itemId = itemId
  if (locationId) where.locationId = locationId

  const [layers, total] = await Promise.all([
    prisma.fifoLayer.findMany({
      where,
      include: {
        item: { select: { sku: true, name: true, category: { select: { name: true } }, uom: { select: { code: true } }, unitCost: true } },
        location: { select: { code: true, type: true, zone: { include: { warehouse: { select: { code: true } } } } } },
      },
      orderBy: { receivedAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.fifoLayer.count({ where }),
  ])

  const now = new Date()
  const rows = layers.map((l) => {
    const daysOld = Math.floor((now - new Date(l.receivedAt)) / (1000 * 60 * 60 * 24))
    return {
      fifoLayerId: l.id,
      itemId: l.itemId,
      sku: l.item?.sku || '—',
      name: l.item?.name || '—',
      category: l.item?.category?.name || '—',
      locationCode: l.location?.code || '—',
      zone: l.location?.zone?.code || '—',
      warehouse: l.location?.zone?.warehouse?.code || '—',
      refNumber: l.refNumber || '—',
      receivedAt: l.receivedAt,
      qtyRemaining: Math.round(l.qtyRemaining * 100) / 100,
      unitCost: l.unitCost,
      totalValue: Math.round(l.qtyRemaining * l.unitCost * 100) / 100,
      daysOld,
    }
  })

  return { data: rows, total }
}

// ----- Dead Stock -----
async function queryDeadStock({ locationId, days = 90, limit = 500, offset = 0 }) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  cutoff.setHours(0, 0, 0, 0)

  const stockRows = await getStockOnHand(locationId ? { locationId } : {})
  const itemIds = [...new Set(stockRows.map((r) => r.itemId))]
  if (!itemIds.length) return { data: [], total: 0 }

  const lastMovement = {}
  const ledgerRows = await prisma.stockLedger.findMany({
    where: { itemId: { in: itemIds }, createdAt: { gte: cutoff } },
    select: { itemId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  for (const r of ledgerRows) {
    if (!lastMovement[r.itemId]) lastMovement[r.itemId] = r.createdAt
  }

  const perItem = {}
  for (const r of stockRows) {
    if (!perItem[r.itemId]) perItem[r.itemId] = { qty: 0, item: r.item, locations: [] }
    perItem[r.itemId].qty += r.qty
    perItem[r.itemId].locations.push(r.location?.code || '—')
  }

  const deadRows = Object.entries(perItem)
    .filter(([itemId]) => !lastMovement[itemId])
    .map(([itemId, v]) => ({
      itemId,
      sku: v.item?.sku || '—',
      name: v.item?.name || '—',
      category: v.item?.category || '—',
      uom: v.item?.uom || '—',
      totalQty: Math.round(v.qty * 100) / 100,
      unitCost: v.item?.unitCost || 0,
      totalValue: Math.round(v.qty * (v.item?.unitCost || 0) * 100) / 100,
      locations: [...new Set(v.locations)].join(', '),
      lastActivityDate: null,
      daysInactive: days,
    }))

  const total = deadRows.length
  const summary = {
    totalItems: total,
    totalQty: deadRows.reduce((s, r) => s + r.totalQty, 0),
    totalValue: deadRows.reduce((s, r) => s + r.totalValue, 0),
  }

  return { data: deadRows.slice(offset, offset + limit), total, summary }
}

// ============================================================
// PUBLIC API — ONE function only
// ============================================================

/**
 * getInventoryReport
 *
 * @param {'stock-on-hand'|'stock-card'|'inventory-aging'|'fifo-aging'|'dead-stock'} reportType
 * @param {object} filters
 * @param {string} [filters.locationId]
 * @param {string} [filters.itemId]
 * @param {string} [filters.categoryId]
 * @param {string} [filters.fromDate]
 * @param {string} [filters.toDate]
 * @param {Array<{minDays:number,maxDays:number}>} [filters.buckets]  — for inventory-aging only
 * @param {number} [filters.days]      — for dead-stock (default 90)
 * @param {number} [filters.limit=500]
 * @param {number} [filters.offset=0]
 * @returns {Promise<{data, total, summary?, grandTotalQty?, grandTotalValue?}>}
 */
export async function getInventoryReport(reportType, filters = {}) {
  if (!VALID_TYPES.includes(reportType)) {
    throw new Error(`Invalid reportType. Must be one of: ${VALID_TYPES.join(', ')}`)
  }

  const limit = Math.min(Number(filters.limit) || 500, 1000)
  const offset = Number(filters.offset) || 0

  let result
  switch (reportType) {
    case 'stock-on-hand':
      result = await queryStockOnHand(filters)
      break
    case 'stock-card':
      result = await queryStockCard(filters)
      break
    case 'inventory-aging':
      result = await queryInventoryAging(filters)
      break
    case 'fifo-aging':
      result = await queryFifoAging(filters)
      break
    case 'dead-stock':
      result = await queryDeadStock(filters)
      break
    default:
      throw new Error(`Unhandled reportType: ${reportType}`)
  }

  if (result && typeof result === 'object') {
    result.pagination = {
      limit,
      offset,
      total: result.total ?? (Array.isArray(result.data) ? result.data.length : 0),
    }
  }

  return result
}
