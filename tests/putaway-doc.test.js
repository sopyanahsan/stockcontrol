/**
 * putaway-doc.test.js
 *
 * Acceptance tests for PTW-1.0 — Enterprise Putaway Document (header + lines).
 *
 * Covers:
 *   1. generateFromReceiving on a POSTED (WAITING_PUTAWAY) receiving → DRAFT
 *      with every receiving line copied (snapshot), no stock ledger changes.
 *   2. Duplicate generation is blocked while an ACTIVE putaway exists.
 *   3. Generation from a non-posted receiving is rejected.
 *   4. updatePutaway edits priority / operator / remarks / target location.
 *   5. releasePutaway → RELEASED; cancelPutaway → CANCELLED.
 *   6. After cancel, a new putaway can be generated for the same receiving.
 *
 * Run:  npx jest tests/putaway-doc.test.js
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const receivingService = require('../lib/receiving-service')
const putawayService = require('../lib/putaway-service')

jest.mock('../lib/audit', () => ({
  logAudit: jest.fn(),
}))

let s

beforeEach(async () => {
  s = await prisma.$transaction(async (tx) => {
    return seed(tx, global.seedKey, global)
  })
})

async function postedReceiving(lines) {
  const draft = await receivingService.createReceivingDraft({
    user: s.admin,
    body: {
      supplier: 'Test Supplier',
      warehouseId: s.warehouse.id,
      lines: lines.map((l) => ({ itemId: l.itemId, expectedQty: l.qty, unitCost: l.cost || 0 })),
    },
  })
  await receivingService.startReceiving({ user: s.admin, id: draft.id })
  const posted = await receivingService.postReceiving({
    user: s.admin,
    id: draft.id,
    body: { lines: draft.lines.map((l, i) => ({ lineId: l.id, receivedQty: lines[i].qty })) },
  })
  expect(posted.status).toBe('WAITING_PUTAWAY')
  return posted
}

async function ledgerCount(itemId) {
  return prisma.stockLedger.count({ where: { itemId } })
}

test('PTW-1: generateFromReceiving copies every line into a DRAFT putaway', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 50 }, { itemId: s.itemB.id, qty: 30 }])
  const beforeLedger = await ledgerCount(s.itemA.id)

  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  expect(doc.status).toBe('DRAFT')
  expect(doc.putawayNo.startsWith('PTW-')).toBe(true)
  expect(doc.sourceType).toBe('RECEIVING')
  expect(doc.sourceId).toBe(receiving.id)
  expect(doc.sourceNumber).toBe(receiving.grnNumber)
  expect(doc.warehouseId).toBe(receiving.warehouseId)
  expect(doc.lines).toHaveLength(2)

  const a = doc.lines.find((l) => l.itemId === s.itemA.id)
  expect(a.qty).toBe(50)
  expect(a.sku).toBe(s.itemA.sku)
  expect(a.itemName).toBe(s.itemA.name)
  expect(a.sourceLocationId).toBe(receiving.stagingLocationId)
  expect(a.qtyCompleted).toBe(0)
  expect(a.status).toBe('WAITING')

  const b = doc.lines.find((l) => l.itemId === s.itemB.id)
  expect(b.qty).toBe(30)
  expect(b.lineNo).toBe(2)

  // No inventory movement, no stock ledger, no stock on hand changes.
  expect(await ledgerCount(s.itemA.id)).toBe(beforeLedger)
})

test('PTW-2: duplicate generation blocked while an ACTIVE putaway exists', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  await expect(putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id }))
    .rejects.toThrow(/active putaway already exists/)

  const count = await prisma.putaway.count({ where: { sourceId: receiving.id } })
  expect(count).toBe(1)
})

test('PTW-3: generation rejected for a non-POSTED receiving', async () => {
  const draft = await receivingService.createReceivingDraft({
    user: s.admin,
    body: { supplier: 'T', warehouseId: s.warehouse.id, lines: [{ itemId: s.itemA.id, expectedQty: 5 }] },
  })
  await expect(putawayService.generateFromReceiving({ user: s.admin, receivingId: draft.id }))
    .rejects.toThrow(/Only POSTED receiving/)
})

test('PTW-4: updatePutaway edits draft header and line target', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 20 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  const updated = await putawayService.updatePutaway({
    user: s.admin,
    id: doc.id,
    body: {
      priority: 'HIGH',
      operatorId: s.stockClerk.id,
      remarks: 'priority order',
      lines: [{ lineId: doc.lines[0].id, targetLocationId: s.loc1.id }],
    },
  })

  expect(updated.priority).toBe('HIGH')
  expect(updated.operatorId).toBe(s.stockClerk.id)
  expect(updated.remarks).toBe('priority order')
  expect(updated.lines[0].targetLocationId).toBe(s.loc1.id)
})

test('PTW-5: release then cancel; cancelled putaway allows regeneration', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 15 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  const released = await putawayService.releasePutaway({ user: s.admin, id: doc.id })
  expect(released.status).toBe('RELEASED')

  // Release is idempotent-blocked: only DRAFT can be released.
  await expect(putawayService.releasePutaway({ user: s.admin, id: doc.id })).rejects.toThrow(/Only DRAFT/)

  const cancelled = await putawayService.cancelPutaway({ user: s.admin, id: doc.id, reason: 'plan changed' })
  expect(cancelled.status).toBe('CANCELLED')

  // A cancelled putaway frees the receiving for a new generation.
  const doc2 = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  expect(doc2.status).toBe('DRAFT')
  expect(doc2.putawayNo).not.toBe(doc.putawayNo)
})

test('PTW-6: assignOperator moves RELEASED -> ASSIGNED and records operator details', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  // Only RELEASED can be assigned (doc is still DRAFT).
  await expect(putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } }))
    .rejects.toThrow(/Only RELEASED/)

  await putawayService.releasePutaway({ user: s.admin, id: doc.id })

  // Invalid operator rejected.
  await expect(putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: 'nonexistent' } }))
    .rejects.toThrow(/not found|inactive/)

  const assigned = await putawayService.assignOperator({
    user: s.admin,
    id: doc.id,
    body: { assignedTo: s.stockClerk.id, priority: 'HIGH', estimatedDuration: 45, remarks: 'asap' },
  })
  expect(assigned.status).toBe('ASSIGNED')
  expect(assigned.assignedTo).toBe(s.stockClerk.id)
  expect(assigned.assignedName).toBe(s.stockClerk.name)
  expect(assigned.assignedAt).not.toBeNull()
  expect(assigned.priority).toBe('HIGH')
  expect(assigned.estimatedDuration).toBe(45)
})

test('PTW-7: startPutaway moves ASSIGNED -> IN_PROGRESS and stamps startedAt', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 8 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await putawayService.releasePutaway({ user: s.admin, id: doc.id })

  // Cannot start before assignment.
  await expect(putawayService.startPutaway({ user: s.admin, id: doc.id })).rejects.toThrow(/Only ASSIGNED/)

  await putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } })
  const started = await putawayService.startPutaway({ user: s.admin, id: doc.id })
  expect(started.status).toBe('IN_PROGRESS')
  expect(started.startedAt).not.toBeNull()
})

test('PTW-8: completed cannot be assigned again; cancelled cannot start', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 5 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await putawayService.releasePutaway({ user: s.admin, id: doc.id })
  await putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } })
  await putawayService.startPutaway({ user: s.admin, id: doc.id })

  // Cancelled cannot start: cancel from IN_PROGRESS is blocked by the state machine.
  await expect(putawayService.cancelPutaway({ user: s.admin, id: doc.id })).rejects.toThrow(/DRAFT, RELEASED or ASSIGNED/)

  // Simulate a completed doc via direct update, then confirm re-assignment is blocked.
  await prisma.putaway.update({ where: { id: doc.id }, data: { status: 'COMPLETED', completedAt: new Date() } })
  await expect(putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } }))
    .rejects.toThrow(/Only RELEASED/)
  await expect(putawayService.startPutaway({ user: s.admin, id: doc.id })).rejects.toThrow(/Only ASSIGNED/)
})

async function startedDoc(qty) {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await putawayService.releasePutaway({ user: s.admin, id: doc.id })
  await putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } })
  await putawayService.startPutaway({ user: s.admin, id: doc.id })
  return prisma.putaway.findUnique({ where: { id: doc.id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
}

test('PTW-9: line execution — start requires IN_PROGRESS doc, complete moves line to COMPLETED', async () => {
  // Line ops are blocked before the document starts.
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await expect(putawayService.startLine({ user: s.admin, id: doc.id, lineId: doc.lines[0].id }))
    .rejects.toThrow(/Only IN_PROGRESS putaway/)

  const started = await startedDoc(10)
  const line = started.lines[0]
  expect(line.status).toBe('WAITING')

  const inProgress = await putawayService.startLine({ user: s.admin, id: started.id, lineId: line.id })
  expect(inProgress.lines[0].status).toBe('IN_PROGRESS')
  expect(inProgress.lines[0].startedAt).not.toBeNull()
  expect(inProgress.lines[0].executedByName).toBe(s.admin.name)

  const completed = await putawayService.completeLine({ user: s.admin, id: started.id, lineId: line.id })
  expect(completed.lines[0].status).toBe('COMPLETED')
  expect(completed.lines[0].qtyCompleted).toBe(10)
  expect(completed.lines[0].completedAt).not.toBeNull()

  // COMPLETED cannot execute again.
  await expect(putawayService.completeLine({ user: s.admin, id: started.id, lineId: line.id }))
    .rejects.toThrow(/Only IN_PROGRESS lines/)
  await expect(putawayService.startLine({ user: s.admin, id: started.id, lineId: line.id }))
    .rejects.toThrow(/WAITING or ASSIGNED/)
})

test('PTW-10: skip then resume a line', async () => {
  const started = await startedDoc(7)
  const line = started.lines[0]

  const skipped = await putawayService.skipLine({ user: s.admin, id: started.id, lineId: line.id, remark: 'damaged' })
  expect(skipped.lines[0].status).toBe('SKIPPED')
  expect(skipped.lines[0].executionRemark).toBe('damaged')

  // Skipped lines cannot complete; must resume first.
  await expect(putawayService.completeLine({ user: s.admin, id: started.id, lineId: line.id }))
    .rejects.toThrow(/Only IN_PROGRESS lines/)

  const resumed = await putawayService.resumeLine({ user: s.admin, id: started.id, lineId: line.id })
  expect(resumed.lines[0].status).toBe('IN_PROGRESS')

  const completed = await putawayService.completeLine({ user: s.admin, id: started.id, lineId: line.id })
  expect(completed.lines[0].status).toBe('COMPLETED')
})

test('PTW-11: progress engine and execution summary are computed dynamically', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 50 }, { itemId: s.itemB.id, qty: 50 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await putawayService.releasePutaway({ user: s.admin, id: doc.id })
  await putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } })
  await putawayService.startPutaway({ user: s.admin, id: doc.id })
  const started = await prisma.putaway.findUnique({ where: { id: doc.id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })

  const [l1, l2] = started.lines
  await putawayService.startLine({ user: s.admin, id: started.id, lineId: l1.id })
  await putawayService.completeLine({ user: s.admin, id: started.id, lineId: l1.id })
  await putawayService.skipLine({ user: s.admin, id: started.id, lineId: l2.id, remark: 'on hold' })

  const progress = await putawayService.calculateProgress({ id: started.id })
  expect(progress.totalLines).toBe(2)
  expect(progress.completedLines).toBe(1)
  expect(progress.skippedLines).toBe(1)
  expect(progress.remainingLines).toBe(0)
  expect(progress.totalQty).toBe(100)
  expect(progress.completedQty).toBe(50)
  expect(progress.progressPct).toBe(50)

  const summary = await putawayService.getExecutionSummary({ id: started.id })
  expect(summary.progressPct).toBe(50)
  expect(summary.completedLines).toBe(1)
  expect(summary.skippedLines).toBe(1)
  expect(summary.runningLines).toBe(0)
  expect(summary.executionDuration).not.toBeNull()
})

test('PTW-12: suggestLocation recommends the same-SKU storage location with capacity info', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  // Seed stock at loc1 (STORAGE): ledger (occupancy) + FIFO layer (same-SKU detection).
  await prisma.stockLedger.create({
    data: { itemId: s.itemA.id, locationId: s.loc1.id, txnType: 'ADJUSTMENT_IN', qty: 5, userId: s.admin.id },
  })
  await prisma.fifoLayer.create({
    data: { itemId: s.itemA.id, locationId: s.loc1.id, refNumber: `PTWSEED-${global.seedKey}`, qtyReceived: 5, qtyRemaining: 5, unitCost: 10 },
  })

  const suggestion = await putawayService.suggestLocation({ user: s.admin, id: doc.id, lineId: doc.lines[0].id })

  expect(suggestion.allowPutaway).toBe(true)
  expect(suggestion.suggestedLocation).toBeTruthy()
  expect(suggestion.suggestedLocation.id).toBe(s.loc1.id)
  expect(suggestion.capacity.status).toBe('UNLIMITED')
  expect(suggestion.capacity.allowPutaway).toBe(true)
  expect(suggestion.fifo.method).toBe('FIFO')
  expect(suggestion.fifo.candidates.length).toBeGreaterThan(0)
  expect(suggestion.reasons.length).toBeGreaterThan(0)
})

test('PTW-13: validateCapacity rejects a full location and overflows', async () => {
  await prisma.location.update({ where: { id: s.loc1.id }, data: { maxCapacity: 10 } })
  await prisma.stockLedger.create({
    data: { itemId: s.itemA.id, locationId: s.loc1.id, txnType: 'ADJUSTMENT_IN', qty: 10, userId: s.admin.id },
  })

  const full = await putawayService.validateCapacity({ locationId: s.loc1.id, qty: 5 })
  expect(full.status).toBe('FULL')
  expect(full.allowPutaway).toBe(false)

  await prisma.location.update({ where: { id: s.loc1.id }, data: { maxCapacity: 12 } })
  const overflow = await putawayService.validateCapacity({ locationId: s.loc1.id, qty: 5 })
  expect(overflow.status).toBe('OVERFLOW')
  expect(overflow.allowPutaway).toBe(false)
  expect(overflow.reason).toMatch(/exceeds/)

  await prisma.location.update({ where: { id: s.loc1.id }, data: { maxCapacity: 0 } })
  const unlimited = await putawayService.validateCapacity({ locationId: s.loc1.id, qty: 5 })
  expect(unlimited.status).toBe('UNLIMITED')
  expect(unlimited.allowPutaway).toBe(true)
})

test('PTW-14: selectLineLocation accepts / overrides and validates the location', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  const line = doc.lines[0]

  // Inactive location rejected.
  await prisma.location.update({ where: { id: s.loc2.id }, data: { isActive: false } })
  await expect(putawayService.selectLineLocation({ user: s.admin, id: doc.id, lineId: line.id, locationId: s.loc2.id, mode: 'OVERRIDE' }))
    .rejects.toThrow(/inactive/)
  await prisma.location.update({ where: { id: s.loc2.id }, data: { isActive: true } })

  const accepted = await putawayService.selectLineLocation({ user: s.admin, id: doc.id, lineId: line.id, locationId: s.loc1.id, mode: 'ACCEPT' })
  expect(accepted.targetLocationId).toBe(s.loc1.id)

  const overridden = await putawayService.selectLineLocation({ user: s.admin, id: doc.id, lineId: line.id, locationId: s.loc2.id, mode: 'OVERRIDE' })
  expect(overridden.targetLocationId).toBe(s.loc2.id)
})

test('PTW-15: scoreSuggestions returns a ranked primary with score, reasons and warnings', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  const rec = await putawayService.scoreSuggestions({ user: s.admin, id: doc.id, lineId: doc.lines[0].id })

  expect(rec.primary).toBeTruthy()
  expect(rec.primary.score).toBeGreaterThanOrEqual(0)
  expect(rec.primary.score).toBeLessThanOrEqual(100)
  expect(rec.primary.available).toBe(true)
  expect(rec.primary.reasons.length).toBeGreaterThan(0)
  expect(typeof rec.primary.strategy).toBe('string')
  expect(rec.primary.location.code).toBeTruthy()
  expect(rec.alternatives.length).toBeGreaterThanOrEqual(0)
  // primary must be the top available location.
  expect(rec.alternatives.every((a) => a.score <= rec.primary.score)).toBe(true)
})

test('PTW-16: same-SKU location scores highest', async () => {
  await prisma.stockLedger.create({
    data: { itemId: s.itemA.id, locationId: s.loc1.id, txnType: 'ADJUSTMENT_IN', qty: 5, userId: s.admin.id },
  })
  await prisma.fifoLayer.create({
    data: { itemId: s.itemA.id, locationId: s.loc1.id, refNumber: `PTWSEED2-${global.seedKey}`, qtyReceived: 5, qtyRemaining: 5, unitCost: 10 },
  })

  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  const rec = await putawayService.scoreSuggestions({ user: s.admin, id: doc.id, lineId: doc.lines[0].id })

  expect(rec.primary.location.id).toBe(s.loc1.id)
  expect(rec.primary.reasons).toContain('Same SKU')
  // Ranked output also places loc1 first.
  const rankedIds = rec.alternatives.map((a) => a.location.id)
  expect(rankedIds).not.toContain(s.loc1.id)
})

test('PTW-17: scan session validates location scans (correct vs wrong)', async () => {
  const started = await startedDoc(10)
  const line = started.lines[0]

  // Scan sessions require IN_PROGRESS.
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 5 }])
  const draft = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await expect(putawayService.startScanSession({ user: s.admin, id: draft.id })).rejects.toThrow(/IN_PROGRESS/)

  const started2 = await startedDoc(10)
  const line2 = started2.lines[0]
  await putawayService.selectLineLocation({ user: s.admin, id: started2.id, lineId: line2.id, locationId: s.loc1.id, mode: 'ACCEPT' })

  const { session } = await putawayService.startScanSession({ user: s.admin, id: started2.id })
  expect(session.scanCount).toBe(0)

  // Item scan before location scan is rejected.
  await expect(putawayService.validateItemScan({ user: s.admin, id: started2.id, body: { code: s.itemA.sku } }))
    .rejects.toThrow(/location first/)

  const ok = await putawayService.validateLocationScan({ user: s.admin, id: started2.id, body: { code: s.loc1.code, lineId: line2.id } })
  expect(ok.result.status).toBe('SUCCESS')
  expect(ok.result.expected).toBe(s.loc1.code)
  expect(ok.session.scanCount).toBe(1)

  const wrong = await putawayService.validateLocationScan({ user: s.admin, id: started2.id, body: { code: s.loc2.code, lineId: line2.id } })
  expect(wrong.result.status).toBe('WARNING')
  expect(wrong.result.message).toBe('Wrong location')

  const unknown = await putawayService.validateLocationScan({ user: s.admin, id: started2.id, body: { code: 'NOPE-404', lineId: line2.id } })
  expect(unknown.result.status).toBe('ERROR')
})

test('PTW-18: scan session validates item scans (correct, wrong, duplicate)', async () => {
  const started = await startedDoc(10)
  const line = started.lines[0]
  await putawayService.selectLineLocation({ user: s.admin, id: started.id, lineId: line.id, locationId: s.loc1.id, mode: 'ACCEPT' })
  await putawayService.startScanSession({ user: s.admin, id: started.id })
  await putawayService.validateLocationScan({ user: s.admin, id: started.id, body: { code: s.loc1.code, lineId: line.id } })

  const ok = await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: s.itemA.sku } })
  expect(ok.result.status).toBe('SUCCESS')
  expect(ok.result.actual).toBe(s.itemA.sku)

  // Consecutive identical scan -> duplicate warning.
  const dup = await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: s.itemA.sku } })
  expect(dup.result.status).toBe('WARNING')
  expect(dup.result.message).toBe('Duplicate scan')

  const wrong = await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: s.itemB.sku } })
  expect(wrong.result.status).toBe('ERROR')
  expect(wrong.result.message).toBe('Wrong item')

  const unknown = await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: 'NO-ITEM-999' } })
  expect(unknown.result.status).toBe('ERROR')

  const session = await putawayService.getScanSession({ id: started.id })
  expect(session.scanCount).toBe(5)
})

async function startedDoc2(qtyA, qtyB) {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: qtyA }, { itemId: s.itemB.id, qty: qtyB }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await putawayService.releasePutaway({ user: s.admin, id: doc.id })
  await putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } })
  await putawayService.startPutaway({ user: s.admin, id: doc.id })
  return prisma.putaway.findUnique({ where: { id: doc.id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
}

test('PTW-19: continuous scan completes lines, auto-advances, then completes the putaway', async () => {
  const started = await startedDoc2(10, 20)
  const [l1, l2] = started.lines
  await putawayService.selectLineLocation({ user: s.admin, id: started.id, lineId: l1.id, locationId: s.loc1.id, mode: 'ACCEPT' })
  await putawayService.selectLineLocation({ user: s.admin, id: started.id, lineId: l2.id, locationId: s.loc2.id, mode: 'ACCEPT' })

  // Completion rejected while a line is still WAITING.
  await expect(putawayService.completePutaway({ user: s.admin, id: started.id })).rejects.toThrow(/COMPLETED or SKIPPED/)

  const { session } = await putawayService.startScanSession({ user: s.admin, id: started.id })
  expect(session.lineId).toBe(l1.id)

  await putawayService.validateLocationScan({ user: s.admin, id: started.id, body: { code: s.loc1.code } })
  await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: s.itemA.sku } })
  const r1 = await putawayService.completeExecution({ user: s.admin, id: started.id, lineId: l1.id })
  expect(r1.completedLine.id).toBe(l1.id)
  expect(r1.nextLine?.id).toBe(l2.id)
  expect(r1.ready).toBe(false)
  expect(r1.session.lineId).toBe(l2.id)

  await putawayService.validateLocationScan({ user: s.admin, id: started.id, body: { code: s.loc2.code } })
  await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: s.itemB.sku } })
  const r2 = await putawayService.completeExecution({ user: s.admin, id: started.id, lineId: l2.id })
  expect(r2.ready).toBe(true)
  expect(r2.nextLine).toBeNull()

  const pending = await putawayService.nextPendingLine({ id: started.id })
  expect(pending.ready).toBe(true)
  expect(pending.nextLine).toBeNull()

  const done = await putawayService.completePutaway({ user: s.admin, id: started.id })
  expect(done.status).toBe('COMPLETED')
  expect(done.completedAt).not.toBeNull()
})

test('PTW-20: every scan is recorded in scan history', async () => {
  const started = await startedDoc(10)
  const line = started.lines[0]
  await putawayService.selectLineLocation({ user: s.admin, id: started.id, lineId: line.id, locationId: s.loc1.id, mode: 'ACCEPT' })
  await putawayService.startScanSession({ user: s.admin, id: started.id })
  await putawayService.validateLocationScan({ user: s.admin, id: started.id, body: { code: s.loc1.code } })
  await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: s.itemA.sku } })
  await putawayService.validateItemScan({ user: s.admin, id: started.id, body: { code: 'BOGUS-XXX' } })

  const history = await putawayService.getScanHistory({ id: started.id })
  expect(history.length).toBe(3) // location ok, item ok, item error
  const types = history.map((h) => `${h.scanType}:${h.validationStatus}`)
  expect(types).toContain('LOCATION:SUCCESS')
  expect(types).toContain('ITEM:SUCCESS')
  expect(types).toContain('ITEM:ERROR')
  expect(history.every((h) => h.putawayId === started.id)).toBe(true)
})

test('PTW-21: postInventory moves inventory from STAGING to target bins atomically', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }, { itemId: s.itemB.id, qty: 5 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })
  await putawayService.releasePutaway({ user: s.admin, id: doc.id })
  await putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } })
  await putawayService.startPutaway({ user: s.admin, id: doc.id })
  const started = await prisma.putaway.findUnique({ where: { id: doc.id }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
  const [l1, l2] = started.lines
  await putawayService.selectLineLocation({ user: s.admin, id: doc.id, lineId: l1.id, locationId: s.loc1.id, mode: 'ACCEPT' })
  await putawayService.selectLineLocation({ user: s.admin, id: doc.id, lineId: l2.id, locationId: s.loc2.id, mode: 'ACCEPT' })
  await putawayService.startLine({ user: s.admin, id: doc.id, lineId: l1.id })
  await putawayService.completeLine({ user: s.admin, id: doc.id, lineId: l1.id })
  await putawayService.startLine({ user: s.admin, id: doc.id, lineId: l2.id })
  await putawayService.completeLine({ user: s.admin, id: doc.id, lineId: l2.id })
  await putawayService.completePutaway({ user: s.admin, id: doc.id })

  const staging = s.locStaging.id
  const sum = async (itemId, locId) => {
    const agg = await prisma.stockLedger.aggregate({ where: { itemId, locationId: locId }, _sum: { qty: true } })
    return Number(agg._sum.qty || 0)
  }
  expect(await sum(s.itemA.id, staging)).toBe(10) // receiving posted into staging
  expect(await sum(s.itemA.id, s.loc1.id)).toBe(0)

  const posted = await putawayService.completeInventoryPosting({ user: s.admin, id: doc.id })
  expect(posted.status).toBe('POSTED')
  expect(posted.movedQty).toBe(15)
  expect(posted.ledgerEntries).toBe(4) // 2 lines × 2 entries
  expect(posted.binOccupancy.length).toBeGreaterThan(0)

  expect(await sum(s.itemA.id, staging)).toBe(0)
  expect(await sum(s.itemB.id, staging)).toBe(0)
  expect(await sum(s.itemA.id, s.loc1.id)).toBe(10)
  expect(await sum(s.itemB.id, s.loc2.id)).toBe(5)

  // FIFO layers moved to the bins; staging emptied.
  const fifoSum = async (itemId, locId) => {
    const agg = await prisma.fifoLayer.aggregate({ where: { itemId, locationId: locId, qtyRemaining: { gt: 0 } }, _sum: { qtyRemaining: true } })
    return Number(agg._sum.qtyRemaining || 0)
  }
  expect(await fifoSum(s.itemA.id, s.loc1.id)).toBe(10)
  expect(await fifoSum(s.itemB.id, s.loc2.id)).toBe(5)
  expect(await fifoSum(s.itemA.id, staging)).toBe(0)

  // Posted marker + no duplicate posting.
  const d = await prisma.putaway.findUnique({ where: { id: doc.id } })
  expect(d.postedAt).not.toBeNull()
  expect(d.postedById).toBe(s.admin.id)
  await expect(putawayService.completeInventoryPosting({ user: s.admin, id: doc.id })).rejects.toThrow(/already been posted/)
})

test('PTW-22: posting validation rejects incomplete documents and missing targets', async () => {
  const receiving = await postedReceiving([{ itemId: s.itemA.id, qty: 10 }])
  const doc = await putawayService.generateFromReceiving({ user: s.admin, receivingId: receiving.id })

  // DRAFT doc with no completed lines -> invalid.
  const v1 = await putawayService.validateInventoryPosting({ id: doc.id })
  expect(v1.valid).toBe(false)
  expect(v1.errors.some((e) => /COMPLETED/.test(e))).toBe(true)

  // COMPLETED doc but line has no target -> invalid.
  await putawayService.releasePutaway({ user: s.admin, id: doc.id })
  await putawayService.assignOperator({ user: s.admin, id: doc.id, body: { assignedTo: s.stockClerk.id } })
  await putawayService.startPutaway({ user: s.admin, id: doc.id })
  const started = await prisma.putaway.findUnique({ where: { id: doc.id }, include: { lines: true } })
  const line = started.lines[0]
  await putawayService.startLine({ user: s.admin, id: doc.id, lineId: line.id })
  await putawayService.completeLine({ user: s.admin, id: doc.id, lineId: line.id })
  await putawayService.completePutaway({ user: s.admin, id: doc.id })

  const v2 = await putawayService.validateInventoryPosting({ id: doc.id })
  expect(v2.valid).toBe(false)
  expect(v2.errors.some((e) => /target/.test(e))).toBe(true)
})
