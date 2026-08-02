import * as XLSX from 'xlsx'
import { logAudit } from '@/lib/audit'

export const SUPPLIER_TEMPLATE_HEADERS = [
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

// Build the "Supplier Template.xlsx" workbook.
// Sheet 1 = Suppliers (headers + an example row)
// Sheet 2 = Instructions (field requirements)
export async function buildSupplierTemplateWorkbook(user) {
  const ws = XLSX.utils.aoa_to_sheet([
    SUPPLIER_TEMPLATE_HEADERS,
    ['', 'PT Mebel Jaya (Example)', 'Budi Santoso', '0812-3456-7890', 'budi@example.com', 'Jl. Raya No. 1', 'Jakarta', 'DKI Jakarta', '10110', 3, 'NPWP-0000', 'https://example.com', 'Active', 'Example row — replace with your data. Leave Supplier Code empty to auto-generate.'],
  ])
  ws['!cols'] = SUPPLIER_TEMPLATE_HEADERS.map((h, i) => ({ wch: [14, 24, 20, 16, 24, 30, 16, 16, 12, 10, 14, 20, 10, 30][i] || 14 }))

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Field', 'Required', 'Rules'],
    ['Supplier Code', 'Optional', 'Leave empty to auto-generate (SUP-000001). If provided it must be unique.'],
    ['Supplier Name', 'Required', 'Unique supplier display name.'],
    ['PIC', 'Optional', 'Person in charge / contact person.'],
    ['Phone', 'Required', 'Primary contact phone number.'],
    ['Email', 'Optional', 'Contact email address.'],
    ['Address', 'Optional', 'Street address.'],
    ['City', 'Optional', 'City.'],
    ['Province', 'Optional', 'Province / state.'],
    ['Postal Code', 'Optional', 'Postal / zip code.'],
    ['Lead Time', 'Optional', 'Days. Must be a number >= 0.'],
    ['NPWP', 'Optional', 'Tax number.'],
    ['Website', 'Optional', 'Website URL.'],
    ['Status', 'Optional', 'Active or Inactive (defaults to Active).'],
    ['Notes', 'Optional', 'Free-form notes.'],
  ])
  instructions['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 70 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Suppliers')
  XLSX.utils.book_append_sheet(wb, instructions, 'Instructions')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })

  if (user) {
    await logAudit({
      user,
      action: 'EXPORT_SUPPLIER',
      module: 'SUPPLIER',
      entityType: 'Supplier',
      entityId: null,
      description: 'Downloaded supplier import template',
      after: { template: 'Supplier Template.xlsx' },
    })
  }

  return { buffer, filename: 'Supplier Template.xlsx' }
}
