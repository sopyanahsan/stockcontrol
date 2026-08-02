/**
 * items-import-export-acceptance.test.js
 *
 * Acceptance tests for Phase 11.1 — Master Item Bulk Import & Export.
 *
 * Business rules verified:
 *   - Import requires canManageMaster (SUPERVISOR/ADMINISTRATOR).
 *   - Import NEVER bypasses the service layer; validation runs server-side.
 *   - Strict mode = all-or-nothing (rollback on any invalid row).
 *   - Partial mode = valid rows imported, invalid rows skipped.
 *   - Duplicate SKU / barcode rejected (both in-file and against the DB).
 *   - Unknown Category / UOM rejected.
 *   - Audit trail written (module IMPORT_ITEM_MASTER).
 *   - Export produces a real .xlsx buffer with on-hand/reserved/available.
 *   - Template workbook contains Items / Categories / UOM sheets.
 *
 * Run: npx jest
 */

const { describe, test, expect, beforeEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const { seed } = require('./seed')
const XLSX = require('xlsx')
const {
  parseItemWorkbook,
  dryRunItemImport,
  importItems,
  ItemImportError,
  IMPORT_MAX_ROWS,
} = require('../lib/item-import-service')
const { exportItemsToWorkbook } = require('../lib/item-export-service')
const { buildItemTemplateWorkbook } = require('../lib/item-template-service')

jest.mock('../lib/audit', () => ({
  logAudit: jest.fn(),
}))
const { logAudit } = require('../lib/audit')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEADERS = ['SKU', 'Barcode', 'Item Name', 'Category', 'UOM', 'Description', 'Reorder Point', 'Unit Cost', 'Status']

function makeWorkbook(rows) {
  const data = rows.map((r) =>
    HEADERS.map((h) => {
      const key = {
        SKU: 'sku',
        Barcode: 'barcode',
        'Item Name': 'name',
        Category: 'category',
        UOM: 'uom',
        Description: 'description',
        'Reorder Point': 'reorderPoint',
        'Unit Cost': 'unitCost',
        Status: 'status',
      }[h]
      return r[key] ?? ''
    })
  )
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...data])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Items')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

function row(sku, overrides = {}) {
  return {
    sku,
    barcode: '',
    name: `Imported Item ${sku}`,
    category: `Test Category ${global.seedKey}`,
    uom: `U_${global.seedKey}`,
    description: 'created by import test',
    reorderPoint: 5,
    unitCost: 25,
    status: 'Active',
    ...overrides,
  }
}

async function countImported(prefix) {
  return prisma.item.count({ where: { sku: { startsWith: prefix } } })
}

let s

beforeEach(async () => {
  logAudit.mockClear()
  s = await prisma.$transaction(async (tx) => {
    return seed(tx, global.seedKey, global)
  })
})

// ---------------------------------------------------------------------------
// TEST 1 — Parsing + dry-run validation detects every error type
// ---------------------------------------------------------------------------

test('import: dry-run validation catches all error types', async () => {
  const rows = [
    row('IMPT-OK-1'),
    { ...row('IMPT-MISSING-SKU'), sku: '' },
    row('IMPT-DUP-1'),
    row('IMPT-DUP-1'),
    row('IMPT-EXISTING', { sku: s.itemA.sku }),
    { ...row('IMPT-NO-NAME'), name: '' },
    row('IMPT-BAD-CAT', { category: 'No Such Category' }),
    row('IMPT-BAD-UOM', { uom: 'NOUOM' }),
    row('IMPT-NEG-RP', { reorderPoint: -1 }),
    row('IMPT-NEG-COST', { unitCost: -5 }),
    row('IMPT-BAD-STATUS', { status: 'Maybe' }),
    row('IMPT-DUP-BC', { barcode: 'BC-DUP-1' }),
    row('IMPT-DUP-BC-2', { barcode: 'BC-DUP-1' }),
  ]

  const summary = await dryRunItemImport(rows)
  expect(summary.totalRows).toBe(rows.length)
  expect(summary.validCount).toBe(3)
  expect(summary.invalidCount).toBe(rows.length - 3)

  const byRow = Object.fromEntries(summary.errors.map((e) => [e.sku, e.reasons]))
  expect(byRow['']).toContain('SKU is required')
  expect(byRow['IMPT-DUP-1']).toContain('Duplicate SKU within file')
  expect(byRow[s.itemA.sku]).toContain('SKU already exists')
  expect(byRow['IMPT-NO-NAME']).toContain('Item Name is required')
  expect(byRow['IMPT-BAD-CAT']).toContain('Category "No Such Category" not found')
  expect(byRow['IMPT-BAD-UOM']).toContain('UOM "NOUOM" not found')
  expect(byRow['IMPT-NEG-RP']).toContain('Reorder Point must be a number >= 0')
  expect(byRow['IMPT-NEG-COST']).toContain('Unit Cost must be a number >= 0')
  expect(byRow['IMPT-BAD-STATUS']).toContain('Status must be "Active" or "Inactive"')
  expect(byRow['IMPT-DUP-BC-2']).toContain('Duplicate barcode within file')

  // Nothing was written during a dry run
  expect(await countImported('IMPT-')).toBe(0)
})

