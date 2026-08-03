'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import HelpButton from '@/components/help/HelpButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowRight, Ship, Plus, Play, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const SHIPMENT_STATUS_META = {
  QUEUE:       { label: 'Queue',         class: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress',   class: 'bg-amber-50 text-amber-700 border-amber-200' },
  READY:       { label: 'Ready',         class: 'bg-purple-50 text-purple-700 border-purple-200' },
  COMPLETED:   { label: 'Completed',     class: 'bg-green-50 text-green-700 border-green-200' },
  FAILED:      { label: 'Failed',        class: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED:   { label: 'Cancelled',     class: 'bg-gray-50 text-gray-700 border-gray-200' },
}

const PKG_STATUS_META = {
  PENDING:   { label: 'Pending',   class: 'bg-gray-100 text-gray-600' },
  VERIFIED:  { label: 'Verified',  class: 'bg-blue-50 text-blue-700' },
  CONFIRMED: { label: 'Confirmed', class: 'bg-green-50 text-green-700' },
  FAILED:    { label: 'Failed',   class: 'bg-red-50 text-red-700' },
}

function QueueItem({ item, onCreate }) {
  const pkgCount = (item.packages || []).length
  const closedPkgs = (item.packages || []).filter((p) => p.status === 'CLOSED').length
  const totalItems = item.packages.reduce((s, p) => s + (p.items || []).length, 0)

  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{item.packingNumber}</span>
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
            Completed
          </Badge>
        </div>
        <div className="mt-0.5 flex gap-3 text-xs text-gray-500">
          <span>{pkgCount} package(s)</span>
          {closedPkgs > 0 && <span>{closedPkgs} closed</span>}
          {totalItems > 0 && <span>{totalItems} item(s)</span>}
        </div>
      </div>
      <div className="ml-4 flex items-center gap-2">
        <span className="text-[11px] text-gray-400">
          Completed {item.completedAt
            ? formatDistanceToNow(new Date(item.completedAt), { addSuffix: true })
            : 'recently'}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onCreate(item)}
        >
          <Ship className="mr-1 h-3 w-3" />
          Create Shipment
        </Button>
      </div>
    </div>
  )
}

function ShipmentRow({ order }) {
  const statusMeta = SHIPMENT_STATUS_META[order.status] || { label: order.status, class: 'bg-gray-100 text-gray-700' }
  const pkgCount = (order.packages || []).length
  const verifiedPkgs = (order.packages || []).filter((p) => p.status === 'VERIFIED' || p.status === 'CONFIRMED').length

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2">
        <div className="font-mono text-xs font-medium">{order.shipmentNumber}</div>
        {order.packingOrder && (
          <div className="text-[11px] text-gray-400">from {order.packingOrder.packingNumber}</div>
        )}
      </td>
      <td className="px-4 py-2 text-xs">
        {pkgCount === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="tabular-nums">
            {verifiedPkgs > 0 && <span className="text-purple-600">{verifiedPkgs} verified</span>}
            {verifiedPkgs > 0 && pkgCount - verifiedPkgs > 0 && <span className="text-gray-400">, </span>}
            {pkgCount - verifiedPkgs > 0 && <span className="text-gray-500">{pkgCount - verifiedPkgs} pending</span>}
            <span className="text-gray-400"> / {pkgCount}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-xs">
        {order.assignedTo ? (
          <span className="text-gray-700">{order.assignedTo.name}</span>
        ) : (
          <span className="text-gray-400">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-2">
        <Badge variant="outline" className={`${statusMeta.class} text-[10px]`}>
          {statusMeta.label}
        </Badge>
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">
        {order.shippedAt && order.status === 'COMPLETED' ? (
          <span className="text-green-600">
            Shipped {formatDistanceToNow(new Date(order.shippedAt), { addSuffix: true })}
          </span>
        ) : (
          formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link href={`/shipping/${order.id}`}>
            {order.status === 'QUEUE' ? 'Start' :
             ['IN_PROGRESS', 'READY'].includes(order.status) ? 'Continue' : 'View'}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </td>
    </tr>
  )
}

const App = () => {
  const qc = useQueryClient()
  const [tab, setTab] = useState('QUEUE')

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['shipping-queue'],
    queryFn: () => api('/shipping/queue'),
    enabled: tab === 'QUEUE',
  })

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['shipments', tab],
    queryFn: () => api(`/shipping?status=${tab}`),
    enabled: tab !== 'QUEUE',
  })

  const queue = tab === 'QUEUE' ? (queueData || []) : []
  const orders = tab !== 'QUEUE' ? (ordersData?.data || []) : []
  const isLoading = tab === 'QUEUE' ? queueLoading : ordersLoading

  const handleCreateShipment = async (packing) => {
    try {
      const res = await api('/shipping', {
        method: 'POST',
        body: { packingOrderId: packing.id },
      })
      toast.success('Shipment created: ' + res.shipmentNumber)
      qc.invalidateQueries({ queryKey: ['shipping-queue'] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
    } catch (e) {
      toast.error(e.message || 'Failed to create shipment')
    }
  }

  return (
    <AppShell
      title="Shipping"
      subtitle="Finalize shipments — consumes FIFO, creates SHIP_OUT ledger"
      actions={
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
              {queue.length} awaiting shipment
            </Badge>
          )}
          <HelpButton pageId="shipping" />
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="QUEUE">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="IN_PROGRESS">In Progress</TabsTrigger>
          <TabsTrigger value="READY">Ready</TabsTrigger>
          <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : tab === 'QUEUE' ? (
          queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
              <Ship className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No items in shipping queue</div>
              <div className="text-xs text-gray-400">
                Completed packing orders will appear here for shipping.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => (
                <QueueItem key={item.id} item={item} onCreate={handleCreateShipment} />
              ))}
            </div>
          )
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
            <Ship className="h-8 w-8 text-gray-300" />
            <div className="text-sm font-medium text-gray-500">No shipments</div>
            <div className="text-xs text-gray-400">
              Create a shipment from the Queue tab.
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Shipment #</th>
                  <th className="px-4 py-2 font-medium">Packages</th>
                  <th className="px-4 py-2 font-medium">Assigned To</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <ShipmentRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default App
