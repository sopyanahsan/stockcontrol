/**
 * tests/seed.js — creates all required records inside a $transaction
 * so the entire seed can be rolled back on error.
 *
 * Users are created once in setup.js::beforeAll and passed in as `users`.
 * No user creation/deletion happens here.
 */
const prisma = require('../lib/prisma')

async function seed(tx, seedKey, users) {
  const { admin, supervisor, stockClerk } = users

  // 1. Category + UoM
  const category = await tx.category.upsert({
    where: { id: `cat_${seedKey}` },
    update: {},
    create: { id: `cat_${seedKey}`, name: `Test Category ${seedKey}` },
  })

  const uom = await tx.uom.upsert({
    where: { code: `U_${seedKey}` },
    update: {},
    create: { id: `uom_${seedKey}`, code: `U_${seedKey}`, name: 'Unit' },
  })

  // 2. Items with different unit costs (important for FIFO averaging)
  const itemA = await tx.item.upsert({
    where: { id: `itemA_${seedKey}` },
    update: { isActive: true },
    create: {
      id: `itemA_${seedKey}`,
      sku: `SEED-A-${seedKey}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      name: 'Widget A',
      categoryId: category.id,
      uomId: uom.id,
      unitCost: 10.0,
      isActive: true,
    },
  })

  const itemB = await tx.item.upsert({
    where: { id: `itemB_${seedKey}` },
    update: { isActive: true },
    create: {
      id: `itemB_${seedKey}`,
      sku: `SEED-B-${seedKey}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      name: 'Widget B',
      categoryId: category.id,
      uomId: uom.id,
      unitCost: 5.0,
      isActive: true,
    },
  })

  // 3. Warehouse + Zone + Location
  const warehouse = await tx.warehouse.upsert({
    where: { id: `wh_${seedKey}` },
    update: {},
    create: {
      id: `wh_${seedKey}`,
      code: 'WHTESTSUITESE', // stable — cleanup matches this exact code
      name: 'Test Warehouse',
    },
  })

  const zone = await tx.zone.upsert({
    where: { id: `zone_${seedKey}` },
    update: {},
    create: {
      id: `zone_${seedKey}`,
      warehouseId: warehouse.id,
      code: `Z01`,
      name: 'Zone 1',
    },
  })

  const loc1 = await tx.location.upsert({
    where: { id: `loc1_${seedKey}` },
    update: { isActive: true },
    create: {
      id: `loc1_${seedKey}`,
      zoneId: zone.id,
      code: `L01${seedKey}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
      type: 'STORAGE',
      isActive: true,
    },
  })

  const loc2 = await tx.location.upsert({
    where: { id: `loc2_${seedKey}` },
    update: { isActive: true },
    create: {
      id: `loc2_${seedKey}`,
      zoneId: zone.id,
      code: `L02${seedKey}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
      type: 'STORAGE',
      isActive: true,
    },
  })

  // STAGING location — receiving always posts into STAGING, so the warehouse
  // must have one active STAGING bin or createReceivingDraft throws.
  const locStaging = await tx.location.upsert({
    where: { id: `loc_staging_${seedKey}` },
    update: { isActive: true },
    create: {
      id: `loc_staging_${seedKey}`,
      zoneId: zone.id,
      code: `LST${seedKey}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
      type: 'STAGING',
      isActive: true,
    },
  })

  // 4. Reason codes (type ADJUSTMENT)
  const reasonAdj = await tx.reasonCode.upsert({
    where: { id: `rc_adj_${seedKey}` },
    update: {},
    create: {
      id: `rc_adj_${seedKey}`,
      code: `ADJ-${seedKey}`.toUpperCase().slice(0, 10),
      description: 'Test Adjustment Reason',
      type: 'ADJUSTMENT',
    },
  })

  // Reason code type CYCLE_COUNT (needed for approveCycleCount)
  const reasonCC = await tx.reasonCode.upsert({
    where: { id: `rc_cc_${seedKey}` },
    update: {},
    create: {
      id: `rc_cc_${seedKey}`,
      code: `CC-${seedKey}`.toUpperCase().slice(0, 10),
      description: 'Test Cycle Count Reason',
      type: 'CYCLE_COUNT',
    },
  })

  // Reason code type OPNAME (needed for approveStockOpname)
  const reasonOpname = await tx.reasonCode.upsert({
    where: { id: `rc_opname_${seedKey}` },
    update: {},
    create: {
      id: `rc_opname_${seedKey}`,
      code: `OP-${seedKey}`.toUpperCase().slice(0, 10),
      description: 'Test Stock Opname Reason',
      type: 'OPNAME',
    },
  })

  // 5. Document sequences for the test warehouse
  const whCode = warehouse.code
  const now = new Date()
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  await tx.documentSequence.upsert({
    where: { prefix_warehouseCode_yearMonth: { prefix: 'ADJ', warehouseCode: whCode, yearMonth: ym } },
    update: {},
    create: { prefix: 'ADJ', warehouseCode: whCode, yearMonth: ym, lastSeq: 0 },
  })

  await tx.documentSequence.upsert({
    where: { prefix_warehouseCode_yearMonth: { prefix: 'CC', warehouseCode: whCode, yearMonth: ym } },
    update: {},
    create: { prefix: 'CC', warehouseCode: whCode, yearMonth: ym, lastSeq: 0 },
  })

  return {
    admin,
    supervisor,
    stockClerk,
    itemA,
    itemB,
    loc1,
    loc2,
    locStaging,
    reasonAdj,
    reasonCC,
    reasonOpname,
    warehouse,
    zone,
    category,
    uom,
    whCode,
  }
}

module.exports = { seed }