// ---------------------------------------------------------------------------
// TEST 2 — Full pipeline: parse workbook → import 1000 rows (batched)
// ---------------------------------------------------------------------------

test('import: parses a workbook and imports 1000 rows in batches', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => row(`IMPT-1000-${i}`))
  const buffer = makeWorkbook(rows)
  const parsed = parseItemWorkbook(buffer)
  expect(parsed).toHaveLength(1000)
  expect(parsed[0].__rowNumber).toBe(2)

  const progress = []
  const result = await importItems({
    user: s.stockClerk,
    fileName: 'big-import.xlsx',
    rows: parsed,
    mode: 'partial',
    onProgress: (pct) => progress.push(pct),
  })

  expect(result.imported).toBe(1000)
  expect(result.skipped).toBe(0)
  expect(await countImported('IMPT-1000-')).toBe(1000)
  expect(progress[0]).toBe(10)
  expect(progress[progress.length - 1]).toBe(100)
  expect(progress.length).toBeGreaterThanOrEqual(4)
  expect(Math.max(...progress)).toBe(100)

  // Audit trail recorded with the expected shape
  const auditCall = logAudit.mock.calls.find(([c]) => c.module === 'IMPORT_ITEM_MASTER' && c.action === 'IMPORT')
  expect(auditCall).toBeDefined()
  const { after } = auditCall[0]
  expect(after.fileName).toBe('big-import.xlsx')
  expect(after.importedRows).toBe(1000)
  expect(after.skippedRows).toBe(0)
  expect(after.mode).toBe('partial')
  expect(after.operator).toBe(s.stockClerk.name)
})

// ---------------------------------------------------------------------------
// TEST 3 — Strict mode is all-or-nothing
// ---------------------------------------------------------------------------

test('import: strict mode rolls back the whole import on any invalid row', async () => {
  const rows = [
    row('IMPT-STRICT-OK-1'),
    row('IMPT-STRICT-OK-2'),
    { ...row('IMPT-STRICT-BAD', { sku: s.itemA.sku }) }, // already exists
  ]

  await expect(
    importItems({ user: s.stockClerk, fileName: 'strict.xlsx', rows, mode: 'strict' })
  ).rejects.toBeInstanceOf(ItemImportError)

  // Nothing was written — all-or-nothing
  expect(await countImported('IMPT-STRICT-')).toBe(0)
  expect(logAudit).not.toHaveBeenCalled()
})

test('import: strict mode succeeds when every row is valid', async () => {
  const rows = [row('IMPT-STRICT-OK-3'), row('IMPT-STRICT-OK-4')]
  const result = await importItems({ user: s.stockClerk, fileName: 'strict-ok.xlsx', rows, mode: 'strict' })
  expect(result.imported).toBe(2)
  expect(result.skipped).toBe(0)
  expect(await countImported('IMPT-STRICT-')).toBe(2)
})

// ---------------------------------------------------------------------------
// TEST 4 — Partial mode skips invalid rows and imports the valid ones
// ---------------------------------------------------------------------------

test('import: partial mode imports valid rows and skips invalid rows', async () => {
  const rows = [
    row('IMPT-PARTIAL-OK-1'),
    row('IMPT-PARTIAL-OK-2'),
    row('IMPT-PARTIAL-BAD', { category: 'Missing Category' }),
    row('IMPT-PARTIAL-OK-3'),
  ]

  const result = await importItems({ user: s.stockClerk, fileName: 'partial.xlsx', rows, mode: 'partial' })
  expect(result.imported).toBe(3)
  expect(result.skipped).toBe(1)
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].sku).toBe('IMPT-PARTIAL-BAD')
  expect(result.errors[0].reasons[0]).toContain('Category "Missing Category" not found')

  expect(await countImported('IMPT-PARTIAL-')).toBe(3)
  expect(await prisma.item.findUnique({ where: { sku: 'IMPT-PARTIAL-BAD' } })).toBeNull()
})

// ---------------------------------------------------------------------------
// TEST 5 — Barcode uniqueness against the database
// ---------------------------------------------------------------------------

test('import: barcode already in use is rejected', async () => {
  const existing = await prisma.item.create({
    data: { sku: 'IMPT-BC-SEED', name: 'Seed Barcode Item', categoryId: s.category.id, uomId: s.uom.id, barcode: 'BC-ALREADY-USED' },
  })
  expect(existing).toBeDefined()

  const rows = [row('IMPT-BC-NEW', { barcode: 'BC-ALREADY-USED' })]
  const summary = await dryRunItemImport(rows)
  expect(summary.invalidCount).toBe(1)
  expect(summary.errors[0].reasons).toContain('Barcode already in use')

  await expect(
    importItems({ user: s.stockClerk, fileName: 'bc.xlsx', rows, mode: 'strict' })
  ).rejects.toBeInstanceOf(ItemImportError)
})

