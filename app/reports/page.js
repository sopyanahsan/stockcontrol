'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReportLayout } from '@/components/reports/ReportLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Package, Warehouse, Truck, BarChart3, ArrowRightLeft,
  ClipboardList, Ship, Boxes, FileSearch, Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  {
    value: 'inventory',
    label: 'Inventory',
    icon: Boxes,
    href: '/reports/inventory',
    description: 'Stock levels, aging, and valuation',
  },
  {
    value: 'warehouse',
    label: 'Warehouse',
    icon: Warehouse,
    href: '/reports/warehouse',
    description: 'Receiving, putaway, and movements',
  },
  {
    value: 'outbound',
    label: 'Outbound',
    icon: Truck,
    href: '/reports/outbound',
    description: 'Picking, packing, and shipping',
  },
  {
    value: 'audit',
    label: 'Audit',
    icon: FileSearch,
    href: '/reports/audit',
    description: 'Audit trail and user activity',
  },
]

function DashboardKPIs() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-500">Total SKUs</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">—</div>
        <div className="mt-0.5 text-[11px] text-gray-400">Loading...</div>
      </div>
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-500">Stock Value</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">—</div>
        <div className="mt-0.5 text-[11px] text-gray-400">Loading...</div>
      </div>
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-500">Movements Today</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">—</div>
        <div className="mt-0.5 text-[11px] text-gray-400">Loading...</div>
      </div>
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-500">Open Tasks</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">—</div>
        <div className="mt-0.5 text-[11px] text-gray-400">Loading...</div>
      </div>
    </div>
  )
}

function TabCard({ tab, isActive }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      className={cn(
        'flex items-start gap-3 rounded-md border p-4 transition-colors',
        isActive
          ? 'border-blue-200 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      )}
    >
      <div className={cn(
        'rounded-md p-2',
        isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn(
          'text-sm font-medium',
          isActive ? 'text-blue-700' : 'text-gray-900'
        )}>
          {tab.label}
        </div>
        <div className="mt-0.5 text-xs text-gray-500">{tab.description}</div>
      </div>
    </Link>
  )
}

export default function ReportsPage() {
  const pathname = usePathname()

  const activeTab = TABS.find((tab) =>
    pathname === tab.href || pathname.startsWith(tab.href + '/')
  )?.value || 'inventory'

  return (
    <ReportLayout
      title="Reports"
      subtitle="Executive Dashboard — inventory, warehouse, outbound, and audit reports"
    >
      <DashboardKPIs />

      <Tabs defaultValue={activeTab} className="mt-6">
        <TabsList className="mb-6 h-11 w-full justify-start rounded-md border border-gray-200 bg-white p-1 shadow-sm">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-2 text-xs"
                asChild
              >
                <Link href={tab.href}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TabCard tab={tab} isActive={true} />
              {TABS.filter((t) => t.value !== tab.value).map((otherTab) => (
                <TabCard key={otherTab.value} tab={otherTab} isActive={false} />
              ))}
            </div>
            <div className="mt-4 rounded-md border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-gray-400" />
              <div className="mt-2 text-sm font-medium text-gray-600">
                {tab.label} Reports
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Click to view detailed {tab.label.toLowerCase()} reports
              </div>
              <Link
                href={tab.href}
                className="mt-3 inline-block rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Open {tab.label} Reports
              </Link>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </ReportLayout>
  )
}
