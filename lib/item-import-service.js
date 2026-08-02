import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export const IMPORT_MAX_ROWS = 10000
const IMPORT_BATCH_SIZE = 500

const IMPORT_HEADERS = [
  'SKU',
  'Barcode',
  'Item Name',
  'Category',
  'UOM',
  'Description',
  'Reorder Point',
  'Unit Cost',
  'Status',
]

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// Normalise an arbitrary spreadsheet header into a known import field.
function normalizeHeader(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
  const map = {
    sku: 'sku',
    barcode: 'barcode',
    'item name': 'name',
    name: 'name',
    'item': 'name',
    category: 'category',
    uom: 'uom',
    'unit of measure': 'uom',
    'unit': 'uom',
    description: 'description',
    'reorder point': 'reorderPoint',
    'reorder': 'reorderPoint',
    'unit cost': 'unitCost',
    cost: 'unitCost',
    status: 'status',
  }
  return map[v] || null
}

export function parseItemWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('The file does not contain any worksheet')
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!aoa || aoa.length < 2) throw new Error('The file does not contain any data rows')

  const headerRow = aoa[0]
  const fields = headerRow.map(normalizeHeader)

  const rows = []
  for (let i = 1; i < aoa.length; i++) {
    const line = aoa[i]
    if (!line || line.every((cell) => String(cell ?? '').trim() === '')) continue
    const row = {}
    fields.forEach((field, idx) => {
      if (!field) return
      row[field] = String(line[idx] ?? '').trim()
    })
    row.__rowNumber = i + 1 // 1-based Excel row number (header = row 1)
    rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function cleanNumber(raw) {
  if (raw === undefined || raw === null) return null
  const v = String(raw).replace(/[, ]/g, '')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

// Validate all rows against the reference maps. Returns the resolved rows.
// ctx = { existingSkus:Set, existingBarcodes:Set, categoryIdByName:Map, uomIdByCode:Map }
export function validateImportRows(rows, ctx) {
  const seenSkus = new Set()
  const seenBarcodes = new Set()
  const normalized = []

  for (const raw of rows) {
    const row = { ...raw }
    const errors = []
    const { sku, barcode, name, category, uom } = row

    if (!sku) {
      errors.push('SKU is required')
    } else if (seenSkus.has(sku)) {
      errors.push('Duplicate SKU within file')
    } else if (ctx.existingSkus.has(sku)) {
      errors.push('SKU already exists')
    } else {
      seenSkus.add(sku)
    }

    if (barcode) {
      if (seenBarcodes.has(barcode)) errors.push('Duplicate barcode within file')
      else if (ctx.existingBarcodes.has(barcode)) errors.push('Barcode already in use')
      else seenBarcodes.add(barcode)
    }

    if (!name) errors.push('Item Name is required')

    if (!category) {
      errors.push('Category is required')
    } else {
      const key = String(category).trim().toLowerCase()
      const categoryId = ctx.categoryIdByName.get(key)
      if (!categoryId) errors.push(`Category "${category}" not found`)
      else row.categoryId = categoryId
    }

    if (!uom) {
      errors.push('UOM is required')
    } else {
      const key = String(uom).trim().toUpperCase()
      const uomId = ctx.uomIdByCode.get(key)
      if (!uomId) errors.push(`UOM "${uom}" not found`)
      else row.uomId = uomId
    }

    const reorderPoint = cleanNumber(row.reorderPoint)
    if (reorderPoint === null) row.reorderPoint = 0
    else if (Number.isNaN(reorderPoint) || reorderPoint < 0) errors.push('Reorder Point must be a number >= 0')
    else row.reorderPoint = reorderPoint

    const unitCost = cleanNumber(row.unitCost)
    if (unitCost === null) row.unitCost = 0
    else if (Number.isNaN(unitCost) || unitCost < 0) errors.push('Unit Cost must be a number >= 0')
    else row.unitCost = unitCost

    const status = row.status ? String(row.status).trim().toLowerCase() : 'active'
    if (!['active', 'inactive'].includes(status)) {
      errors.push('Status must be "Active" or "Inactive"')
    } else {
      row.isActive = status === 'active'
    }

    if (errors.length) {
      row.__errors = errors
    }
    normalized.push(row)
  }
  return normalized
}

async function loadImportContext() {
  const [existingItems, categories, uoms] = await Promise.all([
    prisma.item.findMany({ select: { sku: true, barcode: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.uom.findMany({ select: { id: true, code: true } }),
  ])
  return {
    existingSkus: new Set(existingItems.map((i) => i.sku)),
    existingBarcodes: new Set(existingItems.map((i) => i.barcode).filter(Boolean)),
    categoryIdByName: new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id])),
    uomIdByCode: new Map(uoms.map((u) => [u.code.trim().toUpperCase(), u.id])),
  }
}

function toRowPayload(row) {
  return {
    sku: row.sku,
    name: row.name,
    barcode: row.barcode || row.sku,
    description: row.description || null,
    categoryId: row.categoryId,
    uomId: row.uomId,
    minStock: 0,
    maxStock: 0,
    reorderPoint: row.reorderPoint ?? 0,
    unitCost: row.unitCost ?? 0,
    isActive: row.isActive ?? true,
    serialTracked: false,
  }
}

export class ItemImportError extends Error {
  constructor(message, errors) {
    super(message)
    this.name = 'ItemImportError'
    this.errors = errors || []
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Run a validation-only pass (dry run). Returns the summary, imports nothing.
export async function dryRunItemImport(rows) {
  if (!rows.length) throw new ItemImportError('The file does not contain any data rows')
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new ItemImportError(`File exceeds the ${IMPORT_MAX_ROWS.toLocaleString()} row limit`)
  }
  const ctx = await loadImportContext()
  const normalized = validateImportRows(rows, ctx)
  const valid = normalized.filter((r) => !r.__errors)
  const invalid = normalized.filter((r) => r.__errors)
  return {
    totalRows: normalized.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    errors: invalid.map((r) => ({
      row: r.__rowNumber,
      sku: r.sku || '',
      reasons: r.__errors,
    })),
  }
}

// Import the rows. mode = 'strict' (all-or-nothing) | 'partial' (skip invalid).
// onProgress(pct) is invoked with 10/20/.../100 so the UI can stream progress.
export async function importItems({ user, fileName, rows, mode = 'strict', onProgress }) {
  if (!rows.length) throw new ItemImportError('The file does not contain any data rows')
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new ItemImportError(`File exceeds the ${IMPORT_MAX_ROWS.toLocaleString()} row limit`)
  }

  const ctx = await loadImportContext()
  const normalized = validateImportRows(rows, ctx)
  const valid = normalized.filter((r) => !r.__errors)
  const invalid = normalized.filter((r) => r.__errors)

  onProgress && onProgress(10)

  if (mode === 'strict' && invalid.length) {
    throw new ItemImportError('Import aborted — some rows are invalid', invalid.map((r) => ({
      row: r.__rowNumber,
      sku: r.sku || '',
      reasons: r.__errors,
    })))
  }

  const payloads = valid.map(toRowPayload)
  let imported = 0

  const create = async (tx) => {
    for (let i = 0; i < payloads.length; i += IMPORT_BATCH_SIZE) {
      const chunk = payloads.slice(i, i + IMPORT_BATCH_SIZE)
      await tx.item.createMany({ data: chunk })
      imported = Math.min(i + chunk.length, payloads.length)
      const pct = Math.round(10 + (imported / Math.max(payloads.length, 1)) * 85)
      onProgress && onProgress(Math.max(10, Math.min(95, pct)))
    }
  }

  if (mode === 'strict') {
    await prisma.$transaction(async (tx) => {
      await create(tx)
    })
  } else {
    await create(prisma)
  }

  const skipped = invalid.length
  await logAudit({
    user,
    action: 'IMPORT',
    module: 'IMPORT_ITEM_MASTER',
    entityType: 'Item',
    entityId: null,
    description: `Imported ${imported} item(s) from ${fileName} (${mode} mode, ${skipped} skipped)`,
    after: {
      fileName,
      importedRows: imported,
      skippedRows: skipped,
      totalRows: normalized.length,
      mode,
      operator: user.name,
    },
  })

  onProgress && onProgress(100)

  return {
    imported,
    skipped,
    totalRows: normalized.length,
    mode,
    errors: invalid.map((r) => ({
      row: r.__rowNumber,
      sku: r.sku || '',
      reasons: r.__errors,
    })),
  }
}
