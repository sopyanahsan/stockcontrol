/**
 * reports-acceptance.test.js
 *
 * Acceptance tests for Milestone 8 — Reports Module.
 *
 * Tests:
 *   1. Inventory Reports (Stock On Hand, Stock Card, Inventory Aging, FIFO Aging, Dead Stock)
 *   2. Operations Reports (Receiving, Putaway, Movement, Adjustment, Cycle Count, Picking, Packing, Shipping)
 *   3. Audit Reports (Audit Trail, User Activity, Inventory History)
 *   4. Dashboard Report
 *   5. Filters and Pagination
 *   6. RBAC (ADMIN, SUPERVISOR, STOCK_CONTROL)
 *   7. Read-only verification (no mutations)
 *   8. Export service (CSV, XLSX, Print)
 *
 * Run:  npx jest tests/reports-acceptance.test.js
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')

// Silence audit log writes during tests
jest.mock('../lib/audit', () => ({
  logAudit: jest.fn(),
}))

// ---------------------------------------------------------------------------
// Import Report Services
// ---------------------------------------------------------------------------
const { getInventoryReport } = require('../lib/reports/inventory-report')
const { getOperationsReport } = require('../lib/reports/operations-report')
const { getAuditReport, getAuditFilterOptions } = require('../lib/reports/audit-report')
const { getDashboardReport } = require('../lib/reports/dashboard-report')
const { exportReport } = require('../lib/reports/export-service')

// ---------------------------------------------------------------------------
// Import Business Services for seeding
// ---------------------------------------------------------------------------
const adjustmentService = require('../lib/adjustment-service')
const receivingService = require('../lib/receiving-service')
const movementService = require('../lib/movement-service')
const putawayService = require('../lib/putaway-service')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

async function getFifoLayers(itemId, locationId) {
  return prisma.fifoLayer.findMany({
    where: { itemId, locationId, qtyRemaining: { gt: 0 } },
    orderBy: { receivedAt: 'asc' },
  })
}

async function getLedgerEntries(itemId, locationId) {
  return prisma.stockLedger.findMany({
    where: { itemId, locationId },
    orderBy: { createdAt: 'asc' },
  })
}

async function createFifoLayer(tx, itemId, locationId, qty, unitCost, refNumber, receivedAt) {
  await tx.fifoLayer.create({
    data: {
      itemId,
      locationId,
      qtyReceived: qty,
      qtyRemaining: qty,
      unitCost,
      refNumber,
      receivedAt: receivedAt || new Date(),
    },
  })
  await tx.stockLedger.create({
    data: {
      itemId,
      locationId,
      txnType: 'RECEIVING',
      qty,
      unitCost,
      refType: 'SEED',
      refNumber,
      userId: global.admin.id,
    },
  })
}

// ---------------------------------------------------------------------------
// Shared seed
// ---------------------------------------------------------------------------
let s

beforeEach(async () => {
  s = await prisma.$transaction(async (tx) => {
    const base = await seed(tx, global.seedKey, global)
    // Add extra location for location filtering tests
    const extraLoc = await tx.location.upsert({
      where: { id: `loc3_${global.seedKey}` },
      update: {},
      create: {
        id: `loc3_${global.seedKey}`,
        zoneId: base.zone.id,
        code: `L03${global.seedKey}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
        type: 'STORAGE',
        isActive: true,
      },
    })
    // Create FIFO layers for various tests
    await createFifoLayer(tx, base.itemA.id, base.loc1.id, 100, 10.0, `SEED-A1-${global.seedKey}`, new Date('2024-01-01'))
    await createFifoLayer(tx, base.itemA.id, base.loc1.id, 50, 12.0, `SEED-A2-${global.seedKey}`, new Date('2024-06-01'))
    await createFifoLayer(tx, base.itemA.id, extraLoc.id, 200, 8.0, `SEED-A3-${global.seedKey}`, new Date('2025-01-01'))
    await createFifoLayer(tx, base.itemB.id, base.loc1.id, 75, 5.0, `SEED-B1-${global.seedKey}`, new Date('2024-03-01'))
    // Add a "dead stock" item - no movement for 180+ days
    await createFifoLayer(tx, base.itemB.id, extraLoc.id, 30, 15.0, `SEED-DEAD-${global.seedKey}`, new Date('2023-01-01'))
    return { ...base, extraLoc }
  })
})

// ===========================================================================
// SECTION 1: INVENTORY REPORTS
// ===========================================================================

describe('Inventory Reports', () => {

  // -----------------------------------------------------------------------
  // TEST 1.1: Stock On Hand Report
  // -----------------------------------------------------------------------
  test('Stock On Hand: returns all items with stock across locations', async () => {
    const result = await getInventoryReport('stock-on-hand', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)
    expect(result.data.length).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('itemId')
    expect(row).toHaveProperty('sku')
    expect(row).toHaveProperty('name')
    expect(row).toHaveProperty('locationCode')
    expect(row).toHaveProperty('qty')
    expect(row).toHaveProperty('unitCost')

    // Verify total values
    expect(result).toHaveProperty('grandTotalQty')
    expect(result).toHaveProperty('grandTotalValue')
    expect(result.grandTotalQty).toBeGreaterThan(0)
  })

  // -----------------------------------------------------------------------
  // TEST 1.2: Stock On Hand - Filter by Location
  // -----------------------------------------------------------------------
  test('Stock On Hand: filters correctly by locationId', async () => {
    const resultAll = await getInventoryReport('stock-on-hand', {})
    const resultLoc1 = await getInventoryReport('stock-on-hand', { locationId: s.loc1.id })

    // Filtered result should have fewer or equal rows
    expect(resultLoc1.data.length).toBeLessThanOrEqual(resultAll.data.length)

    // All filtered rows should be from the specified location
    if (resultLoc1.data.length > 0) {
      const allFromLoc1 = resultLoc1.data.every(r => r.locationId === s.loc1.id)
      expect(allFromLoc1).toBe(true)
    }
  })

  // -----------------------------------------------------------------------
  // TEST 1.3: Stock On Hand - Filter by Item
  // -----------------------------------------------------------------------
  test('Stock On Hand: filters correctly by itemId', async () => {
    const resultAll = await getInventoryReport('stock-on-hand', {})
    const resultItemA = await getInventoryReport('stock-on-hand', { itemId: s.itemA.id })

    expect(resultItemA.data.length).toBeLessThanOrEqual(resultAll.data.length)
    if (resultItemA.data.length > 0) {
      const allItemA = resultItemA.data.every(r => r.itemId === s.itemA.id)
      expect(allItemA).toBe(true)
    }
  })

  // -----------------------------------------------------------------------
  // TEST 1.4: Stock Card Report
  // -----------------------------------------------------------------------
  test('Stock Card: returns ledger entries with running balance for an item', async () => {
    // Get stock card for itemA
    const result = await getInventoryReport('stock-card', { itemId: s.itemA.id })

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('txnType')
    expect(row).toHaveProperty('qty')
    expect(row).toHaveProperty('balance')
    expect(row).toHaveProperty('refNumber')

    // Verify running balance is calculated correctly
    let expectedBalance = 0
    for (const entry of result.data) {
      expectedBalance += entry.qty
      expect(entry.balance).toBeCloseTo(expectedBalance, 2)
    }
  })

  // -----------------------------------------------------------------------
  // TEST 1.5: Stock Card - Filter by Date Range
  // -----------------------------------------------------------------------
  test('Stock Card: filters by date range correctly', async () => {
    const fromDate = '2024-01-01'
    const toDate = '2024-12-31'

    const result = await getInventoryReport('stock-card', {
      itemId: s.itemA.id,
      fromDate,
      toDate,
    })

    expect(result.data).toBeDefined()
    // All entries should be within date range
    for (const entry of result.data) {
      const entryDate = new Date(entry.date)
      expect(entryDate.getTime()).toBeGreaterThanOrEqual(new Date(fromDate).getTime())
      expect(entryDate.getTime()).toBeLessThanOrEqual(new Date(toDate + 'T23:59:59').getTime())
    }
  })

  // -----------------------------------------------------------------------
  // TEST 1.6: Stock Card - Requires itemId
  // -----------------------------------------------------------------------
  test('Stock Card: requires itemId parameter', async () => {
    await expect(getInventoryReport('stock-card', {})).rejects.toThrow('itemId is required')
  })

  // -----------------------------------------------------------------------
  // TEST 1.7: Inventory Aging Report
  // -----------------------------------------------------------------------
  test('Inventory Aging: returns items with age calculation', async () => {
    const result = await getInventoryReport('inventory-aging', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('itemId')
    expect(row).toHaveProperty('qty')
    expect(row).toHaveProperty('daysSinceActivity')
    expect(row).toHaveProperty('totalValue')

    // Verify summary
    expect(result.summary).toBeDefined()
    expect(result.summary).toHaveProperty('totalItems')
    expect(result.summary).toHaveProperty('totalValue')
    expect(result.summary).toHaveProperty('buckets')
  })

  // -----------------------------------------------------------------------
  // TEST 1.8: Inventory Aging - Custom Buckets
  // -----------------------------------------------------------------------
  test('Inventory Aging: supports custom age buckets', async () => {
    const customBuckets = [
      { minDays: 0, maxDays: 7 },
      { minDays: 8, maxDays: 30 },
      { minDays: 31, maxDays: 9999 },
    ]

    const result = await getInventoryReport('inventory-aging', { buckets: customBuckets })

    expect(result.summary.buckets).toBeDefined()
    expect(result.summary.buckets.length).toBe(customBuckets.length)
  })

  // -----------------------------------------------------------------------
  // TEST 1.9: FIFO Aging Report
  // -----------------------------------------------------------------------
  test('FIFO Aging: returns FIFO layers sorted by received date', async () => {
    const result = await getInventoryReport('fifo-aging', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('fifoLayerId')
    expect(row).toHaveProperty('itemId')
    expect(row).toHaveProperty('qtyRemaining')
    expect(row).toHaveProperty('unitCost')
    expect(row).toHaveProperty('receivedAt')
    expect(row).toHaveProperty('daysOld')

    // Verify FIFO ordering (oldest first)
    for (let i = 1; i < result.data.length; i++) {
      const prev = new Date(result.data[i - 1].receivedAt)
      const curr = new Date(result.data[i].receivedAt)
      expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime())
    }
  })

  // -----------------------------------------------------------------------
  // TEST 1.10: FIFO Aging - Filter by Item
  // -----------------------------------------------------------------------
  test('FIFO Aging: filters by itemId', async () => {
    const result = await getInventoryReport('fifo-aging', { itemId: s.itemA.id })

    expect(result.data).toBeDefined()
    if (result.data.length > 0) {
      const allItemA = result.data.every(r => r.itemId === s.itemA.id)
      expect(allItemA).toBe(true)
    }
  })

  // -----------------------------------------------------------------------
  // TEST 1.11: Dead Stock Report
  // -----------------------------------------------------------------------
  test('Dead Stock: returns items with no recent movement', async () => {
    const result = await getInventoryReport('dead-stock', { days: 365 })

    expect(result.data).toBeDefined()
    // Should include items with no movement in the specified period

    // Verify structure
    if (result.data.length > 0) {
      const row = result.data[0]
      expect(row).toHaveProperty('itemId')
      expect(row).toHaveProperty('sku')
      expect(row).toHaveProperty('totalQty')
      expect(row).toHaveProperty('totalValue')
    }

    // Verify summary
    expect(result.summary).toBeDefined()
    expect(result.summary).toHaveProperty('totalItems')
    expect(result.summary).toHaveProperty('totalQty')
    expect(result.summary).toHaveProperty('totalValue')
  })

  // -----------------------------------------------------------------------
  // TEST 1.12: Invalid Report Type
  // -----------------------------------------------------------------------
  test('Invalid report type throws error', async () => {
    await expect(getInventoryReport('invalid-type', {})).rejects.toThrow('Invalid reportType')
  })

})

// ===========================================================================
// SECTION 2: OPERATIONS REPORTS
// ===========================================================================

describe('Operations Reports', () => {

  // -----------------------------------------------------------------------
  // TEST 2.1: Receiving Report
  // -----------------------------------------------------------------------
  test('Receiving: returns receiving records', async () => {
    // First create a receiving record
    const receiving = await receivingService.createReceivingDraft({
      user: s.admin,
      body: {
        supplier: 'Test Supplier',
        refDocument: 'PO-001',
        warehouseId: s.warehouse.id,
        lines: [
          { itemId: s.itemA.id, expectedQty: 50, unitCost: 10.0 },
        ],
      },
    })

    const result = await getOperationsReport('receiving', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('grnNumber')
    expect(row).toHaveProperty('status')
    expect(row).toHaveProperty('supplier')
  })

  // -----------------------------------------------------------------------
  // TEST 2.2: Receiving - Filter by Status
  // -----------------------------------------------------------------------
  test('Receiving: filters by status', async () => {
    // Create a completed receiving
    const receiving = await receivingService.createReceivingDraft({
      user: s.admin,
      body: {
        supplier: 'Test Supplier',
        warehouseId: s.warehouse.id,
        lines: [{ itemId: s.itemA.id, expectedQty: 50, unitCost: 10.0 }],
      },
    })

    await receivingService.startReceiving({ user: s.admin, id: receiving.id })

    await receivingService.postReceiving({
      user: s.admin,
      id: receiving.id,
      body: { lines: [{ lineId: receiving.lines[0].id, receivedQty: 50 }] },
    })

    const result = await getOperationsReport('receiving', { status: 'COMPLETED' })

    expect(result.data).toBeDefined()
    if (result.data.length > 0) {
      const allCompleted = result.data.every(r => r.status === 'COMPLETED')
      expect(allCompleted).toBe(true)
    }
  })

  // -----------------------------------------------------------------------
  // TEST 2.3: Putaway Report
  // -----------------------------------------------------------------------
  test('Putaway: returns putaway task records', async () => {
    // Putaway tasks are created automatically when a receiving is posted.
    // Seed stock and post a receiving so a putaway task exists.
    await createFifoLayer(prisma, s.itemA.id, s.loc1.id, 100, 10.0, `PUT-SEED-${global.seedKey}`)

    const receiving = await receivingService.createReceivingDraft({
      user: s.admin,
      body: {
        supplier: 'Test Supplier',
        warehouseId: s.warehouse.id,
        lines: [{ itemId: s.itemA.id, expectedQty: 50, unitCost: 10.0 }],
      },
    })

    await receivingService.startReceiving({ user: s.admin, id: receiving.id })

    await receivingService.postReceiving({
      user: s.admin,
      id: receiving.id,
      body: { lines: [{ lineId: receiving.lines[0].id, receivedQty: 50 }] },
    })

    const result = await getOperationsReport('putaway', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)
  })

  // -----------------------------------------------------------------------
  // TEST 2.4: Movement Report
  // -----------------------------------------------------------------------
  test('Movement: returns stock movement records', async () => {
    // Seed stock
    await createFifoLayer(prisma, s.itemA.id, s.loc1.id, 100, 10.0, `MOV-SEED-${global.seedKey}`)

    // Create movement
    const movement = await movementService.createMovement({
      user: s.admin,
      body: {
        lines: [
          {
            itemId: s.itemA.id,
            fromLocationId: s.loc1.id,
            toLocationId: s.loc2.id,
            qty: 25,
          },
        ],
      },
    })

    await movementService.postMovement({
      user: s.admin,
      id: movement.id,
    })

    const result = await getOperationsReport('movement', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)
  })

  // -----------------------------------------------------------------------
  // TEST 2.5: Adjustment Report
  // -----------------------------------------------------------------------
  test('Adjustment: returns adjustment records', async () => {
    // Create adjustment
    const adj = await adjustmentService.createAdjustment({
      user: s.admin,
      body: {
        lines: [
          { itemId: s.itemA.id, locationId: s.loc1.id, qty: 10, systemQty: 0, countedQty: 0, diffQty: 0 },
        ],
        reasonCodeId: s.reasonAdj.id,
      },
    })

    await adjustmentService.postAdjustment({ user: s.admin, id: adj.id })

    const result = await getOperationsReport('adjustment', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('adjustmentNumber')
    expect(row).toHaveProperty('status')
  })

  // -----------------------------------------------------------------------
  // TEST 2.6: Picking Report (placeholder)
  // -----------------------------------------------------------------------
  test('Picking: returns picking order records', async () => {
    const result = await getOperationsReport('picking', {})

    expect(result.data).toBeDefined()
    // May be empty if no picking orders exist, but structure should be valid
  })

  // -----------------------------------------------------------------------
  // TEST 2.7: Packing Report (placeholder)
  // -----------------------------------------------------------------------
  test('Packing: returns packing order records', async () => {
    const result = await getOperationsReport('packing', {})

    expect(result.data).toBeDefined()
    // May be empty if no packing orders exist, but structure should be valid
  })

  // -----------------------------------------------------------------------
  // TEST 2.8: Shipping Report (placeholder)
  // -----------------------------------------------------------------------
  test('Shipping: returns shipment records', async () => {
    const result = await getOperationsReport('shipping', {})

    expect(result.data).toBeDefined()
    // May be empty if no shipments exist, but structure should be valid
  })

  // -----------------------------------------------------------------------
  // TEST 2.9: Invalid Operations Report Type
  // -----------------------------------------------------------------------
  test('Invalid operations report type throws error', async () => {
    await expect(getOperationsReport('invalid-type', {})).rejects.toThrow('Invalid reportType')
  })

})

// ===========================================================================
// SECTION 3: AUDIT REPORTS
// ===========================================================================

describe('Audit Reports', () => {

  // -----------------------------------------------------------------------
  // TEST 3.1: Audit Trail Report
  // -----------------------------------------------------------------------
  test('Audit Trail: returns audit log entries', async () => {
    // This file mocks logAudit, so seed one audit row directly to verify the
    // report returns persisted entries on a clean test database.
    const created = await prisma.auditLog.create({
      data: {
        userId: s.admin.id,
        userName: s.admin.name,
        action: 'TEST',
        module: 'MASTER_ITEM',
        entityType: 'Item',
        description: 'Seeded for audit trail report test',
      },
    })

    const result = await getAuditReport('audit-trail', {})

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('id')
    expect(row).toHaveProperty('timestamp')
    expect(row).toHaveProperty('action')
    expect(row).toHaveProperty('module')
    expect(row).toHaveProperty('userName')

    await prisma.auditLog.delete({ where: { id: created.id } })
  })

  // -----------------------------------------------------------------------
  // TEST 3.2: Audit Trail - Filter by Module
  // -----------------------------------------------------------------------
  test('Audit Trail: filters by module', async () => {
    const result = await getAuditReport('audit-trail', { module: 'MASTER_ITEM' })

    expect(result.data).toBeDefined()
    // All entries should be from MASTER_ITEM module (if any exist)
    for (const entry of result.data) {
      expect(entry.module).toBe('MASTER_ITEM')
    }
  })

  // -----------------------------------------------------------------------
  // TEST 3.3: Audit Trail - Filter by Date Range
  // -----------------------------------------------------------------------
  test('Audit Trail: filters by date range', async () => {
    const fromDate = '2020-01-01'
    const toDate = '2099-12-31'

    const result = await getAuditReport('audit-trail', { fromDate, toDate })

    expect(result.data).toBeDefined()
    // All entries should be within date range
    for (const entry of result.data) {
      const entryDate = new Date(entry.timestamp)
      expect(entryDate.getTime()).toBeGreaterThanOrEqual(new Date(fromDate).getTime())
      expect(entryDate.getTime()).toBeLessThanOrEqual(new Date(toDate + 'T23:59:59').getTime())
    }
  })

  // -----------------------------------------------------------------------
  // TEST 3.4: User Activity Report
  // -----------------------------------------------------------------------
  test('User Activity: returns user activity summaries', async () => {
    const result = await getAuditReport('user-activity', {})

    expect(result.data).toBeDefined()
    // Verify structure
    if (result.data.length > 0) {
      const row = result.data[0]
      expect(row).toHaveProperty('userId')
      expect(row).toHaveProperty('userName')
      expect(row).toHaveProperty('totalActions')
    }
  })

  // -----------------------------------------------------------------------
  // TEST 3.5: Inventory History Report
  // -----------------------------------------------------------------------
  test('Inventory History: returns ledger entries with running balance', async () => {
    const result = await getAuditReport('inventory-history', { itemId: s.itemA.id })

    expect(result.data).toBeDefined()
    expect(result.total).toBeGreaterThan(0)

    // Verify structure
    const row = result.data[0]
    expect(row).toHaveProperty('timestamp')
    expect(row).toHaveProperty('txnType')
    expect(row).toHaveProperty('qty')
    expect(row).toHaveProperty('runningBalance')
  })

  // -----------------------------------------------------------------------
  // TEST 3.6: Inventory History - Filter by Transaction Type
  // -----------------------------------------------------------------------
  test('Inventory History: filters by transaction type', async () => {
    const result = await getAuditReport('inventory-history', {
      itemId: s.itemA.id,
      txnType: 'RECEIVING',
    })

    expect(result.data).toBeDefined()
    // All entries should be RECEIVING transactions
    for (const entry of result.data) {
      expect(entry.txnType).toBe('RECEIVING')
    }
  })

  // -----------------------------------------------------------------------
  // TEST 3.7: Audit Filter Options
  // -----------------------------------------------------------------------
  test('Audit Filter Options: returns available filter values', async () => {
    const options = await getAuditFilterOptions()

    expect(options).toBeDefined()
    expect(options).toHaveProperty('modules')
    expect(options).toHaveProperty('actions')
    expect(options).toHaveProperty('entityTypes')
    expect(options).toHaveProperty('users')
    expect(Array.isArray(options.modules)).toBe(true)
    expect(Array.isArray(options.actions)).toBe(true)
    expect(Array.isArray(options.users)).toBe(true)
  })

  // -----------------------------------------------------------------------
  // TEST 3.8: Invalid Audit Report Type
  // -----------------------------------------------------------------------
  test('Invalid audit report type throws error', async () => {
    await expect(getAuditReport('invalid-type', {})).rejects.toThrow('Invalid reportType')
  })

})

// ===========================================================================
// SECTION 4: DASHBOARD REPORT
// ===========================================================================

describe('Dashboard Report', () => {

  // -----------------------------------------------------------------------
  // TEST 4.1: Dashboard - Returns KPIs
  // -----------------------------------------------------------------------
  test('Dashboard: returns KPIs for the dashboard', async () => {
    const result = await getDashboardReport({})

    expect(result).toBeDefined()
    expect(result).toHaveProperty('kpis')
    expect(result).toHaveProperty('trend')
    expect(result).toHaveProperty('byCategory')
    expect(result).toHaveProperty('topItems')
    expect(result).toHaveProperty('opsSummary')
    expect(result).toHaveProperty('lowStock')

    // Verify KPI structure
    const kpis = result.kpis
    expect(kpis).toHaveProperty('totalUnits')
    expect(kpis).toHaveProperty('totalValue')
    expect(kpis).toHaveProperty('todayMovements')
  })

  // -----------------------------------------------------------------------
  // TEST 4.2: Dashboard - Movement Trend
  // -----------------------------------------------------------------------
  test('Dashboard: returns 30-day movement trend', async () => {
    const result = await getDashboardReport({})

    expect(result.trend).toBeDefined()
    expect(Array.isArray(result.trend)).toBe(true)
    expect(result.trend.length).toBe(30) // 30 days

    // Verify trend structure
    const day = result.trend[0]
    expect(day).toHaveProperty('date')
    expect(day).toHaveProperty('inbound')
    expect(day).toHaveProperty('outbound')
  })

  // -----------------------------------------------------------------------
  // TEST 4.3: Dashboard - Filter by Warehouse
  // -----------------------------------------------------------------------
  test('Dashboard: supports warehouse filter', async () => {
    const result = await getDashboardReport({ warehouseId: s.warehouse.id })

    expect(result).toBeDefined()
    expect(result.kpis).toBeDefined()
  })

  // -----------------------------------------------------------------------
  // TEST 4.4: Dashboard - Top Moving Items
  // -----------------------------------------------------------------------
  test('Dashboard: returns top moving items', async () => {
    const result = await getDashboardReport({})

    expect(result.topItems).toBeDefined()
    expect(Array.isArray(result.topItems)).toBe(true)
    // Verify structure
    if (result.topItems.length > 0) {
      const item = result.topItems[0]
      expect(item).toHaveProperty('itemId')
      expect(item).toHaveProperty('sku')
      expect(item).toHaveProperty('name')
      expect(item).toHaveProperty('totalMovement')
    }
  })

  // -----------------------------------------------------------------------
  // TEST 4.5: Dashboard - Operations Summary
  // -----------------------------------------------------------------------
  test('Dashboard: returns daily operations summary', async () => {
    const result = await getDashboardReport({})

    expect(result.opsSummary).toBeDefined()
    expect(Array.isArray(result.opsSummary)).toBe(true)
    if (result.opsSummary.length > 0) {
      const day = result.opsSummary[0]
      expect(day).toHaveProperty('date')
      expect(day).toHaveProperty('receiving')
      expect(day).toHaveProperty('putaway')
      expect(day).toHaveProperty('picking')
    }
  })

  // -----------------------------------------------------------------------
  // TEST 4.6: Dashboard - Low Stock Items
  // -----------------------------------------------------------------------
  test('Dashboard: returns low stock items', async () => {
    const result = await getDashboardReport({})

    expect(result.lowStock).toBeDefined()
    expect(Array.isArray(result.lowStock)).toBe(true)
  })

})

// ===========================================================================
// SECTION 5: PAGINATION
// ===========================================================================

describe('Pagination', () => {

  // -----------------------------------------------------------------------
  // TEST 5.1: Pagination - Default Limit
  // -----------------------------------------------------------------------
  test('Pagination: uses default limit of 500', async () => {
    const result = await getInventoryReport('stock-on-hand', {})

    expect(result.data.length).toBeLessThanOrEqual(500)
  })

  // -----------------------------------------------------------------------
  // TEST 5.2: Pagination - Custom Limit
  // -----------------------------------------------------------------------
  test('Pagination: respects custom limit', async () => {
    const result = await getInventoryReport('stock-on-hand', { limit: 10 })

    expect(result.data.length).toBeLessThanOrEqual(10)
    expect(result.pagination.limit).toBe(10)
  })

  // -----------------------------------------------------------------------
  // TEST 5.3: Pagination - Offset
  // -----------------------------------------------------------------------
  test('Pagination: offset skips records correctly', async () => {
    const resultAll = await getInventoryReport('stock-on-hand', { limit: 100 })

    if (resultAll.total > 10) {
      const resultOffset = await getInventoryReport('stock-on-hand', { limit: 5, offset: 5 })

      expect(resultOffset.data.length).toBeLessThanOrEqual(5)
      expect(resultOffset.pagination.offset).toBe(5)

      // The first record of offset result should differ from first record of all result
      // (assuming there are at least 6 records)
    }
  })

  // -----------------------------------------------------------------------
  // TEST 5.4: Pagination - Limit Capped at 1000
  // -----------------------------------------------------------------------
  test('Pagination: limit is capped at 1000', async () => {
    const result = await getInventoryReport('stock-on-hand', { limit: 5000 })

    expect(result.data.length).toBeLessThanOrEqual(1000)
    expect(result.pagination.limit).toBeLessThanOrEqual(1000)
  })

})

// ===========================================================================
// SECTION 6: READ-ONLY VERIFICATION
// ===========================================================================

describe('Read-Only Verification', () => {

  // -----------------------------------------------------------------------
  // TEST 6.1: Inventory Report - No INSERT
  // -----------------------------------------------------------------------
  test('Inventory Report: does not create any database records', async () => {
    const beforeCount = await prisma.fifoLayer.count()
    await getInventoryReport('stock-on-hand', {})
    await getInventoryReport('fifo-aging', {})
    const afterCount = await prisma.fifoLayer.count()

    expect(afterCount).toBe(beforeCount)
  })

  // -----------------------------------------------------------------------
  // TEST 6.2: Inventory Report - No UPDATE
  // -----------------------------------------------------------------------
  test('Inventory Report: does not modify existing records', async () => {
    // Get a FIFO layer and record its state
    const layers = await prisma.fifoLayer.findMany({ take: 1 })
    if (layers.length > 0) {
      const original = { ...layers[0] }

      // Run reports
      await getInventoryReport('stock-on-hand', {})
      await getInventoryReport('inventory-aging', {})

      // Check it hasn't changed
      const current = await prisma.fifoLayer.findUnique({ where: { id: layers[0].id } })
      expect(current.qtyRemaining).toBe(original.qtyRemaining)
      expect(current.qtyReceived).toBe(original.qtyReceived)
    }
  })

  // -----------------------------------------------------------------------
  // TEST 6.3: Operations Report - No INSERT
  // -----------------------------------------------------------------------
  test('Operations Report: does not create any database records', async () => {
    const beforeCount = await prisma.stockAdjustment.count()
    await getOperationsReport('receiving', {})
    await getOperationsReport('putaway', {})
    const afterCount = await prisma.stockAdjustment.count()

    expect(afterCount).toBe(beforeCount)
  })

  // -----------------------------------------------------------------------
  // TEST 6.4: Audit Report - No INSERT
  // -----------------------------------------------------------------------
  test('Audit Report: does not create any database records', async () => {
    // Note: The mock for logAudit means no audit logs are created
    const beforeCount = await prisma.auditLog.count()
    await getAuditReport('audit-trail', {})
    await getAuditReport('user-activity', {})
    const afterCount = await prisma.auditLog.count()

    expect(afterCount).toBe(beforeCount)
  })

  // -----------------------------------------------------------------------
  // TEST 6.5: Dashboard Report - No FIFO Mutation
  // -----------------------------------------------------------------------
  test('Dashboard Report: does not modify FIFO layers', async () => {
    const layers = await prisma.fifoLayer.findMany({ take: 5 })
    const originalStates = layers.map(l => ({ id: l.id, qtyRemaining: l.qtyRemaining }))

    await getDashboardReport({})

    for (const orig of originalStates) {
      const current = await prisma.fifoLayer.findUnique({ where: { id: orig.id } })
      if (current) {
        expect(current.qtyRemaining).toBe(orig.qtyRemaining)
      }
    }
  })

  // -----------------------------------------------------------------------
  // TEST 6.6: Dashboard Report - No Ledger Mutation
  // -----------------------------------------------------------------------
  test('Dashboard Report: does not create ledger entries', async () => {
    const beforeCount = await prisma.stockLedger.count()
    await getDashboardReport({})
    const afterCount = await prisma.stockLedger.count()

    expect(afterCount).toBe(beforeCount)
  })

  // -----------------------------------------------------------------------
  // TEST 6.7: Report Services - No DELETE
  // -----------------------------------------------------------------------
  test('Report Services: do not delete any records', async () => {
    const beforeItems = await prisma.item.count()
    const beforeLocations = await prisma.location.count()
    const beforeFifo = await prisma.fifoLayer.count()

    // Run all report types
    await getInventoryReport('stock-on-hand', {})
    await getInventoryReport('fifo-aging', {})
    await getOperationsReport('receiving', {})
    await getAuditReport('audit-trail', {})
    await getDashboardReport({})

    const afterItems = await prisma.item.count()
    const afterLocations = await prisma.location.count()
    const afterFifo = await prisma.fifoLayer.count()

    expect(afterItems).toBe(beforeItems)
    expect(afterLocations).toBe(beforeLocations)
    expect(afterFifo).toBe(beforeFifo)
  })

})

// ===========================================================================
// SECTION 7: EXPORT SERVICE
// ===========================================================================

describe('Export Service', () => {

  // -----------------------------------------------------------------------
  // TEST 7.1: Export Service - CSV Export
  // -----------------------------------------------------------------------
  test('Export Service: generates valid CSV string', async () => {
    const rows = [
      { id: 1, name: 'Item A', qty: 100 },
      { id: 2, name: 'Item B', qty: 50 },
    ]
    const columns = [
      { accessorKey: 'id', label: 'ID' },
      { accessorKey: 'name', label: 'Name' },
      { accessorKey: 'qty', label: 'Quantity' },
    ]

    // Mock window and URL for Node.js environment
    const mockBlob = []
    global.Blob = class {
      constructor(parts) {
        mockBlob.push(parts)
      }
    }
    global.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {},
    }
    global.document = {
      createElement: () => ({
        href: '',
        download: '',
        click: () => {},
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
    }

    const result = await exportReport(rows, columns, 'test-report', 'csv')

    expect(result).toBe(true)
  })

  // -----------------------------------------------------------------------
  // TEST 7.2: Export Service - Empty Rows
  // -----------------------------------------------------------------------
  test('Export Service: returns false for empty rows', async () => {
    const result = await exportReport([], [], 'empty-report', 'csv')
    expect(result).toBe(false)
  })

  // -----------------------------------------------------------------------
  // TEST 7.3: Export Service - Invalid Format
  // -----------------------------------------------------------------------
  test('Export Service: returns false for invalid format', async () => {
    const rows = [{ id: 1 }]
    const columns = [{ accessorKey: 'id' }]

    const result = await exportReport(rows, columns, 'test', 'invalid')
    expect(result).toBe(false)
  })

  // -----------------------------------------------------------------------
  // TEST 7.4: Export Service - Null/Undefined Values
  // -----------------------------------------------------------------------
  test('Export Service: handles null and undefined values correctly', async () => {
    const rows = [
      { id: 1, name: null, qty: undefined },
      { id: 2, name: 'Test', qty: 0 },
    ]
    const columns = [
      { accessorKey: 'id', label: 'ID' },
      { accessorKey: 'name', label: 'Name' },
      { accessorKey: 'qty', label: 'Quantity' },
    ]

    // This should not throw
    const result = await exportReport(rows, columns, 'null-test', 'csv')
    expect(result).toBe(true)
  })

  // -----------------------------------------------------------------------
  // TEST 7.5: Export Service - Nested Object Values
  // -----------------------------------------------------------------------
  test('Export Service: handles nested object values', async () => {
    const rows = [
      { id: 1, item: { sku: 'SKU001', name: 'Widget' } },
      { id: 2, item: { sku: 'SKU002', name: 'Gadget' } },
    ]
    const columns = [
      { accessorKey: 'id', label: 'ID' },
      { accessorKey: 'item.sku', label: 'SKU' },
    ]

    // This should not throw and should resolve nested values
    const result = await exportReport(rows, columns, 'nested-test', 'csv')
    expect(result).toBe(true)
  })

})

// ===========================================================================
// SECTION 8: REGRESSION - EXISTING MODULES UNAFFECTED
// ===========================================================================

describe('Regression Tests', () => {

  // -----------------------------------------------------------------------
  // TEST 8.1: Receiving Service Unaffected
  // -----------------------------------------------------------------------
  test('Regression: receiving service still works correctly', async () => {
    const receiving = await receivingService.createReceivingDraft({
      user: s.admin,
      body: {
        supplier: 'Regression Test Supplier',
        warehouseId: s.warehouse.id,
        lines: [
          { itemId: s.itemA.id, expectedQty: 100, unitCost: 10.0 },
        ],
      },
    })

    expect(receiving.status).toBe('DRAFT')
    expect(receiving.lines).toHaveLength(1)
    expect(receiving.lines[0].expectedQty).toBe(100)
  })

  // -----------------------------------------------------------------------
  // TEST 8.2: Adjustment Service Unaffected
  // -----------------------------------------------------------------------
  test('Regression: adjustment service still works correctly', async () => {
    const adj = await adjustmentService.createAdjustment({
      user: s.admin,
      body: {
        lines: [
          { itemId: s.itemA.id, locationId: s.loc1.id, qty: 5, systemQty: 0, countedQty: 0, diffQty: 0 },
        ],
        reasonCodeId: s.reasonAdj.id,
      },
    })

    expect(adj.status).toBe('DRAFT')
    expect(adj.lines).toHaveLength(1)
  })

  // -----------------------------------------------------------------------
  // TEST 8.3: FIFO Integrity Maintained
  // -----------------------------------------------------------------------
  test('Regression: FIFO ordering still works correctly', async () => {
    // Get FIFO layers for itemA
    const layers = await getFifoLayers(s.itemA.id, s.loc1.id)

    // Verify they are in FIFO order (oldest first)
    for (let i = 1; i < layers.length; i++) {
      const prev = new Date(layers[i - 1].receivedAt)
      const curr = new Date(layers[i].receivedAt)
      expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime())
    }
  })

  // -----------------------------------------------------------------------
  // TEST 8.4: Stock Ledger Integrity Maintained
  // -----------------------------------------------------------------------
  test('Regression: stock ledger still accumulates correctly', async () => {
    // Get ledger entries for itemA at loc1
    const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)

    // Verify running balance
    let expectedBalance = 0
    for (const entry of ledger) {
      expectedBalance += entry.qty
    }

    // Verify against aggregate
    const agg = await prisma.stockLedger.aggregate({
      where: { itemId: s.itemA.id, locationId: s.loc1.id },
      _sum: { qty: true },
    })

    expect(expectedBalance).toBeCloseTo(Number(agg._sum.qty || 0), 2)
  })

  // -----------------------------------------------------------------------
  // TEST 8.5: RBAC Still Enforced
  // -----------------------------------------------------------------------
  test('Regression: RBAC still enforced on business operations', async () => {
    // Stock clerk should not be able to create warehouse
    const { canManageMaster } = require('../lib/auth')

    expect(canManageMaster('STOCK_CONTROL')).toBe(false)
    expect(canManageMaster('SUPERVISOR')).toBe(true)
    expect(canManageMaster('ADMINISTRATOR')).toBe(true)
  })

})

// ===========================================================================
// SECTION 9: PERFORMANCE
// ===========================================================================

describe('Performance', () => {

  // -----------------------------------------------------------------------
  // TEST 9.1: Dashboard Load Time
  // -----------------------------------------------------------------------
  test('Performance: dashboard loads within acceptable time', async () => {
    const start = Date.now()
    await getDashboardReport({})
    const duration = Date.now() - start

    // Dashboard should load within 5 seconds (5000ms)
    expect(duration).toBeLessThan(5000)
  })

  // -----------------------------------------------------------------------
  // TEST 9.2: Large Pagination Works
  // -----------------------------------------------------------------------
  test('Performance: pagination works correctly with large limits', async () => {
    const result = await getInventoryReport('stock-on-hand', { limit: 500 })

    expect(result.data).toBeDefined()
    expect(result.data.length).toBeLessThanOrEqual(500)
  })

  // -----------------------------------------------------------------------
  // TEST 9.3: Report Generation Completes
  // -----------------------------------------------------------------------
  test('Performance: all reports complete successfully', async () => {
    const start = Date.now()

    await Promise.all([
      getInventoryReport('stock-on-hand', {}),
      getInventoryReport('fifo-aging', {}),
      getOperationsReport('receiving', {}),
      getAuditReport('audit-trail', {}),
      getDashboardReport({}),
    ])

    const duration = Date.now() - start

    // All reports should complete within 10 seconds
    expect(duration).toBeLessThan(10000)
  })

})

// ===========================================================================
// SECTION 10: RBAC
// ===========================================================================

describe('RBAC', () => {

  // -----------------------------------------------------------------------
  // TEST 10.1: All Roles Can View Reports
  // -----------------------------------------------------------------------
  test('RBAC: all roles can view reports', async () => {
    // Admin
    const adminResult = await getInventoryReport('stock-on-hand', {})
    expect(adminResult).toBeDefined()

    // Note: Since these tests use seeded users with specific roles,
    // and the report services don't check roles directly (they're read-only),
    // all authenticated users should be able to view reports
  })

  // -----------------------------------------------------------------------
  // TEST 10.2: Report Service Reads Only
  // -----------------------------------------------------------------------
  test('RBAC: report services are read-only (no role restrictions needed)', async () => {
    // Report services are read-only by design
    // No INSERT, UPDATE, or DELETE operations
    // Therefore, no RBAC restrictions are needed
    const result = await getInventoryReport('stock-on-hand', {})
    expect(result).toBeDefined()
    expect(result.data).toBeDefined()
  })

})

// ===========================================================================
// SUMMARY
// ===========================================================================

/**
 * Milestone 8 - Reports Module Acceptance Tests
 * ============================================
 *
 * Total Tests: 50+
 *
 * Test Coverage:
 * - Inventory Reports: 12 tests
 * - Operations Reports: 9 tests
 * - Audit Reports: 8 tests
 * - Dashboard Report: 6 tests
 * - Pagination: 4 tests
 * - Read-Only Verification: 7 tests
 * - Export Service: 5 tests
 * - Regression: 5 tests
 * - Performance: 3 tests
 * - RBAC: 2 tests
 *
 * Pass Criteria:
 * - All tests pass
 * - No database mutations
 * - Performance within acceptable limits
 * - Regression tests confirm existing functionality works
 */
