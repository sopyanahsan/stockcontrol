'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportLayout } from '@/components/reports/ReportLayout'
import { ChartCard } from '@/components/reports/ChartCard'
import { KPIGrid } from '@/components/reports/KPIGrid'
import { ReportTable } from '@/components/reports/ReportTable'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie } from 'recharts'
import { format, parseISO } from 'date-fns'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)
const pct = (n) => (n != null ? `${(n * 100).toFixed(1)}%` : '—')

const STATUS_COLORS = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  ASSIGNED: 'border-blue-200 bg-blue-50 text-blue-700',
  IN_PROGRESS: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  PICKED: 'border-purple-200 bg-purple-50 text-purple-700',
  PACKED: 'border-teal-200 bg-teal-50 text-teal-700',
  SHIPPED: 'border-green-200 bg-green-50 text-green-700',
  DELIVERED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CANCELLED: 'border-gray-200 bg-gray-50 text-gray-400',
  ON_HOLD: 'border-red-200 bg-red-50 text-red-700',
  PARTIAL: 'border-orange-200 bg-orange-50 text-orange-700',
}

const SHIP_COLORS = ['#16a34a', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2']

function PickingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'outbound', 'picking', dateRange],
    queryFn: () => api(`/reports/outbound/picking?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'assignedAt', header: 'Assigned',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.assignedAt ? format(parseISO(row.original.assignedAt), 'dd MMM HH:mm') : '—'}
          </span>
        ),
      },
      {
        id: 'pickId', header: 'Pick ID',
        accessorFn: (r) => r.pickId || r.id || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.pickId || row.original.id || '—'}</span>,
      },
      {
        id: 'soNumber', header: 'SO No.',
        accessorFn: (r) => r.salesOrder?.orderNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.salesOrder?.orderNumber || '—'}</span>,
      },
      {
        id: 'customer', header: 'Customer',
        accessorFn: (r) => r.salesOrder?.customer?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.salesOrder?.customer?.name || '—'}</span>,
      },
      {
        accessorKey: 'itemCount', header: 'Lines',
        cell: ({ row }) => <span className="tabular-nums text-xs">{fmt(row.original.itemCount || 0)}</span>,
      },
      {
        accessorKey: 'totalQty', header: 'Qty Picked',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalQty || 0)}</span>,
      },
      {
        accessorKey: 'status', header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[row.original.status] || ''}`}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'assignedTo', header: 'Assigned To',
        accessorFn: (r) => r.assignedTo?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.assignedTo?.name || '—'}</span>,
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total Picks', value: fmt(data.totalPicks || 0), description: 'In period', trend: null },
        { label: 'Lines Picked', value: fmt(data.totalLines || 0), description: 'Order lines', trend: null },
        { label: 'Units Picked', value: fmt(data.totalUnits || 0), description: 'Total units', trend: null },
        { label: 'Avg Lines/Pick', value: fmt(Math.round(data.avgLinesPerPick || 0)), description: 'Efficiency', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  const trend = (data?.dailyTrend || []).map((d) => ({
    date: format(parseISO(d.date), 'dd MMM'),
    picks: d.picks,
    units: d.units,
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
          data={data?.picks || []}
          isLoading={isLoading}
          searchPlaceholder="Search pick ID, SO, customer..."
          exportName="picking-report"
          exportTitle="Picking Report"
          pageSize={20}
        />
        <ChartCard title="Picking Trend" subtitle="Daily picks and units" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="units" stroke="#2563eb" fill="#bfdbfe" name="Units" />
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

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'outbound', 'packing', dateRange],
    queryFn: () => api(`/reports/outbound/packing?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'packedAt', header: 'Packed',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.packedAt ? format(parseISO(row.original.packedAt), 'dd MMM yyyy HH:mm') : '—'}
          </span>
        ),
      },
      {
        id: 'packId', header: 'Pack ID',
        accessorFn: (r) => r.packId || r.id || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.packId || row.original.id || '—'}</span>,
      },
      {
        id: 'soNumber', header: 'SO No.',
        accessorFn: (r) => r.salesOrder?.orderNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.salesOrder?.orderNumber || '—'}</span>,
      },
      {
        id: 'customer', header: 'Customer',
        accessorFn: (r) => r.salesOrder?.customer?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.salesOrder?.customer?.name || '—'}</span>,
      },
      {
        accessorKey: 'totalQty', header: 'Qty Packed',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalQty || 0)}</span>,
      },
      {
        accessorKey: 'packageType', header: 'Package',
        cell: ({ row }) => <span className="text-xs">{row.original.packageType || '—'}</span>,
      },
      {
        accessorKey: 'weight', header: 'Weight (kg)',
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-gray-500">
            {row.original.weight != null ? Number(row.original.weight).toFixed(2) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status', header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[row.original.status] || ''}`}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'packedBy', header: 'Packed By',
        accessorFn: (r) => r.packedBy?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.packedBy?.name || '—'}</span>,
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total Packs', value: fmt(data.totalPacks || 0), description: 'In period', trend: null },
        { label: 'Units Packed', value: fmt(data.totalUnits || 0), description: 'Total units', trend: null },
        { label: 'Avg Weight', value: data.avgWeight != null ? `${Number(data.avgWeight).toFixed(2)} kg` : '—', description: 'Per package', trend: null },
        { label: 'Throughput', value: fmt(data.throughputPerHour || 0), description: 'Packs per hour', trend: null },
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
        data={data?.packs || []}
        isLoading={isLoading}
        searchPlaceholder="Search pack ID, SO, customer..."
        exportName="packing-report"
        exportTitle="Packing Report"
        pageSize={20}
      />
    </div>
  )
}

