import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

// ============================================================
// Supplier Service
// ------------------------------------------------------------
// Supplier master data supporting Furniture Warehouse Receiving.
// This is NOT a Purchasing module — no Purchase Order logic lives here.
//
// Rules:
//   - Supplier code is auto-generated (SUP-000001, SUP-000002, ...) or
//     manually overridden; it must ALWAYS stay unique.
//   - Soft delete only — suppliers are never hard deleted.
//   - A supplier referenced by Receiving cannot be deleted (409 Conflict).
//   - Receiving only accepts ACTIVE suppliers.
// ============================================================

const SUPPLIER_CODE_PREFIX = 'SUP'
const SUPPLIER_CODE_PAD = 6
// Permanent global sequence (never resets monthly, never warehouse-scoped).
const CODE_SEQUENCE_WAREHOUSE = 'GLOBAL'
const CODE_SEQUENCE_YEAR_MONTH = 'ALL'

export class SupplierServiceError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'SupplierServiceError'
    this.status = status
  }
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase()
}

// ---------- Code generation ----------
// Concurrency-safe via the DocumentSequence atomic upsert (unique key
// prefix + warehouseCode + yearMonth). Skips codes already claimed by a
// manual override so the sequence can never collide with user-entered codes.
export async function nextSupplierCode(tx = prisma) {
  const client = tx || prisma
  let seq = await client.documentSequence.upsert({
    where: {
      prefix_warehouseCode_yearMonth: {
        prefix: SUPPLIER_CODE_PREFIX,
        warehouseCode: CODE_SEQUENCE_WAREHOUSE,
        yearMonth: CODE_SEQUENCE_YEAR_MONTH,
      },
    },
    update: { lastSeq: { increment: 1 } },
    create: {
      prefix: SUPPLIER_CODE_PREFIX,
      warehouseCode: CODE_SEQUENCE_WAREHOUSE,
      yearMonth: CODE_SEQUENCE_YEAR_MONTH,
      lastSeq: 1,
    },
  })

  let candidate = `${SUPPLIER_CODE_PREFIX}-${String(seq.lastSeq).padStart(SUPPLIER_CODE_PAD, '0')}`
  while (await client.supplier.findUnique({ where: { code: candidate } })) {
    seq = await client.documentSequence.update({
      where: {
        prefix_warehouseCode_yearMonth: {
          prefix: SUPPLIER_CODE_PREFIX,
          warehouseCode: CODE_SEQUENCE_WAREHOUSE,
          yearMonth: CODE_SEQUENCE_YEAR_MONTH,
        },
      },
      data: { lastSeq: { increment: 1 } },
    })
    candidate = `${SUPPLIER_CODE_PREFIX}-${String(seq.lastSeq).padStart(SUPPLIER_CODE_PAD, '0')}`
  }
  return candidate
}

// ---------- Payload sanitization ----------
function sanitizeSupplierFields(body = {}) {
  const str = (v) => (v === undefined || v === null ? undefined : String(v).trim())
  const num = (v) => {
    if (v === undefined || v === null || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
  }
  return {
    code: normalizeCode(body.code),
    name: str(body.name),
    picName: str(body.picName),
    phone: str(body.phone),
    email: str(body.email) || undefined,
    address: str(body.address) || undefined,
    city: str(body.city) || undefined,
    province: str(body.province) || undefined,
    postalCode: str(body.postalCode) || undefined,
    leadTimeDays: num(body.leadTimeDays),
    taxNumber: str(body.taxNumber) || undefined,
    website: str(body.website) || undefined,
    notes: str(body.notes) || undefined,
    isActive: body.isActive === undefined || body.isActive === null
      ? undefined
      : String(body.isActive).toLowerCase() === 'false' || body.isActive === false ? false : true,
  }
}

// ---------- Validation ----------
function validateSupplier(fields, { requireCode = false } = {}) {
  const errors = []
  if (requireCode && !fields.code) errors.push('Supplier Code is required')
  if (!fields.name) errors.push('Supplier Name is required')
  if (!fields.picName) errors.push('PIC Name is required')
  if (!fields.phone) errors.push('Phone is required')
  if (fields.isActive === undefined) errors.push('Status is required')
  if (fields.leadTimeDays !== undefined) {
    if (Number.isNaN(fields.leadTimeDays)) errors.push('Lead Time must be a number')
    else if (fields.leadTimeDays < 0) errors.push('Lead Time must be >= 0')
    else fields.leadTimeDays = Math.round(fields.leadTimeDays)
  }
  if (errors.length) throw new SupplierServiceError(errors.join('; '))
}

// ---------- LIST ----------
export async function listSuppliers({ search, status, city, leadTime, sortBy = 'code', sortOrder = 'asc', limit = 100, offset = 0 } = {}) {
  const where = {}

  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { picName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (status === 'active') where.isActive = true
  else if (status === 'inactive') where.isActive = false

  if (city) where.city = { contains: city, mode: 'insensitive' }

  if (leadTime) {
    const parts = String(leadTime).split(',')
    const min = Number(parts[0])
    const max = Number(parts[1])
    if (Number.isFinite(min) && Number.isFinite(max)) {
      where.leadTimeDays = { gte: min, lte: max }
    } else if (Number.isFinite(min)) {
      where.leadTimeDays = { gte: min }
    }
  }

  const SORTABLE = ['code', 'name', 'createdAt', 'leadTimeDays']
  const safeSort = SORTABLE.includes(sortBy) ? sortBy : 'code'
  const safeOrder = String(sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc'

  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: [{ [safeSort]: safeOrder }, { id: 'asc' }],
      take: Math.min(Number(limit) || 100, 1000),
      skip: Number(offset) || 0,
    }),
    prisma.supplier.count({ where }),
  ])

  return { data: rows, total }
}

