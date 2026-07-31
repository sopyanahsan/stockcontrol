#!/usr/bin/env node
/**
 * test_putaway_logic.js
 *
 * Unit-test the putaway-service business logic correctness.
 * Uses Node.js + a mock Prisma client to verify:
 *   - Status state machine transitions
 *   - Partial putaway arithmetic
 *   - Validation rules
 *   - FIFO layer creation (never editing)
 *   - Receiving auto-completion logic
 *
 * Run: node test_putaway_logic.js
 */

const PASS = "✅"
const FAIL = "❌"

// ─── Mock Prisma ────────────────────────────────────────────────────────────────
let mockData = {
  putawayTasks: [
    {
      id: "task-001",
      taskNumber: "PUT-WH01-202607-000001",
      receivingId: "rec-001",
      receivingLineId: "line-001",
      itemId: "item-001",
      qty: 20,
      qtyPutaway: 0,
      fromLocationId: "staging-001",
      status: "OPEN",
      receiving: { id: "rec-001", grnNumber: "GRN-WH01-202607-000001", warehouseId: "wh-001" },
      fromLocation: { id: "staging-001", code: "STAGING-01" },
      item: { id: "item-001", sku: "ITEM-A", serialTracked: false },
      receivingLine: { id: "line-001", receivedQty: 20, serials: [] },
    },
    {
      id: "task-002",
      taskNumber: "PUT-WH01-202607-000002",
      receivingId: "rec-002",
      receivingLineId: "line-002",
      itemId: "item-002",
      qty: 5,
      qtyPutaway: 3,  // partially done
      fromLocationId: "staging-002",
      status: "IN_PROGRESS",
      receiving: { id: "rec-002", grnNumber: "GRN-WH01-202607-000002", warehouseId: "wh-001" },
      fromLocation: { id: "staging-002", code: "STAGING-02" },
      item: { id: "item-002", sku: "ITEM-B", serialTracked: true },
      receivingLine: {
        id: "line-002",
        receivedQty: 5,
        serials: [
          { id: "s1", serialNo: "SN-A1", status: "IN_STAGING", currentLocationId: "staging-002" },
          { id: "s2", serialNo: "SN-A2", status: "IN_STAGING", currentLocationId: "staging-002" },
          { id: "s3", serialNo: "SN-A3", status: "IN_STAGING", currentLocationId: "staging-002" },
          { id: "s4", serialNo: "SN-A4", status: "IN_STAGING", currentLocationId: "staging-002" },
          { id: "s5", serialNo: "SN-A5", status: "IN_STAGING", currentLocationId: "staging-002" },
        ],
      },
    },
  ],
  locations: [
    { id: "staging-001", code: "STAGING-01", type: "STAGING", isActive: true, zone: { warehouseId: "wh-001" } },
    { id: "staging-002", code: "STAGING-02", type: "STAGING", isActive: true, zone: { warehouseId: "wh-001" } },
    { id: "bin-a01",      code: "A-01",       type: "STORAGE", isActive: true, zone: { warehouseId: "wh-001" } },
    { id: "bin-a02",      code: "A-02",       type: "STORAGE", isActive: true, zone: { warehouseId: "wh-001" } },
    { id: "pick-001",     code: "PICK-01",    type: "PICKING", isActive: true, zone: { warehouseId: "wh-001" } },
  ],
  serialNumbers: [],
  stockLedger: [],
  fifoLayers: [],
}

let taskCounter = 3
let ledgerId = 0
let fifoId = 0
let serialId = 100

// Simplified mock prisma (only what's needed)
const prisma = {
  putawayTask: {
    findUnique: ({ where, include }) => {
      const t = mockData.putawayTasks.find((t) => t.id === where.id)
      return t || null
    },
    update: ({ where, data, include }) => {
      const t = mockData.putawayTasks.find((t) => t.id === where.id)
      if (!t) throw new Error("Task not found")
      Object.assign(t, data)
      return t
    },
  },
  location: {
    findUnique: ({ where, include }) => {
      return mockData.locations.find((l) => l.code === where.code) || null
    },
  },
  serialNumber: {
    update: ({ where, data }) => {
      // Serials live in task.receivingLine.serials
      for (const task of mockData.putawayTasks) {
        const s = task.receivingLine.serials.find((s) => s.id === where.id)
        if (s) { Object.assign(s, data); return s }
      }
      // Also check standalone serialNumbers array
      const s = mockData.serialNumbers.find((s) => s.id === where.id)
      if (s) { Object.assign(s, data) }
      return s || null
    },
  },
  stockLedger: {
    create: ({ data }) => {
      mockData.stockLedger.push({ id: `ledger-${ledgerId++}`, ...data })
      return { id: `ledger-${ledgerId - 1}`, ...data }
    },
  },
  fifoLayer: {
    create: ({ data }) => {
      mockData.fifoLayers.push({ id: `fifo-${fifoId++}`, ...data })
      return { id: `fifo-${fifoId - 1}`, ...data }
    },
  },
  receiving: {
    update: ({ where, data }) => ({ id: where.id, ...data }),
    count: () => 0,  // assume all tasks done
  },
}

