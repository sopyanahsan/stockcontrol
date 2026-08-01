'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportLayout } from '@/components/reports/ReportLayout'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ChartCard } from '@/components/reports/ChartCard'
import { KPIGrid } from '@/components/reports/KPIGrid'
import { ReportTable } from '@/components/reports/ReportTable'
import { SummaryCard } from '@/components/reports/SummaryCard'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { format, parseISO } from 'date-fns'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)
const pct = (n) => (n != null ? `${(n * 100).toFixed(1)}%` : '—')
const ZONE_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#16a34a', '#0891b2', '#dc2626', '#65a30d']

const TXN_STATUS_COLORS = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-700',
  COMPLETED: 'border-green-200 bg-green-50 text-green-700',
  CANCELLED: 'border-gray-200 bg-gray-50 text-gray-400',
}

function ReceivingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'warehouse', 'receiving', dateRange],
    queryFn: () => api(`/reports/warehouse/receiving?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'grnDate', header: 'Date',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.grnDate ? format(parseISO(row.original.grnDate), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      {
        id: 'grnNumber', header: 'GRN No.',
        accessorFn: (r) => r.grnNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.grnNumber || '—'}</span>,
      },
      {
        id: 'poNumber', header: 'PO No.',
        accessorFn: (r) => r.poNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.poNumber || '—'}</span>,
      },
      {
        id: 'supplier', header: 'Supplier',
        accessorFn: (r) => r.supplier?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.supplier?.name || '—'}</span>,
      },
      {
        accessorKey: 'itemCount', header: 'Lines',
        cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.itemCount || 0)}</span>,
      },
      {
        accessorKey: 'totalQty', header: 'Qty Received',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalQty || 0)}</span>,
      },
      {
        accessorKey: 'status', header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${TXN_STATUS_COLORS[row.original.status] || ''}`}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'grnBy', header: 'Received By',
        accessorFn: (r) => r.grnBy?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.grnBy?.name || '—'}</span>,
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total GRNs', value: fmt(data.totalGRNs || 0), description: 'In period', trend: null },
        { label: 'Total Qty Received', value: fmt(data.totalQty || 0), description: 'Units received', trend: null },
        { label: 'Avg per GRN', value: fmt(Math.round(data.avgQtyPerGRN || 0)), description: 'Units/GRN', trend: null },
        { label: 'On-Time Rate', value: pct(data.onTimeRate), description: 'Against PO ETA', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  const trend = (data?.dailyTrend || []).map((d) => ({
    date: format(parseISO(d.date), 'dd MMM'),
    qty: d.qty,
    grns: d.grns,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Period:</span>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={data?.grns || []}
          isLoading={isLoading}
          searchPlaceholder="Search GRN, PO, supplier..."
          exportName="receiving-report"
          exportTitle="Receiving Report"
          pageSize={20}
        />
        <ChartCard title="Receiving Trend" subtitle="Daily GRNs and quantity" className="lg:col-span-1">
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

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'warehouse', 'putaway', dateRange],
    queryFn: () => api(`/reports/warehouse/putaway?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'completedAt', header: 'Completed',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.completedAt ? format(parseISO(row.original.completedAt), 'dd MMM yyyy HH:mm') : '—'}
          </span>
        ),
      },
      {
        id: 'grnNumber', header: 'GRN No.',
        accessorFn: (r) => r.grnNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.grnNumber || '—'}</span>,
      },
      {
        id: 'item', header: 'Item',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku || '—'}</span>,
      },
      {
        id: 'fromLocation', header: 'From',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.fromLocation?.code || 'Staging'}</span>,
      },
      {
        id: 'toLocation', header: 'To',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.toLocation?.code || '—'}</span>,
      },
      {
        accessorKey: 'qty', header: 'Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.qty)}</span>,
      },
      {
        accessorKey: 'durationMin', header: 'Duration',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-gray-500">
            {row.original.durationMin != null ? `${row.original.durationMin} min` : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status', header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${TXN_STATUS_COLORS[row.original.status] || ''}`}>
            {row.original.status}
          </Badge>
        ),
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total Putaways', value: fmt(data.totalPutaways || 0), description: 'In period', trend: null },
        { label: 'Avg Duration', value: data.avgDurationMin != null ? `${data.avgDurationMin} min` : '—', description: 'Average time', trend: null },
        { label: 'Same-Day Rate', value: pct(data.sameDayRate), description: 'Completed same day', trend: null },
        { label: 'Pending Putaways', value: fmt(data.pendingPutaways || 0), description: 'Awaiting putaway', trend: null, accent: 'warning' },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Period:</span>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>
      <ReportTable
        columns={columns}
        data={data?.putaways || []}
        isLoading={isLoading}
        searchPlaceholder="Search GRN, item, location..."
        exportName="putaway-report"
        exportTitle="Putaway Report"
        pageSize={20}
      />
    </div>
  )
}

