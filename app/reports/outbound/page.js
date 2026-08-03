'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import * as analytics from '@/lib/analytics/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportLayout } from '@/components/reports/ReportLayout'
import { KPIGrid } from '@/components/reports/KPIGrid'
import { ReportTable } from '@/components/reports/ReportTable'
import { ChartCard } from '@/components/reports/ChartCard'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie } from 'recharts'
import { format, parseISO } from 'date-fns'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const STATUS_COLORS = {
  DRAFT: 'border-gray-200 bg-gray-50 text-gray-500',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  ASSIGNED: 'border-blue-200 bg-blue-50 text-blue-700',
  IN_PROGRESS: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  PICKED: 'border-purple-200 bg-purple-50 text-purple-700',
  PACKED: 'border-teal-200 bg-teal-50 text-teal-700',
  SHIPPED: 'border-green-200 bg-green-50 text-green-700',
  DELIVERED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CANCELLED: 'border-gray-200 bg-gray-50 text-gray-400',
  ON_HOLD: 'border-red-200 bg-red-50 text-red-700',
}

const SHIP_COLORS = ['#16a34a', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2']

function useFromDate(days) {
  return useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - Number(days))
    return d.toISOString().slice(0, 10)
  }, [days])
}

function PeriodSelect({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Period:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="60">Last 60 days</option>
        <option value="90">Last 90 days</option>
      </select>
    </div>
  )
}