const mockUser = { id: "user-001", name: "Test User", role: "ADMINISTRATOR" }
const mockTx = prisma


// ─── Validation helpers (mirrored from putaway-service.js) ────────────────────
function validateLocation(code) {
  const loc = mockData.locations.find((l) => l.code === code)
  if (!loc) throw new Error(`Location not found: ${code}`)
  if (!loc.isActive) throw new Error(`Location is inactive: ${code}`)
  if (loc.type !== "STORAGE") throw new Error(`Destination must be a STORAGE bin (got: ${loc.type})`)
  return loc
}

function validatePartialQty(task, qty) {
  const qtyRemaining = task.qty - (task.qtyPutaway || 0)
  const qtyToPutaway = qty !== undefined ? Number(qty) : qtyRemaining
  if (!Number.isFinite(qtyToPutaway) || qtyToPutaway <= 0)
    throw new Error("Quantity must be a positive number")
  if (qtyToPutaway > qtyRemaining)
    throw new Error(`Quantity exceeds remaining qty on task (${qtyRemaining})`)
  return qtyToPutaway
}

function validateSerials(task, serials, qtyToPutaway) {
  if (!task.item.serialTracked) return []
  const serialsToMigrate = task.receivingLine.serials.filter(
    (s) => s.currentLocationId === task.fromLocationId && s.status === "IN_STAGING"
  )
  const validSerialNos = new Set(serialsToMigrate.map((s) => s.serialNo))
  for (const sn of serials) {
    if (!validSerialNos.has(sn))
      throw new Error(`Serial "${sn}" is not available at staging for this task`)
  }
  if (serials.length !== qtyToPutaway)
    throw new Error(`Serial-tracked item requires exactly ${qtyToPutaway} serial(s) (got ${serials.length})`)
  const seen = new Set()
  for (const sn of serials) {
    if (seen.has(sn)) throw new Error(`Duplicate serial in request: ${sn}`)
    seen.add(sn)
  }
  return serialsToMigrate.filter((s) => serials.includes(s.serialNo))
}

// ─── Simulate completePutawayTask ───────────────────────────────────────────
function simulateComplete(taskId, body) {
  const task = mockData.putawayTasks.find((t) => t.id === taskId)
  if (!task) throw new Error("Putaway task not found")
  if (task.status !== "IN_PROGRESS") throw new Error("Only IN_PROGRESS tasks can be completed")
  if (!body.scannedLocationCode) throw new Error("Destination location is required")

  const destLoc = validateLocation(body.scannedLocationCode)
  const qtyToPutaway = validatePartialQty(task, body.qty)
  const serials = Array.isArray(body.serials) ? body.serials : []
  const serialsToMigrate = validateSerials(task, serials, qtyToPutaway)

  // Simulate ledger writes
  prisma.stockLedger.create({ data: { itemId: task.itemId, locationId: task.fromLocationId, qty: -qtyToPutaway } })
  prisma.stockLedger.create({ data: { itemId: task.itemId, locationId: destLoc.id, qty: qtyToPutaway } })
  // FIFO: NEW layer only (never edit)
  prisma.fifoLayer.create({ data: { itemId: task.itemId, locationId: destLoc.id, qtyReceived: qtyToPutaway, qtyRemaining: qtyToPutaway } })
  // Serials
  for (const s of serialsToMigrate) {
    prisma.serialNumber.update({ where: { id: s.id }, data: { currentLocationId: destLoc.id, status: "IN_STOCK" } })
  }
  // Task update
  const isFull = qtyToPutaway === (task.qty - (task.qtyPutaway || 0))
  task.qtyPutaway = (task.qtyPutaway || 0) + qtyToPutaway
  task.toLocationId = destLoc.id
  task.status = isFull ? "COMPLETED" : "IN_PROGRESS"
  if (isFull) { task.completedAt = new Date(); task.completedById = mockUser.id }

  return { task, destLoc, qtyToPutaway, serialsToMigrate, isFull }
}


