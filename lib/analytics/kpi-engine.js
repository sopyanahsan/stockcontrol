// ============================================================
// KPI ENGINE — Phase A.1 (Enterprise Analytics Foundation)
// ------------------------------------------------------------
// Centralized business-calculation layer for EVERY analytics
// surface: Dashboard, Reports, Executive Dashboard, Analytics
// module, and future analytics APIs. No page or module computes
// KPIs independently anymore — they all consume this engine.
//
// PHASE SCOPE
//   A.1  → architecture only. No SQL, no Prisma, no calculations.
//   A.2  → implement each KPI against Prisma using the shared
//          utilities below.
//
// CONTRACT
//   Every public function returns a consistent envelope:
//     { success:true,  generatedAt:Date, data:{...} }
//   and on any failure:
//     { success:false, error:string, generatedAt:Date, data:null }
//
//   The engine is PURE SERVER-SIDE business logic:
//   no React, no JSX, no UI, no HTTP routes.
// ============================================================

import prisma from '@/lib/prisma'
import { getStockOnHand } from '@/lib/stock'

// ==================== RESPONSE ENVELOPE ====================
// Internal helpers keep every public function's return shape
// identical and avoid duplicating the try/catch boilerplate.

function ok(data) {
  return { success: true, generatedAt: new Date(), data }
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error)
  return { success: false, error: message, generatedAt: new Date(), data: null }
}

// ==================== SHARED UTILITIES ====================
// Pure, framework-agnostic helpers reused internally by every
// KPI implementation in Phase A.2 (and by future callers).

/**
 * safeDivide
 * Purpose: Divide two numbers without throwing or producing NaN/Infinity.
 * Input:   numerator, denominator (any numeric-ish values).
 * Output:  quotient (Number). Returns 0 when the denominator is 0 or either
 *          value is not a finite number.
 * Business meaning: Prevents division-by-zero blowups in ratio KPIs such as
 *                   accuracy, variance and fulfillment rates.
 */
export function safeDivide(numerator, denominator) {
  const d = Number(denominator)
  if (!Number.isFinite(d) || d === 0) return 0
  const n = Number(numerator)
  return Number.isFinite(n) ? n / d : 0
}

/**
 * calculatePercentage
 * Purpose: Compute a percentage from a part and a total.
 * Input:   part (Number), total (Number).
 * Output:  percentage (Number, 0-100 scale). Returns 0 when total is 0.
 * Business meaning: Basis for accuracy, variance, aging and completion KPIs.
 */
export function calculatePercentage(part, total) {
  return safeDivide(part, total) * 100
}

/**
 * sumQuantity
 * Purpose: Sum quantities across a list of rows.
 * Input:   rows (Array), optional getQty(row) accessor. Defaults to row.qty.
 * Output:  sum (Number).
 * Business meaning: Total units moved/received/picked across a dataset.
 */
export function sumQuantity(rows, getQty) {
  if (!Array.isArray(rows)) return 0
  const pick = typeof getQty === 'function' ? getQty : (r) => r.qty
  return rows.reduce((sum, r) => sum + (Number(pick(r)) || 0), 0)
}

/**
 * sumValue
 * Purpose: Sum monetary value across a list of rows.
 * Input:   rows (Array), optional getValue(row) accessor.
 *          Defaults to row.qty * row.unitCost.
 * Output:  sum (Number).
 * Business meaning: Inventory valuation and movement value totals.
 */
export function sumValue(rows, getValue) {
  if (!Array.isArray(rows)) return 0
  const pick = typeof getValue === 'function'
    ? getValue
    : (r) => Number(r.qty || 0) * Number(r.unitCost || 0)
  return rows.reduce((sum, r) => sum + (Number(pick(r)) || 0), 0)
}

/**
 * groupRows (internal)
 * Purpose: Single generic grouping routine behind every groupBy* helper.
 * Input:   rows (Array), getKey(row) accessor producing the group key.
 * Output:  plain object mapping group key -> Array of rows.
 *          Rows with null/empty keys fall into "Uncategorized".
 */
function groupRows(rows, getKey) {
  const groups = {}
  if (!Array.isArray(rows)) return groups
  const pick = typeof getKey === 'function' ? getKey : (r) => r.key
  for (const row of rows) {
    const raw = pick(row)
    const key = raw == null || raw === '' ? 'Uncategorized' : String(raw)
    ;(groups[key] = groups[key] || []).push(row)
  }
  return groups
}

