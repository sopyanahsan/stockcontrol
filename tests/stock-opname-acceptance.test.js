/**
 * stock-opname-acceptance.test.js
 *
 * Acceptance tests for Milestone 9 — Stock Opname.
 *
 * Each test:
 *   1. Seeds a minimal dataset inside a $transaction (rolled back on failure).
 *   2. Builds stock via a posted ADJUSTMENT_IN (FIFO layer + Stock Ledger).
 *   3. Exercises the full opname lifecycle and asserts the resulting DB state.
 *
 * Business rules verified:
 *   - Stock Opname NEVER modifies inventory directly (stock unchanged until approval).
 *   - systemQty is captured at DRAFT → IN_PROGRESS and is IMMUTABLE.
 *   - Approval reuses adjustment-service → FIFO + Stock Ledger + Audit Trail.
 *   - Only Supervisor / Administrator can approve or cancel.
 *
 * Run: npx jest
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const adjustmentService = require('../lib/adjustment-service')
const opnameService = require('../lib/stock-opname-service')

// Silence audit log writes during tests (they are cleaned up by afterEach anyway)
jest.mock('../lib/audit', () => ({
  logAudit: jest.fn(),
}))
const { logAudit } = require('../lib/audit')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function availableQty(itemId, locationId) {
  const agg = await prisma.fifoLayer.aggregate({
    where: { itemId, locationId, qtyRemaining: { gt: 0 } },
    _sum: { qtyRemaining: true },
  })
  return Number(agg._sum.qtyRemaining || 0)
}

async function getLedgerEntries(itemId, locationId) {
  return prisma.stockLedger.findMany({
    where: { itemId, locationId },
    orderBy: { createdAt: 'asc' },
  })
}

// Post a positive-qty adjustment to create stock (FIFO layer + ledger entry)
async function stockIn(itemId, locationId, qty, reasonCodeId) {
  const draft = await adjustmentService.createAdjustment({
    user: global.stockClerk,
    body: {
      lines: [
        { itemId, locationId, qty, systemQty: 0, countedQty: 0, diffQty: 0 },
      ],
      reasonCodeId,
      remarks: 'Opname test stock-in',
    },
  })
  await adjustmentService.postAdjustment({ user: global.stockClerk, id: draft.id, body: {} })
}

// Full setup + lifecycle up to a specific status
async function buildOpnameWithStock(s, { qty, countedQty }) {
  await stockIn(s.itemA.id, s.loc1.id, qty, s.reasonAdj.id)

  const opname = await opnameService.createStockOpname({ user: s.stockClerk, body: { remarks: 'Opname test' } })
  const started = await opnameService.startStockOpname({
    user: s.stockClerk,
    id: opname.id,
    body: { locationId: s.loc1.id },
  })

  if (countedQty != null) {
    const line = started.lines.find((l) => l.itemId === s.itemA.id)
    await opnameService.updateCountedQty({
      user: s.stockClerk,
      id: opname.id,
      body: { lineId: line.id, countedQty },
    })
  }
  return { opname, started }
}

let s // seed result

beforeEach(async () => {
  logAudit.mockClear()
  s = await prisma.$transaction(async (tx) => {
    return seed(tx, global.seedKey, global)
  })
})

// ---------------------------------------------------------------------------
// TEST 1 — Full lifecycle with over-count (positive variance)
// ---------------------------------------------------------------------------

test('opname: full lifecycle with over-count posts ADJUSTMENT_IN on approval', async () => {
  const SEED_QTY = 50
  const COUNTED_QTY = 60

  const { opname, started } = await buildOpnameWithStock(s, { qty: SEED_QTY, countedQty: COUNTED_QTY })

  expect(opname.status).toBe('DRAFT')
  expect(opname.opnameNumber).toMatch(/^SO-/)

  // Snapshot captured at start
  expect(started.status).toBe('IN_PROGRESS')
  expect(started.lines).toHaveLength(1)
  expect(started.lines[0].itemId).toBe(s.itemA.id)
  expect(started.lines[0].systemQty).toBe(SEED_QTY)
  expect(started.lines[0].countedQty).toBe(0)

  // Scan location + item
  const locScan = await opnameService.scanLocation({
    user: s.stockClerk,
    id: opname.id,
    body: { locationCode: s.loc1.code },
  })
  expect(locScan.location.code).toBe(s.loc1.code)
  expect(locScan.linesAtLocation).toBe(1)

  const itemScan = await opnameService.scanItem({
    user: s.stockClerk,
    id: opname.id,
    body: { barcode: s.itemA.sku, locationId: s.loc1.id },
  })
  expect(itemScan.item.id).toBe(s.itemA.id)
  expect(itemScan.line.systemQty).toBe(SEED_QTY)

  // Counted qty + variance
  const lineId = started.lines[0].id
  const counted = await opnameService.updateCountedQty({
    user: s.stockClerk,
    id: opname.id,
    body: { lineId, countedQty: COUNTED_QTY },
  })
  expect(counted.countedQty).toBe(COUNTED_QTY)
  expect(counted.diffQty).toBe(COUNTED_QTY - SEED_QTY)

  // Variance summary
  const summary = await opnameService.getVarianceSummary(opname.id)
  expect(summary).toMatchObject({ totalItems: 1, countedItems: 1, variance: 1, over: 1, missing: 0, matched: 0 })

  // Stock is untouched before approval — opname never edits stock directly
  expect(await availableQty(s.itemA.id, s.loc1.id)).toBe(SEED_QTY)

  // Submit
  const submitted = await opnameService.submitStockOpname({ user: s.stockClerk, id: opname.id })
  expect(submitted.status).toBe('SUBMITTED')

  // Approve → COMPLETED
  const approved = await opnameService.approveStockOpname({ user: s.supervisor, id: opname.id })
  expect(approved.status).toBe('COMPLETED')
  expect(approved.approvedById).toBe(s.supervisor.id)
  expect(approved.completedAt).not.toBeNull()

  // Stock increased by the +10 variance via the auto-created adjustment
  expect(await availableQty(s.itemA.id, s.loc1.id)).toBe(COUNTED_QTY)

  // Ledger written via the auto-created adjustment with an OPNAME reason code
  const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)
  const inEntry = ledger.find((e) => e.txnType === 'ADJUSTMENT_IN' && e.qty === COUNTED_QTY - SEED_QTY)
  expect(inEntry).not.toBeUndefined()
  expect(inEntry.reasonCodeId).not.toBeNull()
  const rc = await prisma.reasonCode.findUnique({ where: { id: inEntry.reasonCodeId } })
  expect(rc.type).toBe('OPNAME')

  // Audit trail emitted for the opname flow
  const approveLog = logAudit.mock.calls.find(([call]) => call.module === 'STOCK_OPNAME' && call.action === 'APPROVE')
  expect(approveLog).toBeDefined()
})

// ---------------------------------------------------------------------------
// TEST 2 — Shortage (negative variance → ADJUSTMENT_OUT)
// ---------------------------------------------------------------------------

test('opname: shortage posts ADJUSTMENT_OUT and reduces stock', async () => {
  const SEED_QTY = 30
  const COUNTED_QTY = 20

  await stockIn(s.itemA.id, s.loc1.id, SEED_QTY, s.reasonAdj.id)
  const opname = await opnameService.createStockOpname({ user: s.stockClerk, body: {} })
  const started = await opnameService.startStockOpname({
    user: s.stockClerk,
    id: opname.id,
    body: { locationId: s.loc1.id },
  })
  expect(started.lines[0].systemQty).toBe(SEED_QTY)

  await opnameService.updateCountedQty({
    user: s.stockClerk,
    id: opname.id,
    body: { lineId: started.lines[0].id, countedQty: COUNTED_QTY },
  })
  await opnameService.submitStockOpname({ user: s.stockClerk, id: opname.id })

  const approved = await opnameService.approveStockOpname({ user: s.supervisor, id: opname.id })
  expect(approved.status).toBe('COMPLETED')

  expect(await availableQty(s.itemA.id, s.loc1.id)).toBe(COUNTED_QTY)

  const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)
  const outEntry = ledger.find((e) => e.txnType === 'ADJUSTMENT_OUT' && e.refType === 'ADJUSTMENT')
  expect(outEntry).not.toBeUndefined()
  expect(outEntry.qty).toBe(COUNTED_QTY - SEED_QTY) // -10
})

// ---------------------------------------------------------------------------
// TEST 3 — Snapshot immutability + validation rules
// ---------------------------------------------------------------------------

test('opname: systemQty snapshot is immutable after start', async () => {
  await stockIn(s.itemA.id, s.loc1.id, 25, s.reasonAdj.id)

  const opname = await opnameService.createStockOpname({ user: s.stockClerk, body: {} })
  const started = await opnameService.startStockOpname({
    user: s.stockClerk,
    id: opname.id,
    body: { locationId: s.loc1.id },
  })
  expect(started.lines[0].systemQty).toBe(25)

  // Stock changes after the snapshot was captured
  await stockIn(s.itemA.id, s.loc1.id, 15, s.reasonAdj.id)
  expect(await availableQty(s.itemA.id, s.loc1.id)).toBe(40)

  // Reload the opname — snapshot must NOT have moved
  const reloaded = await opnameService.getStockOpname(opname.id)
  expect(reloaded.lines[0].systemQty).toBe(25)
  expect(reloaded.lines[0].countedQty).toBe(0)
})

test('opname: validation guards the workflow', async () => {
  await stockIn(s.itemA.id, s.loc1.id, 10, s.reasonAdj.id)
  const opname = await opnameService.createStockOpname({ user: s.stockClerk, body: {} })

  // Cannot start twice
  const started = await opnameService.startStockOpname({
    user: s.stockClerk,
    id: opname.id,
    body: { locationId: s.loc1.id },
  })
  await expect(
    opnameService.startStockOpname({ user: s.stockClerk, id: opname.id, body: { locationId: s.loc1.id } })
  ).rejects.toThrow('Only DRAFT stock opnames can be started')

  // Cannot submit with uncounted lines
  await expect(opnameService.submitStockOpname({ user: s.stockClerk, id: opname.id })).rejects.toThrow(
    'All lines must be counted before submission'
  )

  // Negative counts rejected
  await expect(
    opnameService.updateCountedQty({
      user: s.stockClerk,
      id: opname.id,
      body: { lineId: started.lines[0].id, countedQty: -1 },
    })
  ).rejects.toThrow('Counted quantity must be a non-negative number')

  // Unknown barcode rejected
  await expect(
    opnameService.scanItem({ user: s.stockClerk, id: opname.id, body: { barcode: 'NO-SUCH-ITEM', locationId: s.loc1.id } })
  ).rejects.toThrow('Barcode does not match any item')

  // Item not part of the snapshot rejected
  await expect(
    opnameService.scanItem({ user: s.stockClerk, id: opname.id, body: { barcode: s.itemB.sku, locationId: s.loc1.id } })
  ).rejects.toThrow('Item is not in this stock opname snapshot')

  // Scan item at the wrong location rejected
  await opnameService.updateCountedQty({
    user: s.stockClerk,
    id: opname.id,
    body: { lineId: started.lines[0].id, countedQty: 10 },
  })
  await expect(
    opnameService.scanItem({ user: s.stockClerk, id: opname.id, body: { barcode: s.itemA.sku, locationId: s.loc2.id } })
  ).rejects.toThrow('Item is not at the specified location')
})

// ---------------------------------------------------------------------------
// TEST 4 — RBAC + cancel + list
// ---------------------------------------------------------------------------

test('opname: RBAC — only Supervisor/Admin can approve or cancel; clerk is blocked', async () => {
  const opname = await opnameService.createStockOpname({ user: s.stockClerk, body: {} })

  await expect(
    opnameService.approveStockOpname({ user: s.stockClerk, id: opname.id })
  ).rejects.toThrow('Only Supervisor or Administrator can approve')

  await expect(
    opnameService.cancelStockOpname({ user: s.stockClerk, id: opname.id, body: { reason: 'no' } })
  ).rejects.toThrow('Only Supervisor or Administrator can cancel')

  const cancelled = await opnameService.cancelStockOpname({ user: s.supervisor, id: opname.id, body: { reason: 'test cancel' } })
  expect(cancelled.status).toBe('CANCELLED')
  expect(cancelled.remarks).toContain('[CANCELLED]')

  // CANCELLED opnames cannot be started
  await expect(
    opnameService.startStockOpname({ user: s.stockClerk, id: opname.id, body: { locationId: s.loc1.id } })
  ).rejects.toThrow('Only DRAFT stock opnames can be started')
})

test('opname: listStockOpnames returns drafts and respects status filter', async () => {
  const first = await opnameService.createStockOpname({ user: s.stockClerk, body: { remarks: 'first' } })
  await opnameService.createStockOpname({ user: s.stockClerk, body: { remarks: 'second' } })

  const all = await opnameService.listStockOpnames({})
  expect(all.total).toBeGreaterThanOrEqual(2)
  expect(all.data.some((o) => o.id === first.id)).toBe(true)

  const drafts = await opnameService.listStockOpnames({ status: 'DRAFT' })
  expect(drafts.data.every((o) => o.status === 'DRAFT')).toBe(true)
  expect(drafts.data.some((o) => o.id === first.id)).toBe(true)

  const completed = await opnameService.listStockOpnames({ status: 'COMPLETED' })
  expect(completed.data.some((o) => o.id === first.id)).toBe(false)
})
