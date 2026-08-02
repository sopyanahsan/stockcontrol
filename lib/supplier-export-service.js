import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export const SUPPLIER_EXPORT_HEADERS = [
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
  'Created At',
  'Updated At',
]

// Build the Suppliers.xlsx workbook.
// ids = supplier ids to include; when empty, exports every supplier.
export async function exportSuppliersToWorkbook({ ids = [] } = {}, user) {
  const where = ids.length ? { id: { in: ids } } : {}

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: { code: 'asc' },
  })

  const rows = suppliers.map((s) => [
    s.code,
    s.name,
    s.picName,
    s.phone,
    s.email || '',
    s.address || '',
    s.city || '',
    s.province || '',
    s.postalCode || '',
    s.leadTimeDays,
    s.taxNumber || '',
    s.website || '',
    s.isActive ? 'Active' : 'Inactive',
    s.notes || '',
    s.createdAt.toISOString().slice(0, 19).replace('T', ' '),
    s.updatedAt.toISOString().slice(0, 19).replace('T', ' '),
  ])

  const ws = XLSX.utils.aoa_to_sheet([SUPPLIER_EXPORT_HEADERS, ...rows])
  ws['!cols'] = SUPPLIER_EXPORT_HEADERS.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)),
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Suppliers')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })

  if (user) {
    await logAudit({
      user,
      action: 'EXPORT_SUPPLIER',
      module: 'SUPPLIER',
      entityType: 'Supplier',
      entityId: null,
      description: `Exported ${suppliers.length} supplier(s)`,
      after: { count: suppliers.length, scope: ids.length ? 'selected' : 'all' },
    })
  }

  return { buffer, count: suppliers.length }
}
