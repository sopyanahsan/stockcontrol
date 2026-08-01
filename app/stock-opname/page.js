'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { StockOpnameStatusBadge } from '@/components/stock-opname/StockOpnameStatusBadge'
import { EmptyState } from '@/components/stock-opname/EmptyState'
import {
  CalendarCheck, Plus, ArrowRight, Loader2, Search,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [remarks, setRemarks] = useState('')

  const { data: listData, isLoading } = useQuery({
    queryKey: ['stock-opname-list', status],
    queryFn: () => api(`/stock-opname${status !== 'ALL' ? `?status=${status}` : ''}`),
  })

  const createMut = useMutation({
    mutationFn: (payload) => api('/stock-opname', { method: 'POST', body: payload }),
    onSuccess: (so) => {
      toast.success(`Stock opname ${so.opnameNumber} created`)
      setCreateOpen(false)
      setRemarks('')
      qc.invalidateQueries({ queryKey: ['stock-opname-list'] })
      router.push(`/stock-opname/${so.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const handleCreate = () => {
    createMut.mutate({ remarks: remarks || undefined })
  }

  const filtered = listData?.data?.filter((so) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      so.opnameNumber?.toLowerCase().includes(q) ||
      so.createdBy?.name?.toLowerCase().includes(q)
    )
  }) || []

  const STATUS_TABS = [
    { value: 'ALL', label: 'All' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ]

  return (
    <AppShell
      title="Stock Opname"
      subtitle="Physical stock verification and variance correction"
      actions={
        <Button
          size="sm"
          className="h-8 bg-blue-600 hover:bg-blue-700"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> New Stock Opname
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by SO number or user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.value}
                variant={status === tab.value ? 'default' : 'outline'}
                size="sm"
                className={`h-8 text-xs ${status === tab.value ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                onClick={() => setStatus(tab.value)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No stock opnames found"
              description={
                status === 'ALL' && !search
                  ? 'Create a new stock opname session to begin physical verification.'
                  : 'No matching results. Try a different filter or search term.'
              }
            />
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">SO Number</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created By</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Completed</th>
                  <th className="px-4 py-2 font-medium text-right">Lines</th>
                  <th className="px-4 py-2 font-medium text-right">Accuracy</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((so) => {
                  const isCompleted = so.status === 'COMPLETED'
                  const hasLines = (so._count?.lines || 0) > 0
                  return (
                    <tr key={so.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link
                          href={`/stock-opname/${so.id}`}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          {so.opnameNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {new Date(so.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-2">
                        <StockOpnameStatusBadge status={so.status} />
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {so.createdBy?.name || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {so.startedAt
                          ? formatDistanceToNow(new Date(so.startedAt), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {so.completedAt
                          ? formatDistanceToNow(new Date(so.completedAt), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums text-gray-600">
                        {hasLines ? fmt(so._count.lines) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-400">
                        {isCompleted ? '—' : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/stock-opname/${so.id}`}>
                            View <ArrowRight className="ml-1 h-3.5 w-3.5" />
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

        {/* Pagination info */}
        {listData?.total != null && listData.total > (listData?.data?.length || 0) && (
          <div className="text-center text-xs text-gray-500">
            Showing {listData.data.length} of {listData.total} stock opnames
          </div>
        )}
      </div>

      {/* CREATE DIALOG */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) { setCreateOpen(false); setRemarks('') }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Stock Opname</DialogTitle>
            <DialogDescription>
              A new stock opname session will be created in Draft status. You can start counting after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Remarks (optional)</Label>
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g., Monthly stock verification — August 2026"
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreate}
              disabled={createMut.isPending}
            >
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Stock Opname
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
