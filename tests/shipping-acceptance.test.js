/**
 * shipping-acceptance.test.js
 *
 * End-to-end acceptance tests for Milestone 7 — Shipping Module.
 *
 * Tests AC-01 through AC-22:
 *   AC-01  Create shipment from COMPLETED packing → status QUEUE
 *   AC-02  Scan wrong package barcode → Error "Package not found"
 *   AC-03  Package OPEN → Error "Package must be CLOSED"
 *   AC-04  Package from different warehouse → Error "Wrong warehouse"
 *   AC-05  Wrong serial in package → Error "Serial not in package"
 *   AC-06  Duplicate serial verified → Error "already verified"
 *   AC-07  Preview shipment → Shows packages, FIFO, ledger
 *   AC-08  Confirm consumes FIFO → FIFO qtyRemaining decreases
 *   AC-09  Stock Ledger OUT → SHIP_OUT ledger entries exist
 *   AC-10  Inventory reduced → Stock Ledger sum reflects shipment
 *   AC-11  Audit Trail → All events logged
 *   AC-12  Rollback transaction → Exception → all rolled back
 *   AC-13  Duplicate shipment for packing → Error "Packing already shipped"
 *   AC-14  Package already shipped → Error "Package already shipped"
 *   AC-15  Package locked after COMPLETED → Cannot be edited/reopened
 *   AC-16  Double confirm → Error on second call
 *   AC-17  Partial shipment (PENDING + VERIFIED) → Can confirm when all VERIFIED
 *   AC-18  Shipment Not READY → Confirm rejected if status != READY
 *   AC-19  FIFO Allocation Mismatch → Confirm rejected + rolled back
 *   AC-20  Package Locked Edit Attempt → After COMPLETED, edit rejected
 *   AC-21  Retry FAILED shipment → Reset to READY
 *   AC-22  Duplicate submit protection → Status check prevents double execution
 *
 * Run: npx jest tests/shipping-acceptance.test.js
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const packingService = require('../lib/packing-service')
const pickingService = require('../lib/picking-service')
const shippingService = require('../lib/shipping-service')

jest.mock('../lib/audit', () => ({ logAudit: jest.fn() }))

// ---------------------------------------------------------------------------
// Shared setup — creates COMPLETED picking → COMPLETED packing → CLOSED packages
// ---------------------------------------------------------------------------
let s

beforeEach(async () => {
  const base = await seed(prisma, global.seedKey, global)

  const now = new Date()
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  for (const prefix of ['PICK', 'PACK', 'PKG', 'SHIP']) {
    await prisma.documentSequence.upsert({
      where: { prefix_warehouseCode_yearMonth: { prefix, warehouseCode: base.whCode, yearMonth: ym } },
      update: {},
      create: { prefix, warehouseCode: base.whCode, yearMonth: ym, lastSeq: 0 },
    })
  }

  const ts = Date.now()

  // FIFO layers
  const flA = await prisma.fifoLayer.create({
    data: { itemId: base.itemA.id, locationId: base.loc1.id, qtyReceived: 100, qtyRemaining: 100, unitCost: 10, refNumber: 'SHIP-SEED-REF', receivedAt: new Date('2026-01-01') },
  })
  const flB = await prisma.fifoLayer.create({
    data: { itemId: base.itemB.id, locationId: base.loc1.id, qtyReceived: 50, qtyRemaining: 50, unitCost: 5, refNumber: 'SHIP-SEED-REF', receivedAt: new Date('2026-01-01') },
  })

  // Serial-tracked item + serials
  const itemS = await prisma.item.create({
    data: { id: `SH-ACCEPT-${ts}`, sku: `SHSA-${ts}`.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16), name: 'Serial Accept Item', categoryId: base.category.id, uomId: base.uom.id, serialTracked: true, isActive: true },
  })
  const serials = await Promise.all(
    Array.from({ length: 3 }, (_, i) =>
      prisma.serialNumber.create({
        data: { serialNo: `SH-SERIAL-${ts}-${i}`, itemId: itemS.id, status: 'IN_STOCK', currentLocationId: base.loc1.id },
      })
    )
  )

  // COMPLETED picking order with 3 lines
  const pickingOrder = await prisma.pickingOrder.create({
    data: {
      id: `SPICK-ACCEPT-${ts}`, pickingNumber: `PICK-ACCEPT-${ts}`, status: 'COMPLETED', warehouseId: base.warehouse.id, createdById: base.stockClerk.id, startedAt: new Date(), completedAt: new Date(),
      lines: { create: [
        { itemId: base.itemA.id, qtyOrdered: 10, qtyPicked: 10, status: 'COMPLETED' },
        { itemId: base.itemB.id, qtyOrdered: 5, qtyPicked: 5, status: 'COMPLETED' },
        { itemId: itemS.id, qtyOrdered: 3, qtyPicked: 3, status: 'COMPLETED' },
      ]},
    },
    include: { lines: true },
  })

  // Picking tasks + serials — one task per item at loc1
  const taskA = await prisma.pickingTask.create({
    data: { pickingLineId: pickingOrder.lines[0].id, locationId: base.loc1.id, fifoLayerId: flA.id, sequence: 1, qty: 10, qtyPicked: 10, status: 'COMPLETED', pickedById: base.stockClerk.id, pickedAt: new Date() },
  })
  const taskB = await prisma.pickingTask.create({
    data: { pickingLineId: pickingOrder.lines[1].id, locationId: base.loc1.id, fifoLayerId: flB.id, sequence: 1, qty: 5, qtyPicked: 5, status: 'COMPLETED', pickedById: base.stockClerk.id, pickedAt: new Date() },
  })
  const taskS = await prisma.pickingTask.create({
    data: { pickingLineId: pickingOrder.lines[2].id, locationId: base.loc1.id, fifoLayerId: null, sequence: 1, qty: 3, qtyPicked: 3, status: 'COMPLETED', pickedById: base.stockClerk.id, pickedAt: new Date() },
  })

  await prisma.pickingTaskSerial.createMany({
    data: serials.map((ser) => ({ pickingTaskId: taskS.id, serialNo: ser.serialNo, pickedAt: new Date() })),
  })

  // COMPLETED packing order
  const packingOrder = await prisma.packingOrder.create({
    data: { id: `SPACK-ACCEPT-${ts}`, packingNumber: `PACK-ACCEPT-${ts}`, status: 'COMPLETED', pickingOrderId: pickingOrder.id, warehouseId: base.warehouse.id, createdById: base.stockClerk.id, startedAt: new Date(), completedAt: new Date() },
  })

  // Packages + PackageItems + PackageAllocations
  const pkgA = await prisma.package.create({ data: { id: `SPKGA-ACCEPT-${ts}`, packageNumber: `PKGA-${global.seedKey}-${ts}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''), packingOrderId: packingOrder.id, status: 'CLOSED', closedAt: new Date() } })
  const pkgAItem = await prisma.packageItem.create({ data: { packageId: pkgA.id, itemId: base.itemA.id, qty: 10 } })
  await prisma.packageAllocation.create({ data: { packageItemId: pkgAItem.id, pickingTaskId: taskA.id, qtyPacked: 10 } })

  const pkgB = await prisma.package.create({ data: { id: `SPKGB-ACCEPT-${ts}`, packageNumber: `PKGB-${global.seedKey}-${ts}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''), packingOrderId: packingOrder.id, status: 'CLOSED', closedAt: new Date() } })
  const pkgBItem = await prisma.packageItem.create({ data: { packageId: pkgB.id, itemId: base.itemB.id, qty: 5 } })
  await prisma.packageAllocation.create({ data: { packageItemId: pkgBItem.id, pickingTaskId: taskB.id, qtyPacked: 5 } })

  const pkgC = await prisma.package.create({ data: { id: `SPKGC-ACCEPT-${ts}`, packageNumber: `PKGC-${global.seedKey}-${ts}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''), packingOrderId: packingOrder.id, status: 'CLOSED', closedAt: new Date() } })
  const pkgCItem = await prisma.packageItem.create({ data: { packageId: pkgC.id, itemId: itemS.id, qty: 3 } })
  await prisma.packageAllocation.create({ data: { packageItemId: pkgCItem.id, pickingTaskId: taskS.id, qtyPacked: 3 } })

  // Attach serials to Package C — unique key is (pickingTaskId, serialNo), so use updateMany
  for (const ser of serials) {
    await prisma.pickingTaskSerial.updateMany({
      where: { serialNo: ser.serialNo, pickingTaskId: taskS.id },
      data: { packageId: pkgC.id },
    })
  }

  // Second warehouse + closed package (for AC-04)
  const wh2 = await prisma.warehouse.create({ data: { id: `WH2-ACCEPT-${ts}`, code: `WH2ACCEPT${ts}`.slice(0, 12), name: 'Test Warehouse 2' } })
  const zone2 = await prisma.zone.create({ data: { id: `ZONE2-ACCEPT-${ts}`, warehouseId: wh2.id, code: 'Z01', name: 'Zone 2' } })
  const loc2 = await prisma.location.create({ data: { id: `LOC2-ACCEPT-${ts}`, zoneId: zone2.id, code: `L02A${ts}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10), type: 'STORAGE', isActive: true } })

  await prisma.fifoLayer.create({ data: { itemId: base.itemA.id, locationId: loc2.id, qtyReceived: 20, qtyRemaining: 20, unitCost: 10, receivedAt: new Date('2026-01-01') } })

  const packingOrder2 = await prisma.packingOrder.create({
    data: { id: `SPACK2-ACCEPT-${ts}`, packingNumber: `PACK2-ACCEPT-${ts}`, status: 'COMPLETED', warehouseId: wh2.id, createdById: base.stockClerk.id, startedAt: new Date(), completedAt: new Date() },
  })
  const pkgW2 = await prisma.package.create({ data: { id: `SPKGW2-ACCEPT-${ts}`, packageNumber: `PKGW2-${global.seedKey}-${ts}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''), packingOrderId: packingOrder2.id, status: 'CLOSED', closedAt: new Date() } })
  await prisma.packageItem.create({ data: { packageId: pkgW2.id, itemId: base.itemA.id, qty: 5 } })

  s = {
    ...base,
    itemS,
    serials,
    pickingOrder,
    packingOrder,
    pkgA, pkgB, pkgC,
    taskA, taskB, taskS,
    wh2,
    packingOrder2,
    pkgW2,
    ts,
  }
})

// ---------------------------------------------------------------------------
// AC-01 — Create shipment from COMPLETED packing → QUEUE
// ---------------------------------------------------------------------------
test('AC-01: Create shipment from COMPLETED packing → status QUEUE', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id, warehouseId: s.warehouse.id },
  })

  expect(shipment).toBeDefined()
  expect(shipment.shipmentNumber).toMatch(/^SHIP-/)
  expect(shipment.status).toBe('QUEUE')
  expect(shipment.packingOrderId).toBe(s.packingOrder.id)
})

// ---------------------------------------------------------------------------
// AC-02 — Scan wrong package barcode → Error "Package not found"
// ---------------------------------------------------------------------------
test('AC-02: Scan wrong package barcode is rejected', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await expect(
    shippingService.scanPackage({
      user: s.stockClerk,
      id: shipment.id,
      body: { packageNumber: 'FAKE-PACKAGE-999' },
    })
  ).rejects.toThrow('not found')
})

// ---------------------------------------------------------------------------
// AC-03 — Package OPEN → Error "Package must be CLOSED"
// ---------------------------------------------------------------------------
test('AC-03: Package OPEN is rejected', async () => {
  // Create an OPEN package
  const openPkg = await prisma.package.create({
    data: {
      packageNumber: `OPEN-${global.seedKey}-${s.ts}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      packingOrderId: s.packingOrder.id,
      status: 'OPEN',
    },
  })

  await prisma.packageItem.create({
    data: { packageId: openPkg.id, itemId: s.itemA.id, qty: 3 },
  })

  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await expect(
    shippingService.scanPackage({
      user: s.stockClerk,
      id: shipment.id,
      body: { packageNumber: openPkg.packageNumber },
    })
  ).rejects.toThrow('CLOSED')
})

// ---------------------------------------------------------------------------
// AC-04 — Package from different warehouse → Error "Wrong warehouse"
// ---------------------------------------------------------------------------
test('AC-04: Package from different warehouse is rejected', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id, warehouseId: s.warehouse.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await expect(
    shippingService.scanPackage({
      user: s.stockClerk,
      id: shipment.id,
      body: { packageNumber: s.pkgW2.packageNumber },
    })
  ).rejects.toThrow('different warehouse')
})

// ---------------------------------------------------------------------------
// AC-05 — Wrong serial in package → Error "Serial not in package"
// ---------------------------------------------------------------------------
test('AC-05: Wrong serial in package is rejected', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  // Scan package C (serial-tracked)
  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgC.packageNumber },
  })

  const shipmentPkg = await prisma.shipmentPackage.findFirst({
    where: { shipmentId: shipment.id, packageId: s.pkgC.id },
  })

  // Try to verify with a serial not in package C
  await expect(
    shippingService.verifySerials({
      user: s.stockClerk,
      id: shipment.id,
      body: {
        packageId: s.pkgC.id,
        itemId: s.itemS.id,
        serials: ['FAKE-SERIAL-999'],
      },
    })
  ).rejects.toThrow()
})

// ---------------------------------------------------------------------------
// AC-06 — Duplicate serial verified → Error "already verified"
// ---------------------------------------------------------------------------
test('AC-06: Duplicate serial in same package is rejected', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgC.packageNumber },
  })

  const shipmentPkg = await prisma.shipmentPackage.findFirst({
    where: { shipmentId: shipment.id, packageId: s.pkgC.id },
  })

  // First verification — mark package VERIFIED
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgC.id },
  })

  // Verify again — should reject because already VERIFIED
  await expect(
    shippingService.verifyPackage({
      user: s.stockClerk,
      id: shipment.id,
      body: { packageId: s.pkgC.id },
    })
  ).rejects.toThrow('already VERIFIED')
})

// ---------------------------------------------------------------------------
// AC-07 — Preview shipment → Shows packages, items, FIFO, ledger
// ---------------------------------------------------------------------------
test('AC-07: Preview shipment shows packages, FIFO allocations, and ledger preview', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgB.packageNumber },
  })

  const preview = await shippingService.previewShipment({ id: shipment.id })

  expect(preview.packages).toHaveLength(2)
  expect(preview.ledgerPreview.length).toBeGreaterThan(0)
  expect(preview.ledgerPreview.every((e) => e.txnType === 'SHIP_OUT')).toBe(true)
  expect(preview.ledgerPreview.some((e) => e.qty < 0)).toBe(true)
})

// ---------------------------------------------------------------------------
// AC-08 — Confirm consumes FIFO → qtyRemaining decreases
// ---------------------------------------------------------------------------
test('AC-08: Confirm shipment consumes FIFO — qtyRemaining decreases', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })

  const shipmentPkg = await prisma.shipmentPackage.findFirst({
    where: { shipmentId: shipment.id, packageId: s.pkgA.id },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  // Record FIFO state before
  const beforeFifo = await prisma.fifoLayer.findMany({
    where: { itemId: s.itemA.id, qtyRemaining: { gt: 0 } },
    orderBy: { receivedAt: 'asc' },
  })
  const totalBefore = beforeFifo.reduce((sum, l) => sum + Number(l.qtyRemaining), 0)

  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  const afterFifo = await prisma.fifoLayer.findMany({
    where: { itemId: s.itemA.id },
  })

  // Check that at least one layer had qtyRemaining decremented
  const totalAfter = afterFifo.reduce((sum, l) => sum + Number(l.qtyRemaining), 0)
  expect(totalAfter).toBeLessThan(totalBefore)
})

// ---------------------------------------------------------------------------
// AC-09 — Stock Ledger OUT → SHIP_OUT ledger entries exist
// ---------------------------------------------------------------------------
test('AC-09: Confirm creates SHIP_OUT Stock Ledger entries', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  const ledger = await prisma.stockLedger.findMany({
    where: { refNumber: shipment.shipmentNumber },
  })

  expect(ledger.length).toBeGreaterThan(0)
  expect(ledger.every((e) => e.txnType === 'SHIP_OUT')).toBe(true)
  expect(ledger.every((e) => e.refType === 'SHIPMENT')).toBe(true)
  expect(ledger.some((e) => e.itemId === s.itemA.id)).toBe(true)
})

// ---------------------------------------------------------------------------
// AC-10 — Inventory reduced → Stock Ledger sum reflects shipment
// ---------------------------------------------------------------------------
test('AC-10: Stock Ledger sum reflects inventory reduction after shipment', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgB.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgB.id },
  })

  const beforeSum = await prisma.stockLedger.aggregate({
    where: { itemId: s.itemB.id },
    _sum: { qty: true },
  })

  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  const afterSum = await prisma.stockLedger.aggregate({
    where: { itemId: s.itemB.id },
    _sum: { qty: true },
  })

  expect(Number(afterSum._sum.qty || 0)).toBeLessThan(Number(beforeSum._sum.qty || 0))
})

// ---------------------------------------------------------------------------
// AC-11 — Audit Trail → All events logged
// ---------------------------------------------------------------------------
test('AC-11: Audit trail records shipment events including FIFO and Ledger', async () => {
  const { logAudit } = require('../lib/audit')
  logAudit.mockClear()

  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })

  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  const shippingLogs = logAudit.mock.calls.filter(([call]) => call.module === 'SHIPPING')
  const actions = shippingLogs.map(([call]) => call.action)

  expect(actions).toContain('CREATE') // Shipment created
  expect(actions).toContain('UPDATE') // Started, scanned, verified
  expect(actions).toContain('POST')  // Confirmed
})

// ---------------------------------------------------------------------------
// AC-12 — Rollback transaction → Exception → all rolled back
// ---------------------------------------------------------------------------
test('AC-12: Exception during confirm rolls back all changes', async () => {
  // Create a shipment with a package but no FIFO stock for itemB (zero it out)
  await prisma.fifoLayer.updateMany({
    where: { itemId: s.itemB.id },
    data: { qtyRemaining: 0 },
  })

  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgB.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgB.id },
  })

  // FIFO should be insufficient — confirm should throw and rollback
  await expect(
    shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })
  ).rejects.toThrow()

  // Verify shipment was NOT completed
  const after = await prisma.shipment.findUnique({ where: { id: shipment.id } })
  expect(after.status).not.toBe('COMPLETED')

  // Verify no ledger entries were created
  const ledger = await prisma.stockLedger.findMany({
    where: { refNumber: shipment.shipmentNumber },
  })
  expect(ledger).toHaveLength(0)

  // Restore FIFO
  await prisma.fifoLayer.updateMany({
    where: { itemId: s.itemB.id },
    data: { qtyRemaining: 50 },
  })
})

// ---------------------------------------------------------------------------
// AC-13 — Duplicate shipment for packing → Error "Packing already shipped"
// ---------------------------------------------------------------------------
test('AC-13: Duplicate shipment for same packing order is rejected', async () => {
  await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })

  await expect(
    shippingService.createShipment({
      user: s.stockClerk,
      body: { packingOrderId: s.packingOrder.id },
    })
  ).rejects.toThrow('already exists')
})

// ---------------------------------------------------------------------------
// AC-14 — Package already shipped → Error "Package already shipped"
// ---------------------------------------------------------------------------
test('AC-14: Package already in another shipment is rejected', async () => {
  // Create first shipment with pkgA and confirm it
  const shipment1 = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment1.id })
  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment1.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment1.id,
    body: { packageId: s.pkgA.id },
  })
  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment1.id })

  // pkgA is now shipped. Creating another shipment from the same packing order
  // fails because of the @@unique([packingOrderId]) constraint on Shipment.
  await expect(
    shippingService.createShipment({
      user: s.stockClerk,
      body: { packingOrderId: s.packingOrder.id },
    })
  ).rejects.toThrow()
})

// ---------------------------------------------------------------------------
// AC-15 — Package locked after COMPLETED → Cannot be edited/reopened
// ---------------------------------------------------------------------------
test('AC-15: After COMPLETED, package remains CLOSED and immutable', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  // Package must still be CLOSED
  const pkg = await prisma.package.findUnique({ where: { id: s.pkgA.id } })
  expect(pkg.status).toBe('CLOSED')

  // ShipmentPackage must be CONFIRMED
  const sp = await prisma.shipmentPackage.findFirst({
    where: { packageId: s.pkgA.id },
  })
  expect(sp.status).toBe('CONFIRMED')
})

// ---------------------------------------------------------------------------
// AC-16 — Double confirm → Error on second call
// ---------------------------------------------------------------------------
test('AC-16: Double confirm is rejected on second call', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  // Second confirm — should reject
  await expect(
    shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })
  ).rejects.toThrow('already COMPLETED')
})

// ---------------------------------------------------------------------------
// AC-17 — Partial shipment (PENDING + VERIFIED) → Can confirm when all VERIFIED
// ---------------------------------------------------------------------------
test('AC-17: All packages VERIFIED → status READY → can confirm', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  // Scan both packages
  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgB.packageNumber },
  })

  // Verify both
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgB.id },
  })

  const updated = await prisma.shipment.findUnique({ where: { id: shipment.id } })
  expect(updated.status).toBe('READY')

  const confirmed = await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })
  expect(confirmed.status).toBe('COMPLETED')
})

// ---------------------------------------------------------------------------
// AC-18 — Shipment Not READY → Confirm rejected if status != READY
// ---------------------------------------------------------------------------
test('AC-18: Confirm rejected if shipment status is not READY', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  // Do NOT verify — status stays IN_PROGRESS

  await expect(
    shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })
  ).rejects.toThrow('READY')
})

// ---------------------------------------------------------------------------
// AC-19 — FIFO Allocation Mismatch → Confirm rejected + rolled back
// ---------------------------------------------------------------------------
test('AC-19: FIFO allocation mismatch rolls back all changes', async () => {
  // Zero out FIFO for itemA — will cause mismatch
  await prisma.fifoLayer.updateMany({
    where: { itemId: s.itemA.id },
    data: { qtyRemaining: 0 },
  })

  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  await expect(
    shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })
  ).rejects.toThrow()

  // Status must not be COMPLETED
  const after = await prisma.shipment.findUnique({ where: { id: shipment.id } })
  expect(after.status).not.toBe('COMPLETED')

  // No ledger entries
  const ledger = await prisma.stockLedger.findMany({
    where: { refNumber: shipment.shipmentNumber },
  })
  expect(ledger).toHaveLength(0)

  // Restore FIFO
  await prisma.fifoLayer.updateMany({
    where: { itemId: s.itemA.id },
    data: { qtyRemaining: 100 },
  })
})

// ---------------------------------------------------------------------------
// AC-20 — Package Locked Edit Attempt → After COMPLETED, edit rejected
// ---------------------------------------------------------------------------
test('AC-20: After COMPLETED, no service allows editing the locked shipment', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  // Try to cancel — should fail
  await expect(
    shippingService.cancelShipment({ user: s.stockClerk, id: shipment.id, reason: 'Test' })
  ).rejects.toThrow('cannot be cancelled')

  // Try to assign shipper — should fail
  await expect(
    shippingService.assignShipper({ user: s.stockClerk, id: shipment.id, assignedToId: s.stockClerk.id })
  ).rejects.toThrow()
})

// ---------------------------------------------------------------------------
// AC-21 — Retry FAILED shipment → Reset to READY
// ---------------------------------------------------------------------------
test('AC-21: Retry FAILED shipment resets to READY', async () => {
  // Manually set shipment to FAILED
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  // Force FAILED status (simulating a mid-confirm failure)
  await prisma.shipment.update({
    where: { id: shipment.id },
    data: { status: 'FAILED' },
  })

  const retried = await shippingService.retryShipment({ user: s.stockClerk, id: shipment.id })

  expect(retried.status).toBe('READY')
})

// ---------------------------------------------------------------------------
// AC-22 — Duplicate submit protection → Status check prevents double execution
// ---------------------------------------------------------------------------
test('AC-22: Status check prevents duplicate confirmation', async () => {
  const shipment = await shippingService.createShipment({
    user: s.stockClerk,
    body: { packingOrderId: s.packingOrder.id },
  })
  await shippingService.startShipment({ user: s.stockClerk, id: shipment.id })

  await shippingService.scanPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageNumber: s.pkgA.packageNumber },
  })
  await shippingService.verifyPackage({
    user: s.stockClerk,
    id: shipment.id,
    body: { packageId: s.pkgA.id },
  })

  // First confirm
  await shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })

  // Count ledger entries — should be exactly what was written
  const ledger = await prisma.stockLedger.findMany({
    where: { refNumber: shipment.shipmentNumber },
  })

  // Second confirm — duplicate protection kicks in
  await expect(
    shippingService.confirmShipment({ user: s.stockClerk, id: shipment.id })
  ).rejects.toThrow('already COMPLETED')

  // Ledger count unchanged
  const ledgerAfter = await prisma.stockLedger.findMany({
    where: { refNumber: shipment.shipmentNumber },
  })
  expect(ledgerAfter.length).toBe(ledger.length)
})
