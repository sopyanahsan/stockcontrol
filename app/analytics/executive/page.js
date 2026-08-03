'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import * as analytics from '@/lib/analytics/client'
import { formatCurrency } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { KPIGrid } from '@/components/reports/KPIGrid'
import {
  DollarSign, Package, Boxes, Activity, AlertTriangle, PackageX, Store, Layers,
  RefreshCw, FileDown, Truck, PackageOpen, ArrowRightLeft, SlidersHorizontal,
  CalendarCheck, ClipboardList, PackageCheck, Ship, Tags, MapPin, Server, Clock, Database,
} from 'lucide-react'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)
const ANALYTICS_VERSION = '1.0.0'

const formatDateTime = (d) => (d ? format(new Date(d), 'dd MMM yyyy HH:mm:ss') : '—')

// ---------------------------------------------------------------------------
// Section 2 — Warehouse performance module card
// ---------------------------------------------------------------------------
function WarehouseModuleCard({ title, icon: Icon, accent, summary, status, performance, fallbackMeta }) {
  const hasPerf = performance && performance.today != null
  const statusEntries = Object.entries(status || {}).filter(([, v]) => v > 0)

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`rounded-md p-1.5 ${accent}`}><Icon className="h-3.5 w-3.5" /></div>
          <span className="text-xs font-semibold">{title}</span>
        </div>
        <span className="text-[10px] text-gray-400">Docs: {fmt(summary.totalDocuments)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-base font-semibold tabular-nums">{hasPerf ? fmt(performance.today) : '—'}</div>
          <div className="text-[10px] text-gray-400">Today</div>
        </div>
        <div>
          <div className="text-base font-semibold tabular-nums">{hasPerf ? fmt(performance.thisWeek) : '—'}</div>
          <div className="text-[10px] text-gray-400">This Week</div>
        </div>
        <div>
          <div className="text-base font-semibold tabular-nums">{hasPerf ? fmt(performance.thisMonth) : '—'}</div>
          <div className="text-[10px] text-gray-400">This Month</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {statusEntries.length > 0
          ? statusEntries.map(([k, v]) => (
              <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{k}: {fmt(v)}</span>
            ))
          : (fallbackMeta || []).map((m) => (
              <span key={m.label} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{m.label}: {fmt(m.value)}</span>
            ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Outbound performance module card
// ---------------------------------------------------------------------------
function OutboundModuleCard({ title, icon: Icon, accent, documents, quantity, quantityLabel, today }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`rounded-md p-1.5 ${accent}`}><Icon className="h-3.5 w-3.5" /></div>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-base font-semibold tabular-nums">{fmt(documents)}</div>
          <div className="text-[10px] text-gray-400">Documents</div>
        </div>
        <div>
          <div className="text-base font-semibold tabular-nums">{fmt(quantity)}</div>
          <div className="text-[10px] text-gray-400">{quantityLabel}</div>
        </div>
        <div>
          <div className="text-base font-semibold tabular-nums">{today != null ? fmt(today) : '—'}</div>
          <div className="text-[10px] text-gray-400">Today</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 4 — Inventory breakdown (top 5)
// ---------------------------------------------------------------------------
function BreakdownList({ title, icon: Icon, rows, keyName }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="h-3.5 w-3.5 text-gray-400" /> {title}
      </div>
      {rows.length ? (
        <div className="mt-2 space-y-1">
          {rows.slice(0, 5).map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gray-700">{r[keyName] || '—'}</span>
              <span className="tabular-nums text-gray-500">{fmt(r.quantity)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-2 text-xs text-gray-400">No stock</div>
      )}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <span className="flex items-center gap-1.5 text-gray-500"><Icon className="h-3.5 w-3.5" /> {label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Executive Dashboard
// ---------------------------------------------------------------------------
export default function ExecutiveDashboardPage() {
  const queryClient = useQueryClient()
  const [lastRefresh, setLastRefresh] = useState(() => new Date())

  // All data comes from the Analytics Client (→ Analytics API → KPI Engine).
  const execDashboard = useQuery({ queryKey: ['analytics', 'executive', 'dashboard'], queryFn: () => analytics.dashboard() })
  const execInventory = useQuery({ queryKey: ['analytics', 'executive', 'inventory'], queryFn: () => analytics.inventory() })
  const execWarehouse = useQuery({ queryKey: ['analytics', 'executive', 'warehouse'], queryFn: () => analytics.warehouse() })
  const execOutbound = useQuery({ queryKey: ['analytics', 'executive', 'outbound'], queryFn: () => analytics.outbound() })
  const execSuppliers = useQuery({ queryKey: ['analytics', 'executive', 'suppliers'], queryFn: () => analytics.suppliers() })

  const dashboard = execDashboard.data?.data
  const inventory = execInventory.data?.data
  const generatedAt = execDashboard.data?.generatedAt

  const wmod = (name) => execWarehouse.data?.data?.[name]?.data || null
  const wsummary = (name) => wmod(name)?.summary || {}
  const wstatus = (name) => wmod(name)?.status || {}
  const wperf = (name) => wmod(name)?.performance || {}

  const omod = (name) => execOutbound.data?.data?.[name]?.data || null
  const osummary = (name) => omod(name)?.summary || {}
  const operf = (name) => omod(name)?.performance || {}

  const suppliers = execSuppliers.data?.data

  const isLoading =
    execDashboard.isLoading || execInventory.isLoading || execWarehouse.isLoading ||
    execOutbound.isLoading || execSuppliers.isLoading

  // Refresh ONLY this page's analytics queries.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['analytics', 'executive'] })
    setLastRefresh(new Date())
  }

  // System info — database status derived from every analytics envelope.
  const envelopes = [execDashboard.data, execInventory.data, execWarehouse.data, execOutbound.data, execSuppliers.data]
  const allLoaded = envelopes.every((e) => e !== undefined)
  const degraded = allLoaded && envelopes.some((e) => e.success === false)
  const dbStatus = !allLoaded ? 'Checking...' : degraded ? 'Degraded' : 'Operational'

  const health = inventory?.health || {}
  const todayOps =
    (wperf('receiving').today ?? 0) +
    (wperf('putaway').today ?? 0) +
    (operf('picking').today ?? 0) +
    (operf('packing').today ?? 0) +
    (operf('shipping').today ?? 0)

  const summaryCards = useMemo(
    () => [
      { icon: DollarSign, label: 'Inventory Value', value: formatCurrency(dashboard?.inventoryValue), sub: 'At standard cost', accent: 'green' },
      { icon: Package, label: 'Active SKU', value: fmt(dashboard?.activeSku), sub: 'Active master items', accent: 'blue' },
      { icon: Boxes, label: 'Stock On Hand', value: fmt(dashboard?.stockOnHand), sub: 'Units across locations', accent: 'indigo' },
      { icon: Activity, label: 'Warehouse Health', value: fmt(health.healthy), sub: `${fmt(health.low)} low · ${fmt(health.outOfStock)} out of stock`, accent: 'purple' },
      { icon: AlertTriangle, label: 'Low Stock', value: fmt(dashboard?.lowStock), sub: 'At or below reorder point', accent: 'amber' },
      { icon: PackageX, label: 'Out Of Stock', value: fmt(dashboard?.outOfStock), sub: 'Zero quantity', accent: 'red' },
      { icon: Store, label: 'Total Suppliers', value: fmt(dashboard?.suppliers?.total), sub: `${fmt(dashboard?.suppliers?.active)} active`, accent: 'orange' },
      { icon: Layers, label: "Today's Operations", value: fmt(todayOps), sub: 'Documents completed today', accent: 'blue' },
    ],
    [dashboard, health, todayOps]
  )

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">Business Intelligence — live from the Analytics Engine</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh Analytics
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled>
            <FileDown className="mr-1.5 h-3.5 w-3.5" /> Export Executive PDF
            <Badge variant="secondary" className="ml-1.5 text-[9px]">Coming Soon</Badge>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-md" />)}
          </div>
        </div>
      ) : (
        <>
          {/* Section 1 — Executive Summary */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Executive Summary</h3>
            <KPIGrid items={summaryCards} />
          </section>

          {/* Section 2 — Warehouse Performance */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Warehouse Performance</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <WarehouseModuleCard title="Receiving" icon={Truck} accent="bg-green-50 text-green-600" summary={wsummary('receiving')} status={wstatus('receiving')} performance={wperf('receiving')} />
              <WarehouseModuleCard title="Putaway" icon={PackageOpen} accent="bg-purple-50 text-purple-600" summary={wsummary('putaway')} status={wstatus('putaway')} performance={wperf('putaway')} />
              <WarehouseModuleCard title="Movement" icon={ArrowRightLeft} accent="bg-blue-50 text-blue-600" summary={wsummary('movement')} status={wstatus('movement')} performance={wperf('movement')} />
              <WarehouseModuleCard title="Adjustment" icon={SlidersHorizontal} accent="bg-amber-50 text-amber-600" summary={wsummary('adjustment')} status={wstatus('adjustment')} performance={wperf('adjustment')}
                fallbackMeta={[
                  { label: 'Increase', value: wsummary('adjustment').increaseDocuments },
                  { label: 'Decrease', value: wsummary('adjustment').decreaseDocuments },
                ]} />
              <WarehouseModuleCard title="Cycle Count" icon={CalendarCheck} accent="bg-indigo-50 text-indigo-600" summary={wsummary('cycleCount')} status={wstatus('cycleCount')} performance={wperf('cycleCount')}
                fallbackMeta={[
                  { label: 'Scheduled', value: wsummary('cycleCount').scheduled },
                  { label: 'Completed', value: wsummary('cycleCount').completed },
                ]} />
            </div>
          </section>

          {/* Section 3 — Outbound Performance */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Outbound Performance</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <OutboundModuleCard title="Picking" icon={ClipboardList} accent="bg-blue-50 text-blue-600" documents={osummary('picking').totalDocuments} quantity={osummary('picking').totalQuantity} quantityLabel="Units Picked" today={operf('picking').today} />
              <OutboundModuleCard title="Packing" icon={PackageCheck} accent="bg-orange-50 text-orange-600" documents={osummary('packing').totalDocuments} quantity={osummary('packing').packedQuantity} quantityLabel="Items Packed" today={operf('packing').today} />
              <OutboundModuleCard title="Shipping" icon={Ship} accent="bg-purple-50 text-purple-600" documents={osummary('shipping').totalDocuments} quantity={osummary('shipping').shippedQuantity} quantityLabel="Units Shipped" today={operf('shipping').today} />
            </div>
          </section>

          {/* Section 4 — Inventory Insight */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Inventory Insight</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <BreakdownList title="By Category" icon={Tags} rows={inventory?.categoryBreakdown || []} keyName="category" />
              <BreakdownList title="By Warehouse" icon={Package} rows={inventory?.warehouseBreakdown || []} keyName="warehouse" />
              <BreakdownList title="By Location" icon={MapPin} rows={inventory?.locationBreakdown || []} keyName="location" />
            </div>
          </section>

          {/* Section 5 — Supplier Insight */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Supplier Insight</h3>
            <div className="rounded-md border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
                <Store className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium">Top Suppliers</span>
                <span className="ml-auto text-[11px] text-gray-400">By received quantity · top 10</span>
              </div>
              {suppliers?.ranking?.length ? (
                <table className="w-full text-[13px]">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Supplier</th>
                      <th className="px-4 py-2 text-right font-medium">Documents</th>
                      <th className="px-4 py-2 text-right font-medium">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.ranking.map((s, i) => (
                      <tr key={s.supplierId || i} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2">
                          <div className="font-mono text-xs">{s.supplierCode || '—'}</div>
                          <div className="text-xs text-gray-500">{s.supplierName || '—'}</div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(s.documents)}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{fmt(s.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-10 text-center text-sm text-gray-400">No supplier data yet</div>
              )}
            </div>
          </section>

          {/* Section 6 — System Information */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">System Information</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoRow icon={Clock} label="Generated At" value={formatDateTime(generatedAt)} />
              <InfoRow icon={RefreshCw} label="Last Refresh" value={formatDateTime(lastRefresh)} />
              <InfoRow icon={Database} label="Database Status" value={
                <Badge variant="outline" className={dbStatus === 'Operational' ? 'border-green-200 bg-green-50 text-green-700' : dbStatus === 'Degraded' ? 'border-amber-200 bg-amber-50 text-amber-700' : ''}>
                  {dbStatus}
                </Badge>
              } />
              <InfoRow icon={Layers} label="Analytics Version" value={`v${ANALYTICS_VERSION}`} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