/**
 * groupByCategory
 * Purpose: Group rows by item category.
 * Input:   rows (Array), optional getKey(row) accessor.
 *          Defaults to row.category.name / row.category / row.item.category.name.
 * Output:  object keyed by category name -> Array of rows.
 * Business meaning: Category-level distribution of stock, value or movement.
 */
export function groupByCategory(rows, getKey) {
  const pick = typeof getKey === 'function'
    ? getKey
    : (r) => r.category?.name || r.category?.id || r.item?.category?.name || 'Uncategorized'
  return groupRows(rows, pick)
}

/**
 * groupByWarehouse
 * Purpose: Group rows by warehouse.
 * Input:   rows (Array), optional getKey(row) accessor.
 *          Defaults to row.warehouse.code/name or nested location/zone/warehouse.
 * Output:  object keyed by warehouse identifier -> Array of rows.
 * Business meaning: Warehouse-level comparison of stock, throughput and value.
 */
export function groupByWarehouse(rows, getKey) {
  const pick = typeof getKey === 'function'
    ? getKey
    : (r) => r.warehouse?.code
      || r.warehouse?.name
      || r.location?.warehouse?.code
      || r.zone?.warehouse?.code
      || 'Uncategorized'
  return groupRows(rows, pick)
}

/**
 * groupByLocation
 * Purpose: Group rows by storage location.
 * Input:   rows (Array), optional getKey(row) accessor.
 *          Defaults to row.location.code/name or row.zone.code.
 * Output:  object keyed by location identifier -> Array of rows.
 * Business meaning: Location-level stock accuracy and movement analysis.
 */
export function groupByLocation(rows, getKey) {
  const pick = typeof getKey === 'function'
    ? getKey
    : (r) => r.location?.code || r.location?.name || r.zone?.code || 'Uncategorized'
  return groupRows(rows, pick)
}

/**
 * dateRangeFilter
 * Purpose: Build a Prisma-style date range filter from optional dates.
 * Input:   { fromDate, toDate } (Date or date-string, or undefined).
 * Output:  { gte?: Date, lte?: Date } — empty object when neither/invalid.
 * Business meaning: Shared boundary guard so every KPI enforces the same
 *                   period filtering instead of re-implementing date logic.
 */
export function dateRangeFilter({ fromDate, toDate } = {}) {
  const range = {}
  const from = fromDate ? new Date(fromDate) : null
  const to = toDate ? new Date(toDate) : null
  if (from && !Number.isNaN(from.getTime())) range.gte = from
  if (to && !Number.isNaN(to.getTime())) range.lte = to
  return range
}

/**
 * statusCountsMap (internal)
 * Purpose: Turn a Prisma groupBy-by-status result into a fixed object with
 *          every documented status present (zero-filled when absent).
 * Input:   grouped (Array of { status, _count }), statuses (Array of enum values).
 * Output:  plain object mapping status -> count.
 * Business meaning: Keeps every status breakdown shape stable for consumers.
 */
function statusCountsMap(grouped, statuses) {
  const counts = {}
  for (const s of statuses) counts[s] = 0
  for (const g of grouped || []) {
    if (g && g.status in counts) counts[g.status] = g._count || 0
  }
  return counts
}

/**
 * periodStarts (internal)
 * Purpose: Build the `gte` boundary for today / this-week / this-month windows.
 * Input:   none (uses the current time).
 * Output:  { today: {gte}, thisWeek: {gte}, thisMonth: {gte} } Prisma fragments.
 * Business meaning: One shared definition of reporting periods across all
 *                   operational KPI functions (no per-function date math).
 */
function periodStarts() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const week = new Date(today)
  const dow = week.getDay() || 7 // Sunday -> 7, so Monday is week start
  week.setDate(week.getDate() - dow + 1)

  const month = new Date(today.getFullYear(), today.getMonth(), 1)

  return {
    today: { gte: today },
    thisWeek: { gte: week },
    thisMonth: { gte: month },
  }
}

/**
 * periodCounts (internal)
 * Purpose: Count documents completed within today / this-week / this-month
 *          using a per-model timestamp field.
 * Input:   model (Prisma delegate), timeField (e.g. 'postedAt'|'completedAt').
 * Output:  { today, thisWeek, thisMonth } counts (Number).
 * Business meaning: Throughput windows reused by every operational KPI.
 */
