'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Package, Boxes, DollarSign, AlertTriangle, Activity, MapPin } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'

const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0))
const fmtMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

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

const App = () => {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard') })

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
            <StatCard icon={DollarSign} label="Inventory Value" value={fmtMoney(data?.stats?.totalValue)} sub="at standard cost" accent="text-green-600 bg-green-50" />
            <StatCard icon={AlertTriangle} label="Low Stock Alerts" value={fmt(data?.stats?.lowStockCount)} sub={`${fmt(data?.stats?.todayMovements)} movements today`} accent="text-amber-600 bg-amber-50" />
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
