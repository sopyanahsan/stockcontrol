import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'

export const ITEM_EXPORT_HEADERS = [
  'SKU',
  'Barcode',
  'Item Name',
  'Category',
  'UOM',
  'Description',
  'On Hand',
  'Reserved',
  'Available',
  'Reorder Point',
  'Unit Cost',
  'Status',
  'Created At',
  'Updated At',
]

// Build the export workbook.
// ids = item ids to include; when empty, exports every item master.
export async function exportItemsToWorkbook({ ids = [] } = {}) {
  const where = ids.length ? { id: { in: ids } } : {}

  const [items, ledgerSums, fifoSums] = await Promise.all([
    prisma.item.findMany({
      where,
      include: { category: { select: { name: true } }, uom: { select: { code: true } } },
      orderBy: { sku: 'asc' },
    }),
    prisma.stockLedger.groupBy({ by: ['itemId'], _sum: { qty: true } }),
    prisma.fifoLayer.groupBy({ by: ['itemId'], _sum: { qtyRemaining: true } }),
  ])

  const onHandMap = Object.fromEntries(ledgerSums.map((s) => [s.itemId, s._sum.qty || 0]))
  const availableMap = Object.fromEntries(fifoSums.map((s) => [s.itemId, s._sum.qtyRemaining || 0]))

  const rows = items.map((item) => {
    const onHand = onHandMap[item.id] || 0
    const available = availableMap[item.id] || 0
    return [
      item.sku,
      item.barcode || '',
      item.name,
      item.category?.name || '',
      item.uom?.code || '',
      item.description || '',
      onHand,
      Math.max(0, onHand - available),
      available,
      item.reorderPoint,
      item.unitCost,
      item.isActive ? 'Active' : 'Inactive',
      item.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      item.updatedAt.toISOString().slice(0, 19).replace('T', ' '),
    ]
  })

  const ws = XLSX.utils.aoa_to_sheet([ITEM_EXPORT_HEADERS, ...rows])
  ws['!cols'] = ITEM_EXPORT_HEADERS.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)),
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Items')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })
  return { buffer, count: items.length }
}