async function periodCounts(model, timeField) {
  const p = periodStarts()
  const [today, thisWeek, thisMonth] = await Promise.all([
    model.count({ where: { [timeField]: p.today } }),
    model.count({ where: { [timeField]: p.thisWeek } }),
    model.count({ where: { [timeField]: p.thisMonth } }),
  ])
  return { today, thisWeek, thisMonth }
}

// ==================== KPI FUNCTIONS ====================
// Each function is the single owner of its metric set. Phase A.2 fills
// `data` with Prisma queries; the envelope, filters and error handling are
// already locked in here so downstream callers never change.

/**
 * getDashboardMetrics
 * Purpose: Aggregate every high-level KPI rendered on the Dashboard. This is the
 *          SINGLE SOURCE OF TRUTH for the Dashboard — no page computes these.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, locationId }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              activeSku,        // COUNT(Item WHERE isActive = true)
 *              stockOnHand,      // SUM(current stock quantity)
 *              inventoryValue,   // SUM(Qty × Unit Cost) — 0 when cost is null
 *              lowStock,         // count of items with Qty <= Reorder Point
 *              outOfStock,       // count of items with Qty <= 0
 *              suppliers: { total, active, inactive, added30Days }
 *            }
 * Business meaning: Single source of truth for the Dashboard; the page no longer
 *                   computes any metric on its own. Returns raw numbers only.
 */