export async function getSupplier(id) {
  return prisma.supplier.findUnique({ where: { id } })
}

export async function listActiveSuppliers({ search, limit = 500 } = {}) {
  const where = { isActive: true }
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ]
  }
  return prisma.supplier.findMany({
    where,
    orderBy: { code: 'asc' },
    take: Math.min(Number(limit) || 500, 1000),
  })
}

// ---------- CREATE ----------
export async function createSupplier({ user, body }) {
  const fields = sanitizeSupplierFields(body)
  const manualCode = !!fields.code
  validateSupplier(fields, { requireCode: false })

  if (fields.code) {
    const exists = await prisma.supplier.findUnique({ where: { code: fields.code } })
    if (exists) throw new SupplierServiceError('Supplier code already exists', 409)
  }

  const supplier = await prisma.$transaction(async (tx) => {
    const code = fields.code || (await nextSupplierCode(tx))
    const created = await tx.supplier.create({
      data: {
        code,
        name: fields.name,
        picName: fields.picName,
        phone: fields.phone,
        email: fields.email || null,
        address: fields.address || null,
        city: fields.city || null,
        province: fields.province || null,
        postalCode: fields.postalCode || null,
        leadTimeDays: fields.leadTimeDays ?? 0,
        taxNumber: fields.taxNumber || null,
        website: fields.website || null,
        notes: fields.notes || null,
        isActive: fields.isActive ?? true,
      },
    })
    return created
  })

  await logAudit({
    user,
    action: 'CREATE_SUPPLIER',
    module: 'SUPPLIER',
    entityType: 'Supplier',
    entityId: supplier.id,
    description: `Created supplier ${supplier.code} - ${supplier.name}`,
    after: { supplierCode: supplier.code, supplierName: supplier.name, isActive: supplier.isActive },
  })

  return supplier
}

// ---------- UPDATE ----------
export async function updateSupplier({ user, id, body }) {
  const before = await prisma.supplier.findUnique({ where: { id } })
  if (!before) throw new SupplierServiceError('Supplier not found', 404)

  const fields = sanitizeSupplierFields(body)
  const merged = {
    code: fields.code || before.code,
    name: fields.name || before.name,
    picName: fields.picName || before.picName,
    phone: fields.phone || before.phone,
    email: fields.email !== undefined ? fields.email : before.email,
    address: fields.address !== undefined ? fields.address : before.address,
    city: fields.city !== undefined ? fields.city : before.city,
    province: fields.province !== undefined ? fields.province : before.province,
    postalCode: fields.postalCode !== undefined ? fields.postalCode : before.postalCode,
    leadTimeDays: fields.leadTimeDays !== undefined ? fields.leadTimeDays : before.leadTimeDays,
    taxNumber: fields.taxNumber !== undefined ? fields.taxNumber : before.taxNumber,
    website: fields.website !== undefined ? fields.website : before.website,
    notes: fields.notes !== undefined ? fields.notes : before.notes,
    isActive: fields.isActive !== undefined ? fields.isActive : before.isActive,
  }
  validateSupplier(merged)

  const dup = await prisma.supplier.findFirst({ where: { code: merged.code, id: { not: id } } })
  if (dup) throw new SupplierServiceError('Supplier code already exists', 409)

  const supplier = await prisma.supplier.update({ where: { id }, data: merged })

  await logAudit({
    user,
    action: 'UPDATE_SUPPLIER',
    module: 'SUPPLIER',
    entityType: 'Supplier',
    entityId: id,
    description: `Updated supplier ${supplier.code} - ${supplier.name}`,
    before: { supplierCode: before.code, supplierName: before.name, isActive: before.isActive },
    after: { supplierCode: supplier.code, supplierName: supplier.name, isActive: supplier.isActive },
  })

  return supplier
}

