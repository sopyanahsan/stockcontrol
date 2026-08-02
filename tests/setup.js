jest.setTimeout(30000)

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SEED_KEY = 'TEST_SUITE_SEED'
const WH_CODE = 'WHTESTSUITESE'

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL env var is not set')
  }
  global.admin = await prisma.user.upsert({
    where: { email: `admin_${SEED_KEY}@test.internal` },
    update: {},
    create: {
      email: `admin_${SEED_KEY}@test.internal`,
      passwordHash: '$2a$10$placeholder',
      name: 'Test Admin',
      role: 'ADMINISTRATOR',
    },
  })
  global.supervisor = await prisma.user.upsert({
    where: { email: `supervisor_${SEED_KEY}@test.internal` },
    update: {},
    create: {
      email: `supervisor_${SEED_KEY}@test.internal`,
      passwordHash: '$2a$10$placeholder',
      name: 'Test Supervisor',
      role: 'SUPERVISOR',
    },
  })
  global.stockClerk = await prisma.user.upsert({
    where: { email: `clerk_${SEED_KEY}@test.internal` },
    update: {},
    create: {
      email: `clerk_${SEED_KEY}@test.internal`,
      passwordHash: '$2a$10$placeholder',
      name: 'Test Stock Clerk',
      role: 'STOCK_CONTROL',
    },
  })
})

