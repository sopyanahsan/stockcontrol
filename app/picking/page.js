'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowRight, ClipboardList, Plus, Play, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_META = {
  DRAFT:       { label: 'Draft',       class: 'bg-gray-100 text-gray-600 border-gray-200' },
  ASSIGNED:    { label: 'Assigned',    class: 'bg-blue-100 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED:   { label: 'Completed',   class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:   { label: 'Cancelled',   class: 'bg-red-100 text-red-700 border-red-200' },
}

const PRIORITY_META = {
  LOW:    { label: 'Low',    class: 'bg-gray-50 text-gray-500 border-gray-200' },
  NORMAL: { label: 'Normal', class: 'bg-blue-50 text-blue-600 border-blue-200' },
  HIGH:   { label: 'High',   class: 'bg-orange-100 text-orange-700 border-orange-200' },
  URGENT: { label: 'Urgent', class: 'bg-red-100 text-red-700 border-red-200' },
}

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ALL')

  const { data: list, isLoading } = useQuery({
    queryKey: ['picking-list', status],
    queryFn: () => api(`/picking${status !== 'ALL' ? `?status=${status}` : ''}`),
  })

  const pendingCount = list?.filter((o) => ['DRAFT', 'ASSIGNED'].includes(o.status)).length || 0
  const inProgressCount = list?.filter((o) => o.status === 'IN_PROGRESS').length || 0
  const completedToday = list?.filter((o) => {
    if (o.status !== 'COMPLETED' || !o.completedAt) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return new Date(o.completedAt) >= today
  }).length || 0

  return (
    <AppShell
      title="Picking"
      subtitle="FIFO-guided picking — no stock consumed until shipping"
      actions={
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
              {pendingCount} pending
            </Badge>
          )}
          {inProgressCount > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[11px]">
              {inProgressCount} in progress
            </Badge>
          )}
          <Button asChild size="sm" className="h-8 bg-blue-600 hover:bg-blue-700">
            <Link href="/picking/new">
              <Plus className="mr-1 h-3.5 w-3.5" /> New Order
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="DRAFT">Draft</TabsTrigger>
            <TabsTrigger value="ASSIGNED">Assigned</TabsTrigger>
            <TabsTrigger value="IN_PROGRESS">In Progress</TabsTrigger>
            <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
            <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !list?.length ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <ClipboardList className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No picking orders</div>
              <div className="text-xs text-gray-400">
                {status === 'ALL'
                  ? 'Create a picking order to start assigning warehouse picks.'
                  : 'No orders with this status.'}
              </div>
              <Button asChild size="sm" className="mt-2 bg-blue-600 hover:bg-blue-700">
                <Link href="/picking/new"><Plus className="mr-1 h-3.5 w-3.5" /> Create Picking Order</Link>
              </Button>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Order #</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium">Lines</th>
                  <th className="px-4 py-2 font-medium">Total Qty</th>
                  <th className="px-4 py-2 font-medium">Assigned To</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((order) => {
                  const statusMeta = STATUS_META[order.status] || { label: order.status, class: 'bg-gray-100 text-gray-700' }
                  const priorityMeta = PRIORITY_META[order.priority] || { label: order.priority, class: 'bg-gray-100 text-gray-700' }
                  const totalOrdered = (order.lines || []).reduce((s, l) => s + Number(l.qtyOrdered), 0)
                  const totalPicked = (order.lines || []).reduce((s, l) => s + Number(l.qtyPicked || 0), 0)
                  return (
                    <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs font-medium">{order.pickingNumber}</div>
                        <div className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`${priorityMeta.class} text-[10px]`}>
                          {priorityMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-xs">{(order.lines || []).length} line(s)</div>
                        <div className="text-xs text-gray-400">
                          {totalPicked}/{totalOrdered} picked
                        </div>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-xs">
                        {totalPicked} <span className="text-gray-400">/ {totalOrdered}</span>
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
                            Completed {formatDistanceToNow(new Date(order.completedAt), { addSuffix: true })}
                          </span>
                        ) : (
                          formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/picking/${order.id}`}>
                            {order.status === 'DRAFT' ? 'Edit' :
                             order.status === 'ASSIGNED' ? 'Start' :
                             order.status === 'IN_PROGRESS' ? 'Continue' : 'View'}
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}

export default App
