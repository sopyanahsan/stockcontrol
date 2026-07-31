'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import DataTable from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const TXN_COLORS = {
  RECEIVING: 'border-green-200 bg-green-50 text-green-700',
  PUTAWAY: 'border-blue-200 bg-blue-50 text-blue-700',
  TRANSFER_IN: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  TRANSFER_OUT: 'border-orange-200 bg-orange-50 text-orange-700',
  ADJUSTMENT_IN: 'border-teal-200 bg-teal-50 text-teal-700',
  ADJUSTMENT_OUT: 'border-red-200 bg-red-50 text-red-700',
  CYCLE_COUNT: 'border-purple-200 bg-purple-50 text-purple-700',
  OPNAME: 'border-amber-200 bg-amber-50 text-amber-700',
}

const App = () => {
  const { data: stock = [], isLoading: stockLoading } = useQuery({ queryKey: ['stock'], queryFn: () => api('/stock') })
  const { data: ledger = [], isLoading: ledgerLoading } = useQuery({ queryKey: ['ledger'], queryFn: () => api('/ledger?limit=200') })

  const stockColumns = useMemo(
    () => [
      { id: 'sku', header: 'SKU', accessorFn: (r) => r.item?.sku || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span> },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.item?.name || '' },
      { id: 'category', header: 'Category', accessorFn: (r) => r.item?.category || '' },
      { id: 'location', header: 'Location', accessorFn: (r) => r.location?.code || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code}</span> },
      { id: 'zone', header: 'Zone', accessorFn: (r) => r.location?.zone || '' },
      {
        accessorKey: 'qty',
        header: 'Qty on Hand',
        cell: ({ row }) => (
          <Badge variant="outline" className="border-blue-200 bg-blue-50 tabular-nums text-blue-700">
            {fmt(row.original.qty)} {row.original.item?.uom}
          </Badge>
        ),
      },
      {
        id: 'value',
        header: 'Value',
        accessorFn: (r) => r.qty * (r.item?.unitCost || 0),
        cell: ({ row }) => <span className="tabular-nums text-gray-600">${fmt(row.original.qty * (row.original.item?.unitCost || 0))}</span>,
      },
    ],
    []
  )

  const ledgerColumns = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-gray-500">{format(new Date(row.original.createdAt), 'dd MMM yyyy HH:mm:ss')}</span>,
      },
      { id: 'sku', header: 'SKU', accessorFn: (r) => r.item?.sku || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span> },
      { id: 'item', header: 'Item', accessorFn: (r) => r.item?.name || '' },
      { id: 'location', header: 'Location', accessorFn: (r) => r.location?.code || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code}</span> },
      {
        accessorKey: 'txnType',
        header: 'Transaction',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${TXN_COLORS[row.original.txnType] || ''}`}>{row.original.txnType}</Badge>
        ),
      },
      {
        accessorKey: 'qty',
        header: 'Qty',
        cell: ({ row }) => (
          <span className={`font-medium tabular-nums ${row.original.qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {row.original.qty >= 0 ? '+' : ''}{fmt(row.original.qty)}
          </span>
        ),
      },
      { accessorKey: 'refNumber', header: 'Reference', cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.refNumber || '-'}</span> },
      { id: 'reason', header: 'Reason', accessorFn: (r) => r.reasonCode?.code || '', cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.reasonCode?.code || '-'}</span> },
      { id: 'user', header: 'User', accessorFn: (r) => r.user?.name || '' },
    ],
    []
  )

  return (
    <AppShell title="Stock on Hand" subtitle="Live inventory position — calculated from the Stock Ledger, never stored directly">
      <Tabs defaultValue="stock">
        <TabsList className="mb-3 h-8">
          <TabsTrigger value="stock" className="text-xs">Stock on Hand</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs">Stock Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <DataTable columns={stockColumns} data={stock} isLoading={stockLoading} searchPlaceholder="Search item, location..." exportName="stock-on-hand" />
        </TabsContent>
        <TabsContent value="ledger">
          <DataTable columns={ledgerColumns} data={ledger} isLoading={ledgerLoading} searchPlaceholder="Search ledger entries..." exportName="stock-ledger" pageSize={50} />
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}

export default App