export async function getDashboardMetrics({ filters = {} } = {}) {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Parallel batch: active items, shared stock source, supplier breakdown.
    const [activeItems, stockRows, supplierGroup, suppliersAdded30Days] = await Promise.all([
      prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, reorderPoint: true, unitCost: true },
      }),
      getStockOnHand(),
      prisma.supplier.groupBy({ by: ['isActive'], _count: true }),
      prisma.supplier.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ])

    // Per-item on-hand quantities derived from the shared stock source.
    // Items absent from the map have no stock (qty = 0).
    const qtyByItem = {}
    for (const row of stockRows) {
      qtyByItem[row.itemId] = (qtyByItem[row.itemId] || 0) + Number(row.qty || 0)
    }

    const stockOnHand = sumQuantity(stockRows)
    const inventoryValue = stockRows.reduce(
      (sum, row) => sum + Number(row.qty || 0) * Number(row.item?.unitCost || 0),
      0
    )

    const lowStock = activeItems.filter((i) => (qtyByItem[i.id] || 0) <= Number(i.reorderPoint || 0)).length
    const outOfStock = activeItems.filter((i) => (qtyByItem[i.id] || 0) <= 0).length

    const suppliersTotal = supplierGroup.reduce((s, g) => s + g._count, 0)
    const suppliersActive = (supplierGroup.find((g) => g.isActive === true) || {})._count || 0
    const suppliersInactive = (supplierGroup.find((g) => g.isActive === false) || {})._count || 0

    return ok({
      activeSku: activeItems.length,
      stockOnHand,
      inventoryValue,
      lowStock,
      outOfStock,
      suppliers: {
        total: suppliersTotal,
        active: suppliersActive,
        inactive: suppliersInactive,
        added30Days: suppliersAdded30Days,
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getInventoryMetrics
 * Purpose: Aggregate inventory-wide KPIs (SKU counts, quantities, values,
 *          health classification and category/warehouse/location breakdowns).
 *          SINGLE SOURCE OF TRUTH for every inventory KPI.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, categoryId }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary: { totalSku, totalQuantity, inventoryValue, averageStockPerSku },
 *              health:  { healthy, low, outOfStock, deadStock },
 *              categoryBreakdown:  [{ category, quantity, value }],
 *              warehouseBreakdown: [{ warehouse, quantity, value }],
 *              locationBreakdown:  [{ location, quantity, value }],
 *            }
 * Business meaning: Core inventory health figures shared by Dashboard, the Stock
 *                   page, Reports and the future Executive Dashboard.
 */
export async function getInventoryMetrics({ filters = {} } = {}) {
  try {
    // Parallel: shared stock source + the active item catalog (needed to
    // classify zero-stock / out-of-stock items, which have no ledger rows).
    const [stockRows, activeItems] = await Promise.all([
      getStockOnHand(),
      prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, sku: true, reorderPoint: true, unitCost: true },
      }),
    ])

    const valueAccessor = (r) => Number(r.qty || 0) * Number(r.item?.unitCost || 0)

    // Per-item on-hand quantities derived from the shared stock source.
    // Items absent from the map have no stock (qty = 0).
    const qtyByItem = {}
    for (const row of stockRows) {
      qtyByItem[row.itemId] = (qtyByItem[row.itemId] || 0) + Number(row.qty || 0)
    }

    // Summary
    const totalQuantity = sumQuantity(stockRows)
    const inventoryValue = sumValue(stockRows, valueAccessor)
    const totalSku = activeItems.filter((i) => (qtyByItem[i.id] || 0) > 0).length
    const averageStockPerSku = safeDivide(totalQuantity, totalSku)

    // Health classification per active item
    let healthy = 0
    let low = 0
    let outOfStock = 0
    for (const item of activeItems) {
      const qty = qtyByItem[item.id] || 0
      const reorder = Number(item.reorderPoint || 0)
      if (qty <= 0) outOfStock += 1
      else if (qty <= reorder) low += 1
      else healthy += 1
    }
    // TODO: dead stock requires a movement-analysis engine (no movement engine
    // exists yet) — placeholder until that engine is implemented.
    const deadStock = 0

    // Breakdowns grouped from the shared stock source. Explicit accessors are
    // used because getStockOnHand() exposes category/warehouse as plain strings.
    const toBreakdown = (groups, key) =>
      Object.entries(groups)
        .map(([name, rows]) => ({
          [key]: name,
          quantity: sumQuantity(rows),
          value: sumValue(rows, valueAccessor),
        }))
        .sort((a, b) => b.quantity - a.quantity)

    const categoryBreakdown = toBreakdown(
      groupByCategory(stockRows, (r) => r.item?.category || 'Uncategorized'),
      'category'
    )
    const warehouseBreakdown = toBreakdown(
      groupByWarehouse(stockRows, (r) => r.location?.warehouse || 'Uncategorized'),
      'warehouse'
    )
    const locationBreakdown = toBreakdown(
      groupByLocation(stockRows, (r) => r.location?.code || 'Uncategorized'),
      'location'
    )

    return ok({
      summary: {
        totalSku,
        totalQuantity,
        inventoryValue,
        averageStockPerSku,
      },
      health: {
        healthy,
        low,
        outOfStock,
        deadStock,
      },
      categoryBreakdown,
      warehouseBreakdown,
      locationBreakdown,
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getReceivingMetrics
 * Purpose: Aggregate receiving performance KPIs. SINGLE SOURCE OF TRUTH for
 *          Receiving metrics (Warehouse Dashboard, Reports, Analytics).
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, supplierId }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary:     { totalDocuments, draft, started, posted, totalLines, totalQuantity },
 *              status:      { DRAFT, RECEIVING, WAITING_PUTAWAY, COMPLETED, CANCELLED },
 *              performance: { today, thisWeek, thisMonth, averageLinesPerDocument, averageQuantityPerDocument },
 *            }
 * Business meaning: Inbound throughput, document lifecycle and backlog.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getReceivingMetrics({ filters = {} } = {}) {
  try {
    const [statusGrouped, lineCount, qtyAgg, perf] = await Promise.all([
      prisma.receiving.groupBy({ by: ['status'], _count: true }),
      prisma.receivingLine.count(),
      prisma.receivingLine.aggregate({ _sum: { receivedQty: true } }),
      periodCounts(prisma.receiving, 'postedAt'),
    ])

    const status = statusCountsMap(statusGrouped, ['DRAFT', 'RECEIVING', 'WAITING_PUTAWAY', 'COMPLETED', 'CANCELLED'])
    const totalDocuments = statusGrouped.reduce((s, g) => s + (g._count || 0), 0)
    const totalLines = lineCount
    const totalQuantity = qtyAgg._sum.receivedQty || 0

    return ok({
      summary: {
        totalDocuments,
        draft: status.DRAFT,
        started: status.RECEIVING,
        posted: status.WAITING_PUTAWAY + status.COMPLETED,
        totalLines,
        totalQuantity,
      },
      status,
      performance: {
        ...perf,
        averageLinesPerDocument: safeDivide(totalLines, totalDocuments),
        averageQuantityPerDocument: safeDivide(totalQuantity, totalDocuments),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getPutawayMetrics
 * Purpose: Aggregate putaway task KPIs. SINGLE SOURCE OF TRUTH for Putaway.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, status }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary:     { totalDocuments, draft, started, posted, totalLines, totalQuantity },
 *              status:      { OPEN, IN_PROGRESS, COMPLETED, CANCELLED },
 *              performance: { today, thisWeek, thisMonth, averageLinesPerDocument, averageQuantityPerDocument },
 *            }
 *          Each putaway task is a single movement line, so totalLines === totalDocuments.
 * Business meaning: Tasks opened/completed, backlog and throughput.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getPutawayMetrics({ filters = {} } = {}) {
  try {
    const [statusGrouped, qtyAgg, perf] = await Promise.all([
      prisma.putawayTask.groupBy({ by: ['status'], _count: true }),
      prisma.putawayTask.aggregate({ _sum: { qty: true } }),
      periodCounts(prisma.putawayTask, 'completedAt'),
    ])

    const status = statusCountsMap(statusGrouped, ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    const totalDocuments = statusGrouped.reduce((s, g) => s + (g._count || 0), 0)
    const totalQuantity = qtyAgg._sum.qty || 0

    return ok({
      summary: {
        totalDocuments,
        draft: status.OPEN,
        started: status.IN_PROGRESS,
        posted: status.COMPLETED,
        totalLines: totalDocuments,
        totalQuantity,
      },
      status,
      performance: {
        ...perf,
        averageLinesPerDocument: 1,
        averageQuantityPerDocument: safeDivide(totalQuantity, totalDocuments),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getMovementMetrics
 * Purpose: Aggregate internal stock movement KPIs. SINGLE SOURCE OF TRUTH.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary:     { totalDocuments, draft, started, posted, internalTransfers },
 *              status:      full DocStatus breakdown,
 *              performance: { today, thisWeek, thisMonth, averageLinesPerDocument, averageQuantityPerDocument },
 *            }
 * Business meaning: Transfer document lifecycle and internal relocations.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getMovementMetrics({ filters = {} } = {}) {
  try {
    const [statusGrouped, lineCount, qtyAgg, transferPairs, perf] = await Promise.all([
      prisma.stockTransfer.groupBy({ by: ['status'], _count: true }),
      prisma.stockTransferLine.count(),
      prisma.stockTransferLine.aggregate({ _sum: { qty: true } }),
      prisma.stockTransferLine.groupBy({ by: ['fromLocationId', 'toLocationId'], _count: true }),
      periodCounts(prisma.stockTransfer, 'postedAt'),
    ])

    const status = statusCountsMap(statusGrouped, [
      'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
      'COMPLETED', 'CANCELLED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED',
    ])
    const totalDocuments = statusGrouped.reduce((s, g) => s + (g._count || 0), 0)
    const totalLines = lineCount
    const totalQuantity = qtyAgg._sum.qty || 0

    // Internal transfer = a line whose source and destination locations differ.
    const internalTransfers = transferPairs.reduce(
      (s, g) => s + (g.fromLocationId !== g.toLocationId ? g._count : 0),
      0
    )

    return ok({
      summary: {
        totalDocuments,
        draft: status.DRAFT,
        started: status.IN_PROGRESS,
        posted: status.COMPLETED,
        internalTransfers,
      },
      status,
      performance: {
        ...perf,
        averageLinesPerDocument: safeDivide(totalLines, totalDocuments),
        averageQuantityPerDocument: safeDivide(totalQuantity, totalDocuments),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getAdjustmentMetrics
 * Purpose: Aggregate stock adjustment KPIs. SINGLE SOURCE OF TRUTH.
 * Input:   { filters = {} } — optional { fromDate, toDate, reasonCodeId }.
 * Output:  { success, generatedAt, data } where data.summary is:
 *            {
 *              increaseDocuments,  // documents with at least one positive-qty line
 *              decreaseDocuments,  // documents with at least one negative-qty line
 *              totalIncreaseQty,   // SUM(positive line qty)
 *              totalDecreaseQty,   // |SUM(negative line qty)|
 *            }
 * Business meaning: Correction direction and volume (increase vs decrease).
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getAdjustmentMetrics({ filters = {} } = {}) {
  try {
    const [incDocs, decDocs, incQty, decQty] = await Promise.all([
      prisma.stockAdjustmentLine.findMany({
        where: { qty: { gt: 0 } },
        distinct: ['adjustmentId'],
        select: { adjustmentId: true },
      }),
      prisma.stockAdjustmentLine.findMany({
        where: { qty: { lt: 0 } },
        distinct: ['adjustmentId'],
        select: { adjustmentId: true },
      }),
      prisma.stockAdjustmentLine.aggregate({ where: { qty: { gt: 0 } }, _sum: { qty: true } }),
      prisma.stockAdjustmentLine.aggregate({ where: { qty: { lt: 0 } }, _sum: { qty: true } }),
    ])

    return ok({
      summary: {
        increaseDocuments: incDocs.length,
        decreaseDocuments: decDocs.length,
        totalIncreaseQty: incQty._sum.qty || 0,
        totalDecreaseQty: Math.abs(decQty._sum.qty || 0),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getCycleCountMetrics
 * Purpose: Aggregate cycle count KPIs. SINGLE SOURCE OF TRUTH.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, locationId }.
 * Output:  { success, generatedAt, data } where data.summary is:
 *            {
 *              scheduled,          // DRAFT + ASSIGNED
 *              started,            // IN_PROGRESS
 *              completed,          // APPROVED + COMPLETED
 *              varianceDocuments,  // documents with at least one line where diffQty != 0
 *              varianceQuantity,   // SUM(|diffQty|) across variance lines
 *            }
 * Business meaning: Count coverage and physical variance magnitude.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getCycleCountMetrics({ filters = {} } = {}) {
  try {
    const [statusGrouped, varianceLines] = await Promise.all([
      prisma.cycleCount.groupBy({ by: ['status'], _count: true }),
      prisma.cycleCountLine.findMany({
        where: { diffQty: { not: 0 } },
        select: { cycleCountId: true, diffQty: true },
      }),
    ])

    const status = statusCountsMap(statusGrouped, [
      'DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'COMPLETED', 'CANCELLED',
    ])

    return ok({
      summary: {
        scheduled: status.DRAFT + status.ASSIGNED,
        started: status.IN_PROGRESS,
        completed: status.APPROVED + status.COMPLETED,
        varianceDocuments: new Set(varianceLines.map((l) => l.cycleCountId)).size,
        varianceQuantity: varianceLines.reduce((s, l) => s + Math.abs(Number(l.diffQty || 0)), 0),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getPickingMetrics
 * Purpose: Aggregate picking order KPIs. SINGLE SOURCE OF TRUTH for Picking.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, status }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary:     { totalDocuments, draft, started, posted, totalLines, totalQuantity },
 *              status:      { DRAFT, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED },
 *              performance: { today, thisWeek, thisMonth, averageLinesPerDocument, averageQuantityPerDocument },
 *            }
 *          totalQuantity uses qtyPicked (units actually picked).
 * Business meaning: Order lifecycle, backlog, throughput and pick volume.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getPickingMetrics({ filters = {} } = {}) {
  try {
    const [statusGrouped, lineCount, qtyAgg, perf] = await Promise.all([
      prisma.pickingOrder.groupBy({ by: ['status'], _count: true }),
      prisma.pickingOrderLine.count(),
      prisma.pickingOrderLine.aggregate({ _sum: { qtyPicked: true } }),
      periodCounts(prisma.pickingOrder, 'completedAt'),
    ])

    const status = statusCountsMap(statusGrouped, ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    const totalDocuments = statusGrouped.reduce((s, g) => s + (g._count || 0), 0)
    const totalLines = lineCount
    const totalQuantity = qtyAgg._sum.qtyPicked || 0

    return ok({
      summary: {
        totalDocuments,
        draft: status.DRAFT,
        started: status.IN_PROGRESS,
        posted: status.COMPLETED,
        totalLines,
        totalQuantity,
      },
      status,
      performance: {
        ...perf,
        averageLinesPerDocument: safeDivide(totalLines, totalDocuments),
        averageQuantityPerDocument: safeDivide(totalQuantity, totalDocuments),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getPackingMetrics
 * Purpose: Aggregate packing order KPIs. SINGLE SOURCE OF TRUTH for Packing.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, status }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary:     { totalDocuments, draft, started, posted, packedLines, packedQuantity },
 *              status:      { QUEUE, IN_PROGRESS, COMPLETED, CANCELLED },
 *              performance: { today, thisWeek, thisMonth, averageLinesPerDocument, averageQuantityPerDocument },
 *            }
 *          packedLines/packedQuantity are derived from PackageItem rows.
 * Business meaning: Queue/open/closed counts and packing volume.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getPackingMetrics({ filters = {} } = {}) {
  try {
    const [statusGrouped, packedLines, packedQty, perf] = await Promise.all([
      prisma.packingOrder.groupBy({ by: ['status'], _count: true }),
      prisma.packageItem.count(),
      prisma.packageItem.aggregate({ _sum: { qty: true } }),
      periodCounts(prisma.packingOrder, 'completedAt'),
    ])

    const status = statusCountsMap(statusGrouped, ['QUEUE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    const totalDocuments = statusGrouped.reduce((s, g) => s + (g._count || 0), 0)
    const packedQuantity = packedQty._sum.qty || 0

    return ok({
      summary: {
        totalDocuments,
        draft: status.QUEUE,
        started: status.IN_PROGRESS,
        posted: status.COMPLETED,
        packedLines,
        packedQuantity,
      },
      status,
      performance: {
        ...perf,
        averageLinesPerDocument: safeDivide(packedLines, totalDocuments),
        averageQuantityPerDocument: safeDivide(packedQuantity, totalDocuments),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getShippingMetrics
 * Purpose: Aggregate shipping KPIs. SINGLE SOURCE OF TRUTH for Shipping.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId, status }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary:     { totalDocuments, draft, started, posted, shippedQuantity, shippedOrders },
 *              status:      { QUEUE, IN_PROGRESS, READY, COMPLETED, FAILED, CANCELLED },
 *              performance: { today, thisWeek, thisMonth, averageLinesPerDocument, averageQuantityPerDocument },
 *            }
 *          shippedQuantity = units inside packages of COMPLETED shipments.
 *          averageLinesPerDocument uses shipped packages as the line proxy.
 * Business meaning: Outbound throughput and units leaving the warehouse.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getShippingMetrics({ filters = {} } = {}) {
  try {
    const [statusGrouped, shippedOrders, shippedPackages, perf] = await Promise.all([
      prisma.shipment.groupBy({ by: ['status'], _count: true }),
      prisma.shipment.count({ where: { status: 'COMPLETED' } }),
      prisma.shipmentPackage.count({ where: { shipment: { status: 'COMPLETED' } } }),
      periodCounts(prisma.shipment, 'shippedAt'),
    ])

    const status = statusCountsMap(statusGrouped, ['QUEUE', 'IN_PROGRESS', 'READY', 'COMPLETED', 'FAILED', 'CANCELLED'])
    const totalDocuments = statusGrouped.reduce((s, g) => s + (g._count || 0), 0)

    // Shipped quantity = SUM(PackageItem.qty) across packages in completed shipments.
    const pkgRows = await prisma.shipmentPackage.findMany({
      where: { shipment: { status: 'COMPLETED' } },
      select: { packageId: true },
    })
    const pkgIds = [...new Set(pkgRows.map((r) => r.packageId))]
    const qtyAgg = pkgIds.length > 0
      ? await prisma.packageItem.aggregate({ where: { packageId: { in: pkgIds } }, _sum: { qty: true } })
      : null
    const shippedQuantity = qtyAgg?._sum.qty || 0

    return ok({
      summary: {
        totalDocuments,
        draft: status.QUEUE,
        started: status.IN_PROGRESS,
        posted: status.COMPLETED,
        shippedQuantity,
        shippedOrders,
      },
      status,
      performance: {
        ...perf,
        averageLinesPerDocument: safeDivide(shippedPackages, totalDocuments),
        averageQuantityPerDocument: safeDivide(shippedQuantity, totalDocuments),
      },
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getSupplierMetrics
 * Purpose: Aggregate supplier KPIs and rank suppliers by inbound volume.
 *          SINGLE SOURCE OF TRUTH for Supplier metrics.
 * Input:   { filters = {} } — optional { fromDate, toDate, status }.
 * Output:  { success, generatedAt, data } where data is:
 *            {
 *              summary:     { totalSuppliers, activeSuppliers, inactiveSuppliers, added30Days },
 *              performance: { receivingDocuments, receivedQuantity, averageLinesPerSupplier },
 *              ranking:     [{ supplierId, supplierCode, supplierName, documents, quantity }] (top 10 by quantity desc),
 *            }
 * Business meaning: Supplier base health and inbound performance for purchasing.
 * Future consumers: Warehouse Dashboard, Reports, Executive Dashboard.
 */
export async function getSupplierMetrics({ filters = {} } = {}) {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [
      supplierGroup,
      suppliersAdded30Days,
      receivingDocuments,
      receivedQtyAgg,
      totalReceivingLines,
      receivings,
      lineSums,
    ] = await Promise.all([
      prisma.supplier.groupBy({ by: ['isActive'], _count: true }),
      prisma.supplier.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.receiving.count(),
      prisma.receivingLine.aggregate({ _sum: { receivedQty: true } }),
      prisma.receivingLine.count(),
      prisma.receiving.findMany({
        where: { supplierId: { not: null } },
        select: {
          id: true,
          supplierId: true,
          supplierRel: { select: { code: true, name: true } },
        },
      }),
      prisma.receivingLine.groupBy({ by: ['receivingId'], _sum: { receivedQty: true } }),
    ])

    const totalSuppliers = supplierGroup.reduce((s, g) => s + g._count, 0)
    const activeSuppliers = (supplierGroup.find((g) => g.isActive === true) || {})._count || 0
    const inactiveSuppliers = (supplierGroup.find((g) => g.isActive === false) || {})._count || 0

    const receivedQuantity = receivedQtyAgg._sum.receivedQty || 0

    // Per-supplier aggregation (documents + received quantity) for the ranking.
    const perSupplier = {}
    for (const r of receivings) {
      if (!perSupplier[r.supplierId]) {
        perSupplier[r.supplierId] = {
          supplierId: r.supplierId,
          supplierCode: r.supplierRel?.code || '',
          supplierName: r.supplierRel?.name || '',
          documents: 0,
          quantity: 0,
        }
      }
      perSupplier[r.supplierId].documents += 1
    }
    const qtyByReceiving = Object.fromEntries(lineSums.map((l) => [l.receivingId, l._sum.receivedQty || 0]))
    for (const r of receivings) {
      perSupplier[r.supplierId].quantity += qtyByReceiving[r.id] || 0
    }

    const ranking = Object.values(perSupplier)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)

    const suppliersWithReceiving = Object.keys(perSupplier).length

    return ok({
      summary: {
        totalSuppliers,
        activeSuppliers,
        inactiveSuppliers,
        added30Days: suppliersAdded30Days,
      },
      performance: {
        receivingDocuments,
        receivedQuantity,
        averageLinesPerSupplier: safeDivide(totalReceivingLines, suppliersWithReceiving),
      },
      ranking,
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * getWarehouseMetrics
 * Purpose: Aggregate warehouse-level operational KPIs.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId }.
 * Output:  { success, generatedAt, data } — data holds per-warehouse KPIs.
 * Business meaning: Cross-warehouse comparison of capacity, stock and throughput.
 */
export async function getWarehouseMetrics({ filters = {} } = {}) {
  try {
    // Phase A.2: zones, locations, capacity, stock value per warehouse.
    const data = {}
    return ok(data)
  } catch (err) {
    return fail(err)
  }
}

/**
 * getInventoryHealth
 * Purpose: Produce a composite health score for inventory accuracy.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId }.
 * Output:  { success, generatedAt, data } — data holds the health score and
 *          its components (aging, dead stock, low stock, variance).
 * Business meaning: A single consolidated signal for operational review.
 */
export async function getInventoryHealth({ filters = {} } = {}) {
  try {
    // Phase A.2: composite score + component sub-scores.
    const data = {}
    return ok(data)
  } catch (err) {
    return fail(err)
  }
}

/**
 * getLowStock
 * Purpose: Identify items at or below their reorder point.
 * Input:   { filters = {} } — optional { warehouseId, categoryId, limit }.
 * Output:  { success, generatedAt, data } — data holds the low-stock list.
 * Business meaning: Replenishment trigger signal for purchasing.
 */
export async function getLowStock({ filters = {} } = {}) {
  try {
    // Phase A.2: items where Qty On Hand <= Reorder Point.
    const data = {}
    return ok(data)
  } catch (err) {
    return fail(err)
  }
}

/**
 * getDeadStock
 * Purpose: Identify items with no movement within the period.
 * Input:   { filters = {} } — optional { fromDate, toDate, warehouseId }.
 * Output:  { success, generatedAt, data } — data holds the dead-stock list.
 * Business meaning: Slow-moving / obsolete inventory for disposal decisions.
 */
export async function getDeadStock({ filters = {} } = {}) {
  try {
    // Phase A.2: items with zero ledger movement in the filtered window.
    const data = {}
    return ok(data)
  } catch (err) {
    return fail(err)
  }
}

/**
 * getInventoryValue
 * Purpose: Compute total inventory valuation.
 * Input:   { filters = {} } — optional { warehouseId, categoryId, asOf }.
 * Output:  { success, generatedAt, data } — data holds value totals by
 *          category and warehouse.
 * Business meaning: Standard-cost valuation used by finance and reporting.
 */
export async function getInventoryValue({ filters = {} } = {}) {
  try {
    // Phase A.2: SUM(Qty × Standard Cost) grouped by category / warehouse.
    const data = {}
    return ok(data)
  } catch (err) {
    return fail(err)
  }
}
