'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportLayout } from '@/components/reports/ReportLayout'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ChartCard } from '@/components/reports/ChartCard'
import { ExportButton } from '@/components/reports/ExportButton'
import { KPIGrid } from '@/components/reports/KPIGrid'
import { ReportTable } from '@/components/reports/ReportTable'
import { ReportChart } from '@/components/reports/ReportChart'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { format, parseISO } from 'date-fns'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)
const pct = (n) => (n != null ? `${(n * 100).toFixed(1)}%` : '—')

const ZONE_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#16a34a', '#0891b2', '#dc2626', '#65a30d']

// ─── Stock On Hand ──────────────────────────────────────────────────────────
function StockOnHandTab({ active }) {
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'inventory', 'stock-on-hand', dateRange],
    queryFn: () => api(`/reports/inventory/stock-on-hand?days=${dateRange}`),
    enabled: active,
  })

  const filtered = useMemo(() => {
    if (!data?.items) return []
    const q = search.toLowerCase()
    return data.items.filter(
      (r) =>
        r.item?.sku?.toLowerCase().includes(q) ||
        r.item?.name?.toLowerCase().includes(q) ||
        r.location?.code?.toLowerCase().includes(q)
    )
  }, [data, search])

  const columns = useMemo(
    () => [
      {
        id: 'sku',
        header: 'SKU',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.item?.name || '' },
      {
        id: 'category', header: 'Category',
        accessorFn: (r) => r.item?.category || '',
        cell: ({ row }) => (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{row.original.item?.category || '—'}</span>
        ),
      },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.location?.code || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code}</span>,
      },
      {
        id: 'qty', header: 'Qty on Hand',
        accessorKey: 'qty',
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span>
        ),
      },
      {
        id: 'uom', header: 'UoM',
        accessorFn: (r) => r.item?.uom || '',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.item?.uom}</span>,
      },
      {
        id: 'value', header: 'Value at Cost',
        accessorFn: (r) => r.qty * (r.item?.unitCost || 0),
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700">${fmt(Math.round(row.original.qty * (row.original.item?.unitCost || 0)))}</span>
        ),
      },
      {
        id: 'reorder', header: 'Reorder Level',
        accessorFn: (r) => r.item?.reorderLevel || 0,
        cell: ({ row }) => {
          const qty = row.original.qty
          const level = row.original.item?.reorderLevel || 0
          const below = qty < level
          return (
            <Badge variant="outline" className={`${below ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200'} text-[11px]`}>
              {fmt(level)}
            </Badge>
          )
        },
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total SKUs', value: fmt(data.totalSKUs), description: 'Items with stock', trend: null },
        { label: 'Total Qty', value: fmt(data.totalQty), description: 'Units on hand', trend: null },
        { label: 'Total Value', value: `$${fmt(Math.round(data.totalValue || 0))}`, description: 'At unit cost', trend: null },
        { label: 'Below Reorder', value: fmt(data.belowReorder || 0), description: 'Need replenishment', trend: null, accent: 'warning' },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  const zoneData = data?.byZone
    ? Object.entries(data.byZone).map(([zone, v]) => ({ zone, qty: v.qty, value: v.value }))
    : []

  return (
    <div className="space-y-4">
      <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          searchPlaceholder="Search SKU, item, location..."
          exportName="stock-on-hand"
          exportTitle="Stock on Hand"
          pageSize={20}
        />
        <ChartCard title="Stock by Zone" subtitle="Quantity distribution" className="lg:col-span-1">
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <PieChart>
                <Pie
                  data={zoneData}
                  dataKey="qty"
                  nameKey="zone"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                  label={({ zone, percent }) => `${zone} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {zoneData.map((_, i) => (
                    <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [fmt(v), name]}
                  contentStyle={{ borderRadius: 6, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ─── Stock Card ─────────────────────────────────────────────────────────────
function StockCardTab({ active }) {
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const { data: stockRows = [] } = useQuery({ queryKey: ['stock'], queryFn: () => api('/stock') })

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (itemId) params.set('itemId', itemId)
    if (locationId) params.set('locationId', locationId)
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    return `/reports/inventory/stock-card?${params.toString()}`
  }

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'inventory', 'stock-card', itemId, locationId, fromDate, toDate],
    queryFn: () => api(buildUrl()),
    enabled: active && !!(itemId || locationId || fromDate || toDate),
  })

  const hasFilters = !!(itemId || locationId || fromDate || toDate)

  const columns = useMemo(
    () => [
      {
        accessorKey: 'createdAt', header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {format(parseISO(row.original.createdAt), 'dd MMM yyyy HH:mm:ss')}
          </span>
        ),
      },
      {
        accessorKey: 'location',
        header: 'Location',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code || '—'}</span>,
      },
      {
        accessorKey: 'item',
        header: 'Item',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku || '—'}</span>,
      },
      {
        accessorKey: 'txnType', header: 'Transaction',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px]">{row.original.txnType}</Badge>
        ),
      },
      {
        accessorKey: 'qty', header: 'Qty',
        cell: ({ row }) => (
          <span className={`tabular-nums font-medium ${row.original.qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {row.original.qty >= 0 ? '+' : ''}{fmt(row.original.qty)}
          </span>
        ),
      },
      {
        accessorKey: 'runningQty', header: 'Running Balance',
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">{fmt(row.original.runningQty)}</span>
        ),
      },
      {
        accessorKey: 'unitCost', header: 'Unit Cost',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-gray-500">
            {row.original.unitCost != null ? `$${Number(row.original.unitCost).toFixed(4)}` : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'refNumber', header: 'Reference',
        cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.refNumber || '—'}</span>,
      },
      {
        accessorKey: 'user', header: 'User',
        accessorFn: (r) => r.user?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.user?.name || '—'}</span>,
      },
    ],
    []
  )

  const clearFilters = () => { setItemId(''); setLocationId(''); setFromDate(''); setToDate('') }

  return (
    <div className="space-y-4">
      <ReportHeader title="Stock Card" subtitle="Item ledger with running balance" />
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Item:</span>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
          >
            <option value="">All items</option>
            {stockRows.map((r) => (
              <option key={r.itemId} value={r.itemId}>{r.item?.sku}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Location:</span>
          <input type="text" value={locationId} onChange={(e) => setLocationId(e.target.value)}
            placeholder="Location ID"
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs w-36" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">From:</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">To:</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">Clear filters</button>
        )}
        {data?.currentBalance != null && (
          <Badge variant="outline" className="ml-auto border-blue-200 bg-blue-50 text-xs">
            Running Balance: <strong className="tabular-nums">{fmt(data.currentBalance)}</strong>
          </Badge>
        )}
      </div>
      {!hasFilters ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="text-sm text-gray-500">Apply at least one filter to view ledger entries</div>
        </div>
      ) : (
        <ReportTable
          columns={columns}
          data={data?.entries || []}
          isLoading={isLoading}
          exportName="stock-card"
          exportTitle="Stock Card"
          pageSize={50}
        />
      )}
    </div>
  )
}

