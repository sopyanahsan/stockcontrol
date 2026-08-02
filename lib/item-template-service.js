import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'

export const ITEM_TEMPLATE_HEADERS = [
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

// Build the "Master Item Template.xlsx" workbook.
// Sheet 1  = Items (headers + an example row)
// Sheet 2  = Categories (from the database)
// Sheet 3  = UOM (from the database)
export async function buildItemTemplateWorkbook() {
  const [categories, uoms] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.uom.findMany({ orderBy: { code: 'asc' } }),
  ])

  const itemsSheet = XLSX.utils.aoa_to_sheet([
    ITEM_TEMPLATE_HEADERS,
    ['FUR-CHR-001', '', 'Office Chair - Example', categories[0]?.name || 'Furniture', uoms[0]?.code || 'PCS', 'Example row — replace with your data', 5, 150, 'Active'],
  ])
  itemsSheet['!cols'] = ITEM_TEMPLATE_HEADERS.map((h, i) => ({ wch: [14, 14, 28, 18, 10, 30, 13, 10, 10][i] || 14 }))

  const categoriesSheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Description'],
    ...categories.map((c) => [c.name, c.description || '']),
  ])
  categoriesSheet['!cols'] = [{ wch: 24 }, { wch: 40 }]

  const uomSheet = XLSX.utils.aoa_to_sheet([
    ['Code', 'Name'],
    ...uoms.map((u) => [u.code, u.name]),
  ])
  uomSheet['!cols'] = [{ wch: 10 }, { wch: 24 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, itemsSheet, 'Items')
  XLSX.utils.book_append_sheet(wb, categoriesSheet, 'Categories')
  XLSX.utils.book_append_sheet(wb, uomSheet, 'UOM')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })
  return { buffer, filename: 'Master Item Template.xlsx' }
}
