'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import * as analytics from '@/lib/analytics/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportLayout } from '@/components/reports/ReportLayout'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ChartCard } from '@/components/reports/ChartCard'
import { KPIGrid } from '@/components/reports/KPIGrid'
import { ReportTable } from '@/components/reports/ReportTable'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { format, parseISO } from 'date-fns'
import { formatCurrency } from '@/lib/currency'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

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

  // Stock KPI summary comes from the Analytics Client (KPI Engine).
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'inventory'],
    queryFn: () => analytics.inventory(),
    enabled: active,
  })
  const inventoryMetrics = analyticsData?.data
  const engineSummary = inventoryMetrics?.summary || {}
  const engineHealth = inventoryMetrics?.health || {}

  const rows = useMemo(() => data?.data || [], [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        String(r.sku || '').toLowerCase().includes(q) ||
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.locationCode || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const columns = useMemo(
    () => [
      {
        id: 'sku',
        header: 'SKU',
        accessorFn: (r) => r.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku || '—'}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.name || '', cell: ({ row }) => <span className="text-xs">{row.original.name || '—'}</span> },
      {
        id: 'category', header: 'Category',
        accessorFn: (r) => r.category || '',
        cell: ({ row }) => (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{row.original.category || '—'}</span>
        ),
      },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.locationCode || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode || '—'}</span>,
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
        accessorFn: (r) => r.uom || '',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.uom || '—'}</span>,
      },
      {
        id: 'value', header: 'Value at Cost',
        accessorFn: (r) => r.totalValue || 0,
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700">{formatCurrency(row.original.totalValue || 0)}</span>
        ),
      },
      {
        id: 'reorder', header: 'Reorder Level',
        accessorFn: (r) => r.reorderPoint || 0,
        cell: ({ row }) => {
          const below = row.original.isLowStock
          return (
            <Badge variant="outline" className={`${below ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200'} text-[11px]`}>
              {fmt(row.original.reorderPoint || 0)}
            </Badge>
          )
        },
      },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return Array(4).fill({ label: '—', value: '—', description: '', trend: null })
    const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0)
    const totalValue = rows.reduce((s, r) => s + (r.totalValue || 0), 0)
    const belowReorder = rows.filter((r) => r.isLowStock).length
    const hasEngine = Object.keys(engineSummary).length > 0
    const belowEngine = (engineHealth.low ?? 0) + (engineHealth.outOfStock ?? 0)
    return [
      { label: 'Total SKUs', value: fmt(hasEngine ? engineSummary.totalSku ?? rows.length : rows.length), sub: 'Items with stock' },
      { label: 'Total Qty', value: fmt(hasEngine ? engineSummary.totalQuantity ?? totalQty : totalQty), sub: 'Units on hand' },
      { label: 'Total Value', value: formatCurrency(hasEngine ? engineSummary.inventoryValue ?? totalValue : totalValue), sub: 'At unit cost' },
      { label: 'Below Reorder', value: fmt(hasEngine ? belowEngine : belowReorder), sub: 'Need replenishment', accent: 'amber' },
    ]
  }, [data, rows, engineSummary, engineHealth])

  const zoneData = useMemo(() => {
    const m = {}
    for (const r of rows) {
      const zone = r.zone || '—'
      m[zone] = (m[zone] || 0) + (r.qty || 0)
    }
    return Object.entries(m).map(([zone, qty]) => ({ zone, qty }))
  }, [rows])

  return (
    <div className="space-y-4">
      <KPIGrid items={kpis} />
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
    enabled: active && !!itemId,
  })

  const hasFilters = !!(itemId || locationId || fromDate || toDate)

  const entries = useMemo(() => data?.data || [], [data])
  const currentBalance = useMemo(() => (entries.length ? entries[entries.length - 1].balance : null), [entries])

  const columns = useMemo(
    () => [
      {
        accessorKey: 'date', header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {format(parseISO(row.original.date), 'dd MMM yyyy HH:mm:ss')}
          </span>
        ),
      },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.locationCode || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode || '—'}</span>,
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
        accessorKey: 'balance', header: 'Running Balance',
        cell: ({ row }) => (
          <span className={`tabular-nums font-medium ${row.original.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {fmt(row.original.balance)}
          </span>
        ),
      },
      {
        accessorKey: 'unitCost', header: 'Unit Cost',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-gray-500">
            {row.original.unitCost != null ? formatCurrency(row.original.unitCost) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'refNumber', header: 'Reference',
        cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.refNumber || '—'}</span>,
      },
      {
        id: 'reason', header: 'Reason',
        accessorFn: (r) => r.reasonCode || '',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.reasonCode || '—'}</span>,
      },
      {
        id: 'user', header: 'User',
        accessorFn: (r) => r.user || '',
        cell: ({ row }) => <span className="text-xs">{row.original.user || '—'}</span>,
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
        {currentBalance != null && (
          <Badge variant="outline" className="ml-auto border-blue-200 bg-blue-50 text-xs">
            Running Balance: <strong className="tabular-nums">{fmt(currentBalance)}</strong>
          </Badge>
        )}
      </div>
      {!hasFilters ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="text-sm text-gray-500">Select an item to view its stock card</div>
        </div>
      ) : (
        <ReportTable
          columns={columns}
          data={entries}
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

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'sku', header: 'SKU',
        accessorFn: (r) => r.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku || '—'}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.name || '', cell: ({ row }) => <span className="text-xs">{row.original.name || '—'}</span> },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.locationCode || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode || '—'}</span>,
      },
      {
        accessorKey: 'qty', header: 'Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span>,
      },
      {
        accessorKey: 'daysSinceActivity', header: 'Days in Stock',
        cell: ({ row }) => {
          const d = row.original.daysSinceActivity
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
        accessorKey: 'lastActivityDate', header: 'Last Activity',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.lastActivityDate ? format(parseISO(row.original.lastActivityDate), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'unitCost', header: 'Unit Cost',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-gray-500">
            {row.original.unitCost != null ? formatCurrency(row.original.unitCost) : '—'}
          </span>
        ),
      },
      {
        id: 'value', header: 'Value',
        accessorFn: (r) => r.totalValue || 0,
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700">{formatCurrency(row.original.totalValue || 0)}</span>
        ),
      },
    ],
    []
  )

  const ageBuckets = useMemo(() => {
    const summary = data?.summary?.buckets || []
    return summary.map((b) => {
      const key = String(b.label || '')
      const color = key.startsWith('0-') ? '#16a34a' : key.startsWith('31-') ? '#2563eb' : key.startsWith('61-') ? '#d97706' : key.startsWith('91-') ? '#db2777' : '#dc2626'
      return { bucket: key.replace('-9999', '+').replace('-', '–'), qty: b.qty || 0, color }
    })
  }, [data])

  const kpis = useMemo(() => {
    if (!data) return Array(4).fill({ label: '—', value: '—', description: '', trend: null })
    const totalItems = rows.length
    const totalValue = rows.reduce((s, r) => s + (r.totalValue || 0), 0)
    const avgAgeDays = totalItems ? Math.round(rows.reduce((s, r) => s + (r.daysSinceActivity || 0), 0) / totalItems) : 0
    const staleItems = rows.filter((r) => (r.daysSinceActivity || 0) > 180).length
    return [
      { label: 'Total Items', value: fmt(totalItems), sub: 'Stock items tracked' },
      { label: 'Total Value', value: formatCurrency(totalValue), sub: 'At unit cost' },
      { label: 'Avg Age', value: `${avgAgeDays}d`, sub: 'Average days in stock' },
      { label: 'Stale Stock', value: fmt(staleItems), sub: '> 180 days', accent: 'amber' },
    ]
  }, [data, rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
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
          data={rows}
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

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'sku', header: 'SKU',
        accessorFn: (r) => r.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku || '—'}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.name || '', cell: ({ row }) => <span className="text-xs">{row.original.name || '—'}</span> },
      {
        id: 'batch', header: 'Reference',
        accessorFn: (r) => r.refNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.refNumber || '—'}</span>,
      },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.locationCode || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode || '—'}</span>,
      },
      {
        accessorKey: 'qtyRemaining', header: 'Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qtyRemaining)}</span>,
      },
      {
        accessorKey: 'receivedAt', header: 'Received Date',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.receivedAt ? format(parseISO(row.original.receivedAt), 'dd MMM yyyy') : '—'}
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
        id: 'value', header: 'Value',
        accessorFn: (r) => r.totalValue || 0,
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700">{formatCurrency(row.original.totalValue || 0)}</span>
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
        data={rows}
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

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'sku', header: 'SKU',
        accessorFn: (r) => r.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku || '—'}</span>,
      },
      { id: 'name', header: 'Item Name', accessorFn: (r) => r.name || '', cell: ({ row }) => <span className="text-xs">{row.original.name || '—'}</span> },
      {
        id: 'category', header: 'Category',
        accessorFn: (r) => r.category || '',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.category || '—'}</span>,
      },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.locations || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.locations || '—'}</span>,
      },
      {
        accessorKey: 'totalQty', header: 'Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalQty)}</span>,
      },
      {
        accessorKey: 'lastActivityDate', header: 'Last Movement',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.lastActivityDate ? format(parseISO(row.original.lastActivityDate), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'daysInactive', header: 'Days Idle',
        cell: ({ row }) => (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600 text-[11px]">
            {row.original.daysInactive || 0} days
          </Badge>
        ),
      },
      {
        id: 'value', header: 'Tied-up Value',
        accessorFn: (r) => r.totalValue || 0,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium text-red-600">
            {formatCurrency(row.original.totalValue || 0)}
          </span>
        ),
      },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return Array(4).fill({ label: '—', value: '—', description: '', trend: null })
    const totalValue = rows.reduce((s, r) => s + (r.totalValue || 0), 0)
    const byCat = {}
    for (const r of rows) {
      const c = r.category || '—'
      byCat[c] = (byCat[c] || 0) + (r.totalQty || 0)
    }
    const topCategory = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    return [
      { label: 'Dead Stock Items', value: fmt(rows.length), sub: 'No movement > threshold', accent: 'amber' },
      { label: 'Tied-up Value', value: formatCurrency(totalValue), sub: 'Capital locked in dead stock' },
      { label: 'Top Category', value: topCategory, sub: 'Most dead stock' },
      { label: 'Threshold', value: `${threshold}d`, sub: 'Idle period' },
    ]
  }, [data, rows, threshold])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
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
        data={rows}
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
