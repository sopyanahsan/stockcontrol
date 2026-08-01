'use client'

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
  LOGIN: 'border-purple-200 bg-purple-50 text-purple-700',
  LOGOUT: 'border-gray-200 bg-gray-50 text-gray-500',
  VIEW: 'border-gray-200 bg-gray-50 text-gray-400',
  EXPORT: 'border-teal-200 bg-teal-50 text-teal-700',
  APPROVE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECT: 'border-orange-200 bg-orange-50 text-orange-700',
}

function AuditTrailTab({ active }) {
  const [dateRange, setDateRange] = useState('30')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'audit', 'trail', dateRange, module, action],
    queryFn: () => {
      const params = new URLSearchParams({ days: dateRange })
      if (module) params.set('module', module)
      if (action) params.set('action', action)
      return api(`/reports/audit/trail?${params.toString()}`)
    },
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'timestamp', header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {format(parseISO(row.original.timestamp), 'dd MMM yyyy HH:mm:ss')}
          </span>
        ),
      },
      {
        accessorKey: 'user', header: 'User',
        accessorFn: (r) => r.user?.name || '',
        cell: ({ row }) => (
          <div>
            <div className="text-xs font-medium">{row.original.user?.name || 'System'}</div>
            <div className="text-[10px] text-gray-400">{row.original.user?.email || ''}</div>
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
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-500">{row.original.entityId || '—'}</span>
        ),
      },
      {
        accessorKey: 'ipAddress', header: 'IP Address',
        cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.ipAddress || '—'}</span>,
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

  const kpis = data
    ? [
        { label: 'Total Events', value: fmt(data.totalEvents || 0), description: 'In period', trend: null },
        { label: 'Active Users', value: fmt(data.activeUsers || 0), description: 'Unique users', trend: null },
        { label: 'Creates', value: fmt(data.creates || 0), description: 'New records', trend: null },
        { label: 'Updates', value: fmt(data.updates || 0), description: 'Modified records', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  const trend = (data?.dailyTrend || []).map((d) => ({
    date: format(parseISO(d.date), 'dd MMM'),
    events: d.events,
    creates: d.creates,
    updates: d.updates,
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
          <select value={module} onChange={(e) => setModule(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="">All modules</option>
            <option value="ITEMS">Master Items</option>
            <option value="LOCATIONS">Locations</option>
            <option value="RECEIVING">Receiving</option>
            <option value="PUTAWAY">Putaway</option>
            <option value="PICKING">Picking</option>
            <option value="PACKING">Packing</option>
            <option value="SHIPPING">Shipping</option>
            <option value="MOVEMENT">Movement</option>
            <option value="ADJUSTMENT">Adjustment</option>
            <option value="CYCLE_COUNT">Cycle Count</option>
            <option value="AUTH">Authentication</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportTable
          columns={columns}
          data={data?.events || []}
          isLoading={isLoading}
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

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'audit', 'user-activity', dateRange],
    queryFn: () => api(`/reports/audit/user-activity?days=${dateRange}`),
    enabled: active,
  })

  const columns = useMemo(
    () => [
      {
        id: 'user', header: 'User',
        accessorFn: (r) => r.user?.name || '',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
              {row.original.user?.name?.charAt(0) || '?'}
            </div>
            <div>
              <div className="text-xs font-medium">{row.original.user?.name || '—'}</div>
              <div className="text-[10px] text-gray-400">{row.original.user?.email || ''}</div>
            </div>
          </div>
        ),
      },
      {
        id: 'role', header: 'Role',
        accessorFn: (r) => r.user?.role || '',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px]">{row.original.user?.role || '—'}</Badge>
        ),
      },
      {
        accessorKey: 'totalEvents', header: 'Total Events',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.totalEvents || 0)}</span>,
      },
      {
        accessorKey: 'creates', header: 'Creates',
        cell: ({ row }) => <span className="tabular-nums text-green-600">{fmt(row.original.creates || 0)}</span>,
      },
      {
        accessorKey: 'updates', header: 'Updates',
        cell: ({ row }) => <span className="tabular-nums text-blue-600">{fmt(row.original.updates || 0)}</span>,
      },
      {
        accessorKey: 'deletes', header: 'Deletes',
        cell: ({ row }) => <span className="tabular-nums text-red-600">{fmt(row.original.deletes || 0)}</span>,
      },
      {
        accessorKey: 'logins', header: 'Logins',
        cell: ({ row }) => <span className="tabular-nums text-purple-600">{fmt(row.original.logins || 0)}</span>,
      },
      {
        accessorKey: 'lastActivity', header: 'Last Activity',
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">
            {row.original.lastActivity ? format(parseISO(row.original.lastActivity), 'dd MMM HH:mm') : '—'}
          </span>
        ),
      },
      {
        id: 'modules', header: 'Modules Used',
        accessorFn: (r) => (r.modulesUsed || []).join(', '),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.modulesUsed || []).slice(0, 3).map((m) => (
              <span key={m} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px]">{m}</span>
            ))}
            {(row.original.modulesUsed || []).length > 3 && (
              <span className="text-[10px] text-gray-400">+{(row.original.modulesUsed || []).length - 3}</span>
            )}
          </div>
        ),
      },
    ],
    []
  )

  const kpis = data
    ? [
        { label: 'Active Users', value: fmt(data.totalUsers || 0), description: 'In period', trend: null },
        { label: 'Total Events', value: fmt(data.totalEvents || 0), description: 'All actions', trend: null },
        { label: 'Avg Events/User', value: fmt(Math.round(data.avgEventsPerUser || 0)), description: 'Per user', trend: null },
        { label: 'Most Active', value: data.mostActiveUser?.user?.name || '—', description: 'Top contributor', trend: null },
      ]
    : Array(4).fill({ label: '—', value: '—', description: '', trend: null })

  const topUsers = (data?.topUsers || []).map((u) => ({
    name: u.user?.name || '—',
    events: u.totalEvents || 0,
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
          data={data?.users || []}
          isLoading={isLoading}
          searchPlaceholder="Search user name or email..."
          exportName="user-activity"
          exportTitle="User Activity"
          pageSize={20}
        />
        <ChartCard title="Top Users by Activity" subtitle="Events per user" className="lg:col-span-1">
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={topUsers.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
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

  const buildUrl = () => {
    const params = new URLSearchParams({ days: dateRange })
    if (itemId) params.set('itemId', itemId)
    if (locationId) params.set('locationId', locationId)
    return `/reports/audit/inventory-history?${params.toString()}`
  }

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'audit', 'inventory-history', dateRange, itemId, locationId],
    queryFn: () => api(buildUrl()),
    enabled: active,
  })

  const hasFilters = !!(itemId || locationId)

  const columns = useMemo(
    () => [
      {
        accessorKey: 'timestamp', header: 'Timestamp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {format(parseISO(row.original.timestamp), 'dd MMM yyyy HH:mm:ss')}
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
        accessorFn: (r) => r.location?.code || '',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.location?.code || '—'}</span>,
      },
      {
        accessorKey: 'previousQty', header: 'Previous Qty',
        cell: ({ row }) => <span className="tabular-nums text-xs text-gray-500">{fmt(row.original.previousQty)}</span>,
      },
      {
        accessorKey: 'newQty', header: 'New Qty',
        cell: ({ row }) => <span className="tabular-nums font-medium">{fmt(row.original.newQty)}</span>,
      },
      {
        id: 'change', header: 'Change',
        cell: ({ row }) => {
          const c = (row.original.newQty || 0) - (row.original.previousQty || 0)
          return (
            <span className={`tabular-nums font-medium ${c > 0 ? 'text-green-600' : c < 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {c > 0 ? '+' : ''}{fmt(c)}
            </span>
          )
        },
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
        accessorKey: 'reason', header: 'Reason',
        cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.reason || '—'}</span>,
      },
      {
        accessorKey: 'user', header: 'User',
        accessorFn: (r) => r.user?.name || '',
        cell: ({ row }) => <span className="text-xs">{row.original.user?.name || '—'}</span>,
      },
    ],
    []
  )

  const clearFilters = () => { setItemId(''); setLocationId('') }

  const kpis = data
    ? [
        { label: 'Total Changes', value: fmt(data.totalChanges || 0), description: 'In period', trend: null },
        { label: 'Positive', value: fmt(data.positiveChanges || 0), description: 'Qty increased', trend: null },
        { label: 'Negative', value: fmt(data.negativeChanges || 0), description: 'Qty decreased', trend: null },
        { label: 'Net Change', value: fmt((data.positiveChanges || 0) - (data.negativeChanges || 0)), description: 'Net qty change', trend: null },
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
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Item:</span>
          <input type="text" value={itemId} onChange={(e) => setItemId(e.target.value)}
            placeholder="Item ID"
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs w-36" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Location:</span>
          <input type="text" value={locationId} onChange={(e) => setLocationId(e.target.value)}
            placeholder="Location ID"
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs w-36" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">Clear filters</button>
        )}
      </div>
      <ReportTable
        columns={columns}
        data={data?.entries || []}
        isLoading={isLoading}
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