function MovementTab({ active }) {
  const [dateRange, setDateRange] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'warehouse', 'movement', dateRange],
    queryFn: () => api(`/reports/warehouse/movement?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'createdAt', header: 'Date',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {format(parseISO(row.original.createdAt), 'dd MMM yyyy HH:mm')}
          </span>
        ),
      },
      {
        id: 'item', header: 'Item',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku || '—'}</span>,
      },
      {
        id: 'fromLocation', header: 'From',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.fromLocation?.code || '—'}</span>,
      },
      {
        id: 'toLocation', header: 'To',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.toLocation?.code || '—'}</span>,
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
        accessorKey: 'reason', header: 'Reason',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px]">
            {row.original.reasonCode?.code || row.original.reason || '—'}
          </Badge>
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

  const kpis = data
    ? [
        { label: 'Total Movements', value: fmt(data.totalMovements || 0), description: 'In period', trend: null },
        { label: 'Transfer In', value: fmt(data.transferIn || 0), description: 'Received locations', trend: null },
        { label: 'Transfer Out', value: fmt(data.transferOut || 0), description: 'Sent from locations', trend: null },
        { label: 'Net Movement', value: fmt((data.transferIn || 0) - (data.transferOut || 0)), description: 'Net change', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  const zoneData = data?.byZone
    ? Object.entries(data.byZone).map(([zone, v]) => ({ zone, qty: v }))
    : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Period:</span>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={data?.movements || []}
          isLoading={isLoading}
          searchPlaceholder="Search item, location, reference..."
          exportName="movement-report"
          exportTitle="Movement Report"
          pageSize={20}
        />
        <ChartCard title="Movements by Zone" subtitle="Transfer quantity per zone" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={zoneData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="zone" type="category" width={80} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [fmt(v), 'Qty']} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="qty" fill="#2563eb" radius={[0, 3, 3, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function AdjustmentTab({ active }) {
  const [dateRange, setDateRange] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'warehouse', 'adjustment', dateRange],
    queryFn: () => api(`/reports/warehouse/adjustment?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'createdAt', header: 'Date',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {format(parseISO(row.original.createdAt), 'dd MMM yyyy HH:mm')}
          </span>
        ),
      },
      {
        id: 'item', header: 'Item',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku || '—'}</span>,
      },
      {
        id: 'location', header: 'Location',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code || '—'}</span>,
      },
      {
        accessorKey: 'qty', header: 'Qty Change',
        cell: ({ row }) => (
          <span className={`tabular-nums font-medium ${row.original.qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {row.original.qty >= 0 ? '+' : ''}{fmt(row.original.qty)}
          </span>
        ),
      },
      {
        id: 'reason', header: 'Reason',
        accessorFn: (r) => r.reasonCode?.code || '',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px]">{row.original.reasonCode?.code || '—'}</Badge>
        ),
      },
      {
        accessorKey: 'notes', header: 'Notes',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.notes || '—'}</span>,
      },
      {
        accessorKey: 'status', header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${TXN_STATUS_COLORS[row.original.status] || ''}`}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'user', header: 'User',
        accessorFn: (r) => r.user?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.user?.name || '—'}</span>,
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total Adjustments', value: fmt(data.totalAdjustments || 0), description: 'In period', trend: null },
        { label: 'Positive', value: fmt(data.positiveAdjustments || 0), description: 'Adds to stock', trend: null },
        { label: 'Negative', value: fmt(data.negativeAdjustments || 0), description: 'Removes from stock', trend: null },
        { label: 'Net Adjustment', value: fmt((data.positiveAdjustments || 0) - (data.negativeAdjustments || 0)), description: 'Net change', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Period:</span>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>
      <ReportTable
        columns={columns}
        data={data?.adjustments || []}
        isLoading={isLoading}
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

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'warehouse', 'cycle-count', dateRange],
    queryFn: () => api(`/reports/warehouse/cycle-count?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'countDate', header: 'Count Date',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.countDate ? format(parseISO(row.original.countDate), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      {
        id: 'item', header: 'Item',
        accessorFn: (r) => r.item?.sku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.item?.sku || '—'}</span>,
      },
      {
        id: 'location', header: 'Location',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code || '—'}</span>,
      },
      {
        accessorKey: 'systemQty', header: 'System Qty',
        cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.systemQty)}</span>,
      },
      {
        accessorKey: 'countedQty', header: 'Counted Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.countedQty)}</span>,
      },
      {
        id: 'variance', header: 'Variance',
        cell: ({ row }) => {
          const v = (row.original.countedQty || 0) - (row.original.systemQty || 0)
          return (
            <span className={`tabular-nums font-medium ${v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {v > 0 ? '+' : ''}{fmt(v)}
            </span>
          )
        },
      },
      {
        id: 'variancePct', header: 'Variance %',
        cell: ({ row }) => {
          const sys = row.original.systemQty || 0
          const v = (row.original.countedQty || 0) - sys
          const pct = sys !== 0 ? (v / sys) * 100 : 0
          return <span className="tabular-nums text-xs text-gray-500">{pct.toFixed(1)}%</span>
        },
      },
      {
        accessorKey: 'status', header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${TXN_STATUS_COLORS[row.original.status] || ''}`}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'countedBy', header: 'Counted By',
        accessorFn: (r) => r.countedBy?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.countedBy?.name || '—'}</span>,
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total Counts', value: fmt(data.totalCounts || 0), description: 'In period', trend: null },
        { label: 'Accuracy Rate', value: pct(data.accuracyRate), description: 'Zero variance', trend: null },
        { label: 'Avg Variance', value: fmt(Math.round(data.avgVariance || 0)), description: 'Avg absolute variance', trend: null },
        { label: 'Location Coverage', value: pct(data.locationCoverage), description: 'Locations counted', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid kpis={kpis} isLoading={isLoading} columns={4} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Period:</span>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>
      <ReportTable
        columns={columns}
        data={data?.counts || []}
        isLoading={isLoading}
        searchPlaceholder="Search item, location..."
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
