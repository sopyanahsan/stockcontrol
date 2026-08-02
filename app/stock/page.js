'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '@/lib/api-client'
import { formatCurrency } from '@/lib/currency'
import AppShell from '@/components/app-shell'
import DataTable from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const ALL_VALUE = '__ALL__'

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

// ---------- Stock Card Tab (server-side running balance + filters) ----------
function CardTab() {
  const [selectedItemId, setSelectedItemId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [selectedTxnType, setSelectedTxnType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const { data: stockRows = [] } = useQuery({
    queryKey: ['stock'],
    queryFn: () => api('/stock'),
  })

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (selectedItemId) params.set('itemId', selectedItemId)
    if (selectedLocationId && selectedLocationId !== ALL_VALUE) params.set('locationId', selectedLocationId)
    if (selectedTxnType && selectedTxnType !== ALL_VALUE) params.set('txnType', selectedTxnType)
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    return `/stock-card-entries?${params.toString()}`
  }

  const { data: cardData, isLoading: cardLoading } = useQuery({
    queryKey: ['stock-card-entries', selectedItemId, selectedLocationId, selectedTxnType, fromDate, toDate],
    queryFn: () => api(buildUrl()),
    enabled: !!(selectedItemId || (selectedLocationId && selectedLocationId !== ALL_VALUE) || (selectedTxnType && selectedTxnType !== ALL_VALUE) || fromDate || toDate),
  })

  const hasFilters = !!(selectedItemId || (selectedLocationId && selectedLocationId !== ALL_VALUE) || (selectedTxnType && selectedTxnType !== ALL_VALUE) || fromDate || toDate)

  const cardColumns = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {format(new Date(row.original.createdAt), 'dd MMM yyyy HH:mm:ss')}
          </span>
        ),
      },
      {
        accessorKey: 'location',
        header: 'Location',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.location?.code || '-'}</span>
        ),
      },
      {
        accessorKey: 'item',
        header: 'Item',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.item?.sku || '-'}</span>
        ),
      },
      {
        accessorKey: 'txnType',
        header: 'Transaction',
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={`text-[11px] ${TXN_COLORS[row.original.txnType] || ''}`}
          >
            {row.original.txnType}
          </Badge>
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
      {
        accessorKey: 'runningQty',
        header: 'Running Balance',
        cell: ({ row }) => (
          <span className={`font-medium tabular-nums ${row.original.runningQty >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {fmt(row.original.runningQty)}
          </span>
        ),
      },
      {
        accessorKey: 'unitCost',
        header: 'Unit Cost',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-gray-500">
            {row.original.unitCost != null ? formatCurrency(row.original.unitCost) : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'refNumber',
        header: 'Reference',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-500">{row.original.refNumber || '-'}</span>
        ),
      },
      { accessorKey: 'user', header: 'User', cell: ({ row }) => <span className="text-xs">{row.original.user?.name || '-'}</span> },
    ],
    []
  )

  const clearFilters = () => {
    setSelectedItemId('')
    setSelectedLocationId('')
    setSelectedTxnType('')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="space-y-3">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Item:</span>
          <Select value={selectedItemId} onValueChange={setSelectedItemId}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="All items" />
            </SelectTrigger>
            <SelectContent>
              {stockRows.map((r) => (
                <SelectItem key={r.itemId} value={r.itemId} className="text-xs">
                  {r.item?.sku}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Location:</span>
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE} className="text-xs">All locations</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Txn:</span>
          <Select value={selectedTxnType} onValueChange={setSelectedTxnType}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE} className="text-xs">All types</SelectItem>
              <SelectItem value="RECEIVING" className="text-xs">Receiving</SelectItem>
              <SelectItem value="PUTAWAY" className="text-xs">Putaway</SelectItem>
              <SelectItem value="TRANSFER_IN" className="text-xs">Transfer In</SelectItem>
              <SelectItem value="TRANSFER_OUT" className="text-xs">Transfer Out</SelectItem>
              <SelectItem value="ADJUSTMENT_IN" className="text-xs">Adjustment In</SelectItem>
              <SelectItem value="ADJUSTMENT_OUT" className="text-xs">Adjustment Out</SelectItem>
              <SelectItem value="CYCLE_COUNT" className="text-xs">Cycle Count</SelectItem>
              <SelectItem value="OPNAME" className="text-xs">Opname</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">From:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">To:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}

        {cardData?.currentBalance != null && (
          <Badge variant="outline" className="ml-auto border-blue-200 bg-blue-50 text-xs">
            Running Balance: <strong className="tabular-nums">{fmt(cardData.currentBalance)}</strong>
          </Badge>
        )}
      </div>

      {!hasFilters ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="text-sm text-gray-500">Apply at least one filter to view ledger entries</div>
          <div className="mt-1 text-xs text-gray-400">Select an item, location, transaction type, or date range above</div>
        </div>
      ) : cardLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !cardData?.entries?.length ? (
        <div className="rounded-md border border-gray-200 bg-white py-16 text-center">
          <div className="text-sm text-gray-500">No ledger entries match the selected filters</div>
        </div>
      ) : (
        <DataTable
          columns={cardColumns}
          data={cardData.entries}
          isLoading={false}
          searchPlaceholder="Search entries..."
          exportName="stock-card"
          pageSize={50}
        />
      )}
    </div>
  )
}

const App = () => {
  const { data: stock = [], isLoading: stockLoading } = useQuery({ queryKey: ['stock'], queryFn: () => api('/stock') })
  const { data: ledger = [], isLoading: ledgerLoading } = useQuery({ queryKey: ['ledger'], queryFn: () => api('/ledger?limit=200') })

  const stockColumns = useMemo(
    () => [
      {
        id: 'sku',
        header: 'SKU',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.item?.name || '' },
      { id: 'category', header: 'Category', accessorFn: (r) => r.item?.category || '' },
      {
        id: 'location',
        header: 'Location',
        accessorFn: (r) => r.location?.code || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code}</span>,
      },
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
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-600">{formatCurrency(row.original.qty * (row.original.item?.unitCost || 0))}</span>
        ),
      },
    ],
    []
  )

  const ledgerColumns = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {format(new Date(row.original.createdAt), 'dd MMM yyyy HH:mm:ss')}
          </span>
        ),
      },
      {
        id: 'sku',
        header: 'SKU',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span>,
      },
      { id: 'item', header: 'Item', accessorFn: (r) => r.item?.name || '' },
      {
        id: 'location',
        header: 'Location',
        accessorFn: (r) => r.location?.code || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code}</span>,
      },
      {
        accessorKey: 'txnType',
        header: 'Transaction',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${TXN_COLORS[row.original.txnType] || ''}`}>
            {row.original.txnType}
          </Badge>
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
      {
        accessorKey: 'refNumber',
        header: 'Reference',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-500">{row.original.refNumber || '-'}</span>
        ),
      },
      {
        id: 'reason',
        header: 'Reason',
        accessorFn: (r) => r.reasonCode?.code || '',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.reasonCode?.code || '-'}</span>,
      },
      { accessorKey: 'user', header: 'User', accessorFn: (r) => r.user?.name || '' },
    ],
    []
  )

  return (
    <AppShell title="Stock on Hand" subtitle="Live inventory position — calculated from the Stock Ledger, never stored directly">
      <Tabs defaultValue="stock">
        <TabsList className="mb-3 h-8">
          <TabsTrigger value="stock" className="text-xs">Stock on Hand</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs">Stock Ledger</TabsTrigger>
          <TabsTrigger value="card" className="text-xs">Stock Card</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <DataTable
            columns={stockColumns}
            data={stock}
            isLoading={stockLoading}
            searchPlaceholder="Search item, location..."
            exportName="stock-on-hand"
          />
        </TabsContent>
        <TabsContent value="ledger">
          <DataTable
            columns={ledgerColumns}
            data={ledger}
            isLoading={ledgerLoading}
            searchPlaceholder="Search ledger entries..."
            exportName="stock-ledger"
            pageSize={50}
          />
        </TabsContent>
        <TabsContent value="card">
          <CardTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}

export default App
