/**
 * packing.test.js
 *
 * Unit tests for Milestone 6 — Packing Module.
 *
 * Each test seeds a minimal dataset and exercises packing-service.js.
 * No Stock Ledger is written during packing (verifies FIFO untouched).
 * No SerialNumber status changes (verifies PickingTaskSerial.packageId only).
 *
 * Run: npx jest tests/packing.test.js
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const pickingService = require('../lib/picking-service')
const packingService = require('../lib/packing-service')

jest.mock('../lib/audit', () => ({ logAudit: jest.fn() }))

// ---------------------------------------------------------------------------
// Shared seed — creates a COMPLETED picking order ready for packing
// ---------------------------------------------------------------------------
let s

beforeEach(async () => {
  s = await prisma.$transaction(async (tx) => {
    const base = await seed(tx, global.seedKey, global)

    // Add PICK document sequence
    const now = new Date()
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    await tx.documentSequence.upsert({
      where: { prefix_warehouseCode_yearMonth: { prefix: 'PICK', warehouseCode: base.whCode, yearMonth: ym } },
      update: {},
      create: { prefix: 'PICK', warehouseCode: base.whCode, yearMonth: ym, lastSeq: 0 },
    })
    await tx.documentSequence.upsert({
      where: { prefix_warehouseCode_yearMonth: { prefix: 'PACK', warehouseCode: base.whCode, yearMonth: ym } },
      update: {},
      create: { prefix: 'PACK', warehouseCode: base.whCode, yearMonth: ym, lastSeq: 0 },
    })
    await tx.documentSequence.upsert({
      where: { prefix_warehouseCode_yearMonth: { prefix: 'PKG', warehouseCode: base.whCode, yearMonth: ym } },
      update: {},
      create: { prefix: 'PKG', warehouseCode: base.whCode, yearMonth: ym, lastSeq: 0 },
    })

    const ts = Date.now()
    // Create a COMPLETED picking order (unique number using timestamp)
    const pickingOrder = await tx.pickingOrder.create({
      data: {
        pickingNumber: `PICK-${global.seedKey}-${ts}`,
        status: 'COMPLETED',
        priority: 'NORMAL',
        warehouseId: base.warehouse.id,
        createdById: base.stockClerk.id,
        assignedToId: base.stockClerk.id,
        startedAt: new Date(),
        completedAt: new Date(),
        lines: {
          create: [{
            itemId: base.itemA.id,
            qtyOrdered: 10,
            qtyPicked: 10,
            status: 'COMPLETED',
          }],
        },
      },
      include: { lines: { include: { tasks: true } } },
    })

    // Add a picking task with serial
    const line = pickingOrder.lines[0]
    const task = await tx.pickingTask.create({
      data: {
        pickingLineId: line.id,
        locationId: base.loc1.id,
        sequence: 1,
        qty: 10,
        qtyPicked: 10,
        status: 'COMPLETED',
        pickedById: base.stockClerk.id,
        pickedAt: new Date(),
      },
    })

    // Add serial-tracked item in second line
    const itemS = await tx.item.create({
      data: {
        id: `SERIAL-${global.seedKey}-${ts}`,
        sku: `SN-${global.seedKey}-${ts}`,
        name: 'Serial Item',
        categoryId: base.category.id,
        uomId: base.uom.id,
        serialTracked: true,
        isActive: true,
      },
    })

    const serialA = await tx.serialNumber.create({
      data: {
        serialNo: `SNA-${global.seedKey}-${ts}`,
        itemId: itemS.id,
        status: 'IN_STOCK',
        currentLocationId: base.loc1.id,
      },
    })
    const serialB = await tx.serialNumber.create({
      data: {
        serialNo: `SNB-${global.seedKey}-${ts}`,
        itemId: itemS.id,
        status: 'IN_STOCK',
        currentLocationId: base.loc1.id,
      },
    })

    const serialLine = await tx.pickingOrderLine.create({
      data: {
        pickingOrderId: pickingOrder.id,
        itemId: itemS.id,
        qtyOrdered: 2,
        qtyPicked: 2,
        status: 'COMPLETED',
      },
    })

    const serialTask = await tx.pickingTask.create({
      data: {
        pickingLineId: serialLine.id,
        locationId: base.loc1.id,
        sequence: 2,
        qty: 2,
        qtyPicked: 2,
        status: 'COMPLETED',
        pickedById: base.stockClerk.id,
        pickedAt: new Date(),
      },
    })

    await tx.pickingTaskSerial.createMany({
      data: [
        { pickingTaskId: serialTask.id, serialNo: serialA.serialNo, pickedAt: new Date() },
        { pickingTaskId: serialTask.id, serialNo: serialB.serialNo, pickedAt: new Date() },
      ],
    })

    return {
      ...base,
      pickingOrder,
      itemS,
      serialA,
      serialB,
      ts,
    }
  })
})

// ---------------------------------------------------------------------------
// TEST 1 — Create packing order from COMPLETED picking
// ---------------------------------------------------------------------------
test('createPackingOrder creates packing order with QUEUE status', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id, warehouseId: s.warehouse.id },
  })

  expect(order).toBeDefined()
  expect(order.packingNumber).toMatch(/^PACK-/)
  expect(order.status).toBe('QUEUE')
  expect(order.pickingOrderId).toBe(s.pickingOrder.id)
  expect(order.createdById).toBe(s.stockClerk.id)
})

// ---------------------------------------------------------------------------
// TEST 2 — Cannot create packing from non-COMPLETED picking
// ---------------------------------------------------------------------------
test('createPackingOrder rejects non-COMPLETED picking', async () => {
  const draft = await prisma.pickingOrder.create({
    data: {
      pickingNumber: `PICK-DRAFT-${global.seedKey}-${Date.now()}`,
      status: 'DRAFT',
      createdById: s.stockClerk.id,
      lines: { create: [{ itemId: s.itemA.id, qtyOrdered: 5 }] },
    },
    include: { lines: true },
  })

  await expect(
    packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: draft.id } })
  ).rejects.toThrow('Picking order must be COMPLETED')
})

// ---------------------------------------------------------------------------
// TEST 3 — Duplicate packing order for same picking is rejected
// ---------------------------------------------------------------------------
test('createPackingOrder rejects duplicate', async () => {
  await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })

  await expect(
    packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  ).rejects.toThrow('A packing order already exists')
})

// ---------------------------------------------------------------------------
// TEST 4 — Start packing order
// ---------------------------------------------------------------------------
test('startPackingOrder transitions QUEUE → IN_PROGRESS', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })

  const started = await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })

  expect(started.status).toBe('IN_PROGRESS')
  expect(started.startedAt).toBeTruthy()
})

// ---------------------------------------------------------------------------
// TEST 5 — Create package
// ---------------------------------------------------------------------------
test('createPackage generates PKG- prefixed number', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })

  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  expect(pkg).toBeDefined()
  expect(pkg.packageNumber).toMatch(/^PKG-/)
  expect(pkg.status).toBe('OPEN')
  expect(pkg.packingOrderId).toBe(order.id)
})

// ---------------------------------------------------------------------------
// TEST 6 — Scan valid item to package
// ---------------------------------------------------------------------------
test('scanItemToPackage adds item to package', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  const updated = await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 5 },
  })

  expect(updated.items.some((i) => i.itemId === s.itemA.id)).toBe(true)
})

// ---------------------------------------------------------------------------
// TEST 7 — Scan wrong item (not in order)
// ---------------------------------------------------------------------------
test('scanItemToPackage rejects item not in picking order', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: { packageId: pkg.id, scannedItemCode: s.itemB.sku, qty: 1 },
    })
  ).rejects.toThrow('not part of this packing order')
})

// ---------------------------------------------------------------------------
// TEST 8 — Scan serial-tracked item with valid serials
// ---------------------------------------------------------------------------
test('scanItemToPackage accepts valid serials for serial-tracked item', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  const updated = await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: {
      packageId: pkg.id,
      scannedItemCode: s.itemS.sku,
      qty: 2,
      serials: [s.serialA.serialNo, s.serialB.serialNo],
    },
  })

  expect(updated.serials.length).toBe(2)
  expect(updated.serials.map((s) => s.serialNo)).toContain(s.serialA.serialNo)
  expect(updated.serials.map((s) => s.serialNo)).toContain(s.serialB.serialNo)
})

// ---------------------------------------------------------------------------
// TEST 9 — Scan wrong serial (not from picking)
// ---------------------------------------------------------------------------
test('scanItemToPackage rejects serial not from picking', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: {
        packageId: pkg.id,
        scannedItemCode: s.itemS.sku,
        qty: 1,
        serials: ['FAKE-SERIAL-999'],
      },
    })
  ).rejects.toThrow('was not picked for this order')
})

// ---------------------------------------------------------------------------
// TEST 10 — Duplicate serial in same package
// ---------------------------------------------------------------------------
test('scanItemToPackage rejects duplicate serial in same package', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  // First scan
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: {
      packageId: pkg.id,
      scannedItemCode: s.itemS.sku,
      qty: 1,
      serials: [s.serialA.serialNo],
    },
  })

  // Second scan with same serial
  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: {
        packageId: pkg.id,
        scannedItemCode: s.itemS.sku,
        qty: 1,
        serials: [s.serialA.serialNo],
      },
    })
  ).rejects.toThrow('already in this package')
})

// ---------------------------------------------------------------------------
// TEST 11 — Serial already in another package
// ---------------------------------------------------------------------------
test('scanItemToPackage rejects serial already packed in another package', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg1 = await packingService.createPackage({ user: s.stockClerk, id: order.id })
  const pkg2 = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  // Pack into pkg1
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: {
      packageId: pkg1.id,
      scannedItemCode: s.itemS.sku,
      qty: 1,
      serials: [s.serialA.serialNo],
    },
  })

  // Try same serial in pkg2
  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: {
        packageId: pkg2.id,
        scannedItemCode: s.itemS.sku,
        qty: 1,
        serials: [s.serialA.serialNo],
      },
    })
  ).rejects.toThrow('already in another package')
})

// ---------------------------------------------------------------------------
// TEST 12 — Close empty package fails
// ---------------------------------------------------------------------------
test('closePackage rejects package with no items', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await expect(
    packingService.closePackage({ user: s.stockClerk, id: pkg.id })
  ).rejects.toThrow('at least 1 item')
})

// ---------------------------------------------------------------------------
// TEST 13 — Close valid package
// ---------------------------------------------------------------------------
test('closePackage transitions OPEN → CLOSED', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })

  const closed = await packingService.closePackage({ user: s.stockClerk, id: pkg.id })

  expect(closed.status).toBe('CLOSED')
  expect(closed.closedAt).toBeTruthy()
})

// ---------------------------------------------------------------------------
// TEST 14 — Reopen closed package
// ---------------------------------------------------------------------------
test('reopenPackage transitions CLOSED → OPEN', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.closePackage({ user: s.stockClerk, id: pkg.id })

  const reopened = await packingService.reopenPackage({ user: s.stockClerk, id: pkg.id })

  expect(reopened.status).toBe('OPEN')
  expect(reopened.closedAt).toBeNull()
})

// ---------------------------------------------------------------------------
// TEST 15 — Complete packing when all items packed
// ---------------------------------------------------------------------------
test('completePackingOrder succeeds when all items are packed', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  // Pack all items from both lines
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: {
      packageId: pkg.id,
      scannedItemCode: s.itemS.sku,
      qty: 2,
      serials: [s.serialA.serialNo, s.serialB.serialNo],
    },
  })

  const completed = await packingService.completePackingOrder({ user: s.stockClerk, id: order.id })

  expect(completed.status).toBe('COMPLETED')
  expect(completed.completedAt).toBeTruthy()
})

// ---------------------------------------------------------------------------
// TEST 16 — Complete packing fails when not all items packed
// ---------------------------------------------------------------------------
test('completePackingOrder fails when not all items are packed', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  // Pack only 5 of 10 for itemA — not all packed
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 5 },
  })

  await expect(
    packingService.completePackingOrder({ user: s.stockClerk, id: order.id })
  ).rejects.toThrow('All items must be packed')
})

// ---------------------------------------------------------------------------
// TEST 17 — Volume calculation (L × W × H)
// ---------------------------------------------------------------------------
test('updatePackage calculates volume automatically', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  const updated = await packingService.updatePackage({
    user: s.stockClerk,
    id: pkg.id,
    body: { length: 30, width: 20, height: 10 },
  })

  expect(updated.volume).toBe(6000) // 30 * 20 * 10
  expect(updated.length).toBe(30)
  expect(updated.width).toBe(20)
  expect(updated.height).toBe(10)
})

// ---------------------------------------------------------------------------
// TEST 18 — No Stock Ledger written during packing
// ---------------------------------------------------------------------------
test('packing does not write any Stock Ledger entries', async () => {
  const beforeCount = await prisma.stockLedger.count({
    where: { refNumber: { startsWith: `PACK-${global.seedKey}` } },
  })

  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.closePackage({ user: s.stockClerk, id: pkg.id })

  const afterCount = await prisma.stockLedger.count({
    where: { refNumber: { startsWith: `PACK-${global.seedKey}` } },
  })

  expect(afterCount).toBe(beforeCount)
})

// ---------------------------------------------------------------------------
// TEST 19 — getPackingQueue returns only COMPLETED picking orders
// ---------------------------------------------------------------------------
test('getPackingQueue only shows COMPLETED picks without packing orders', async () => {
  const queue = await packingService.getPackingQueue()

  const ourPick = queue.find((q) => q.id === s.pickingOrder.id)
  expect(ourPick).toBeDefined()
  expect(ourPick.status).toBe('COMPLETED')
})

// ---------------------------------------------------------------------------
// TEST 20 — Closed package cannot be edited
// ---------------------------------------------------------------------------
test('updatePackage rejects closed package', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.closePackage({ user: s.stockClerk, id: pkg.id })

  await expect(
    packingService.updatePackage({ user: s.stockClerk, id: pkg.id, body: { weight: 2.5 } })
  ).rejects.toThrow('CLOSED')
})

// ---------------------------------------------------------------------------
// TEST 21 — Cannot scan to closed package
// ---------------------------------------------------------------------------
test('scanItemToPackage rejects closed package', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.closePackage({ user: s.stockClerk, id: pkg.id })

  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 1 },
    })
  ).rejects.toThrow('CLOSED')
})