// ─── Inventory Aging ─────────────────────────────────────────────────────────
function InventoryAgingTab({ active }) {
  const [dateRange, setDateRange] = useState('90')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'inventory', 'inventory-aging', dateRange],
    queryFn: () => api(`/reports/inventory/inventory-aging?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        id: 'sku', header: 'SKU',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.item?.name || '' },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.location?.code || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code}</span>,
      },
      {
        accessorKey: 'qty', header: 'Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span>,
      },
      {
        accessorKey: 'daysInStock', header: 'Days in Stock',
        cell: ({ row }) => {
          const d = row.original.daysInStock
          return (
            <Badge
              variant="outline"
              className={`text-[11px] ${
                d > 180 ? 'border-red-200 bg-red-50 text-red-600' :
                d > 90 ? 'border-amber-200 bg-amber-50 text-amber-600' :
                'border-green-200 bg-green-50 text-green-600'
              }`}
            >
              {d} days
            </Badge>
          )
        },
      },
      {
        accessorKey: 'lastTxnDate', header: 'Last Activity',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.lastTxnDate ? format(parseISO(row.original.lastTxnDate), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'unitCost', header: 'Unit Cost',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-gray-500">
            {row.original.unitCost != null ? `$${Number(row.original.unitCost).toFixed(4)}` : '—'}
          </span>
        ),
      },
      {
        id: 'value', header: 'Value',
        accessorFn: (r) => r.qty * (r.unitCost || 0),
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700">${fmt(Math.round(row.original.qty * (row.original.unitCost || 0)))}</span>
        ),
      },
    ],
    []
  )

  const ageBuckets = data?.ageBuckets
    ? [
        { bucket: '0–30 days', qty: data.ageBuckets['0-30'] || 0, color: '#16a34a' },
        { bucket: '31–60 days', qty: data.ageBuckets['31-60'] || 0, color: '#2563eb' },
        { bucket: '61–90 days', qty: data.ageBuckets['61-90'] || 0, color: '#d97706' },
        { bucket: '91–180 days', qty: data.ageBuckets['91-180'] || 0, color: '#db2777' },
        { bucket: '180+ days', qty: data.ageBuckets['180+'] || 0, color: '#dc2626' },
      ]
    : []

  const kpis = data
    ? [
        { label: 'Total Items', value: fmt(data.totalItems), description: 'Stock items tracked', trend: null },
        { label: 'Total Value', value: `$${fmt(Math.round(data.totalValue || 0))}`, description: 'At unit cost', trend: null },
        { label: 'Avg Age', value: `${data.avgAgeDays || 0}d`, description: 'Average days in stock', trend: null },
        { label: 'Stale Stock', value: fmt(data.staleItems || 0), description: '> 180 days', trend: null, accent: 'warning' },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500">Period:</span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
          >
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last year</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={data?.items || []}
          isLoading={isLoading}
          searchPlaceholder="Search SKU, item..."
          exportName="inventory-aging"
          exportTitle="Inventory Aging"
          pageSize={20}
        />
        <ChartCard title="Age Distribution" subtitle="Items by aging bucket" className="lg:col-span-1">
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={ageBuckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [fmt(v), 'Items']} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="qty" radius={[3, 3, 0, 0]} maxBarSize={32}>
                  {ageBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ─── FIFO Aging ─────────────────────────────────────────────────────────────
function FIFOAgingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'inventory', 'fifo-aging', dateRange],
    queryFn: () => api(`/reports/inventory/fifo-aging?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        id: 'sku', header: 'SKU',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.item?.name || '' },
      {
        id: 'batch', header: 'Batch/Lot',
        accessorFn: (r) => r.batchNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.batchNumber || '—'}</span>,
      },
      {
        accessorKey: 'location', header: 'Location',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code || '—'}</span>,
      },
      {
        accessorKey: 'qty', header: 'Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span>,
      },
      {
        accessorKey: 'receivedDate', header: 'Received Date',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.receivedDate ? format(parseISO(row.original.receivedDate), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'daysOld', header: 'Days Old',
        cell: ({ row }) => {
          const d = row.original.daysOld || 0
          return (
            <Badge
              variant="outline"
              className={`text-[11px] ${d > 90 ? 'border-red-200 bg-red-50 text-red-600' : d > 60 ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-gray-200'}`}
            >
              {d} days
            </Badge>
          )
        },
      },
      {
        accessorKey: 'expiryDate', header: 'Expiry Date',
        cell: ({ row }) => {
          if (!row.original.expiryDate) return <span className="text-xs text-gray-400">—</span>
          const d = parseISO(row.original.expiryDate)
          const expiring = d < new Date(Date.now() + 30 * 86400000)
          return (
            <Badge variant="outline" className={`text-[11px] ${expiring ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200'}`}>
              {format(d, 'dd MMM yyyy')}
            </Badge>
          )
        },
      },
      {
        id: 'value', header: 'Value',
        accessorFn: (r) => r.qty * (r.unitCost || 0),
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700">${fmt(Math.round(row.original.qty * (row.original.unitCost || 0)))}</span>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ReportHeader title="FIFO Aging" subtitle="First-in-first-out aging by batch/lot" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Period:</span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
          >
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
          </select>
        </div>
      </div>
      <ReportTable
        columns={columns}
        data={data?.items || []}
        isLoading={isLoading}
        searchPlaceholder="Search SKU, batch, location..."
        exportName="fifo-aging"
        exportTitle="FIFO Aging"
        pageSize={20}
      />
    </div>
  )
}

