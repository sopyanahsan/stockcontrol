'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ErrorState'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowRight, PackageOpen, ArrowLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_META = {
  OPEN:        { label: 'Open',        class: 'bg-blue-100 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED:   { label: 'Completed',   class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:   { label: 'Cancelled',   class: 'bg-red-100 text-red-700 border-red-200' },
}

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ALL')

  const { data: list, isLoading, error, refetch } = useQuery({
    queryKey: ['putaway-list', status],
    queryFn: () => api(`/putaway${status !== 'ALL' ? `?status=${status}` : ''}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const openCount  = list?.filter((t) => t.status === 'OPEN').length || 0
  const progressCount = list?.filter((t) => t.status === 'IN_PROGRESS').length || 0

  return (
    <AppShell
      title="Putaway"
      subtitle="Move stock from STAGING to warehouse bins"
      actions={
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
              {openCount} open
            </Badge>
          )}
          {progressCount > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[11px]">
              {progressCount} in progress
            </Badge>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="OPEN">Open</TabsTrigger>
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
          ) : error ? (
            <div className="p-4">
              <ErrorState error={error} onRetry={() => refetch()} title="Failed to load putaway tasks" />
            </div>
          ) : !list?.length ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <PackageOpen className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No putaway tasks</div>
              <div className="text-xs text-gray-400">
                {status === 'ALL'
                  ? 'Putaway tasks are created automatically when you post a receiving document.'
                  : 'No tasks with this status.'}
              </div>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Task #</th>
                  <th className="px-4 py-2 font-medium">GRN</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">To</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((task) => {
                  const meta = STATUS_META[task.status] || { label: task.status, class: 'bg-gray-100 text-gray-700' }
                  return (
                    <tr key={task.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{task.taskNumber}</td>
                      <td className="px-4 py-2">
                        {task.receiving ? (
                          <Link
                            href={`/receiving/${task.receiving.id}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {task.receiving.grnNumber}
                          </Link>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs">{task.item?.sku}</div>
                        <div className="text-xs text-gray-500">{task.item?.name}</div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {task.qty}
                        {task.qtyPutaway > 0 && (
                          <span className="ml-1 text-gray-400">({task.qtyPutaway} done)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{task.fromLocation?.code}</td>
                      <td className="px-4 py-2">
                        {task.toLocation ? (
                          <span className="font-mono text-xs">{task.toLocation.code}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">pending</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`${meta.class} text-[10px]`}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {task.status === 'OPEN' || task.status === 'IN_PROGRESS' ? (
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                            <Link href={`/putaway/${task.id}`}>
                              {task.status === 'OPEN' ? 'Start' : 'Continue'} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                            <Link href={`/putaway/${task.id}`}>
                              View <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
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
