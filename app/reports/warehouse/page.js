'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportLayout } from '@/components/reports/ReportLayout'
import { KPIGrid } from '@/components/reports/KPIGrid'
import { ReportTable } from '@/components/reports/ReportTable'
import { ChartCard } from '@/components/reports/ChartCard'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const STATUS_COLORS = {
  DRAFT: 'border-gray-200 bg-gray-50 text-gray-500',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-700',
  COMPLETED: 'border-green-200 bg-green-50 text-green-700',
  CANCELLED: 'border-gray-200 bg-gray-50 text-gray-400',
}

const ZONE_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#16a34a', '#0891b2', '#dc2626', '#65a30d']

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

function dailyTrend(rows, valueFn) {
  const m = {}
  for (const r of rows) {
    const date = r.createdAt || r.completedAt || r.shippedAt
    if (!date) continue
    const key = String(date).slice(0, 10)
    m[key] = (m[key] || 0) + (valueFn(r) || 0)
  }
  return Object.keys(m).sort().map((date) => ({ date: format(parseISO(date), 'dd MMM'), qty: m[date] }))
}

function ReceivingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'warehouse', 'receiving', dateRange],
    queryFn: () => api(`/reports/warehouse/receiving?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'createdAt', header: 'Date',
        accessorFn: (r) => r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.createdAt ? format(parseISO(row.original.createdAt), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      { id: 'grnNumber', header: 'GRN No.', accessorFn: (r) => r.grnNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.grnNumber || '—'}</span> },
      { id: 'refDocument', header: 'Ref', accessorFn: (r) => r.refDocument || '', cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.refDocument || '—'}</span> },
      { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.supplier || '', cell: ({ row }) => <span className="text-xs">{row.original.supplier || '—'}</span> },
      { id: 'warehouse', header: 'Warehouse', accessorFn: (r) => r.warehouse || '', cell: ({ row }) => <span className="text-xs">{row.original.warehouse || '—'}</span> },
      { accessorKey: 'totalLines', header: 'Lines', cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.totalLines)}</span> },
      { accessorKey: 'totalReceivedQty', header: 'Qty Received', cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalReceivedQty)}</span> },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'createdBy', header: 'Received By', accessorFn: (r) => r.createdBy || '', cell: ({ row }) => <span className="text-xs">{row.original.createdBy || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const totalQty = rows.reduce((s, r) => s + (r.totalReceivedQty || 0), 0)
    const totalLines = rows.reduce((s, r) => s + (r.totalLines || 0), 0)
    const pending = rows.filter((r) => r.status === 'PENDING').length
    return [
      { label: 'Total GRNs', value: fmt(rows.length), sub: 'In period' },
      { label: 'Qty Received', value: fmt(totalQty), sub: 'Units received' },
      { label: 'Lines Received', value: fmt(totalLines), sub: 'Order lines' },
      { label: 'Pending', value: fmt(pending), sub: 'Awaiting receipt', accent: 'amber' },
    ]
  }, [data, rows])

  const trend = useMemo(() => dailyTrend(rows, (r) => r.totalReceivedQty), [rows])

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
          searchPlaceholder="Search GRN, supplier..."
          exportName="receiving-report"
          exportTitle="Receiving Report"
          pageSize={20}
        />
        <ChartCard title="Receiving Trend" subtitle="Daily quantity received" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="qty" stroke="#16a34a" fill="#bbf7d0" name="Qty" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function PutawayTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'warehouse', 'putaway', dateRange],
    queryFn: () => api(`/reports/warehouse/putaway?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'completedAt', header: 'Completed',
        accessorFn: (r) => r.completedAt || r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.completedAt || row.original.createdAt ? format(parseISO(row.original.completedAt || row.original.createdAt), 'dd MMM yyyy HH:mm') : '—'}
          </span>
        ),
      },
      { id: 'taskNumber', header: 'Task No.', accessorFn: (r) => r.taskNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.taskNumber || '—'}</span> },
      { id: 'itemSku', header: 'Item', accessorFn: (r) => r.itemSku || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.itemSku || '—'}</span> },
      { id: 'fromLocation', header: 'From', accessorFn: (r) => r.fromLocation || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.fromLocation || 'Staging'}</span> },
      { id: 'toLocation', header: 'To', accessorFn: (r) => r.toLocation || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.toLocation || '—'}</span> },
      { accessorKey: 'qty', header: 'Qty', cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span> },
      { accessorKey: 'durationMinutes', header: 'Duration', cell: ({ row }) => <span className="tabular-nums text-xs text-gray-500">{row.original.durationMinutes != null ? `${row.original.durationMinutes} min` : '—'}</span> },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'completedBy', header: 'Completed By', accessorFn: (r) => r.completedBy || '', cell: ({ row }) => <span className="text-xs">{row.original.completedBy || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const durations = rows.map((r) => r.durationMinutes).filter((d) => d != null)
    const avgDuration = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null
    return [
      { label: 'Total Putaways', value: fmt(rows.length), sub: 'In period' },
      { label: 'Avg Duration', value: avgDuration != null ? `${avgDuration} min` : '—', sub: 'Average time' },
      { label: 'Completed', value: fmt(rows.filter((r) => r.status === 'COMPLETED').length), sub: 'Tasks done' },
      { label: 'Pending', value: fmt(rows.filter((r) => r.status === 'PENDING').length), sub: 'Awaiting putaway', accent: 'amber' },
    ]
  }, [data, rows])

  const trend = useMemo(() => dailyTrend(rows, (r) => r.qty), [rows])

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
          searchPlaceholder="Search task, item, location..."
          exportName="putaway-report"
          exportTitle="Putaway Report"
          pageSize={20}
        />
        <ChartCard title="Putaway Trend" subtitle="Daily quantity put away" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="qty" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function MovementTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'warehouse', 'movement', dateRange],
    queryFn: () => api(`/reports/warehouse/movement?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'createdAt', header: 'Date',
        accessorFn: (r) => r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {format(parseISO(row.original.createdAt), 'dd MMM yyyy HH:mm')}
          </span>
        ),
      },
      { id: 'transferNumber', header: 'Transfer No.', accessorFn: (r) => r.transferNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.transferNumber || '—'}</span> },
      { id: 'itemSku', header: 'Item', accessorFn: (r) => r.itemSku || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.itemSku || '—'}</span> },
      { id: 'fromLocation', header: 'From', accessorFn: (r) => r.fromLocation || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.fromLocation || '—'}</span> },
      { id: 'toLocation', header: 'To', accessorFn: (r) => r.toLocation || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.toLocation || '—'}</span> },
      { accessorKey: 'qty', header: 'Qty', cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span> },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'createdBy', header: 'Created By', accessorFn: (r) => r.createdBy || '', cell: ({ row }) => <span className="text-xs">{row.original.createdBy || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const transfers = new Set(rows.map((r) => r.transferNumber).filter(Boolean)).size
    const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0)
    const pending = rows.filter((r) => ['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(r.status)).length
    return [
      { label: 'Total Movements', value: fmt(rows.length), sub: 'Lines in period' },
      { label: 'Units Moved', value: fmt(totalQty), sub: 'Total transferred' },
      { label: 'Transfers', value: fmt(transfers), sub: 'Distinct documents' },
      { label: 'In Progress', value: fmt(pending), sub: 'Awaiting execution', accent: 'amber' },
    ]
  }, [data, rows])

  const trend = useMemo(() => dailyTrend(rows, (r) => r.qty), [rows])

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
          searchPlaceholder="Search item, location, transfer..."
          exportName="movement-report"
          exportTitle="Movement Report"
          pageSize={20}
        />
        <ChartCard title="Movement Trend" subtitle="Daily units transferred" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="qty" stroke="#2563eb" fill="#bfdbfe" name="Qty" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function AdjustmentTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'warehouse', 'adjustment', dateRange],
    queryFn: () => api(`/reports/warehouse/adjustment?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'createdAt', header: 'Date',
        accessorFn: (r) => r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {format(parseISO(row.original.createdAt), 'dd MMM yyyy HH:mm')}
          </span>
        ),
      },
      { id: 'adjustmentNumber', header: 'Adj No.', accessorFn: (r) => r.adjustmentNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.adjustmentNumber || '—'}</span> },
      { id: 'itemSku', header: 'Item', accessorFn: (r) => r.itemSku || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.itemSku || '—'}</span> },
      { id: 'locationCode', header: 'Location', accessorFn: (r) => r.locationCode || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode || '—'}</span> },
      { id: 'reasonCode', header: 'Reason', accessorFn: (r) => r.reasonCode || '', cell: ({ row }) => <Badge variant="outline" className="text-[11px]">{row.original.reasonCode || '—'}</Badge> },
      {
        accessorKey: 'diffQty', header: 'Qty Change',
        cell: ({ row }) => (
          <span className={`tabular-nums font-medium ${row.original.diffQty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {row.original.diffQty >= 0 ? '+' : ''}{fmt(row.original.diffQty)}
          </span>
        ),
      },
      { id: 'remarks', header: 'Remarks', accessorFn: (r) => r.remarks || '', cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.remarks || '—'}</span> },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'createdBy', header: 'Created By', accessorFn: (r) => r.createdBy || '', cell: ({ row }) => <span className="text-xs">{row.original.createdBy || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const positive = rows.reduce((s, r) => s + (r.diffQty > 0 ? r.diffQty : 0), 0)
    const negative = rows.reduce((s, r) => s + (r.diffQty < 0 ? Math.abs(r.diffQty) : 0), 0)
    const net = rows.reduce((s, r) => s + (r.diffQty || 0), 0)
    return [
      { label: 'Total Adjustments', value: fmt(rows.length), sub: 'In period' },
      { label: 'Positive', value: fmt(positive), sub: 'Adds to stock', accent: 'green' },
      { label: 'Negative', value: fmt(negative), sub: 'Removes from stock', accent: 'red' },
      { label: 'Net Adjustment', value: fmt(Math.round(net * 100) / 100), sub: 'Net qty change' },
    ]
  }, [data, rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
        <div className="shrink-0"><PeriodSelect value={dateRange} onChange={setDateRange} /></div>
      </div>
      <ReportTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        searchPlaceholder="Search item, location, reason..."
        exportName="adjustment-report"
        exportTitle="Adjustment Report"
        pageSize={20}
      />
    </div>
  )
}

function CycleCountTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'warehouse', 'cycle-count', dateRange],
    queryFn: () => api(`/reports/warehouse/cycle-count?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        id: 'createdAt', header: 'Count Date',
        accessorFn: (r) => r.createdAt || '',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.createdAt ? format(parseISO(row.original.createdAt), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      { id: 'countNumber', header: 'Count No.', accessorFn: (r) => r.countNumber || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.countNumber || '—'}</span> },
      { id: 'locationCode', header: 'Location', accessorFn: (r) => r.locationCode || '', cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode || '—'}</span> },
      { accessorKey: 'totalLines', header: 'Lines', cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.totalLines)}</span> },
      { accessorKey: 'totalSystemQty', header: 'System Qty', cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.totalSystemQty)}</span> },
      { accessorKey: 'totalCountedQty', header: 'Counted Qty', cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalCountedQty)}</span> },
      {
        id: 'totalVariance', header: 'Variance',
        accessorFn: (r) => r.totalVariance || 0,
        cell: ({ row }) => {
          const v = row.original.totalVariance || 0
          return (
            <span className={`tabular-nums font-medium ${v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {v > 0 ? '+' : ''}{fmt(v)}
            </span>
          )
        },
      },
      { id: 'status', header: 'Status', accessorFn: (r) => r.status || '', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'createdBy', header: 'Created By', accessorFn: (r) => r.createdBy || '', cell: ({ row }) => <span className="text-xs">{row.original.createdBy || '—'}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const accurate = rows.filter((r) => !r.totalVariance).length
    const accuracyRate = rows.length ? (accurate / rows.length) * 100 : 0
    const variances = rows.map((r) => Math.abs(r.totalVariance || 0))
    const avgVariance = variances.length ? Math.round(variances.reduce((s, v) => s + v, 0) / variances.length) : 0
    const netVariance = rows.reduce((s, r) => s + (r.totalVariance || 0), 0)
    return [
      { label: 'Total Counts', value: fmt(rows.length), sub: 'In period' },
      { label: 'Accuracy Rate', value: `${accuracyRate.toFixed(1)}%`, sub: 'Zero variance', accent: 'green' },
      { label: 'Avg Variance', value: fmt(avgVariance), sub: 'Avg absolute variance' },
      { label: 'Net Variance', value: fmt(Math.round(netVariance * 100) / 100), sub: 'System vs counted' },
    ]
  }, [data, rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
        <div className="shrink-0"><PeriodSelect value={dateRange} onChange={setDateRange} /></div>
      </div>
      <ReportTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        searchPlaceholder="Search count, location..."
        exportName="cycle-count-report"
        exportTitle="Cycle Count Report"
        pageSize={20}
      />
    </div>
  )
}

export default function WarehouseReportsPage() {
  const [activeTab, setActiveTab] = useState('receiving')

  return (
    <ReportLayout title="Warehouse Reports" subtitle="Receiving, putaway, movement, adjustment, and cycle count reports">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-8">
          <TabsTrigger value="receiving" className="text-xs">Receiving</TabsTrigger>
          <TabsTrigger value="putaway" className="text-xs">Putaway</TabsTrigger>
          <TabsTrigger value="movement" className="text-xs">Movement</TabsTrigger>
          <TabsTrigger value="adjustment" className="text-xs">Adjustment</TabsTrigger>
          <TabsTrigger value="cycle-count" className="text-xs">Cycle Count</TabsTrigger>
        </TabsList>
        <TabsContent value="receiving" key="receiving">
          <ReceivingTab active={activeTab === 'receiving'} />
        </TabsContent>
        <TabsContent value="putaway" key="putaway">
          <PutawayTab active={activeTab === 'putaway'} />
        </TabsContent>
        <TabsContent value="movement" key="movement">
          <MovementTab active={activeTab === 'movement'} />
        </TabsContent>
        <TabsContent value="adjustment" key="adjustment">
          <AdjustmentTab active={activeTab === 'adjustment'} />
        </TabsContent>
        <TabsContent value="cycle-count" key="cycle-count">
          <CycleCountTab active={activeTab === 'cycle-count'} />
        </TabsContent>
      </Tabs>
    </ReportLayout>
  )
}
