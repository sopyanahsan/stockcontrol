/**
 * packing-acceptance.test.js
 *
 * End-to-end acceptance tests for Milestone 6 — Packing Module.
 *
 * Tests:
 *   AC-01  Create packing from completed pick
 *   AC-02  Start packing order
 *   AC-03  Scan wrong item
 *   AC-04  Scan serial not from pick
 *   AC-05  Scan duplicate serial
 *   AC-06  Close empty package (reject)
 *   AC-07  Close valid package
 *   AC-08  Reopen closed package
 *   AC-09  Complete with unpacked items (reject)
 *   AC-10  Complete valid packing
 *   AC-11  Verify no ledger entries
 *   AC-12  Verify serials unchanged
 *   AC-13  Duplicate Package Number
 *   AC-14  Scan after closed
 *
 * Run: npx jest tests/packing-acceptance.test.js
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const packingService = require('../lib/packing-service')
const pickingService = require('../lib/picking-service')

jest.mock('../lib/audit', () => ({ logAudit: jest.fn() }))

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
let s

beforeEach(async () => {
  s = await prisma.$transaction(async (tx) => {
    const base = await seed(tx, global.seedKey, global)

    // Document sequences for PICK, PACK, PKG
    const now = new Date()
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    for (const prefix of ['PICK', 'PACK', 'PKG']) {
      await tx.documentSequence.upsert({
        where: { prefix_warehouseCode_yearMonth: { prefix, warehouseCode: base.whCode, yearMonth: ym } },
        update: {},
        create: { prefix, warehouseCode: base.whCode, yearMonth: ym, lastSeq: 0 },
      })
    }

    // Create COMPLETED picking order
    const ts = Date.now()
    const pickingOrder = await tx.pickingOrder.create({
      data: {
        pickingNumber: `PICK-ACCEPT-${ts}`,
        status: 'COMPLETED',
        warehouseId: base.warehouse.id,
        createdById: base.stockClerk.id,
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
      include: { lines: true },
    })

    // Picking task for itemA
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

    // Serial-tracked item
    const itemS = await tx.item.create({
      data: {
        id: `S-ACCEPT-${ts}`,
        sku: `SA-${ts}`,
        name: 'Serial Accept',
        categoryId: base.category.id,
        uomId: base.uom.id,
        serialTracked: true,
        isActive: true,
      },
    })

    const serA = await tx.serialNumber.create({
      data: { serialNo: `SA-${ts}-A`, itemId: itemS.id, status: 'IN_STOCK', currentLocationId: base.loc1.id },
    })
    const serB = await tx.serialNumber.create({
      data: { serialNo: `SA-${ts}-B`, itemId: itemS.id, status: 'IN_STOCK', currentLocationId: base.loc1.id },
    })

    const serLine = await tx.pickingOrderLine.create({
      data: {
        pickingOrderId: pickingOrder.id,
        itemId: itemS.id,
        qtyOrdered: 2,
        qtyPicked: 2,
        status: 'COMPLETED',
      },
    })

    const serTask = await tx.pickingTask.create({
      data: {
        pickingLineId: serLine.id,
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
        { pickingTaskId: serTask.id, serialNo: serA.serialNo, pickedAt: new Date() },
        { pickingTaskId: serTask.id, serialNo: serB.serialNo, pickedAt: new Date() },
      ],
    })

    return { ...base, pickingOrder, itemS, serA, serB, ts }
  })
})

// ---------------------------------------------------------------------------
// AC-01 — Create packing from completed pick
// ---------------------------------------------------------------------------
test('AC-01: Create packing order from COMPLETED picking', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id, warehouseId: s.warehouse.id },
  })

  expect(order).toBeDefined()
  expect(order.packingNumber).toMatch(/^PACK-/)
  expect(order.status).toBe('QUEUE')
  expect(order.pickingOrderId).toBe(s.pickingOrder.id)
})

// ---------------------------------------------------------------------------
// AC-02 — Start packing order
// ---------------------------------------------------------------------------
test('AC-02: Start packing transitions QUEUE → IN_PROGRESS', async () => {
  const order = await packingService.createPackingOrder({
    user: s.stockClerk,
    body: { pickingOrderId: s.pickingOrder.id },
  })

  const started = await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  expect(started.status).toBe('IN_PROGRESS')
  expect(started.startedAt).toBeTruthy()
})

// ---------------------------------------------------------------------------
// AC-03 — Scan wrong item
// ---------------------------------------------------------------------------
test('AC-03: Scan wrong item is rejected', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
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
// AC-04 — Scan serial not from pick
// ---------------------------------------------------------------------------
test('AC-04: Scan serial not picked is rejected', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: { packageId: pkg.id, scannedItemCode: s.itemS.sku, qty: 1, serials: ['FAKE-ACCEPT-999'] },
    })
  ).rejects.toThrow('was not picked for this order')
})

// ---------------------------------------------------------------------------
// AC-05 — Scan duplicate serial
// ---------------------------------------------------------------------------
test('AC-05: Duplicate serial in same package is rejected', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  // First scan
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemS.sku, qty: 1, serials: [s.serA.serialNo] },
  })

  // Duplicate scan
  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: { packageId: pkg.id, scannedItemCode: s.itemS.sku, qty: 1, serials: [s.serA.serialNo] },
    })
  ).rejects.toThrow('already in this package')
})

// ---------------------------------------------------------------------------
// AC-06 — Close empty package (reject)
// ---------------------------------------------------------------------------
test('AC-06: Closing empty package is rejected', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await expect(
    packingService.closePackage({ user: s.stockClerk, id: pkg.id })
  ).rejects.toThrow('at least 1 item')
})

// ---------------------------------------------------------------------------
// AC-07 — Close valid package
// ---------------------------------------------------------------------------
test('AC-07: Closing package with items transitions OPEN → CLOSED', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
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
// AC-08 — Reopen closed package
// ---------------------------------------------------------------------------
test('AC-08: Reopen closed package transitions CLOSED → OPEN', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
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
// AC-09 — Complete with unpacked items (reject)
// ---------------------------------------------------------------------------
test('AC-09: Complete packing with unpacked items is rejected', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  // Pack only 5 of 10 for itemA — not all
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
// AC-10 — Complete valid packing
// ---------------------------------------------------------------------------
test('AC-10: Complete packing when all items are packed', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemS.sku, qty: 2, serials: [s.serA.serialNo, s.serB.serialNo] },
  })

  const completed = await packingService.completePackingOrder({ user: s.stockClerk, id: order.id })
  expect(completed.status).toBe('COMPLETED')
  expect(completed.completedAt).toBeTruthy()
})

// ---------------------------------------------------------------------------
// AC-11 — Verify no Stock Ledger entries
// ---------------------------------------------------------------------------
test('AC-11: Packing does NOT write to Stock Ledger', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemS.sku, qty: 2, serials: [s.serA.serialNo, s.serB.serialNo] },
  })
  await packingService.closePackage({ user: s.stockClerk, id: pkg.id })
  await packingService.completePackingOrder({ user: s.stockClerk, id: order.id })

  const ledger = await prisma.stockLedger.findMany({
    where: { refNumber: { startsWith: 'PACK-' } },
  })
  expect(ledger).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// AC-12 — Verify serial status unchanged
// ---------------------------------------------------------------------------
test('AC-12: SerialNumber status stays IN_STOCK after packing', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemS.sku, qty: 2, serials: [s.serA.serialNo, s.serB.serialNo] },
  })
  await packingService.closePackage({ user: s.stockClerk, id: pkg.id })
  await packingService.completePackingOrder({ user: s.stockClerk, id: order.id })

  const serials = await prisma.serialNumber.findMany({
    where: { serialNo: { in: [s.serA.serialNo, s.serB.serialNo] } },
  })
  expect(serials.every((s) => s.status === 'IN_STOCK')).toBe(true)
})

// ---------------------------------------------------------------------------
// AC-13 — Duplicate Package Number is rejected by DB constraint
// ---------------------------------------------------------------------------
test('AC-13: Duplicate package numbers are rejected by unique constraint', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })

  // Create first package normally
  const pkg1 = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  // Try to insert duplicate directly (simulates DB constraint protection)
  await expect(
    prisma.package.create({
      data: {
        id: `DUPE-${s.ts}`,
        packageNumber: pkg1.packageNumber,
        packingOrderId: order.id,
        status: 'OPEN',
      },
    })
  ).rejects.toThrow()
})

// ---------------------------------------------------------------------------
// AC-14 — Scan after package is closed
// ---------------------------------------------------------------------------
test('AC-14: Scanning to a closed package is rejected', async () => {
  const order = await packingService.createPackingOrder({ user: s.stockClerk, body: { pickingOrderId: s.pickingOrder.id } })
  await packingService.startPackingOrder({ user: s.stockClerk, id: order.id })
  const pkg = await packingService.createPackage({ user: s.stockClerk, id: order.id })

  await packingService.scanItemToPackage({
    user: s.stockClerk,
    id: order.id,
    body: { packageId: pkg.id, scannedItemCode: s.itemA.sku, qty: 10 },
  })
  await packingService.closePackage({ user: s.stockClerk, id: pkg.id })

  // Try to scan more after closing
  await expect(
    packingService.scanItemToPackage({
      user: s.stockClerk,
      id: order.id,
      body: { packageId: pkg.id, scannedItemCode: s.itemS.sku, qty: 2, serials: [s.serA.serialNo, s.serB.serialNo] },
    })
  ).rejects.toThrow('CLOSED')
})