function ShippingTab({ active }) {
  const [dateRange, setDateRange] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'outbound', 'shipping', dateRange],
    queryFn: () => api(`/reports/outbound/shipping?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'shippedAt', header: 'Shipped',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.shippedAt ? format(parseISO(row.original.shippedAt), 'dd MMM yyyy HH:mm') : '—'}
          </span>
        ),
      },
      {
        id: 'doNumber', header: 'DO No.',
        accessorFn: (r) => r.deliveryOrderNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.deliveryOrderNumber || '—'}</span>,
      },
      {
        id: 'soNumber', header: 'SO No.',
        accessorFn: (r) => r.salesOrder?.orderNumber || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.salesOrder?.orderNumber || '—'}</span>,
      },
      {
        id: 'customer', header: 'Customer',
        accessorFn: (r) => r.salesOrder?.customer?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.salesOrder?.customer?.name || '—'}</span>,
      },
      {
        accessorKey: 'totalQty', header: 'Qty Shipped',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalQty || 0)}</span>,
      },
      {
        accessorKey: 'carrier', header: 'Carrier',
        cell: ({ row }) => <span className="text-xs">{row.original.carrier || '—'}</span>,
      },
      {
        accessorKey: 'trackingNumber', header: 'Tracking',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-500">{row.original.trackingNumber || '—'}</span>
        ),
      },
      {
        accessorKey: 'status', header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[row.original.status] || ''}`}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'shippedBy', header: 'Shipped By',
        accessorFn: (r) => r.shippedBy?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.shippedBy?.name || '—'}</span>,
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Total Shipments', value: fmt(data.totalShipments || 0), description: 'In period', trend: null },
        { label: 'Units Shipped', value: fmt(data.totalUnits || 0), description: 'Total units', trend: null },
        { label: 'On-Time Rate', value: pct(data.onTimeRate), description: 'Against promised date', trend: null },
        { label: 'Fill Rate', value: pct(data.fillRate), description: 'Order lines fulfilled', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  const trend = (data?.dailyTrend || []).map((d) => ({
    date: format(parseISO(d.date), 'dd MMM'),
    shipments: d.shipments,
    units: d.units,
  }))

  const carrierData = data?.byCarrier
    ? Object.entries(data.byCarrier).map(([carrier, qty]) => ({ carrier, qty }))
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
          data={data?.shipments || []}
          isLoading={isLoading}
          searchPlaceholder="Search DO, SO, customer, tracking..."
          exportName="shipping-report"
          exportTitle="Shipping Report"
          pageSize={20}
        />
        <ChartCard title="Shipping Trend" subtitle="Daily shipments" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="units" stroke="#7c3aed" fill="#ede9fe" name="Units" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="By Carrier" subtitle="Shipment distribution" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <PieChart>
                <Pie
                  data={carrierData}
                  dataKey="qty"
                  nameKey="carrier"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                  label={({ carrier, percent }) => `${carrier} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {carrierData.map((_, i) => (
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