afterEach(async () => {
  // Sequential callback form enforces FK dependency order.
  // Neon has a 5 s interactive-transaction timeout; keep to 12 fast queries.
  await prisma.$transaction(async (tx) => {
    // 0. Shipment and ShipmentPackage (before PackingOrder/Package cleanup)
    await tx.$executeRaw`DELETE FROM "ShipmentPackage" WHERE "shipmentId" IN (SELECT id FROM "Shipment" WHERE "shipmentNumber" LIKE ${'%' + SEED_KEY + '%'})`
    await tx.$executeRaw`DELETE FROM "Shipment" WHERE "shipmentNumber" LIKE ${'%' + SEED_KEY + '%'}`

    // 1. PickingTaskSerial (by serialNo pattern)
    await tx.$executeRaw`DELETE FROM "PickingTaskSerial" WHERE "serialNo" LIKE ${'%' + SEED_KEY + '%'}`

    // 1b. StockOpname lines then StockOpname. Opname numbers do NOT embed the
    //     seed key (SO-WH01-YYYYMM-000001), so match by creator instead. Must
    //     run BEFORE Item deletion or the StockOpnameLine RESTRICT FK fires.
    await tx.$executeRaw`DELETE FROM "StockOpnameLine" WHERE "stockOpnameId" IN (SELECT id FROM "StockOpname" WHERE "createdById" IN (SELECT id FROM "User" WHERE "email" LIKE ${'%' + SEED_KEY + '%'}))`
    await tx.$executeRaw`DELETE FROM "StockOpname" WHERE "createdById" IN (SELECT id FROM "User" WHERE "email" LIKE ${'%' + SEED_KEY + '%'})`

    // 2. All child tables that reference Item (via RESTRICT FKs in the actual DB schema).
    //    Delete all children of seed Items before deleting Items.
    const seedItems = await tx.$queryRaw`SELECT id FROM "Item" WHERE "uomId" IN (SELECT id FROM "Uom" WHERE "code" LIKE ${'%' + SEED_KEY + '%'})`
    const seedItemIds = seedItems.map((r) => r.id)
    if (seedItemIds.length > 0) {
      // All 9 child tables that reference Item via RESTRICT FKs in the actual DB schema.
      await tx.$executeRaw`DELETE FROM "SerialNumber" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "FifoLayer" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "PickingOrderLine" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "PackageItem" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "StockLedger" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "PutawayTask" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "ReceivingLine" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "CycleCountLine" WHERE "itemId" = ANY(${seedItemIds})`
      await tx.$executeRaw`DELETE FROM "StockAdjustmentLine" WHERE "itemId" = ANY(${seedItemIds})`
    }

    // 3. Items referencing seed Uom
    await tx.$executeRaw`DELETE FROM "Item" WHERE "uomId" IN (SELECT id FROM "Uom" WHERE "code" LIKE ${'%' + SEED_KEY + '%'})`

    // 4. Remaining PickingOrderLine/PickingOrder by pickingNumber
    await tx.$executeRaw`DELETE FROM "PickingOrderLine" WHERE "pickingOrderId" IN (SELECT id FROM "PickingOrder" WHERE "pickingNumber" LIKE ${'%' + SEED_KEY + '%'})`
    await tx.$executeRaw`DELETE FROM "PickingOrder" WHERE "pickingNumber" LIKE ${'%' + SEED_KEY + '%'}`

    // 5. Packing records
    await tx.$executeRaw`DELETE FROM "PackingOrder" WHERE "packingNumber" LIKE ${'%' + SEED_KEY + '%'}`

    // 5a. StockTransfer lines then StockTransfer (lines carry Location RESTRICT FKs)
    await tx.$executeRaw`DELETE FROM "StockTransferLine" WHERE "transferId" IN (SELECT id FROM "StockTransfer" WHERE "transferNumber" LIKE ${'%' + SEED_KEY + '%'})`
    await tx.$executeRaw`DELETE FROM "StockTransfer" WHERE "transferNumber" LIKE ${'%' + SEED_KEY + '%'}`

    // 5c. Receiving after ReceivingLine (Receiving carries Location + Warehouse RESTRICT FKs)
    await tx.$executeRaw`DELETE FROM "Receiving" WHERE "warehouseId" IN (SELECT id FROM "Warehouse" WHERE "code" = ${WH_CODE})`

    // 5d. Suppliers created by seed users / with seed key in code or name.
    //     Receiving rows referencing them were removed above, so this can't trip the FK.
    await tx.$executeRaw`DELETE FROM "Supplier" WHERE "name" LIKE ${'%' + SEED_KEY + '%'} OR "code" LIKE ${'%' + SEED_KEY + '%'}`

    // 6. Infrastructure (Location → Zone → Warehouse)
    await tx.$executeRaw`DELETE FROM "Location" WHERE "zoneId" IN (SELECT id FROM "Zone" WHERE "warehouseId" IN (SELECT id FROM "Warehouse" WHERE "code" = ${WH_CODE}))`
    await tx.$executeRaw`DELETE FROM "Zone" WHERE "warehouseId" IN (SELECT id FROM "Warehouse" WHERE "code" = ${WH_CODE})`
    await tx.$executeRaw`DELETE FROM "Warehouse" WHERE "code" = ${WH_CODE}`

    // 7. Second test warehouse (WH2 created in shipping tests)
    const wh2codes = await tx.$queryRaw`SELECT code FROM "Warehouse" WHERE code LIKE ${'%ACCEPT%'}`
    for (const row of wh2codes) {
      await tx.$executeRaw`DELETE FROM "Location" WHERE "zoneId" IN (SELECT id FROM "Zone" WHERE "warehouseId" IN (SELECT id FROM "Warehouse" WHERE code = ${row.code}))`
      await tx.$executeRaw`DELETE FROM "Zone" WHERE "warehouseId" IN (SELECT id FROM "Warehouse" WHERE code = ${row.code})`
      await tx.$executeRaw`DELETE FROM "Warehouse" WHERE code = ${row.code}`
    }

    // 8. Master data
    await tx.$executeRaw`DELETE FROM "ReasonCode" WHERE "code" LIKE ${'%' + SEED_KEY + '%'}`
    await tx.$executeRaw`DELETE FROM "DocumentSequence" WHERE "warehouseCode" = ${WH_CODE}`
    await tx.$executeRaw`DELETE FROM "DocumentSequence" WHERE "prefix" = 'SUP' AND "warehouseCode" = 'GLOBAL' AND "yearMonth" = 'ALL'`
    await tx.$executeRaw`DELETE FROM "Uom" WHERE "code" LIKE ${'%' + SEED_KEY + '%'}`
    await tx.$executeRaw`DELETE FROM "Category" WHERE "name" LIKE ${'%' + SEED_KEY + '%'}`
  })
})

global.seedKey = SEED_KEY
