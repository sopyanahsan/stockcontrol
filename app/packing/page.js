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
import { ErrorState } from '@/components/ErrorState'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ArrowRight, Package, Plus, Play, CheckCircle2, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const PACKING_STATUS_META = {
  QUEUE:       { label: 'Queue',        class: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress',  class: 'bg-amber-50 text-amber-700 border-amber-200' },
  COMPLETED:   { label: 'Completed',    class: 'bg-green-50 text-green-700 border-green-200' },
  CANCELLED:   { label: 'Cancelled',    class: 'bg-red-50 text-red-700 border-red-200' },
}

function QueueItem({ item, onStart }) {
  const totalLines = (item.lines || []).length
  const totalQty = item.lines.reduce((s, l) => {
    return s + l.tasks.reduce((ts, t) => ts + Number(t.qtyPicked || 0), 0)
  }, 0)
  const totalSerials = item.lines.reduce((s, l) => {
    return s + l.tasks.reduce((ts, t) => ts + t.serials.length, 0)
  }, 0)

  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{item.pickingNumber}</span>
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
            Completed
          </Badge>
        </div>
        <div className="mt-0.5 flex gap-3 text-xs text-gray-500">
          <span>{totalLines} line(s)</span>
          <span>{totalQty} unit(s)</span>
          {totalSerials > 0 && <span>{totalSerials} serial(s)</span>}
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
          onClick={() => onStart(item)}
        >
          <Package className="mr-1 h-3 w-3" />
          Create Packing
        </Button>
      </div>
    </div>
  )
}

function PackingRow({ order }) {
  const statusMeta = PACKING_STATUS_META[order.status] || { label: order.status, class: 'bg-gray-100 text-gray-700' }
  const pkgCount = (order.packages || []).length
  const openPkg = (order.packages || []).filter((p) => p.status === 'OPEN').length

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2">
        <div className="font-mono text-xs font-medium">{order.packingNumber}</div>
        {order.pickingOrder && (
          <div className="text-[11px] text-gray-400">from {order.pickingOrder.pickingNumber}</div>
        )}
      </td>
      <td className="px-4 py-2 text-xs">
        {pkgCount === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="tabular-nums">
            {openPkg > 0 && <span className="text-amber-600">{openPkg} open</span>}
            {openPkg > 0 && pkgCount - openPkg > 0 && <span className="text-gray-400">, </span>}
            {pkgCount - openPkg > 0 && <span className="text-green-600">{pkgCount - openPkg} closed</span>}
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
        {order.completedAt && order.status === 'COMPLETED' ? (
          <span className="text-green-600">
            {formatDistanceToNow(new Date(order.completedAt), { addSuffix: true })}
          </span>
        ) : (
          formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link href={`/packing/${order.id}`}>
            {order.status === 'QUEUE' ? 'Start' :
             order.status === 'IN_PROGRESS' ? 'Continue' : 'View'}
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

  const { data: queueData, isLoading: queueLoading, error: queueError, refetch: refetchQueue } = useQuery({
    queryKey: ['packing-queue'],
    queryFn: () => api('/packing/queue'),
    enabled: tab === 'QUEUE',
  })

  const { data: ordersData, isLoading: ordersLoading, error: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ['packing-orders', tab],
    queryFn: () => api(`/packing?status=${tab}`),
    enabled: tab !== 'QUEUE',
  })

  const queue = tab === 'QUEUE' ? (queueData || []) : []
  const orders = tab !== 'QUEUE' ? (ordersData || []) : []

  const handleCreatePacking = async (picking) => {
    try {
      const res = await api('/packing', {
        method: 'POST',
        body: { pickingOrderId: picking.id },
      })
      toast.success('Packing order created: ' + res.packingNumber)
      qc.invalidateQueries({ queryKey: ['packing-queue'] })
      qc.invalidateQueries({ queryKey: ['packing-orders'] })
    } catch (e) {
      toast.error(e.message || 'Failed to create packing order')
    }
  }

  const isLoading = tab === 'QUEUE' ? queueLoading : ordersLoading
  const error = tab === 'QUEUE' ? queueError : ordersError
  const refetch = tab === 'QUEUE' ? refetchQueue : refetchOrders

  return (
    <AppShell
      title="Packing"
      subtitle="Organize picked items into packages — no inventory changes"
      actions={
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
              {queue.length} awaiting packing
            </Badge>
          )}
          <HelpButton pageId="packing" />
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="QUEUE">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="IN_PROGRESS">In Progress</TabsTrigger>
          <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Failed to load packing data" />
        ) : tab === 'QUEUE' ? (
          queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
              <Package className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No items in packing queue</div>
              <div className="text-xs text-gray-400">
                Completed picking orders will appear here for packing.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => (
                <QueueItem key={item.id} item={item} onStart={handleCreatePacking} />
              ))}
            </div>
          )
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
            <Package className="h-8 w-8 text-gray-300" />
            <div className="text-sm font-medium text-gray-500">No packing orders</div>
            <div className="text-xs text-gray-400">
              Create a packing order from the Queue tab.
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Order #</th>
                  <th className="px-4 py-2 font-medium">Packages</th>
                  <th className="px-4 py-2 font-medium">Assigned To</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <PackingRow key={order.id} order={order} />
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