function StatusBadge({ status }) {
  return <Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[status] || ''}`}>{status || '—'}</Badge>
}

function emptyKpis() {
  return [
    { label: '—', value: '—' },
    { label: '—', value: '—' },
    { label: '—', value: '—' },
    { label: '—', value: '—' },
  ]
}

function dailyTrend(rows, dateKey, valueFn) {
  const m = {}
  for (const r of rows) {
    const date = r[dateKey]
    if (!date) continue
    const key = String(date).slice(0, 10)
    m[key] = (m[key] || 0) + (valueFn(r) || 0)
  }
  return Object.keys(m).sort().map((date) => ({ date: format(parseISO(date), 'dd MMM'), qty: m[date] }))
}

function PickingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'outbound', 'picking', dateRange],
    queryFn: () => api(`/reports/outbound/picking?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  // Outbound KPIs come from the Analytics Client (shared queryKey dedupes
  // the fetch across tabs). Metrics the engine does not yet expose fall back
  // to the detailed report rows.
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'outbound'],
    queryFn: () => analytics.outbound(),
    enabled: active,
  })
  const picking = analyticsData?.data?.picking?.data
  const engine = picking?.summary || {}
  const engineStatus = picking?.status || {}

  const columns = useMemo(
    () => [
      {
        id: 'createdAt', header: 'Created',
        accessorFn: (r) => r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.createdAt ? format(parseISO(row.original.createdAt), 'dd MMM HH:mm') : '—'}
          </span>
        ),
      },
      { id: 'pickingNumber', header: 'Pick No.', accessorFn: (r) => r.pickingNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.pickingNumber || '—'}</span> },
      { accessorKey: 'priority', header: 'Priority', cell: ({ row }) => <Badge variant="outline" className="text-[11px]">{row.original.priority || 'NORMAL'}</Badge> },
      { accessorKey: 'totalLines', header: 'Lines', cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.totalLines)}</span> },
      { accessorKey: 'totalOrderedQty', header: 'Ordered', cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.totalOrderedQty)}</span> },
      { accessorKey: 'totalPickedQty', header: 'Picked', cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalPickedQty)}</span> },
      { accessorKey: 'fillRate', header: 'Fill Rate', cell: ({ row }) => <span className="tabular-nums text-xs text-gray-500">{row.original.fillRate != null ? `${row.original.fillRate}%` : '—'}</span> },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'assignedTo', header: 'Assigned To', accessorFn: (r) => r.assignedTo || '', cell: ({ row }) => <span className="text-xs">{row.original.assignedTo || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const totalLines = rows.reduce((s, r) => s + (r.totalLines || 0), 0)
    const totalPicked = rows.reduce((s, r) => s + (r.totalPickedQty || 0), 0)
    const pendingRows = rows.filter((r) => ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)).length
    const enginePending = (engine.draft ?? 0) + (engine.started ?? 0) + (engineStatus.ASSIGNED ?? 0)
    const hasEngine = Object.keys(engine).length > 0
    return [
      { label: 'Total Picks', value: fmt(engine.totalDocuments ?? rows.length), sub: 'In period' },
      { label: 'Lines Picked', value: fmt(engine.totalLines ?? totalLines), sub: 'Order lines' },
      { label: 'Units Picked', value: fmt(engine.totalQuantity ?? totalPicked), sub: 'Total units' },
      { label: 'Pending', value: fmt(hasEngine ? enginePending : pendingRows), sub: 'Awaiting completion', accent: 'amber' },
    ]
  }, [data, rows, engine, engineStatus])

  const trend = useMemo(() => dailyTrend(rows, 'createdAt', (r) => r.totalPickedQty), [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
        <div className="shrink-0"><PeriodSelect value={dateRange} onChange={setDateRange} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          searchPlaceholder="Search pick no., item..."
          exportName="picking-report"
          exportTitle="Picking Report"
          pageSize={20}
        />
        <ChartCard title="Picking Trend" subtitle="Daily units picked" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="qty" stroke="#2563eb" fill="#bfdbfe" name="Units" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function PackingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'outbound', 'packing', dateRange],
    queryFn: () => api(`/reports/outbound/packing?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  // Packing KPIs come from the Analytics Client (shared queryKey dedupes fetch).
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'outbound'],
    queryFn: () => analytics.outbound(),
    enabled: active,
  })
  const packing = analyticsData?.data?.packing?.data
  const engine = packing?.summary || {}

  const columns = useMemo(
    () => [
      {
        id: 'createdAt', header: 'Created',
        accessorFn: (r) => r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.createdAt ? format(parseISO(row.original.createdAt), 'dd MMM yyyy HH:mm') : '—'}
          </span>
        ),
      },
      { id: 'packingNumber', header: 'Pack No.', accessorFn: (r) => r.packingNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.packingNumber || '—'}</span> },
      { id: 'pickingNumber', header: 'Pick No.', accessorFn: (r) => r.pickingNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.pickingNumber || '—'}</span> },
      {
        id: 'packages', header: 'Packages',
        accessorFn: (r) => `${r.closedPackages || 0}/${r.totalPackages || 0}`,
        cell: ({ row }) => <span className="tabular-nums text-xs">{row.original.closedPackages || 0}/{row.original.totalPackages || 0}</span>,
      },
      { accessorKey: 'totalItemsPacked', header: 'Items Packed', cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalItemsPacked)}</span> },
      { accessorKey: 'durationMinutes', header: 'Duration', cell: ({ row }) => <span className="tabular-nums text-xs text-gray-500">{row.original.durationMinutes != null ? `${row.original.durationMinutes} min` : '—'}</span> },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'assignedTo', header: 'Assigned To', accessorFn: (r) => r.assignedTo || '', cell: ({ row }) => <span className="text-xs">{row.original.assignedTo || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const totalItems = rows.reduce((s, r) => s + (r.totalItemsPacked || 0), 0)
    const openPackages = rows.reduce((s, r) => s + (r.openPackages || 0), 0)
    const durations = rows.map((r) => r.durationMinutes).filter((d) => d != null)
    const avgDuration = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null
    return [
      { label: 'Total Packs', value: fmt(engine.totalDocuments ?? rows.length), sub: 'In period' },
      { label: 'Items Packed', value: fmt(engine.packedQuantity ?? totalItems), sub: 'Total units' },
      { label: 'Open Packages', value: fmt(engine.started ?? openPackages), sub: 'Being packed', accent: 'amber' },
      { label: 'Avg Duration', value: avgDuration != null ? `${avgDuration} min` : '—', sub: 'Per order' },
    ]
  }, [data, rows, engine])

  const trend = useMemo(() => dailyTrend(rows, 'createdAt', (r) => r.totalItemsPacked), [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
        <div className="shrink-0"><PeriodSelect value={dateRange} onChange={setDateRange} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          searchPlaceholder="Search pack no., pick no..."
          exportName="packing-report"
          exportTitle="Packing Report"
          pageSize={20}
        />
        <ChartCard title="Packing Trend" subtitle="Daily items packed" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="qty" fill="#d97706" radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function ShippingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'outbound', 'shipping', dateRange],
    queryFn: () => api(`/reports/outbound/shipping?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  // Shipping KPIs come from the Analytics Client (shared queryKey dedupes fetch).
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'outbound'],
    queryFn: () => analytics.outbound(),
    enabled: active,
  })
  const shipping = analyticsData?.data?.shipping?.data
  const engine = shipping?.summary || {}

  const columns = useMemo(
    () => [
      {
        id: 'shippedAt', header: 'Shipped',
        accessorFn: (r) => r.shippedAt || r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.shippedAt || row.original.createdAt ? format(parseISO(row.original.shippedAt || row.original.createdAt), 'dd MMM yyyy HH:mm') : '—'}
          </span>
        ),
      },
      { id: 'shipmentNumber', header: 'Shipment No.', accessorFn: (r) => r.shipmentNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.shipmentNumber || '—'}</span> },
      { id: 'packingNumber', header: 'Pack No.', accessorFn: (r) => r.packingNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.packingNumber || '—'}</span> },
      {
        id: 'packages', header: 'Packages',
        accessorFn: (r) => `${r.verifiedPackages || 0}/${r.totalPackages || 0}`,
        cell: ({ row }) => <span className="tabular-nums text-xs">{row.original.verifiedPackages || 0}/{row.original.totalPackages || 0}</span>,
      },
      { accessorKey: 'durationMinutes', header: 'Duration', cell: ({ row }) => <span className="tabular-nums text-xs text-gray-500">{row.original.durationMinutes != null ? `${row.original.durationMinutes} min` : '—'}</span> },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'assignedTo', header: 'Assigned To', accessorFn: (r) => r.assignedTo || '', cell: ({ row }) => <span className="text-xs">{row.original.assignedTo || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const totalPackages = rows.reduce((s, r) => s + (r.totalPackages || 0), 0)
    const durations = rows.map((r) => r.durationMinutes).filter((d) => d != null)
    const avgDuration = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null
    const pendingRows = rows.filter((r) => !['SHIPPED', 'DELIVERED'].includes(r.status)).length
    const hasEngine = Object.keys(engine).length > 0
    const notShipped = (engine.draft ?? 0) + (engine.started ?? 0)
    return [
      { label: 'Total Shipments', value: fmt(engine.totalDocuments ?? rows.length), sub: 'In period' },
      { label: 'Packages', value: fmt(totalPackages), sub: 'Total packages' },
      { label: 'Avg Duration', value: avgDuration != null ? `${avgDuration} min` : '—', sub: 'Per shipment' },
      { label: 'Not Shipped', value: fmt(hasEngine ? notShipped : pendingRows), sub: 'Awaiting shipment', accent: 'amber' },
    ]
  }, [data, rows, engine])

  const trend = useMemo(() => dailyTrend(rows, 'shippedAt', (r) => r.totalPackages), [rows])

  const statusData = useMemo(() => {
    const m = {}
    for (const r of rows) m[r.status || '—'] = (m[r.status || '—'] || 0) + 1
    return Object.entries(m).map(([status, qty]) => ({ status, qty }))
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
        <div className="shrink-0"><PeriodSelect value={dateRange} onChange={setDateRange} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          searchPlaceholder="Search shipment, package..."
          exportName="shipping-report"
          exportTitle="Shipping Report"
          pageSize={20}
        />
        <ChartCard title="Shipping Trend" subtitle="Daily packages shipped" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="qty" stroke="#7c3aed" fill="#ede9fe" name="Packages" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="By Status" subtitle="Shipment distribution" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="qty"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                  label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={SHIP_COLORS[i % SHIP_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [fmt(v), name]} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

export default function OutboundReportsPage() {
  const [activeTab, setActiveTab] = useState('picking')

  return (
    <ReportLayout title="Outbound Reports" subtitle="Picking, packing, and shipping performance reports">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-8">
          <TabsTrigger value="picking" className="text-xs">Picking</TabsTrigger>
          <TabsTrigger value="packing" className="text-xs">Packing</TabsTrigger>
          <TabsTrigger value="shipping" className="text-xs">Shipping</TabsTrigger>
        </TabsList>
        <TabsContent value="picking" key="picking">
          <PickingTab active={activeTab === 'picking'} />
        </TabsContent>
        <TabsContent value="packing" key="packing">
          <PackingTab active={activeTab === 'packing'} />
        </TabsContent>
        <TabsContent value="shipping" key="shipping">
          <ShippingTab active={activeTab === 'shipping'} />
        </TabsContent>
      </Tabs>
    </ReportLayout>
  )
}
