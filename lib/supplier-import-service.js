import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextSupplierCode } from '@/lib/supplier-service'

export const SUPPLIER_IMPORT_MAX_ROWS = 5000
export const SUPPLIER_IMPORT_BATCH_SIZE = 500

const SUPPLIER_IMPORT_HEADERS = [
  'Supplier Code',
  'Supplier Name',
  'PIC',
  'Phone',
  'Email',
  'Address',
  'City',
  'Province',
  'Postal Code',
  'Lead Time',
  'NPWP',
  'Website',
  'Status',
  'Notes',
]

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function normalizeHeader(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
  const map = {
    'supplier code': 'code',
    code: 'code',
    'supplier name': 'name',
    name: 'name',
    supplier: 'name',
    pic: 'picName',
    'pic name': 'picName',
    'contact person': 'picName',
    'contact': 'picName',
    phone: 'phone',
    telephone: 'phone',
    'phone number': 'phone',
    email: 'email',
    address: 'address',
    city: 'city',
    province: 'province',
    'postal code': 'postalCode',
    'zip': 'postalCode',
    'lead time': 'leadTimeDays',
    'lead time days': 'leadTimeDays',
    npwp: 'taxNumber',
    'tax number': 'taxNumber',
    'tax id': 'taxNumber',
    website: 'website',
    'web': 'website',
    status: 'status',
    notes: 'notes',
    note: 'notes',
  }
  return map[v] || null
}

export function parseSupplierWorkbook(buffer) {
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
    row.__rowNumber = i + 1
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

// ctx = { existingCodes:Set, existingNames:Set }
export function validateSupplierImportRows(rows, ctx) {
  const seenCodes = new Set()
  const seenNames = new Set()
  const normalized = []

  for (const raw of rows) {
    const row = { ...raw }
    const errors = []
    const { code, name, phone, status } = row

    if (code) {
      const normCode = String(code).trim().toUpperCase()
      if (seenCodes.has(normCode)) errors.push('Duplicate Supplier Code within file')
      else if (ctx.existingCodes.has(normCode)) errors.push('Supplier Code already exists')
      else seenCodes.add(normCode)
      row.code = normCode
    }

    if (!name) {
      errors.push('Supplier Name is required')
    } else if (seenNames.has(String(name).trim().toLowerCase())) {
      errors.push('Duplicate Supplier Name within file')
    } else {
      seenNames.add(String(name).trim().toLowerCase())
    }

    if (!String(row.picName || '').trim()) errors.push('PIC Name is required')

    if (!phone) errors.push('Phone is required')

    const leadTime = cleanNumber(row.leadTimeDays)
    if (leadTime === null || leadTime === undefined) row.leadTimeDays = 0
    else if (Number.isNaN(leadTime) || leadTime < 0) errors.push('Lead Time must be a number >= 0')
    else row.leadTimeDays = Math.round(leadTime)

    const statusValue = status ? String(status).trim().toLowerCase() : 'active'
    if (!['active', 'inactive'].includes(statusValue)) {
      errors.push('Status must be "Active" or "Inactive"')
    } else {
      row.isActive = statusValue === 'active'
    }

    if (errors.length) row.__errors = errors
    normalized.push(row)
  }
  return normalized
}

async function loadSupplierImportContext() {
  const existing = await prisma.supplier.findMany({ select: { code: true, name: true } })
  return {
    existingCodes: new Set(existing.map((s) => s.code)),
    existingNames: new Set(existing.map((s) => s.name.trim().toLowerCase())),
  }
}

function toSupplierPayload(row) {
  return {
    code: row.code || null, // auto-generated when null
    name: String(row.name).trim(),
    picName: String(row.picName || '').trim(),
    phone: String(row.phone).trim(),
    email: row.email || null,
    address: row.address || null,
    city: row.city || null,
    province: row.province || null,
    postalCode: row.postalCode || null,
    leadTimeDays: row.leadTimeDays ?? 0,
    taxNumber: row.taxNumber || null,
    website: row.website || null,
    notes: row.notes || null,
    isActive: row.isActive ?? true,
  }
}

export class SupplierImportError extends Error {
  constructor(message, errors) {
    super(message)
    this.name = 'SupplierImportError'
    this.errors = errors || []
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function dryRunSupplierImport(rows) {
  if (!rows.length) throw new SupplierImportError('The file does not contain any data rows')
  if (rows.length > SUPPLIER_IMPORT_MAX_ROWS) {
    throw new SupplierImportError(`File exceeds the ${SUPPLIER_IMPORT_MAX_ROWS.toLocaleString()} row limit`)
  }
  const ctx = await loadSupplierImportContext()
  const normalized = validateSupplierImportRows(rows, ctx)
  const valid = normalized.filter((r) => !r.__errors)
  const invalid = normalized.filter((r) => r.__errors)
  return {
    totalRows: normalized.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    errors: invalid.map((r) => ({
      row: r.__rowNumber,
      supplierCode: r.code || '',
      supplierName: r.name || '',
      reasons: r.__errors,
    })),
  }
}

export async function importSuppliers({ user, fileName, rows, mode = 'strict', onProgress }) {
  if (!rows.length) throw new SupplierImportError('The file does not contain any data rows')
  if (rows.length > SUPPLIER_IMPORT_MAX_ROWS) {
    throw new SupplierImportError(`File exceeds the ${SUPPLIER_IMPORT_MAX_ROWS.toLocaleString()} row limit`)
  }

  const ctx = await loadSupplierImportContext()
  const normalized = validateSupplierImportRows(rows, ctx)
  const valid = normalized.filter((r) => !r.__errors)
  const invalid = normalized.filter((r) => r.__errors)

  onProgress && onProgress(10)

  if (mode === 'strict' && invalid.length) {
    throw new SupplierImportError('Import aborted — some rows are invalid', invalid.map((r) => ({
      row: r.__rowNumber,
      supplierCode: r.code || '',
      supplierName: r.name || '',
      reasons: r.__errors,
    })))
  }

  const payloads = valid.map(toSupplierPayload)
  let imported = 0

  const create = async (tx) => {
    for (let i = 0; i < payloads.length; i += SUPPLIER_IMPORT_BATCH_SIZE) {
      const chunk = payloads.slice(i, i + SUPPLIER_IMPORT_BATCH_SIZE)
      const rowsToCreate = []
      for (const p of chunk) {
        const code = p.code || (await nextSupplierCode(tx))
        rowsToCreate.push({ ...p, code })
      }
      if (rowsToCreate.length) await tx.supplier.createMany({ data: rowsToCreate })
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
    action: 'IMPORT_SUPPLIER',
    module: 'SUPPLIER',
    entityType: 'Supplier',
    entityId: null,
    description: `Imported ${imported} supplier(s) from ${fileName} (${mode} mode, ${skipped} skipped)`,
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
      supplierCode: r.code || '',
      supplierName: r.name || '',
      reasons: r.__errors,
    })),
  }
}