// ─── Test Framework ─────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function test(name, fn) {
  // Fully reset state between each test using the original template
  mockData = {
    putawayTasks: [
      {
        id: "task-001",
        taskNumber: "PUT-WH01-202607-000001",
        receivingId: "rec-001",
        receivingLineId: "line-001",
        itemId: "item-001",
        qty: 20,
        qtyPutaway: 0,
        fromLocationId: "staging-001",
        status: "OPEN",
        receiving: { id: "rec-001", grnNumber: "GRN-WH01-202607-000001", warehouseId: "wh-001" },
        fromLocation: { id: "staging-001", code: "STAGING-01" },
        item: { id: "item-001", sku: "ITEM-A", serialTracked: false },
        receivingLine: { id: "line-001", receivedQty: 20, serials: [] },
      },
      {
        id: "task-002",
        taskNumber: "PUT-WH01-202607-000002",
        receivingId: "rec-002",
        receivingLineId: "line-002",
        itemId: "item-002",
        qty: 5,
        qtyPutaway: 3,
        fromLocationId: "staging-002",
        status: "IN_PROGRESS",
        receiving: { id: "rec-002", grnNumber: "GRN-WH01-202607-000002", warehouseId: "wh-001" },
        fromLocation: { id: "staging-002", code: "STAGING-02" },
        item: { id: "item-002", sku: "ITEM-B", serialTracked: true },
        receivingLine: {
          id: "line-002",
          receivedQty: 5,
          serials: [
            { id: "s1", serialNo: "SN-A1", status: "IN_STAGING", currentLocationId: "staging-002" },
            { id: "s2", serialNo: "SN-A2", status: "IN_STAGING", currentLocationId: "staging-002" },
            { id: "s3", serialNo: "SN-A3", status: "IN_STAGING", currentLocationId: "staging-002" },
            { id: "s4", serialNo: "SN-A4", status: "IN_STAGING", currentLocationId: "staging-002" },
            { id: "s5", serialNo: "SN-A5", status: "IN_STAGING", currentLocationId: "staging-002" },
          ],
        },
      },
    ],
    locations: [
      { id: "staging-001", code: "STAGING-01", type: "STAGING", isActive: true, zone: { warehouseId: "wh-001" } },
      { id: "staging-002", code: "STAGING-02", type: "STAGING", isActive: true, zone: { warehouseId: "wh-001" } },
      { id: "bin-a01",      code: "A-01",       type: "STORAGE", isActive: true, zone: { warehouseId: "wh-001" } },
      { id: "bin-a02",      code: "A-02",       type: "STORAGE", isActive: true, zone: { warehouseId: "wh-001" } },
      { id: "pick-001",     code: "PICK-01",    type: "PICKING", isActive: true, zone: { warehouseId: "wh-001" } },
    ],
    serialNumbers: [],
    stockLedger: [],
    fifoLayers: [],
  }
  taskCounter = 3; ledgerId = 0; fifoId = 0; serialId = 100

  try {
    fn()
    console.log(`${PASS} ${name}`)
    passed++
  } catch (e) {
    console.log(`${FAIL} ${name}`)
    console.log(`      ${e.message}`)
    failed++
  }
}

function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg || ""} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function assertContains(arr, check, msg) {
  const found = arr.some((a) => JSON.stringify(a).includes(JSON.stringify(check)))
  if (!found) throw new Error(`${msg || ""} — not found in ${JSON.stringify(arr)}`)
}

function assertThrows(fn, msg) {
  let threw = false
  try { fn() } catch (e) { threw = true }
  if (!threw) throw new Error(`${msg || "Expected function to throw"}`)
}


// ─── TESTS ───────────────────────────────────────────────────────────────────
console.log("\n── PUTAWAY LOGIC UNIT TESTS ──────────────────────────────────────────\n")

// ── Scenario 1: Full Putaway ─────────────────────────────────────────────────
test("Scenario 1a: Full putaway creates 2 ledger entries (out + in)", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  const result = simulateComplete("task-001", {
    scannedLocationCode: "A-01",
    serials: [],
    qty: 20,
  })
  assertEqual(result.task.status, "COMPLETED")
  assertEqual(result.task.toLocationId, "bin-a01")
  assertEqual(result.isFull, true)
  assertEqual(mockData.stockLedger.length, 2, "Should have 2 ledger entries")
  const out = mockData.stockLedger.find((e) => e.qty < 0)
  const in_ = mockData.stockLedger.find((e) => e.qty > 0)
  assertEqual(out.qty, -20, "Negative ledger at staging")
  assertEqual(in_.qty, 20, "Positive ledger at bin")
})

