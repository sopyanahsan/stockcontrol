const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ---- Users ----
  const usersData = [
    { email: 'admin@stockcontrol.com', password: 'admin123', name: 'System Administrator', role: 'ADMINISTRATOR' },
    { email: 'supervisor@stockcontrol.com', password: 'supervisor123', name: 'Warehouse Supervisor', role: 'SUPERVISOR' },
    { email: 'stock@stockcontrol.com', password: 'stock123', name: 'Stock Control Officer', role: 'STOCK_CONTROL' },
  ]
  const users = {}
  for (const u of usersData) {
    const passwordHash = bcrypt.hashSync(u.password, 10)
    users[u.role] = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, name: u.name, role: u.role, isActive: true },
      create: { email: u.email, passwordHash, name: u.name, role: u.role },
    })
  }
  console.log('Users seeded')

  // ---- Categories ----
  const categoryNames = ['Furniture', 'Hardware', 'Electronics', 'Packaging', 'Tools']
  const categories = {}
  for (const name of categoryNames) {
    categories[name] = await prisma.category.upsert({ where: { name }, update: {}, create: { name } })
  }

  // ---- UOMs ----
  const uomData = [
    { code: 'PCS', name: 'Pieces' },
    { code: 'BOX', name: 'Box' },
    { code: 'PLT', name: 'Pallet' },
    { code: 'KG', name: 'Kilogram' },
    { code: 'M', name: 'Meter' },
  ]
  const uoms = {}
  for (const u of uomData) {
    uoms[u.code] = await prisma.uom.upsert({ where: { code: u.code }, update: {}, create: u })
  }

  // ---- Warehouse / Zones / Locations ----
  const wh = await prisma.warehouse.upsert({
    where: { code: 'WH-01' },
    update: {},
    create: { code: 'WH-01', name: 'Main Distribution Warehouse', address: 'Jl. Industri Raya No. 88' },
  })
  const zoneData = [
    { code: 'A', name: 'Zone A - Bulk Storage' },
    { code: 'B', name: 'Zone B - Picking' },
    { code: 'REC', name: 'Receiving Dock' },
    { code: 'STG', name: 'Staging Area' },
    { code: 'DMG', name: 'Damaged Goods' },
  ]
  const zones = {}
  for (const z of zoneData) {
    const existing = await prisma.zone.findFirst({ where: { warehouseId: wh.id, code: z.code } })
    zones[z.code] = existing || (await prisma.zone.create({ data: { ...z, warehouseId: wh.id } }))
  }
  const locationData = [
    { code: 'A-01-01', zone: 'A', type: 'STORAGE' },
    { code: 'A-01-02', zone: 'A', type: 'STORAGE' },
    { code: 'A-02-01', zone: 'A', type: 'STORAGE' },
    { code: 'A-02-02', zone: 'A', type: 'STORAGE' },
    { code: 'B-01-01', zone: 'B', type: 'PICKING' },
    { code: 'B-01-02', zone: 'B', type: 'PICKING' },
    { code: 'REC-DOCK-01', zone: 'REC', type: 'RECEIVING' },
    { code: 'STG-01', zone: 'STG', type: 'STAGING' },
    { code: 'DMG-01', zone: 'DMG', type: 'DAMAGED' },
  ]
  const locations = {}
  for (const l of locationData) {
    locations[l.code] = await prisma.location.upsert({
      where: { code: l.code },
      update: {},
      create: { code: l.code, type: l.type, zoneId: zones[l.zone].id },
    })
  }

  // ---- Reason Codes ----
  const reasonData = [
    { code: 'RCV-PO', description: 'Receiving from Purchase Order', type: 'RECEIVING' },
    { code: 'PTW-STD', description: 'Standard Putaway', type: 'PUTAWAY' },
    { code: 'TRF-RPL', description: 'Replenishment Transfer', type: 'MOVEMENT' },
    { code: 'TRF-CON', description: 'Consolidation Transfer', type: 'MOVEMENT' },
    { code: 'ADJ-DMG', description: 'Damaged Goods Adjustment', type: 'ADJUSTMENT' },
    { code: 'ADJ-LOSS', description: 'Stock Loss / Shrinkage', type: 'ADJUSTMENT' },
    { code: 'ADJ-FOUND', description: 'Stock Found', type: 'ADJUSTMENT' },
    { code: 'CC-STD', description: 'Cycle Count Variance', type: 'CYCLE_COUNT' },
    { code: 'OPN-STD', description: 'Stock Opname Variance', type: 'OPNAME' },
  ]
  const reasons = {}
  for (const r of reasonData) {
    reasons[r.code] = await prisma.reasonCode.upsert({ where: { code: r.code }, update: {}, create: r })
  }

  // ---- Items ----
  const itemData = [
    { sku: 'FUR-CHR-001', name: 'Office Chair Ergonomic Black', category: 'Furniture', uom: 'PCS', minStock: 20, reorderPoint: 30, maxStock: 200, unitCost: 85 },
    { sku: 'FUR-DSK-002', name: 'Standing Desk 120cm Oak', category: 'Furniture', uom: 'PCS', minStock: 10, reorderPoint: 15, maxStock: 100, unitCost: 210 },
    { sku: 'FUR-SHL-003', name: 'Storage Shelf 5-Tier Metal', category: 'Furniture', uom: 'PCS', minStock: 15, reorderPoint: 25, maxStock: 150, unitCost: 65 },
    { sku: 'HRD-SCR-001', name: 'Wood Screw 4x40mm (500 pack)', category: 'Hardware', uom: 'BOX', minStock: 50, reorderPoint: 80, maxStock: 500, unitCost: 12 },
    { sku: 'HRD-HNG-002', name: 'Door Hinge Stainless 3 inch', category: 'Hardware', uom: 'BOX', minStock: 30, reorderPoint: 50, maxStock: 300, unitCost: 18 },
    { sku: 'ELC-CBL-001', name: 'Power Cable 3m EU Plug', category: 'Electronics', uom: 'PCS', minStock: 100, reorderPoint: 150, maxStock: 1000, unitCost: 4.5 },
    { sku: 'ELC-LED-002', name: 'LED Panel Light 60x60', category: 'Electronics', uom: 'PCS', minStock: 40, reorderPoint: 60, maxStock: 400, unitCost: 22 },
    { sku: 'PKG-BOX-001', name: 'Carton Box Large 60x40x40', category: 'Packaging', uom: 'PCS', minStock: 200, reorderPoint: 300, maxStock: 2000, unitCost: 1.2 },
    { sku: 'PKG-WRP-002', name: 'Stretch Wrap Film 50cm Roll', category: 'Packaging', uom: 'PCS', minStock: 60, reorderPoint: 100, maxStock: 600, unitCost: 8 },
    { sku: 'TLS-DRL-001', name: 'Cordless Drill 18V Kit', category: 'Tools', uom: 'PCS', minStock: 10, reorderPoint: 15, maxStock: 80, unitCost: 95 },
  ]
  const items = {}
  for (const it of itemData) {
    items[it.sku] = await prisma.item.upsert({
      where: { sku: it.sku },
      update: {},
      create: {
        sku: it.sku,
        name: it.name,
        categoryId: categories[it.category].id,
        uomId: uoms[it.uom].id,
        minStock: it.minStock,
        reorderPoint: it.reorderPoint,
        maxStock: it.maxStock,
        unitCost: it.unitCost,
        barcode: it.sku,
      },
    })
  }
  console.log('Master data seeded')

  // ---- Opening stock via Stock Ledger + FIFO layers (business rule: stock only from transactions) ----
  const existingLedger = await prisma.stockLedger.count()
  if (existingLedger === 0) {
    const admin = users['ADMINISTRATOR']
    const openingStock = [
      { sku: 'FUR-CHR-001', loc: 'A-01-01', qty: 120, cost: 85 },
      { sku: 'FUR-DSK-002', loc: 'A-01-02', qty: 45, cost: 210 },
      { sku: 'FUR-SHL-003', loc: 'A-02-01', qty: 12, cost: 65 },
      { sku: 'HRD-SCR-001', loc: 'B-01-01', qty: 240, cost: 12 },
      { sku: 'HRD-HNG-002', loc: 'B-01-01', qty: 25, cost: 18 },
      { sku: 'ELC-CBL-001', loc: 'A-02-02', qty: 620, cost: 4.5 },
      { sku: 'ELC-LED-002', loc: 'A-02-02', qty: 35, cost: 22 },
      { sku: 'PKG-BOX-001', loc: 'B-01-02', qty: 950, cost: 1.2 },
      { sku: 'PKG-WRP-002', loc: 'B-01-02', qty: 45, cost: 8 },
      { sku: 'TLS-DRL-001', loc: 'A-01-01', qty: 28, cost: 95 },
    ]
    for (const [idx, s] of openingStock.entries()) {
      const refNumber = `GRN-OPENING-${String(idx + 1).padStart(3, '0')}`
      await prisma.stockLedger.create({
        data: {
          itemId: items[s.sku].id,
          locationId: locations[s.loc].id,
          txnType: 'RECEIVING',
          qty: s.qty,
          unitCost: s.cost,
          refType: 'RECEIVING',
          refNumber,
          reasonCodeId: reasons['RCV-PO'].id,
          remarks: 'Opening stock balance',
          userId: admin.id,
        },
      })
      await prisma.fifoLayer.create({
        data: {
          itemId: items[s.sku].id,
          locationId: locations[s.loc].id,
          refNumber,
          qtyReceived: s.qty,
          qtyRemaining: s.qty,
          unitCost: s.cost,
        },
      })
      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          userName: admin.name,
          action: 'POST',
          module: 'RECEIVING',
          entityType: 'StockLedger',
          description: `Opening stock: ${s.sku} qty ${s.qty} at ${s.loc} (${refNumber})`,
        },
      })
    }
    console.log('Opening stock ledger seeded')
  } else {
    console.log('Ledger already has data, skipping opening stock')
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