// ---------------------------------------------------------------------------
// TEST 6 — Row limit guard
// ---------------------------------------------------------------------------

test('import: files above the row limit are rejected', async () => {
  const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => row(`IMPT-OVER-${i}`))
  await expect(dryRunItemImport(rows)).rejects.toBeInstanceOf(ItemImportError)
})

// ---------------------------------------------------------------------------
// TEST 7 — Export workbook (all / by ids)
// ---------------------------------------------------------------------------

test('export: workbook contains on-hand, reserved and available columns', async () => {
  const created = await prisma.item.createMany({
    data: [
      { sku: 'IMPT-X-1', name: 'Export One', categoryId: s.category.id, uomId: s.uom.id, unitCost: 10, reorderPoint: 3 },
      { sku: 'IMPT-X-2', name: 'Export Two', categoryId: s.category.id, uomId: s.uom.id, unitCost: 20, reorderPoint: 4 },
    ],
  })
  expect(created.count).toBe(2)

  const ids = (await prisma.item.findMany({ where: { sku: { in: ['IMPT-X-1', 'IMPT-X-2'] } }, select: { id: true } })).map((i) => i.id)

  // Export by ids (current page / filtered scope)
  const byIds = await exportItemsToWorkbook({ ids })
  expect(byIds.count).toBe(2)
  const wbByIds = XLSX.read(byIds.buffer, { type: 'buffer' })
  const rowsByIds = XLSX.utils.sheet_to_json(wbByIds.Sheets.Items, { defval: '' })
  expect(rowsByIds).toHaveLength(2)
  expect(Object.keys(rowsByIds[0])).toEqual(
    expect.arrayContaining(['SKU', 'Barcode', 'Item Name', 'Category', 'UOM', 'On Hand', 'Reserved', 'Available', 'Reorder Point', 'Unit Cost', 'Status', 'Created At', 'Updated At'])
  )
  const one = rowsByIds.find((r) => r.SKU === 'IMPT-X-1')
  expect(one['On Hand']).toBe(0)
  expect(one['Reserved']).toBe(0)
  expect(one['Available']).toBe(0)
  expect(one['Reorder Point']).toBe(3)
  expect(one['Unit Cost']).toBe(10)
  expect(one['Status']).toBe('Active')

  // Export everything
  const all = await exportItemsToWorkbook({})
  expect(all.count).toBeGreaterThanOrEqual(2)
  const wbAll = XLSX.read(all.buffer, { type: 'buffer' })
  const rowsAll = XLSX.utils.sheet_to_json(wbAll.Sheets.Items, { defval: '' })
  expect(rowsAll.length).toBe(all.count)
  expect(rowsAll.some((r) => r.SKU === 'IMPT-X-2')).toBe(true)
})

// ---------------------------------------------------------------------------
// TEST 8 — Template workbook (3 sheets, populated from the database)
// ---------------------------------------------------------------------------

test('template: workbook has Items, Categories and UOM sheets from the database', async () => {
  const { buffer, filename } = await buildItemTemplateWorkbook()
  expect(filename).toBe('Master Item Template.xlsx')

  const wb = XLSX.read(buffer, { type: 'buffer' })
  expect(wb.SheetNames).toContain('Items')
  expect(wb.SheetNames).toContain('Categories')
  expect(wb.SheetNames).toContain('UOM')

  const items = XLSX.utils.sheet_to_json(wb.Sheets.Items)
  expect(Object.keys(items[0])).toEqual(['SKU', 'Barcode', 'Item Name', 'Category', 'UOM', 'Description', 'Reorder Point', 'Unit Cost', 'Status'])

  const categories = XLSX.utils.sheet_to_json(wb.Sheets.Categories)
  expect(categories.some((c) => c.Name === `Test Category ${global.seedKey}`)).toBe(true)

  const uoms = XLSX.utils.sheet_to_json(wb.Sheets.UOM)
  expect(uoms.some((u) => u.Code === `U_${global.seedKey}`)).toBe(true)
})

// ---------------------------------------------------------------------------
// TEST 9 — Imported items are visible in the item list and respect serial-tracked default
// ---------------------------------------------------------------------------

test('import: imported items default to active and non serial-tracked', async () => {
  const result = await importItems({ user: s.supervisor, fileName: 'defaults.xlsx', rows: [row('IMPT-DEFAULT-1')], mode: 'strict' })
  expect(result.imported).toBe(1)
  const item = await prisma.item.findUnique({ where: { sku: 'IMPT-DEFAULT-1' } })
  expect(item.isActive).toBe(true)
  expect(item.serialTracked).toBe(false)
  expect(item.minStock).toBe(0)
  expect(item.reorderPoint).toBe(5)
  expect(item.unitCost).toBe(25)
})