// ─── Dead Stock ─────────────────────────────────────────────────────────────
function DeadStockTab({ active }) {
  const [threshold, setThreshold] = useState('90')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'inventory', 'dead-stock', threshold],
    queryFn: () => api(`/reports/inventory/dead-stock?days=${threshold}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        id: 'sku', header: 'SKU',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.item?.name || '' },
      {
        id: 'category', header: 'Category',
        accessorFn: (r) => r.item?.category || '',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.item?.category || '—'}</span>,
      },
      {
        accessorKey: 'location', header: 'Location',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code || '—'}</span>,
      },
      {
        accessorKey: 'qty', header: 'Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span>,
      },
      {
        accessorKey: 'lastMovementDate', header: 'Last Movement',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.lastMovementDate ? format(parseISO(row.original.lastMovementDate), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'daysSinceMovement', header: 'Days Idle',
        cell: ({ row }) => (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600 text-[11px]">
            {row.original.daysSinceMovement || 0} days
          </Badge>
        ),
      },
      {
        id: 'value', header: 'Tied-up Value',
        accessorFn: (r) => r.qty * (r.unitCost || 0),
        cell: ({ row }) => (
          <span className="tabular-nums font-medium text-red-600">
            ${fmt(Math.round(row.original.qty * (row.original.unitCost || 0)))}
          </span>
        ),
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Dead Stock Items', value: fmt(data.totalItems || 0), description: 'No movement > threshold', trend: null, accent: 'warning' },
        { label: 'Tied-up Value', value: `$${fmt(Math.round(data.totalValue || 0))}`, description: 'Capital locked in dead stock', trend: null },
        { label: 'Top Category', value: data.topCategory || '—', description: 'Most dead stock', trend: null },
        { label: 'Clearance Rate', value: pct(data.clearanceRate), description: 'Items moved recently', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">No movement for:</span>
          <select
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
          >
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </div>
      </div>
      <ReportTable
        columns={columns}
        data={data?.items || []}
        isLoading={isLoading}
        searchPlaceholder="Search SKU, item..."
        exportName="dead-stock"
        exportTitle="Dead Stock"
        pageSize={20}
      />
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function InventoryReportsPage() {
  const [activeTab, setActiveTab] = useState('stock-on-hand')

  return (
    <ReportLayout title="Inventory Reports" subtitle="Stock analysis, aging, and turnover reports">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-8">
          <TabsTrigger value="stock-on-hand" className="text-xs">Stock on Hand</TabsTrigger>
          <TabsTrigger value="stock-card" className="text-xs">Stock Card</TabsTrigger>
          <TabsTrigger value="inventory-aging" className="text-xs">Inventory Aging</TabsTrigger>
          <TabsTrigger value="fifo-aging" className="text-xs">FIFO Aging</TabsTrigger>
          <TabsTrigger value="dead-stock" className="text-xs">Dead Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="stock-on-hand" key="stock-on-hand">
          <StockOnHandTab active={activeTab === 'stock-on-hand'} />
        </TabsContent>
        <TabsContent value="stock-card" key="stock-card">
          <StockCardTab active={activeTab === 'stock-card'} />
        </TabsContent>
        <TabsContent value="inventory-aging" key="inventory-aging">
          <InventoryAgingTab active={activeTab === 'inventory-aging'} />
        </TabsContent>
        <TabsContent value="fifo-aging" key="fifo-aging">
          <FIFOAgingTab active={activeTab === 'fifo-aging'} />
        </TabsContent>
        <TabsContent value="dead-stock" key="dead-stock">
          <DeadStockTab active={activeTab === 'dead-stock'} />
        </TabsContent>
      </Tabs>
    </ReportLayout>
  )
}
