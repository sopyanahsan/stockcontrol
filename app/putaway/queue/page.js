'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import HelpButton from '@/components/help/HelpButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/ErrorState'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ListChecks, ArrowRight, ArrowLeftRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

const STATUS_META = {
  DRAFT:      { label: 'Draft',      class: 'bg-gray-100 text-gray-700 border-gray-200' },
  RELEASED:   { label: 'Released',   class: 'bg-blue-100 text-blue-700 border-blue-200' },
  ASSIGNED:   { label: 'Assigned',   class: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  IN_PROGRESS:{ label: 'In Progress',class: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED:  { label: 'Completed',  class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:  { label: 'Cancelled',  class: 'bg-red-100 text-red-700 border-red-200' },
}

const PRIORITY_META = {
  LOW:    { label: 'Low',    class: 'text-gray-600' },
  NORMAL: { label: 'Normal', class: 'text-gray-700' },
  HIGH:   { label: 'High',   class: 'text-amber-700' },
  URGENT: { label: 'Urgent', class: 'text-red-700' },
}

const App = () => {
  const [status, setStatus] = useState('ALL')
  const [warehouseId, setWarehouseId] = useState('ALL')
  const [operatorId, setOperatorId] = useState('ALL')
  const [priority, setPriority] = useState('ALL')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ status: 'ALL', warehouseId: 'ALL', operatorId: 'ALL', priority: 'ALL', search: '' })

  const qs = new URLSearchParams()
  if (query.status !== 'ALL') qs.set('status', query.status)
  if (query.warehouseId !== 'ALL') qs.set('warehouseId', query.warehouseId)
  if (query.operatorId !== 'ALL') qs.set('operatorId', query.operatorId)
  if (query.priority !== 'ALL') qs.set('priority', query.priority)
  if (query.search) qs.set('search', query.search)

  const { data: list, isLoading, error, refetch } = useQuery({
    queryKey: ['putaway-queue', query],
    queryFn: () => api(`/putaway/documents${qs.toString() ? `?${qs.toString()}` : ''}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })
  const warehouses = meta?.warehouses || []

  const applyFilters = () => setQuery({ status, warehouseId, operatorId, priority, search: search.trim() })

  return (
    <AppShell
      title="Putaway Queue"
      subtitle="Assigned putaways ready for execution"
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/putaway/tasks"><ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Task Queue</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/putaway"><ArrowRight className="mr-1 h-3.5 w-3.5" /> All Documents</Link>
          </Button>
          <HelpButton pageId="putaway-queue" />
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex-1 min-w-[180px]">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">Search</div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
              placeholder="Putaway No / GRN"
              className="h-9 text-sm"
            />
          </div>
          <div className="w-40">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">Status</div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setQuery((q) => ({ ...q, status: v })) }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="RELEASED">Released</SelectItem>
                <SelectItem value="ASSIGNED">Assigned</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">Warehouse</div>
            <Select value={warehouseId} onValueChange={(v) => { setWarehouseId(v); setQuery((q) => ({ ...q, warehouseId: v })) }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">Operator</div>
            <Select value={operatorId} onValueChange={(v) => { setOperatorId(v); setQuery((q) => ({ ...q, operatorId: v })) }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All operators" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {(meta?.users || []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">Priority</div>
            <Select value={priority} onValueChange={(v) => { setPriority(v); setQuery((q) => ({ ...q, priority: v })) }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9" onClick={applyFilters}>Search</Button>
        </div>

        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorState error={error} onRetry={() => refetch()} title="Failed to load putaway queue" />
            </div>
          ) : !list?.length ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <ListChecks className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No putaways in queue</div>
              <div className="text-xs text-gray-400">
                Release a putaway document, then assign an operator to see it here.
              </div>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Putaway No</th>
                  <th className="px-4 py-2 font-medium">Warehouse</th>
                  <th className="px-4 py-2 font-medium">Operator</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 text-right font-medium">Est. Time</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((doc) => {
                  const sm = STATUS_META[doc.status] || { label: doc.status, class: 'bg-gray-100 text-gray-700' }
                  const pm = PRIORITY_META[doc.priority] || { label: doc.priority, class: 'text-gray-700' }
                  return (
                    <tr key={doc.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{doc.putawayNo}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{doc.warehouseName}</td>
                      <td className="px-4 py-2 text-xs">{doc.assignedName || '—'}</td>
                      <td className={cn('px-4 py-2 text-xs font-medium', pm.class)}>{pm.label}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`${sm.class} text-[10px]`}>{sm.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {doc.startedAt ? formatDistanceToNow(new Date(doc.startedAt), { addSuffix: true }) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-600">
                        {doc.estimatedDuration ? `${doc.estimatedDuration} min` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/putaway/${doc.id}`}>
                            Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
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