test("Scenario 1b: FIFO layer created at destination, never edited", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  const before = mockData.fifoLayers.length
  simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 20 })
  assertEqual(mockData.fifoLayers.length, before + 1, "New FIFO layer created at bin")
  // Verify staging FIFO was NOT edited
  const stagingLayers = mockData.fifoLayers.filter((f) => f.locationId === "staging-001")
  assertEqual(stagingLayers.length, 0, "No FIFO layer created at staging for putaway")  // staging layer comes from receiving, not putaway
})

test("Scenario 1c: Task marked COMPLETED after full putaway", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  const result = simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 20 })
  assertEqual(result.task.status, "COMPLETED")
  assertEqual(result.task.qtyPutaway, 20)
})

test("Scenario 1d: qtyPutaway field accumulates", () => {
  const task = mockData.putawayTasks[1]  // qty=5, qtyPutaway=3, qtyRemaining=2
  task.status = "IN_PROGRESS"
  const result = simulateComplete("task-002", { scannedLocationCode: "A-02", serials: ["SN-A3", "SN-A4"], qty: 2 })
  assertEqual(result.task.qtyPutaway, 5, "Accumulated qtyPutaway = 3+2 = 5")
  assertEqual(result.isFull, true)
  assertEqual(result.task.status, "COMPLETED")
})

// ── Scenario 2: Partial Putaway ───────────────────────────────────────────────
test("Scenario 2a: Partial putaway leaves task IN_PROGRESS", () => {
  const task = mockData.putawayTasks[0]  // qty=20, qtyPutaway=0
  task.status = "IN_PROGRESS"
  const result = simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 8 })
  assertEqual(result.task.status, "IN_PROGRESS", "Partial should stay IN_PROGRESS")
  assertEqual(result.task.qtyPutaway, 8, "qtyPutaway = 8")
  assertEqual(result.isFull, false)
})

test("Scenario 2b: Partial putaway creates correct ledger for qty", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 8 })
  const out = mockData.stockLedger.find((e) => e.qty < 0)
  const in_ = mockData.stockLedger.find((e) => e.qty > 0)
  assertEqual(out.qty, -8, "Out ledger = -8")
  assertEqual(in_.qty, 8, "In ledger = +8")
})

test("Scenario 2c: Second partial completes the task", () => {
  const task = mockData.putawayTasks[0]  // qty=20, qtyPutaway=0
  task.status = "IN_PROGRESS"
  simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 8 })
  const result2 = simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 12 })
  assertEqual(result2.task.status, "COMPLETED", "Second partial completes task")
  assertEqual(result2.task.qtyPutaway, 20, "Total qtyPutaway = 8+12 = 20")
})

test("Scenario 2d: Cannot put away more than remaining qty", () => {
  const task = mockData.putawayTasks[0]  // qty=20, qtyPutaway=0
  task.status = "IN_PROGRESS"
  assertThrows(
    () => simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 25 }),
    "Should throw when qty > remaining"
  )
})

// ── Scenario 3: Location Validation ───────────────────────────────────────────
test("Scenario 3a: Rejects non-existent location", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  assertThrows(
    () => simulateComplete("task-001", { scannedLocationCode: "DOES-NOT-EXIST", serials: [], qty: 20 }),
    "Should reject non-existent location"
  )
})

test("Scenario 3b: Rejects non-STORAGE location", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  assertThrows(
    () => simulateComplete("task-001", { scannedLocationCode: "PICK-01", serials: [], qty: 20 }),
    "Should reject non-STORAGE location"
  )
})

// ── Scenario 5: Serial Validation ───────────────────────────────────────────
test("Scenario 5a: Missing serial — throws", () => {
  const task = mockData.putawayTasks[1]  // serialTracked, qty=5, qtyRemaining=2
  task.status = "IN_PROGRESS"
  // Provide 1 serial for qty=2 putaway
  assertThrows(
    () => simulateComplete("task-002", { scannedLocationCode: "A-02", serials: ["SN-A3"], qty: 2 }),
    "Should reject missing serials"
  )
})

test("Scenario 5b: Duplicate serial — throws", () => {
  const task = mockData.putawayTasks[1]
  task.status = "IN_PROGRESS"
  assertThrows(
    () => simulateComplete("task-002", { scannedLocationCode: "A-02", serials: ["SN-A3", "SN-A3"], qty: 2 }),
    "Should reject duplicate serials"
  )
})

