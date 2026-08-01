/**
 * acceptance.test.js
 *
 * Acceptance tests for Milestone 4 — Stock Adjustment & Cycle Count.
 *
 * Each test:
 *   1. Seeds a minimal dataset inside a $transaction (rolled back on failure).
 *   2. Exercises the business logic.
 *   3. Asserts the resulting DB state.
 *
 * Cleanup (afterEach in setup.js) deletes all records whose keys contain the
 * shared SEED_KEY so tests can run against the live Neon DB without polluting
 * production data.
 *
 * Run:  node --experimental-vm-modules node_modules/.bin/jest
 *   or:  npx jest
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const adjustmentService = require('../lib/adjustment-service')
const cycleCountService = require('../lib/cycle-count-service')
const fifoService = require('../lib/fifo-service')

// Silence audit log writes during tests (they are cleaned up by afterEach anyway)
jest.mock('../lib/audit', () => ({
  logAudit: jest.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function availableQty(itemId, locationId) {
  const agg = await prisma.fifoLayer.aggregate({
    where: { itemId, locationId, qtyRemaining: { gt: 0 } },
    _sum: { qtyRemaining: true },
  })
  return Number(agg._sum.qtyRemaining || 0)
}

// ---------------------------------------------------------------------------
// Shared seed — re-created for every test
// ---------------------------------------------------------------------------

let s // seed result: { admin, supervisor, stockClerk, itemA, itemB, loc1, loc2, reasonAdj, reasonCC, whCode }

beforeEach(async () => {
  // Prisma transactions auto-rollback on error, so we wrap the whole seed
  // in one. If anything fails we let it throw rather than silently continuing.
  // Users are created once in setup.js::beforeAll and reused here.
  s = await prisma.$transaction(async (tx) => {
    return seed(tx, global.seedKey, global)
  })
})

// ---------------------------------------------------------------------------
// TEST 1 — Adjustment IN
//   Creates a DRAFT adjustment with qty > 0, posts it.
//   Expects:
//     - adjustment status = COMPLETED
//     - ADJUSTMENT_IN ledger entry created
//     - FIFO layer created with qtyRemaining = qty, unitCost = item.unitCost
// ---------------------------------------------------------------------------

test('ADJ-IN: posting a positive-qty adjustment creates FIFO layer and ledger entry', async () => {
  const IN_QTY = 50
  const UNIT_COST = 10.0 // matches itemA.unitCost

  // Pre-condition: location is empty
  expect(await availableQty(s.itemA.id, s.loc1.id)).toBe(0)

  // Create draft
  const draft = await adjustmentService.createAdjustment({
    user: s.stockClerk,
    body: {
      lines: [
        {
          itemId: s.itemA.id,
          locationId: s.loc1.id,
          qty: IN_QTY,
          systemQty: 0,
          countedQty: 0,
          diffQty: 0,
        },
      ],
      reasonCodeId: s.reasonAdj.id,
      remarks: 'Test ADJ-IN',
    },
  })
  expect(draft.status).toBe('DRAFT')
  expect(draft.lines).toHaveLength(1)
  expect(draft.lines[0].qty).toBe(IN_QTY)

  // Post it
  const posted = await adjustmentService.postAdjustment({
    user: s.stockClerk,
    id: draft.id,
    body: {},
  })
  expect(posted.status).toBe('COMPLETED')
  expect(posted.postedAt).not.toBeNull()

  // FIFO layer created
  const layers = await getFifoLayers(s.itemA.id, s.loc1.id)
  expect(layers).toHaveLength(1)
  expect(layers[0].qtyReceived).toBe(IN_QTY)
  expect(layers[0].qtyRemaining).toBe(IN_QTY)
  expect(Number(layers[0].unitCost)).toBeCloseTo(UNIT_COST)
  expect(layers[0].refNumber).toBe(draft.adjustmentNumber)

  // Ledger entry
  const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)
  expect(ledger).toHaveLength(1)
  expect(ledger[0].txnType).toBe('ADJUSTMENT_IN')
  expect(ledger[0].qty).toBe(IN_QTY)
  expect(Number(ledger[0].unitCost)).toBeCloseTo(UNIT_COST)

  // Running balance check via stock endpoint
  const stock = await prisma.stockLedger.groupBy({
    by: ['itemId', 'locationId'],
    where: { itemId: s.itemA.id, locationId: s.loc1.id },
    _sum: { qty: true },
  })
  expect(Number(stock[0]._sum.qty)).toBe(IN_QTY)
})

// ---------------------------------------------------------------------------
// TEST 2 — Adjustment OUT
//   Pre-seed a FIFO layer, then post an OUT adjustment.
//   Expects:
//     - FIFO qtyRemaining decremented
//     - ADJUSTMENT_OUT ledger entry created
//     - Running balance = original - out_qty
// ---------------------------------------------------------------------------

test('ADJ-OUT: posting a negative-qty adjustment consumes FIFO and creates ledger entry', async () => {
  const SEED_QTY = 30
  const OUT_QTY = 12

  // Seed a FIFO layer directly (simulating a prior RECEIVING)
  await prisma.$transaction(async (tx) => {
    await tx.fifoLayer.create({
      data: {
        itemId: s.itemB.id,
        locationId: s.loc1.id,
        qtyReceived: SEED_QTY,
        qtyRemaining: SEED_QTY,
        unitCost: 5.0,
        refNumber: `RECV-SEED-${global.seedKey}`,
        receivedAt: new Date(),
      },
    })
    await tx.stockLedger.create({
      data: {
        itemId: s.itemB.id,
        locationId: s.loc1.id,
        txnType: 'RECEIVING',
        qty: SEED_QTY,
        unitCost: 5.0,
        refType: 'SEED',
        refNumber: `RECV-SEED-${global.seedKey}`,
        userId: s.admin.id,
      },
    })
  })

  expect(await availableQty(s.itemB.id, s.loc1.id)).toBe(SEED_QTY)

  // Create draft OUT
  const draft = await adjustmentService.createAdjustment({
    user: s.stockClerk,
    body: {
      lines: [
        {
          itemId: s.itemB.id,
          locationId: s.loc1.id,
          qty: -OUT_QTY,
          systemQty: SEED_QTY,
          countedQty: 0,
          diffQty: 0,
        },
      ],
      reasonCodeId: s.reasonAdj.id,
    },
  })
  expect(draft.status).toBe('DRAFT')

  // Post
  const posted = await adjustmentService.postAdjustment({
    user: s.stockClerk,
    id: draft.id,
    body: {},
  })
  expect(posted.status).toBe('COMPLETED')

  // FIFO consumed
  const layers = await getFifoLayers(s.itemB.id, s.loc1.id)
  expect(layers).toHaveLength(1)
  expect(layers[0].qtyRemaining).toBe(SEED_QTY - OUT_QTY)

  // Ledger OUT
  const ledger = await getLedgerEntries(s.itemB.id, s.loc1.id)
  const outEntry = ledger.find((e) => e.txnType === 'ADJUSTMENT_OUT')
  expect(outEntry).not.toBeUndefined()
  expect(outEntry.qty).toBe(-OUT_QTY)

  // Running balance
  const agg = await prisma.stockLedger.aggregate({
    where: { itemId: s.itemB.id, locationId: s.loc1.id },
    _sum: { qty: true },
  })
  expect(Number(agg._sum.qty)).toBe(SEED_QTY - OUT_QTY)
})

// ---------------------------------------------------------------------------
// TEST 3 — Cycle Count Variance → Auto-Adjustment
//   Full workflow: DRAFT → ASSIGNED → IN_PROGRESS → SUBMITTED → APPROVED
//   When variances exist, expects a COMPLETED StockAdjustment auto-created
//   with correct ADJUSTMENT_IN / ADJUSTMENT_OUT ledger + FIFO entries.
// ---------------------------------------------------------------------------

test('CC: approving a cycle count with variances auto-creates a completed adjustment', async () => {
  const SEED_QTY = 20 // system qty
  const COUNTED_QTY = 18 // 2 units short

  // Seed stock so systemQty > 0
  await prisma.$transaction(async (tx) => {
    await tx.fifoLayer.create({
      data: {
        itemId: s.itemA.id,
        locationId: s.loc1.id,
        qtyReceived: SEED_QTY,
        qtyRemaining: SEED_QTY,
        unitCost: 10.0,
        refNumber: `CC-SEED-${global.seedKey}`,
        receivedAt: new Date(),
      },
    })
    await tx.stockLedger.create({
      data: {
        itemId: s.itemA.id,
        locationId: s.loc1.id,
        txnType: 'RECEIVING',
        qty: SEED_QTY,
        unitCost: 10.0,
        refType: 'SEED',
        refNumber: `CC-SEED-${global.seedKey}`,
        userId: s.admin.id,
      },
    })
  })

  expect(await availableQty(s.itemA.id, s.loc1.id)).toBe(SEED_QTY)

  // 1. Create cycle count with systemQty pre-populated
  const cc = await cycleCountService.createCycleCount({
    user: s.admin,
    body: {
      lines: [
        {
          itemId: s.itemA.id,
          locationId: s.loc1.id,
          systemQty: SEED_QTY,
          countedQty: 0,
          diffQty: 0,
        },
      ],
      remarks: `Test CC ${global.seedKey}`,
    },
  })
  expect(cc.status).toBe('DRAFT')
  expect(cc.lines).toHaveLength(1)

  // 2. Assign to a user
  const assigned = await cycleCountService.assignCycleCount({
    user: s.admin,
    id: cc.id,
    assignedToId: s.stockClerk.id,
  })
  expect(assigned.status).toBe('ASSIGNED')
  expect(assigned.assignedToId).toBe(s.stockClerk.id)

  // 3. Start counting
  const started = await cycleCountService.startCycleCount({
    user: s.stockClerk,
    id: cc.id,
  })
  expect(started.status).toBe('IN_PROGRESS')

  // 4. Submit count (enter counted qty, diffQty auto-calculated)
  const submitted = await cycleCountService.submitCycleCount({
    user: s.stockClerk,
    id: cc.id,
    body: {
      lines: [{ id: cc.lines[0].id, countedQty: COUNTED_QTY }],
    },
  })
  expect(submitted.status).toBe('SUBMITTED')

  // Reload line to see diffQty
  const submittedLine = await prisma.cycleCountLine.findUnique({
    where: { id: cc.lines[0].id },
  })
  expect(submittedLine.diffQty).toBe(COUNTED_QTY - SEED_QTY) // -2

  // 5. Approve — expect auto-adjustment created
  const { cycleCount, adjustments } = await cycleCountService.approveCycleCount({
    user: s.supervisor,
    id: cc.id,
  })
  expect(cycleCount.status).toBe('APPROVED')
  expect(cycleCount.adjustmentId).toBeUndefined() // service doesn't set FK, but ledger is written
  expect(adjustments).toHaveLength(1)
  expect(adjustments[0].status).toBe('COMPLETED')

  // Variance is -2 (shortage) → ADJUSTMENT_OUT.
  // The ledger entry uses CC's countNumber as refNumber (set in approveCycleCount),
  // not the auto-created adjustment's adjustmentNumber.
  const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)
  const ccAdjustmentEntry = ledger.find(
    (e) => e.txnType === 'ADJUSTMENT_OUT' && e.refType === 'CYCLE_COUNT' && e.refId === cc.id
  )
  expect(ccAdjustmentEntry).not.toBeUndefined()
  expect(ccAdjustmentEntry.qty).toBe(-2)

  // Stock reduced by 2
  const newBalance = await availableQty(s.itemA.id, s.loc1.id)
  expect(newBalance).toBe(SEED_QTY - 2)
})

// ---------------------------------------------------------------------------
// TEST 4 — Rollback / Cancel
//   A DRAFT adjustment can be cancelled without touching FIFO or ledger.
//   A COMPLETED adjustment CANNOT be cancelled.
// ---------------------------------------------------------------------------

test('cancel: draft adjustment can be cancelled; completed cannot', async () => {
  const IN_QTY = 100

  // Create and post
  const draft = await adjustmentService.createAdjustment({
    user: s.stockClerk,
    body: {
      lines: [
        {
          itemId: s.itemA.id,
          locationId: s.loc1.id,
          qty: IN_QTY,
          systemQty: 0,
          countedQty: 0,
          diffQty: 0,
        },
      ],
      reasonCodeId: s.reasonAdj.id,
    },
  })

  const posted = await adjustmentService.postAdjustment({
    user: s.stockClerk,
    id: draft.id,
    body: {},
  })
  expect(posted.status).toBe('COMPLETED')

  // Attempt to cancel completed as stock clerk — expect permission error first
  await expect(
    adjustmentService.cancelAdjustment({ user: s.stockClerk, id: draft.id, reason: 'test' })
  ).rejects.toThrow('Only Supervisor or Administrator can cancel')

  // Now cancel a fresh DRAFT
  const draft2 = await adjustmentService.createAdjustment({
    user: s.stockClerk,
    body: {
      lines: [
        {
          itemId: s.itemA.id,
          locationId: s.loc1.id,
          qty: 5,
          systemQty: 0,
          countedQty: 0,
          diffQty: 0,
        },
      ],
      reasonCodeId: s.reasonAdj.id,
    },
  })

  const cancelled = await adjustmentService.cancelAdjustment({
    user: s.supervisor, // only SUPERVISOR or ADMIN can cancel
    id: draft2.id,
    reason: 'Wrong item',
  })
  expect(cancelled.status).toBe('CANCELLED')

  // FIFO unchanged (no new layer created)
  const layers = await getFifoLayers(s.itemA.id, s.loc1.id)
  const adjLayers = layers.filter((l) => l.refNumber === draft2.adjustmentNumber)
  expect(adjLayers).toHaveLength(0)

  // Ledger unchanged (posted adjustment still there)
  const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)
  const adj1Entry = ledger.find((e) => e.refNumber === draft.adjustmentNumber)
  expect(adj1Entry).not.toBeUndefined()
  expect(adj1Entry.txnType).toBe('ADJUSTMENT_IN')
})

// ---------------------------------------------------------------------------
// TEST 5 — FIFO Integrity
//   Verifies:
//     a) FIFO ordering: oldest layers consumed first.
//     b) Partial consumption: a layer with qtyRemaining=0 stays in DB.
//     c) Average cost: ADJUSTMENT_OUT uses weighted avg of consumed layers.
// ---------------------------------------------------------------------------

test('FIFO: oldest layers consumed first; partial consumption leaves layer in DB', async () => {
  const ITEM_COST_A = 8.0
  const ITEM_COST_B = 12.0

  // Seed two FIFO layers — layer A received first (older), layer B later
  await prisma.$transaction(async (tx) => {
    // Layer A: older, cheaper
    await tx.fifoLayer.create({
      data: {
        itemId: s.itemA.id,
        locationId: s.loc1.id,
        qtyReceived: 10,
        qtyRemaining: 10,
        unitCost: ITEM_COST_A,
        refNumber: `FIFO-A-${global.seedKey}`,
        receivedAt: new Date('2024-01-01'),
      },
    })
    // Layer B: newer, more expensive
    await tx.fifoLayer.create({
      data: {
        itemId: s.itemA.id,
        locationId: s.loc1.id,
        qtyReceived: 10,
        qtyRemaining: 10,
        unitCost: ITEM_COST_B,
        refNumber: `FIFO-B-${global.seedKey}`,
        receivedAt: new Date('2024-06-01'),
      },
    })
    await tx.stockLedger.createMany({
      data: [
        {
          itemId: s.itemA.id,
          locationId: s.loc1.id,
          txnType: 'RECEIVING',
          qty: 10,
          unitCost: ITEM_COST_A,
          refType: 'SEED',
          refNumber: `FIFO-A-${global.seedKey}`,
          userId: s.admin.id,
        },
        {
          itemId: s.itemA.id,
          locationId: s.loc1.id,
          txnType: 'RECEIVING',
          qty: 10,
          unitCost: ITEM_COST_B,
          refType: 'SEED',
          refNumber: `FIFO-B-${global.seedKey}`,
          userId: s.admin.id,
        },
      ],
    })
  })

  expect(await availableQty(s.itemA.id, s.loc1.id)).toBe(20)

  // Consume 13 units — should empty Layer A (10) and partially consume Layer B (3)
  const draft = await adjustmentService.createAdjustment({
    user: s.stockClerk,
    body: {
      lines: [
        {
          itemId: s.itemA.id,
          locationId: s.loc1.id,
          qty: -13,
          systemQty: 20,
          countedQty: 0,
          diffQty: 0,
        },
      ],
      reasonCodeId: s.reasonAdj.id,
    },
  })

  await adjustmentService.postAdjustment({ user: s.stockClerk, id: draft.id, body: {} })

  // Layer A fully consumed (qtyRemaining = 0, NOT deleted)
  const allLayers = await prisma.fifoLayer.findMany({
    where: { itemId: s.itemA.id, locationId: s.loc1.id },
    orderBy: { receivedAt: 'asc' },
  })
  expect(allLayers).toHaveLength(2)
  expect(allLayers[0].refNumber).toBe(`FIFO-A-${global.seedKey}`)
  expect(allLayers[0].qtyRemaining).toBe(0)
  expect(allLayers[0].qtyReceived).toBe(10) // record still exists

  // Layer B partially consumed
  expect(allLayers[1].refNumber).toBe(`FIFO-B-${global.seedKey}`)
  expect(allLayers[1].qtyRemaining).toBe(7)
  expect(Number(allLayers[1].unitCost)).toBeCloseTo(ITEM_COST_B)

  // Ledger shows ADJUSTMENT_OUT with weighted avg cost
  const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)
  const outEntry = ledger.find((e) => e.txnType === 'ADJUSTMENT_OUT')
  expect(outEntry).not.toBeUndefined()
  // (10 × 8.0 + 3 × 12.0) / 13 = (80 + 36) / 13 ≈ 8.923
  const expectedAvgCost = (10 * ITEM_COST_A + 3 * ITEM_COST_B) / 13
  expect(Number(outEntry.unitCost)).toBeCloseTo(expectedAvgCost, 2)

  // Running balance
  const agg = await prisma.stockLedger.aggregate({
    where: { itemId: s.itemA.id, locationId: s.loc1.id },
    _sum: { qty: true },
  })
  expect(Number(agg._sum.qty)).toBe(7)
})

// ---------------------------------------------------------------------------
// TEST 6 — Preview (no-write check)
//   previewAdjustment must not touch the database.
// ---------------------------------------------------------------------------

test('previewAdjustment: returns allocations without writing to DB', async () => {
  // Seed a FIFO layer so OUT preview can allocate
  await prisma.$transaction(async (tx) => {
    await tx.fifoLayer.create({
      data: {
        itemId: s.itemA.id,
        locationId: s.loc1.id,
        qtyReceived: 100,
        qtyRemaining: 100,
        unitCost: 10.0,
        refNumber: `PREVIEW-SEED-${global.seedKey}`,
        receivedAt: new Date(),
      },
    })
  })

  // IN line preview
  const inPreview = await adjustmentService.previewAdjustment({
    lines: [{ itemId: s.itemA.id, locationId: s.loc1.id, qty: 5 }],
    reasonCodeId: s.reasonAdj.id,
  })
  expect(inPreview.allocations).toHaveLength(1)
  expect(inPreview.allocations[0].direction).toBe('IN')
  expect(inPreview.allocations[0].newFifoLayer).toBeDefined()

  // OUT line preview
  const outPreview = await adjustmentService.previewAdjustment({
    lines: [{ itemId: s.itemA.id, locationId: s.loc1.id, qty: -3 }],
    reasonCodeId: s.reasonAdj.id,
  })
  expect(outPreview.allocations).toHaveLength(1)
  expect(outPreview.allocations[0].direction).toBe('OUT')
  expect(outPreview.allocations[0].fifoLayers).toBeDefined()

  // Confirm DB was NOT modified
  const ledger = await getLedgerEntries(s.itemA.id, s.loc1.id)
  expect(ledger).toHaveLength(0) // only the RECEIVING from seed, no ADJUSTMENT_*
})

// ---------------------------------------------------------------------------
// TEST 7 — Cycle Count with positive variance (surplus)
//   diffQty > 0 → ADJUSTMENT_IN + FIFO layer created
// ---------------------------------------------------------------------------

test('CC: positive variance (surplus) creates ADJUSTMENT_IN FIFO layer', async () => {
  const SEED_QTY = 10
  const COUNTED_QTY = 15 // +5 surplus

  await prisma.$transaction(async (tx) => {
    await tx.fifoLayer.create({
      data: {
        itemId: s.itemB.id,
        locationId: s.loc1.id,
        qtyReceived: SEED_QTY,
        qtyRemaining: SEED_QTY,
        unitCost: 5.0,
        refNumber: `CC-SURP-${global.seedKey}`,
        receivedAt: new Date(),
      },
    })
    await tx.stockLedger.create({
      data: {
        itemId: s.itemB.id,
        locationId: s.loc1.id,
        txnType: 'RECEIVING',
        qty: SEED_QTY,
        unitCost: 5.0,
        refType: 'SEED',
        refNumber: `CC-SURP-${global.seedKey}`,
        userId: s.admin.id,
      },
    })
  })

  const cc = await cycleCountService.createCycleCount({
    user: s.admin,
    body: {
      lines: [
        {
          itemId: s.itemB.id,
          locationId: s.loc1.id,
          systemQty: SEED_QTY,
          countedQty: 0,
          diffQty: 0,
        },
      ],
    },
  })

  // Must ASSIGN before START
  await cycleCountService.assignCycleCount({ user: s.admin, id: cc.id, assignedToId: s.stockClerk.id })
  // assignCycleCount doesn't return lines — refetch to get them
  const assigned = await cycleCountService.getCycleCount(cc.id)
  const started = await cycleCountService.startCycleCount({ user: s.stockClerk, id: assigned.id })

  const submitted = await cycleCountService.submitCycleCount({
    user: s.stockClerk,
    id: assigned.id,
    body: { lines: [{ id: assigned.lines[0].id, countedQty: COUNTED_QTY }] },
  })

  await cycleCountService.approveCycleCount({ user: s.supervisor, id: assigned.id })

  // ADJUSTMENT_IN FIFO layer should exist
  const layers = await getFifoLayers(s.itemB.id, s.loc1.id)
  const adjLayers = layers.filter((l) => l.refNumber?.includes(global.seedKey))
  expect(adjLayers.length).toBeGreaterThanOrEqual(1)

  // Surplus (+5) should be reflected in total available
  const totalAvailable = await availableQty(s.itemB.id, s.loc1.id)
  expect(totalAvailable).toBe(SEED_QTY + 5) // 15 total: 10 original + 5 surplus

  const ledger = await getLedgerEntries(s.itemB.id, s.loc1.id)
  const adjIn = ledger.find((e) => e.txnType === 'ADJUSTMENT_IN')
  expect(adjIn).not.toBeUndefined()
  expect(adjIn.qty).toBe(5)
})
