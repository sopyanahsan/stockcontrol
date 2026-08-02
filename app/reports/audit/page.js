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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const ACTION_COLORS = {
  CREATE: 'border-green-200 bg-green-50 text-green-700',
  UPDATE: 'border-blue-200 bg-blue-50 text-blue-700',
  DELETE: 'border-red-200 bg-red-50 text-red-700',
  POST: 'border-purple-200 bg-purple-50 text-purple-700',
  LOGIN: 'border-purple-200 bg-purple-50 text-purple-700',
  LOGOUT: 'border-gray-200 bg-gray-50 text-gray-500',
  VIEW: 'border-gray-200 bg-gray-50 text-gray-400',
  EXPORT: 'border-teal-200 bg-teal-50 text-teal-700',
  APPROVE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECT: 'border-orange-200 bg-orange-50 text-orange-700',
}

const MODULE_OPTIONS = [
  'AUTH', 'MASTER_ITEM', 'MASTER_CATEGORY', 'MASTER_UOM', 'LOCATION', 'RECEIVING', 'PUTAWAY',
  'MOVEMENT', 'ADJUSTMENT', 'CYCLE_COUNT', 'PICKING', 'PACKING', 'SHIPPING', 'STOCK_OPNAME',
]

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

function emptyKpis() {
  return [
    { label: '—', value: '—' },
    { label: '—', value: '—' },
    { label: '—', value: '—' },
    { label: '—', value: '—' },
  ]
}

function AuditTrailTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'audit', 'trail', dateRange, module, action],
    queryFn: () => {
      const params = new URLSearchParams({ fromDate })
      if (module) params.set('module', module)
      if (action) params.set('action', action)
      return api(`/reports/audit/trail?${params.toString()}`)
    },
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  const columns = useMemo(
    () => [
      {
        accessorKey: 'timestamp', header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {row.original.timestamp ? format(parseISO(row.original.timestamp), 'dd MMM yyyy HH:mm:ss') : '—'}
          </span>
        ),
      },
      {
        id: 'user', header: 'User',
        accessorFn: (r) => r.userName || '',
        cell: ({ row }) => (
          <div>
            <div className="text-xs font-medium">{row.original.userName || 'System'}</div>
            <div className="text-[10px] text-gray-400">{row.original.userEmail || ''}</div>
          </div>
        ),
      },
      {
        accessorKey: 'action', header: 'Action',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${ACTION_COLORS[row.original.action] || ''}`}>
            {row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: 'module', header: 'Module',
        cell: ({ row }) => (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{row.original.module || '—'}</span>
        ),
      },
      {
        accessorKey: 'entityType', header: 'Entity',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.entityType || '—'}</span>,
      },
      {
        accessorKey: 'entityId', header: 'Entity ID',
        cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.entityId || '—'}</span>,
      },
      {
        accessorKey: 'description', header: 'Details',
        cell: ({ row }) => (
          <span className="max-w-xs truncate text-xs text-gray-500" title={row.original.description}>
            {row.original.description || '—'}
          </span>
        ),
      },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const activeUsers = new Set(rows.map((r) => r.userId).filter(Boolean)).size
    const creates = rows.filter((r) => r.action === 'CREATE').length
    const updates = rows.filter((r) => r.action === 'UPDATE').length
    return [
      { label: 'Total Events', value: fmt(rows.length), sub: 'In period' },
      { label: 'Active Users', value: fmt(activeUsers), sub: 'Unique users' },
      { label: 'Creates', value: fmt(creates), sub: 'New records', accent: 'green' },
      { label: 'Updates', value: fmt(updates), sub: 'Modified records', accent: 'blue' },
    ]
  }, [data, rows])

  const trend = useMemo(() => {
    const m = {}
    for (const r of rows) {
      if (!r.timestamp) continue
      const key = String(r.timestamp).slice(0, 10)
      if (!m[key]) m[key] = { events: 0, creates: 0, updates: 0 }
      m[key].events++
      if (r.action === 'CREATE') m[key].creates++
      if (r.action === 'UPDATE') m[key].updates++
    }
    return Object.keys(m).sort().map((date) => ({ date: format(parseISO(date), 'dd MMM'), ...m[date] }))
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
        <div className="flex items-center gap-2 shrink-0">
          <PeriodSelect value={dateRange} onChange={setDateRange} />
          <select value={module} onChange={(e) => setModule(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="">All modules</option>
            {MODULE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="">All actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="POST">POST</option>
            <option value="APPROVE">APPROVE</option>
            <option value="REJECT">REJECT</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          searchPlaceholder="Search user, action, entity..."
          exportName="audit-trail"
          exportTitle="Audit Trail"
          pageSize={30}
        />
        <ChartCard title="Activity Trend" subtitle="Daily audit events" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="creates" fill="#16a34a" name="Creates" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="updates" fill="#2563eb" name="Updates" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function UserActivityTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const fromDate = useFromDate(dateRange)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'audit', 'user-activity', dateRange],
    queryFn: () => api(`/reports/audit/user-activity?fromDate=${fromDate}`),
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])

  const actionCount = (r, action) => r.byAction?.[action] || 0

  const columns = useMemo(
    () => [
      {
        id: 'user', header: 'User',
        accessorFn: (r) => r.userName || '',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
              {row.original.userName?.charAt(0) || '?'}
            </div>
            <div>
              <div className="text-xs font-medium">{row.original.userName || '—'}</div>
              <div className="text-[10px] text-gray-400">{row.original.userId || ''}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'date', header: 'Date',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.date ? format(parseISO(row.original.date), 'dd MMM yyyy') : '—'}
          </span>
        ),
      },
      { accessorKey: 'totalActions', header: 'Total Actions', cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalActions)}</span> },
      { accessorKey: 'creates', header: 'Creates', accessorFn: (r) => actionCount(r, 'CREATE'), cell: ({ row }) => <span className="tabular-nums text-green-600">{fmt(actionCount(row.original, 'CREATE'))}</span> },
      { accessorKey: 'updates', header: 'Updates', accessorFn: (r) => actionCount(r, 'UPDATE'), cell: ({ row }) => <span className="tabular-nums text-blue-600">{fmt(actionCount(row.original, 'UPDATE'))}</span> },
      { accessorKey: 'deletes', header: 'Deletes', accessorFn: (r) => actionCount(r, 'DELETE'), cell: ({ row }) => <span className="tabular-nums text-red-600">{fmt(actionCount(row.original, 'DELETE'))}</span> },
      { accessorKey: 'logins', header: 'Logins', accessorFn: (r) => actionCount(r, 'LOGIN') + actionCount(r, 'LOGOUT'), cell: ({ row }) => <span className="tabular-nums text-purple-600">{fmt(actionCount(row.original, 'LOGIN') + actionCount(row.original, 'LOGOUT'))}</span> },
    ],
    []
  )

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const activeUsers = new Set(rows.map((r) => r.userId).filter(Boolean)).size
    const totalEvents = rows.reduce((s, r) => s + (r.totalActions || 0), 0)
    const avgPerUser = activeUsers ? Math.round(totalEvents / activeUsers) : 0
    return [
      { label: 'Active Users', value: fmt(activeUsers), sub: 'In period' },
      { label: 'Total Events', value: fmt(totalEvents), sub: 'All actions' },
      { label: 'Avg Events/User', value: fmt(avgPerUser), sub: 'Per user' },
      { label: 'Active Days', value: fmt(rows.length), sub: 'User-day records' },
    ]
  }, [data, rows])

  const topUsers = useMemo(() => {
    const byUser = {}
    for (const r of rows) {
      if (!byUser[r.userId]) byUser[r.userId] = { name: r.userName || '—', events: 0 }
      byUser[r.userId].events += r.totalActions || 0
    }
    return Object.values(byUser).sort((a, b) => b.events - a.events).slice(0, 8)
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
          searchPlaceholder="Search user..."
          exportName="user-activity"
          exportTitle="User Activity"
          pageSize={20}
        />
        <ChartCard title="Top Users by Activity" subtitle="Events per user" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={topUsers} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [fmt(v), 'Events']} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="events" fill="#7c3aed" radius={[0, 3, 3, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function InventoryHistoryTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const fromDate = useFromDate(dateRange)

  const { data: stockRows = [] } = useQuery({ queryKey: ['stock'], queryFn: () => api('/stock') })

  const itemOptions = useMemo(() => {
    const m = new Map()
    for (const r of stockRows) if (r.itemId) m.set(r.itemId, r.item?.sku || '—')
    return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [stockRows])

  const locationOptions = useMemo(() => {
    const m = new Map()
    for (const r of stockRows) if (r.locationId) m.set(r.locationId, r.location?.code || '—')
    return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [stockRows])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'audit', 'inventory-history', dateRange, itemId, locationId],
    queryFn: () => {
      const params = new URLSearchParams({ fromDate })
      if (itemId) params.set('itemId', itemId)
      if (locationId) params.set('locationId', locationId)
      return api(`/reports/audit/inventory-history?${params.toString()}`)
    },
    enabled: active,
  })

  const rows = useMemo(() => data?.data || [], [data])
  const hasFilters = !!(itemId || locationId)

  const columns = useMemo(
    () => [
      {
        accessorKey: 'timestamp', header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {row.original.timestamp ? format(parseISO(row.original.timestamp), 'dd MMM yyyy HH:mm:ss') : '—'}
          </span>
        ),
      },
      {
        id: 'item', header: 'Item',
        accessorFn: (r) => r.itemSku || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.itemSku || '—'}</span>,
      },
      {
        id: 'location', header: 'Location',
        accessorFn: (r) => r.locationCode || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode || '—'}</span>,
      },
      {
        accessorKey: 'qty', header: 'Qty Change',
        cell: ({ row }) => {
          const c = row.original.qty || 0
          return (
            <span className={`tabular-nums font-medium ${c > 0 ? 'text-green-600' : c < 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {c > 0 ? '+' : ''}{fmt(c)}
            </span>
          )
        },
      },
      {
        accessorKey: 'runningBalance', header: 'Running Balance',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.runningBalance)}</span>,
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
        accessorKey: 'txnType', header: 'Transaction',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px]">{row.original.txnType || '—'}</Badge>
        ),
      },
      {
        accessorKey: 'refNumber', header: 'Reference',
        cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.refNumber || '—'}</span>,
      },
      {
        accessorKey: 'reasonCode', header: 'Reason',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.reasonCode || '—'}</span>,
      },
      {
        accessorKey: 'user', header: 'User',
        cell: ({ row }) => <span className="text-xs">{row.original.user || '—'}</span>,
      },
    ],
    []
  )

  const clearFilters = () => { setItemId(''); setLocationId('') }

  const kpis = useMemo(() => {
    if (!data) return emptyKpis()
    const positive = rows.reduce((s, r) => s + (r.qty > 0 ? r.qty : 0), 0)
    const negative = rows.reduce((s, r) => s + (r.qty < 0 ? Math.abs(r.qty) : 0), 0)
    const net = rows.reduce((s, r) => s + (r.qty || 0), 0)
    return [
      { label: 'Total Changes', value: fmt(rows.length), sub: 'In period' },
      { label: 'Positive', value: fmt(Math.round(positive * 100) / 100), sub: 'Qty increased', accent: 'green' },
      { label: 'Negative', value: fmt(Math.round(negative * 100) / 100), sub: 'Qty decreased', accent: 'red' },
      { label: 'Net Change', value: fmt(Math.round(net * 100) / 100), sub: 'Net qty change' },
    ]
  }, [data, rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIGrid items={kpis} />
        <div className="shrink-0"><PeriodSelect value={dateRange} onChange={setDateRange} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Item:</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="">All items</option>
            {itemOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Location:</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="">All locations</option>
            {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">Clear filters</button>
        )}
      </div>
      <ReportTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        searchPlaceholder="Search item, location, reference..."
        exportName="inventory-history"
        exportTitle="Inventory History"
        pageSize={30}
      />
    </div>
  )
}

export default function AuditReportsPage() {
  const [activeTab, setActiveTab] = useState('trail')

  return (
    <ReportLayout title="Audit Reports" subtitle="Audit trail, user activity, and inventory change history">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-8">
          <TabsTrigger value="trail" className="text-xs">Audit Trail</TabsTrigger>
          <TabsTrigger value="user-activity" className="text-xs">User Activity</TabsTrigger>
          <TabsTrigger value="inventory-history" className="text-xs">Inventory History</TabsTrigger>
        </TabsList>
        <TabsContent value="trail" key="trail">
          <AuditTrailTab active={activeTab === 'trail'} />
        </TabsContent>
        <TabsContent value="user-activity" key="user-activity">
          <UserActivityTab active={activeTab === 'user-activity'} />
        </TabsContent>
        <TabsContent value="inventory-history" key="inventory-history">
          <InventoryHistoryTab active={activeTab === 'inventory-history'} />
        </TabsContent>
      </Tabs>
    </ReportLayout>
  )
}