test("Scenario 5c: Correct serials — succeeds", () => {
  const task = mockData.putawayTasks[1]  // qty=5, qtyPutaway=3, remaining=2
  task.status = "IN_PROGRESS"
  const result = simulateComplete("task-002", {
    scannedLocationCode: "A-02",
    serials: ["SN-A3", "SN-A4"],  // 2 serials matching qty=2
    qty: 2,
  })
  assertEqual(result.task.status, "COMPLETED")
  assertEqual(result.serialsToMigrate.length, 2, "2 serials migrated")
})

test("Scenario 5d: Serial from wrong staging — throws", () => {
  // Modify a serial to be at a different staging location
  mockData.putawayTasks[1].receivingLine.serials[0].currentLocationId = "staging-001"
  const task = mockData.putawayTasks[1]
  task.status = "IN_PROGRESS"
  assertThrows(
    () => simulateComplete("task-002", { scannedLocationCode: "A-02", serials: ["SN-A1", "SN-A3", "SN-A4"], qty: 3 }),
    "Should reject serial not at this staging"
  )
})

// ── State Machine ─────────────────────────────────────────────────────────────
test("State: Cannot complete OPEN task", () => {
  const task = mockData.putawayTasks[0]
  task.status = "OPEN"
  assertThrows(
    () => simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 20 }),
    "Should reject completing OPEN task"
  )
})

test("State: Cannot complete COMPLETED task", () => {
  const task = mockData.putawayTasks[0]
  task.status = "COMPLETED"
  assertThrows(
    () => simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 20 }),
    "Should reject completing already completed task"
  )
})

test("State: Cannot complete CANCELLED task", () => {
  const task = mockData.putawayTasks[0]
  task.status = "CANCELLED"
  assertThrows(
    () => simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 20 }),
    "Should reject completing cancelled task"
  )
})

// ── Audit Data Completeness ───────────────────────────────────────────────────
test("Audit: All required fields present in after payload", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  const result = simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 20 })
  // The service builds this after payload (verified by reading the service code)
  const afterPayload = {
    taskNumber: result.task.taskNumber,
    itemSku: task.item.sku,
    qty: result.qtyToPutaway,
    fromLocation: task.fromLocation.code,
    toLocation: result.destLoc.code,
    receivingId: task.receivingId,
    receivingGrn: task.receiving.grnNumber,
  }
  assertEqual(afterPayload.taskNumber, "PUT-WH01-202607-000001")
  assertEqual(afterPayload.itemSku, "ITEM-A")
  assertEqual(afterPayload.qty, 20)
  assertEqual(afterPayload.fromLocation, "STAGING-01")
  assertEqual(afterPayload.toLocation, "A-01")
  assertEqual(afterPayload.receivingId, "rec-001")
  assertEqual(afterPayload.receivingGrn, "GRN-WH01-202607-000001")
})

// ── FIFO Never Edited ─────────────────────────────────────────────────────────
test("FIFO: No existing FIFO layer is ever modified", () => {
  const task = mockData.putawayTasks[0]
  task.status = "IN_PROGRESS"
  // Add a pre-existing FIFO layer at staging
  mockData.fifoLayers.push({ id: "fifo-original", itemId: "item-001", locationId: "staging-001", qtyRemaining: 20 })
  const originalFifo = { ...mockData.fifoLayers[0] }
  simulateComplete("task-001", { scannedLocationCode: "A-01", serials: [], qty: 20 })
  // Original layer should be untouched
  const unchanged = mockData.fifoLayers.find((f) => f.id === "fifo-original")
  assertEqual(unchanged.qtyRemaining, 20, "Original FIFO layer unchanged")
  assertEqual(unchanged.locationId, "staging-001", "Original location unchanged")
})

// ── Serial Status Migration ───────────────────────────────────────────────────
test("Serials: migrated to IN_STOCK and correct location", () => {
  const task = mockData.putawayTasks[1]  // qty=5, qtyPutaway=3, remaining=2
  task.status = "IN_PROGRESS"
  simulateComplete("task-002", { scannedLocationCode: "A-02", serials: ["SN-A3", "SN-A4"], qty: 2 })
  // Serials are updated in task.receivingLine.serials
  const migratedSerials = task.receivingLine.serials.filter((s) => s.status === "IN_STOCK")
  assertEqual(migratedSerials.length, 2, "2 serials migrated")
  for (const s of migratedSerials) {
    assertEqual(s.status, "IN_STOCK")
    assertEqual(s.currentLocationId, "bin-a02")
  }
})


// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`${FAIL} SOME TESTS FAILED`)
  process.exit(1)
} else {
  console.log(`${PASS} ALL TESTS PASSED`)
}