// ---------- ACTIVATE / DEACTIVATE ----------
export async function setSupplierActive({ user, id, isActive }) {
  const before = await prisma.supplier.findUnique({ where: { id } })
  if (!before) throw new SupplierServiceError('Supplier not found', 404)
  if (Boolean(before.isActive) === Boolean(isActive)) return before

  const supplier = await prisma.supplier.update({
    where: { id },
    data: { isActive: Boolean(isActive) },
  })

  await logAudit({
    user,
    action: isActive ? 'ACTIVATE_SUPPLIER' : 'DEACTIVATE_SUPPLIER',
    module: 'SUPPLIER',
    entityType: 'Supplier',
    entityId: id,
    description: `${isActive ? 'Activated' : 'Deactivated'} supplier ${supplier.code} - ${supplier.name}`,
    before: { supplierCode: before.code, supplierName: before.name, isActive: before.isActive },
    after: { supplierCode: supplier.code, supplierName: supplier.name, isActive: supplier.isActive },
  })

  return supplier
}

// ---------- DELETE (soft) ----------
export async function deleteSupplier({ user, id }) {
  const before = await prisma.supplier.findUnique({ where: { id } })
  if (!before) throw new SupplierServiceError('Supplier not found', 404)

  // Referenced suppliers can never be deleted (Receiving today, PO in future).
  const receivingCount = await prisma.receiving.count({ where: { supplierId: id } })
  if (receivingCount > 0) {
    throw new SupplierServiceError('Supplier is already used.', 409)
  }

  // Soft delete only — never remove the row.
  const supplier = await prisma.supplier.update({
    where: { id },
    data: { isActive: false },
  })

  await logAudit({
    user,
    action: 'DELETE_SUPPLIER',
    module: 'SUPPLIER',
    entityType: 'Supplier',
    entityId: id,
    description: `Deleted (soft) supplier ${supplier.code} - ${supplier.name}`,
    before: { supplierCode: before.code, supplierName: before.name, isActive: before.isActive },
    after: { supplierCode: supplier.code, supplierName: supplier.name, isActive: false },
  })

  return { deleted: true, deactivated: true, supplier }
}

// ---------- DASHBOARD KPI ----------
export async function getSupplierStats() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [total, active, inactive, recentlyAdded] = await Promise.all([
    prisma.supplier.count(),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.supplier.count({ where: { isActive: false } }),
    prisma.supplier.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
  ])
  return { total, active, inactive, recentlyAdded }
}

// ---------- SUPPLIER REPORT ----------
export async function getSupplierReport({ fromDate, toDate, status, city, limit = 500, offset = 0 } = {}) {
  const where = {}
  if (status === 'active') where.isActive = true
  else if (status === 'inactive') where.isActive = false
  if (city) where.city = { contains: city, mode: 'insensitive' }

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { code: 'asc' },
      take: Math.min(Number(limit) || 500, 1000),
      skip: Number(offset) || 0,
    }),
    prisma.supplier.count({ where }),
  ])

  const ids = suppliers.map((s) => s.id)
  const receivings = ids.length
    ? await prisma.receiving.findMany({
        where: { supplierId: { in: ids } },
        select: { id: true, supplierId: true, createdAt: true, postedAt: true, lines: { select: { receivedQty: true } } },
      })
    : []

  const bySupplier = {}
  for (const s of suppliers) bySupplier[s.id] = { totalReceivings: 0, totalReceivedQty: 0, lastDelivery: null }

  for (const r of receivings) {
    const agg = bySupplier[r.supplierId]
    if (!agg) continue
    agg.totalReceivings += 1
    agg.totalReceivedQty += r.lines.reduce((sum, l) => sum + l.receivedQty, 0)
    const d = r.postedAt || r.createdAt
    if (!agg.lastDelivery || new Date(d) > new Date(agg.lastDelivery)) agg.lastDelivery = d
  }

  const data = suppliers.map((s) => {
    const agg = bySupplier[s.id]
    return {
      id: s.id,
      supplierCode: s.code,
      supplierName: s.name,
      picName: s.picName,
      city: s.city || '—',
      phone: s.phone,
      totalReceivings: agg.totalReceivings,
      totalReceivedQty: agg.totalReceivedQty,
      lastDelivery: agg.lastDelivery,
      averageLeadTimeDays: s.leadTimeDays,
      status: s.isActive ? 'Active' : 'Inactive',
    }
  })

  const summary = {
    totalSuppliers: total,
    activeSuppliers: suppliers.filter((s) => s.isActive).length,
    totalReceivings: receivings.length,
    totalReceivedQty: receivings.reduce((sum, r) => sum + r.lines.reduce((ls, l) => ls + l.receivedQty, 0), 0),
  }

  return { data, total, summary }
}
