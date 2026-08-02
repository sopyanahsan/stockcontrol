'use client'

export const dynamic = 'force-dynamic'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Package, Boxes, DollarSign, AlertTriangle, Activity, MapPin, ClipboardList, Clock, Target, CheckCircle2, PackageCheck, Layers, Store, Users, UserX, UserPlus } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { formatCurrency } from '@/lib/currency'

const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0))

const ACTION_COLORS = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  POST: 'bg-purple-100 text-purple-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-600',
}

function StatCard({ icon: Icon, label, value, sub, accent = 'text-blue-600 bg-blue-50' }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-gray-500">{label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
        </div>
        <div className={`rounded-md p-2 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

function PickingCard({ icon: Icon, label, value, sub, accent = 'text-orange-600 bg-orange-50' }) {
  return (
    <div className="rounded-md border border-orange-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] text-gray-500">{label}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-[10px] text-gray-400">{sub}</div>}
        </div>
        <div className={`rounded-md p-1.5 ${accent}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  )
}

const App = () => {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard') })
  const { data: packingData } = useQuery({ queryKey: ['packing-kpis'], queryFn: () => api('/packing/kpis') })

  return (
    <AppShell title="Dashboard" subtitle="Inventory overview — all figures computed live from the Stock Ledger">
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-md" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-md" />
            <Skeleton className="h-72 rounded-md" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Package} label="Active SKUs" value={fmt(data?.stats?.totalItems)} sub={`${fmt(data?.stats?.totalLocations)} active locations`} />
            <StatCard icon={Boxes} label="Stock on Hand" value={fmt(data?.stats?.totalUnits)} sub="units across all locations" accent="text-indigo-600 bg-indigo-50" />
            <StatCard icon={DollarSign} label="Inventory Value" value={formatCurrency(data?.stats?.totalValue)} sub="at standard cost" accent="text-green-600 bg-green-50" />
            <StatCard icon={AlertTriangle} label="Low Stock Alerts" value={fmt(data?.stats?.lowStockCount)} sub={`${fmt(data?.stats?.todayMovements)} movements today`} accent="text-amber-600 bg-amber-50" />
          </div>

          {/* Supplier KPIs */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <Store className="h-3.5 w-3.5" />
              Supplier Overview
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PickingCard icon={Store} label="Total Suppliers" value={fmt(data?.suppliers?.total)} sub="registered" accent="text-blue-600 bg-blue-50" />
              <PickingCard icon={Users} label="Active" value={fmt(data?.suppliers?.active)} sub="usable on Receiving" accent="text-green-600 bg-green-50" />
              <PickingCard icon={UserX} label="Inactive" value={fmt(data?.suppliers?.inactive)} sub="blocked from Receiving" accent="text-gray-600 bg-gray-100" />
              <PickingCard icon={UserPlus} label="Added (30d)" value={fmt(data?.suppliers?.recentlyAdded)} sub="last 30 days" accent="text-purple-600 bg-purple-50" />
            </div>
          </div>

          {/* Picking KPIs */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <ClipboardList className="h-3.5 w-3.5" />
              Picking Performance
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <PickingCard icon={ClipboardList} label="Pending Picking" value={fmt(data?.picking?.pendingPicking)} sub="orders queued" accent="text-blue-600 bg-blue-50" />
              <PickingCard icon={Activity} label="In Progress" value={fmt(data?.picking?.pickingInProgress)} sub="being picked" accent="text-amber-600 bg-amber-50" />
              <PickingCard icon={CheckCircle2} label="Completed Today" value={fmt(data?.picking?.pickingCompletedToday)} sub="orders done" accent="text-green-600 bg-green-50" />
              <PickingCard icon={Clock} label="Avg Pick Time" value={data?.picking?.avgPickTimeMinutes ? data.picking.avgPickTimeMinutes + 'm' : '—'} sub="per order" accent="text-purple-600 bg-purple-50" />
              <PickingCard icon={Target} label="Picking Accuracy" value={data?.picking?.pickingAccuracy != null ? data.picking.pickingAccuracy + '%' : '—'} sub="last 30 days" accent="text-orange-600 bg-orange-50" />
            </div>
          </div>

          {/* Packing KPIs */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <PackageCheck className="h-3.5 w-3.5" />
              Packing Performance
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <PickingCard icon={Layers} label="Packing Queue" value={fmt(packingData?.packingQueue)} sub="awaiting packing" accent="text-blue-600 bg-blue-50" />
              <PickingCard icon={PackageCheck} label="Open Packages" value={fmt(packingData?.openPackages)} sub="being packed" accent="text-amber-600 bg-amber-50" />
              <PickingCard icon={CheckCircle2} label="Closed Today" value={fmt(packingData?.packagesClosedToday)} sub="packages closed" accent="text-green-600 bg-green-50" />
              <PickingCard icon={Clock} label="Avg Packing Time" value={packingData?.avgPackingTimeMinutes ? packingData.avgPackingTimeMinutes + 'm' : '—'} sub="per order" accent="text-purple-600 bg-purple-50" />
              <PickingCard icon={Target} label="Package Accuracy" value={packingData?.packingAccuracy != null ? packingData.packingAccuracy + '%' : '—'} sub="last 30 days" accent="text-orange-600 bg-orange-50" />
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium">Stock by Category</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data?.stockByCategory || []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="qty" name="Units" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium">Movement Trend (7 days)</div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data?.movementTrend || []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="inbound" name="Inbound" stroke="#16a34a" fill="#16a34a" fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="outbound" name="Outbound" stroke="#dc2626" fill="#dc2626" fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Low stock + recent activity */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Low Stock — At or Below Reorder Point</span>
              </div>
              {data?.lowStock?.length ? (
                <table className="w-full text-[13px]">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">SKU</th>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 text-right font-medium">On Hand</th>
                      <th className="px-4 py-2 text-right font-medium">Reorder Pt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((r) => (
                      <tr key={r.itemId} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 text-right">
                          <Badge variant="outline" className={`tabular-nums ${r.qty <= r.minStock ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                            {fmt(r.qty)} {r.uom}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmt(r.reorderPoint)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-10 text-center text-sm text-gray-400">All items above reorder point</div>
              )}
            </div>

            <div className="rounded-md border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
                <Activity className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Recent Activity</span>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.recentActivity || []).map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{log.description}</div>
                      <div className="text-[11px] text-gray-400">
                        {log.userName} · {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                ))}
                {!data?.recentActivity?.length && <div className="px-4 py-10 text-center text-sm text-gray-400">No activity yet</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default App
