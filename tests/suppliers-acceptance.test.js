/**
 * suppliers-acceptance.test.js
 *
 * Acceptance tests for Phase 11.2 — Supplier Management.
 *
 * Business rules verified:
 *   - Supplier codes auto-generate in SUP-000001 format (sequential, never reused).
 *   - Manual code override allowed, but must stay unique (409 on duplicate).
 *   - Required fields: Supplier Name, PIC Name, Phone. Lead Time >= 0.
 *   - Soft delete only — never a hard delete.
 *   - Delete is blocked (409 "Supplier is already used.") when referenced by Receiving.
 *   - Receiving only accepts ACTIVE suppliers; inactive suppliers are rejected.
 *   - Every mutation writes an Audit Trail entry (CREATE/UPDATE/DELETE_SUPPLIER...).
 *   - getSupplierStats feeds the dashboard KPIs.
 *   - getSupplierReport aggregates receiving totals per supplier.
 *   - Import: strict vs partial, server-side validation, audit IMPORT_SUPPLIER.
 *
 * Run: npx jest
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const XLSX = require('xlsx')
const {
  createSupplier,
  updateSupplier,
  setSupplierActive,
  deleteSupplier,
  listSuppliers,
  getSupplier,
  listActiveSuppliers,
  getSupplierStats,
  getSupplierReport,
  SupplierServiceError,
} = require('../lib/supplier-service')
const {
  parseSupplierWorkbook,
  dryRunSupplierImport,
  importSuppliers,
  SupplierImportError,
  SUPPLIER_IMPORT_MAX_ROWS,
} = require('../lib/supplier-import-service')
const { exportSuppliersToWorkbook } = require('../lib/supplier-export-service')
const { buildSupplierTemplateWorkbook } = require('../lib/supplier-template-service')
const { createReceivingDraft } = require('../lib/receiving-service')

jest.mock('../lib/audit', () => ({
  logAudit: jest.fn(),
}))
const { logAudit } = require('../lib/audit')

const suffix = () => global.seedKey
const supplierName = () => `Supplier ${suffix()}`

let s

beforeEach(async () => {
  logAudit.mockClear()
  s = await prisma.$transaction(async (tx) => {
    return seed(tx, global.seedKey, global)
  })
})

// ---------------------------------------------------------------------------
// 1. Code auto-generation
// ---------------------------------------------------------------------------
test('supplier: auto-generates sequential SUP-#### codes', async () => {
  const a = await createSupplier({ user: s.supervisor, body: { name: `${supplierName()} A`, picName: 'PIC A', phone: '0811-0001', isActive: true } })
  const b = await createSupplier({ user: s.supervisor, body: { name: `${supplierName()} B`, picName: 'PIC B', phone: '0811-0002', isActive: true } })

  expect(a.code).toMatch(/^SUP-\d{6}$/)
  expect(b.code).toMatch(/^SUP-\d{6}$/)
  expect(b.code).not.toBe(a.code)

  // Re-running never reuses a code that is still present in the DB.
  const codes = (await listSuppliers({})).data.filter((x) => x.name.includes(suffix())).map((x) => x.code)
  expect(new Set(codes).size).toBe(codes.length)
})

// ---------------------------------------------------------------------------
// 2. Manual override + uniqueness
// ---------------------------------------------------------------------------
test('supplier: manual code is honoured and duplicates are rejected', async () => {
  const manual = await createSupplier({
    user: s.supervisor,
    body: { code: `SUP-${suffix()}`, name: `${supplierName()} Manual`, picName: 'PIC', phone: '0811-0003', isActive: true },
  })
  expect(manual.code).toBe(`SUP-${suffix()}`)

  await expect(
    createSupplier({ user: s.supervisor, body: { code: `SUP-${suffix()}`, name: `${supplierName()} Dup`, picName: 'PIC', phone: '0811-0004', isActive: true } })
  ).rejects.toThrow(SupplierServiceError)

  await expect(
    createSupplier({ user: s.supervisor, body: { code: `SUP-${suffix()}`, name: `${supplierName()} Dup2`, picName: 'PIC', phone: '0811-0005', isActive: true } })
  ).rejects.toMatchObject({ status: 409 })
})

// ---------------------------------------------------------------------------
// 3. Validation
// ---------------------------------------------------------------------------
test('supplier: required fields and lead time rules are enforced', async () => {
  await expect(
    createSupplier({ user: s.supervisor, body: { name: '', picName: 'PIC', phone: '0811-0006' } })
  ).rejects.toThrow(/Supplier Name is required/)

  await expect(
    createSupplier({ user: s.supervisor, body: { name: `${supplierName()} X`, picName: '', phone: '0811-0007' } })
  ).rejects.toThrow(/PIC Name is required/)

  await expect(
    createSupplier({ user: s.supervisor, body: { name: `${supplierName()} X`, picName: 'PIC', phone: '' } })
  ).rejects.toThrow(/Phone is required/)

  await expect(
    createSupplier({ user: s.supervisor, body: { name: `${supplierName()} X`, picName: 'PIC', phone: '0811-0008', leadTimeDays: -1 } })
  ).rejects.toThrow(/Lead Time must be >= 0/)
})

// ---------------------------------------------------------------------------
// 4. Update + activate/deactivate
// ---------------------------------------------------------------------------
test('supplier: update and deactivate/activate round-trip', async () => {
  const sup = await createSupplier({ user: s.admin, body: { name: `${supplierName()} U`, picName: 'PIC U', phone: '0811-0010', city: 'Jakarta', isActive: true } })

  const updated = await updateSupplier({ user: s.admin, id: sup.id, body: { city: 'Bandung', leadTimeDays: 7 } })
  expect(updated.city).toBe('Bandung')
  expect(updated.leadTimeDays).toBe(7)
  expect(updated.name).toBe(`${supplierName()} U`)

  const deactivated = await setSupplierActive({ user: s.admin, id: sup.id, isActive: false })
  expect(deactivated.isActive).toBe(false)

  const listAfter = await listSuppliers({ status: 'inactive' })
  expect(listAfter.data.some((x) => x.id === sup.id)).toBe(true)

  const activeOnly = await listActiveSuppliers({})
  expect(activeOnly.some((x) => x.id === sup.id)).toBe(false)

  await setSupplierActive({ user: s.admin, id: sup.id, isActive: true })
  expect((await getSupplier(sup.id)).isActive).toBe(true)
})

// ---------------------------------------------------------------------------
// 5. Soft delete + referenced-supplier block
// ---------------------------------------------------------------------------
test('supplier: delete is soft and blocked once used on Receiving', async () => {
  const sup = await createSupplier({ user: s.admin, body: { name: `${supplierName()} D`, picName: 'PIC D', phone: '0811-0011', isActive: true } })

  const res = await deleteSupplier({ user: s.admin, id: sup.id })
  expect(res.deleted).toBe(true)
  expect(res.deactivated).toBe(true)
  expect((await getSupplier(sup.id)).isActive).toBe(false)

  // Re-activate so we can reference it, then verify delete is blocked.
  await setSupplierActive({ user: s.admin, id: sup.id, isActive: true })

  await createReceivingDraft({
    user: s.supervisor,
    body: {
      warehouseId: s.warehouse.id,
      supplierId: sup.id,
      lines: [{ itemId: s.itemA.id, expectedQty: 5, unitCost: 10 }],
    },
  })

  await expect(deleteSupplier({ user: s.admin, id: sup.id })).rejects.toMatchObject({ status: 409, message: 'Supplier is already used.' })
  // Row still exists (never hard-deleted).
  expect(await getSupplier(sup.id)).not.toBeNull()
})

// ---------------------------------------------------------------------------
// 6. Receiving only accepts ACTIVE suppliers
// ---------------------------------------------------------------------------
test('supplier: inactive supplier is rejected on Receiving', async () => {
  const inactive = await createSupplier({ user: s.admin, body: { name: `${supplierName()} I`, picName: 'PIC I', phone: '0811-0012', isActive: false } })

  await expect(
    createReceivingDraft({
      user: s.supervisor,
      body: {
        warehouseId: s.warehouse.id,
        supplierId: inactive.id,
        lines: [{ itemId: s.itemA.id, expectedQty: 5, unitCost: 10 }],
      },
    })
  ).rejects.toThrow(/Supplier is inactive/)

  const active = await createSupplier({ user: s.admin, body: { name: `${supplierName()} A2`, picName: 'PIC A2', phone: '0811-0013', isActive: true } })
  const receiving = await createReceivingDraft({
    user: s.supervisor,
    body: { warehouseId: s.warehouse.id, supplierId: active.id, invoiceNumber: 'INV-001', vehicleNumber: 'B 1234 CD', driverName: 'Budi', lines: [{ itemId: s.itemA.id, expectedQty: 5, unitCost: 10 }] },
  })
  expect(receiving.supplierId).toBe(active.id)
  expect(receiving.supplier).toBe(active.name)
  expect(receiving.invoiceNumber).toBe('INV-001')
  expect(receiving.vehicleNumber).toBe('B 1234 CD')
  expect(receiving.driverName).toBe('Budi')
})

// ---------------------------------------------------------------------------
// 7. Audit trail
// ---------------------------------------------------------------------------
test('supplier: all mutations write an audit trail', async () => {
  const sup = await createSupplier({ user: s.supervisor, body: { name: `${supplierName()} A`, picName: 'PIC A', phone: '0811-0014', isActive: true } })
  await updateSupplier({ user: s.supervisor, id: sup.id, body: { city: 'Surabaya' } })
  await setSupplierActive({ user: s.supervisor, id: sup.id, isActive: false })
  await deleteSupplier({ user: s.supervisor, id: sup.id })

  const actions = logAudit.mock.calls.map((c) => c[0].action)
  expect(actions).toEqual(expect.arrayContaining(['CREATE_SUPPLIER', 'UPDATE_SUPPLIER', 'DEACTIVATE_SUPPLIER', 'DELETE_SUPPLIER']))
  expect(logAudit.mock.calls.every((c) => c[0].module === 'SUPPLIER')).toBe(true)
})

// ---------------------------------------------------------------------------
// 8. Dashboard KPI stats
// ---------------------------------------------------------------------------
test('supplier: getSupplierStats aggregates total/active/inactive', async () => {
  await createSupplier({ user: s.admin, body: { name: `${supplierName()} S1`, picName: 'P', phone: '0811-0020', isActive: true } })
  await createSupplier({ user: s.admin, body: { name: `${supplierName()} S2`, picName: 'P', phone: '0811-0021', isActive: false } })

  const stats = await getSupplierStats()
  expect(stats.total).toBeGreaterThanOrEqual(2)
  expect(stats.active).toBeGreaterThanOrEqual(1)
  expect(stats.inactive).toBeGreaterThanOrEqual(1)
  expect(stats.recentlyAdded).toBeGreaterThanOrEqual(2)
})

// ---------------------------------------------------------------------------
// 9. Supplier report aggregation
// ---------------------------------------------------------------------------
test('supplier: report aggregates receiving totals per supplier', async () => {
  const sup = await createSupplier({ user: s.admin, body: { name: `${supplierName()} R`, picName: 'PIC R', phone: '0811-0022', isActive: true } })
  await createReceivingDraft({
    user: s.supervisor,
    body: { warehouseId: s.warehouse.id, supplierId: sup.id, lines: [{ itemId: s.itemA.id, expectedQty: 10, unitCost: 10 }] },
  })

  const report = await getSupplierReport({})
  const row = report.data.find((r) => r.id === sup.id)
  expect(row).toBeDefined()
  expect(row.totalReceivings).toBe(1)
  expect(row.averageLeadTimeDays).toBe(sup.leadTimeDays)
  expect(row.status).toBe('Active')
})

// ---------------------------------------------------------------------------
// 10. Import — dry-run validation
// ---------------------------------------------------------------------------
const SUPPLIER_HEADERS = ['Supplier Code', 'Supplier Name', 'PIC', 'Phone', 'Email', 'Address', 'City', 'Province', 'Postal Code', 'Lead Time', 'NPWP', 'Website', 'Status', 'Notes']

function makeWorkbook(rows) {
  const keyMap = {
    'Supplier Code': 'code',
    'Supplier Name': 'name',
    PIC: 'picName',
    Phone: 'phone',
    Email: 'email',
    Address: 'address',
    City: 'city',
    Province: 'province',
    'Postal Code': 'postalCode',
    'Lead Time': 'leadTimeDays',
    NPWP: 'taxNumber',
    Website: 'website',
    Status: 'status',
    Notes: 'notes',
  }
  const data = rows.map((r) => SUPPLIER_HEADERS.map((h) => r[keyMap[h]] ?? ''))
  const ws = XLSX.utils.aoa_to_sheet([SUPPLIER_HEADERS, ...data])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Suppliers')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// Import service rows are pre-normalized (workbook headers already mapped by parseSupplierWorkbook).
function srow(overrides = {}) {
  const key = suffix()
  return {
    code: `SUP-IMP-${key}`,
    name: `Imported ${key}`,
    picName: 'PIC Import',
    phone: `0811-${key.slice(0, 4)}`,
    leadTimeDays: 3,
    status: 'Active',
    ...overrides,
  }
}

test('import: parseSupplierWorkbook maps template headers to normalized fields', () => {
  const buffer = makeWorkbook([
    srow(),
    srow({ code: '' }),
  ])
  const parsed = parseSupplierWorkbook(buffer)
  expect(parsed.length).toBe(2)
  expect(parsed[0]).toMatchObject({
    code: `SUP-IMP-${suffix()}`,
    name: `Imported ${suffix()}`,
    picName: 'PIC Import',
    phone: `0811-${suffix().slice(0, 4)}`,
    leadTimeDays: '3',
    status: 'Active',
  })
})

test('import: dry-run catches missing/invalid fields and duplicate codes', async () => {
  const rows = [
    srow(),
    srow({ code: '', name: 'No Code Import' }),
    srow({ name: '' }),
    srow({ picName: '' }),
    srow({ phone: '' }),
    srow({ leadTimeDays: -2 }),
    srow({ status: 'Maybe' }),
    srow(), // duplicate code within file
  ]
  const summary = await dryRunSupplierImport(rows)
  expect(summary.totalRows).toBe(rows.length)
  expect(summary.validCount).toBe(2)
  expect(summary.invalidCount).toBe(rows.length - 2)
})

test('import: strict mode rolls back entirely on any invalid row', async () => {
  const rows = [
    srow({ name: 'Strict OK' }),
    srow({ name: 'Strict Bad', picName: '' }),
  ]
  const before = await prisma.supplier.count({ where: { name: { contains: suffix() } } })
  await expect(
    importSuppliers({ user: s.admin, fileName: 'sup.xlsx', rows, mode: 'strict' })
  ).rejects.toThrow(SupplierImportError)
  const after = await prisma.supplier.count({ where: { name: { contains: suffix() } } })
  expect(after).toBe(before)
})

test('import: partial mode imports valid rows and skips invalid ones', async () => {
  const rows = [
    srow({ name: 'Partial Good' }),
    srow({ name: 'Partial Bad', phone: '' }),
  ]
  const result = await importSuppliers({ user: s.admin, fileName: 'sup.xlsx', rows, mode: 'partial' })
  expect(result.imported).toBe(1)
  expect(result.skipped).toBe(1)
  expect(result.errors.length).toBe(1)
})

// ---------------------------------------------------------------------------
// 11. Export + template
// ---------------------------------------------------------------------------
test('export: produces a real xlsx buffer', async () => {
  const sup = await createSupplier({ user: s.admin, body: { name: `${supplierName()} E`, picName: 'PIC E', phone: '0811-0030', isActive: true } })
  const { buffer } = await exportSuppliersToWorkbook({ ids: [sup.id] }, s.admin)
  expect(buffer).toBeInstanceOf(Buffer)
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  expect(rows.some((r) => r['Supplier Code'] === sup.code)).toBe(true)
})

test('template: workbook has Suppliers + Instructions sheets', async () => {
  const { buffer } = await buildSupplierTemplateWorkbook(s.admin)
  const wb = XLSX.read(buffer, { type: 'buffer' })
  expect(wb.SheetNames).toEqual(expect.arrayContaining(['Suppliers', 'Instructions']))
})
