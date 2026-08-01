'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  ArrowLeft, Play, CheckCircle2, XCircle, Loader2, Ban, ChevronRight,
  AlertCircle, TrendingUp, TrendingDown, Package, ClipboardCheck,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const STATUS_META = {
  DRAFT:       { label: 'Draft',       class: 'bg-gray-100 text-gray-700 border-gray-200' },
  ASSIGNED:    { label: 'Assigned',     class: 'bg-blue-100 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress',  class: 'bg-amber-100 text-amber-700 border-amber-200' },
  SUBMITTED:   { label: 'Submitted',    class: 'bg-purple-100 text-purple-700 border-purple-200' },
  APPROVED:    { label: 'Approved',     class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:   { label: 'Cancelled',   class: 'bg-red-100 text-red-700 border-red-200' },
}

function StatusFlow({ status }) {
  if (status === 'CANCELLED') return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
  const steps = [
    { label: 'Draft', status: 'DRAFT' },
    { label: 'Assigned', status: 'ASSIGNED' },
    { label: 'In Progress', status: 'IN_PROGRESS' },
    { label: 'Submitted', status: 'SUBMITTED' },
    { label: 'Approved', status: 'APPROVED' },
  ]
  const order = ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED']
  const current = order.indexOf(status)
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      {steps.map((s, i) => {
        const isDone = i < current
        const isActive = i === current
        return (
          <div key={s.status} className="flex items-center gap-1">
            <div className={`rounded-full px-2 py-0.5 ${isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-amber-100 text-amber-700 font-medium' : 'bg-gray-100 text-gray-400'}`}>
              {s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
          </div>
        )
      })}
    </div>
  )
}

const App = ({ params }) => {
  const { id } = params
  const router = useRouter()
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cycle-count', id],
    queryFn: () => api(`/cycle-count/${id}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const [countedLines, setCountedLines] = useState(null) // { [lineId]: countedQty }
  const [assignToId, setAssignToId] = useState('')
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)

  const flatLocations = meta?.warehouses?.flatMap((wh) =>
    wh.zones?.flatMap((z) => z.locations || []) || []
  ) || []

  // Mutations
  const assignMut = useMutation({
    mutationFn: () => api(`/cycle-count/${id}/assign`, {
      method: 'POST',
      body: { assignedToId: assignToId },
    }),
    onSuccess: () => { toast.success('Counter assigned'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const startMut = useMutation({
    mutationFn: () => api(`/cycle-count/${id}/start`, { method: 'POST' }),
    onSuccess: (cc) => {
      toast.success('Count started')
      setCountedLines({})
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const submitMut = useMutation({
    mutationFn: (body) => api(`/cycle-count/${id}/submit`, { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Count submitted — awaiting supervisor approval')
      setCountedLines(null)
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const approveMut = useMutation({
    mutationFn: () => api(`/cycle-count/${id}/approve`, { method: 'POST' }),
    onSuccess: (result) => {
      toast.success('Cycle count approved')
      if (result.adjustments?.length > 0) {
        toast.success(`Auto-created adjustment ${result.adjustments[0].adjustmentNumber}`)
      }
      setApproveDialogOpen(false)
      refetch()
      qc.invalidateQueries({ queryKey: ['adjustments-list'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const cancelMut = useMutation({
    mutationFn: (reason) => api(`/cycle-count/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { toast.success('Cycle count cancelled'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const updateCountedLine = (lineId, value) =>
    setCountedLines((p) => ({ ...p, [lineId]: value }))

  const handleSubmit = () => {
    const lines = data.lines.map((l) => ({
      id: l.id,
      countedQty: countedLines?.[l.id] ?? l.countedQty,
    }))
    submitMut.mutate({ lines })
  }

  const varianceLines = data?.lines?.filter((l) => Number(l.diffQty) !== 0) || []
  const totalVariance = varianceLines.reduce((s, l) => s + Number(l.diffQty || 0), 0)

  const isDraft     = data?.status === 'DRAFT'
  const isAssigned  = data?.status === 'ASSIGNED'
  const isInProgress = data?.status === 'IN_PROGRESS'
  const isSubmitted = data?.status === 'SUBMITTED'
  const isApproved  = data?.status === 'APPROVED'
  const isCancelled = data?.status === 'CANCELLED'

  if (isLoading) {
    return (
      <AppShell title="Cycle Count" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <AppShell title="Cycle Count" subtitle="Not found">
        <div className="rounded-md border p-8 text-center text-sm text-gray-500">
          Cycle count not found. <Link className="text-blue-600 underline" href="/cycle-count">Back to list</Link>
        </div>
      </AppShell>
    )
  }

  const statusMeta = STATUS_META[data.status] || { label: data.status, class: 'bg-gray-100' }

  return (
    <AppShell
      title={data.countNumber}
      subtitle="Cycle Count"
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/cycle-count"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-semibold">{data.countNumber}</div>
                <Badge variant="outline" className={`text-[10px] ${statusMeta.class}`}>{statusMeta.label}</Badge>
              </div>
              {data.remarks && <div className="text-xs text-gray-500">{data.remarks}</div>}
              <div className="text-[11px] text-gray-400">
                Created by {data.createdBy?.name || 'Unknown'}
                {' · '}{formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}
                {data.approvedAt && ` · Approved ${formatDistanceToNow(new Date(data.approvedAt), { addSuffix: true })}`}
              </div>
              {varianceLines.length > 0 && (
                <div className={`mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${totalVariance > 0 ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {totalVariance > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {totalVariance > 0 ? '+' : ''}{fmt(totalVariance)} total variance across {varianceLines.length} line(s)
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex flex-wrap gap-2">
                {/* DRAFT */}
                {isDraft && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700"
                      onClick={() => { const r = window.prompt('Cancel reason (optional):') ?? null; if (r !== null) cancelMut.mutate(r) }}
                      disabled={cancelMut.isPending}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <div className="flex items-center gap-1">
                      <Select value={assignToId} onValueChange={setAssignToId}>
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Assign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {meta?.users?.map((u) => (
                            <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700"
                        onClick={() => assignMut.mutate()}
                        disabled={assignMut.isPending || !assignToId}>
                        {assignMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Assign'}
                      </Button>
                    </div>
                  </>
                )}
                {/* ASSIGNED */}
                {isAssigned && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700"
                      onClick={() => { const r = window.prompt('Cancel reason (optional):') ?? null; if (r !== null) cancelMut.mutate(r) }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700"
                      onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                      {startMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      Start Count
                    </Button>
                  </>
                )}
                {/* IN PROGRESS */}
                {isInProgress && (
                  <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700"
                    onClick={handleSubmit} disabled={submitMut.isPending}>
                    {submitMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="mr-1 h-3.5 w-3.5" />}
                    Submit Count
                  </Button>
                )}
                {/* SUBMITTED */}
                {isSubmitted && (
                  <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700"
                    onClick={() => setApproveDialogOpen(true)}>
                    <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Approve & Post Adjustment
                  </Button>
                )}
                {/* APPROVED */}
                {isApproved && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href="/cycle-count"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Completed banner */}
        {isApproved && (
          <div className="rounded-md border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500" />
            <div className="text-sm font-medium text-green-800">Cycle Count Approved</div>
            <div className="mt-1 text-xs text-green-600">
              {varianceLines.length === 0
                ? 'No variances found — no adjustments created.'
                : `${varianceLines.length} variance line(s) — adjustment(s) auto-created and posted.`}
            </div>
          </div>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center">
            <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
            <div className="text-sm font-medium text-red-800">Cycle Count Cancelled</div>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/cycle-count"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
            </Button>
          </div>
        )}

        {/* Line items table */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
            Count Lines
          </div>
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium w-8">#</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 text-right font-medium">System Qty</th>
                <th className="px-4 py-2 text-right font-medium">
                  {isInProgress ? 'Counted Qty *' : 'Counted Qty'}
                </th>
                <th className="px-4 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line, i) => {
                const locationCode = line.location?.code || flatLocations.find((l) => l.id === line.locationId)?.code || line.locationId || '-'
                const countedQty = countedLines?.[line.id] ?? line.countedQty
                const diffQty = Number(countedQty || 0) - Number(line.systemQty || 0)
                const hasVariance = diffQty !== 0
                const showCountedInput = isInProgress

                return (
                  <tr key={line.id} className={`border-t border-gray-100 ${hasVariance ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs">{line.item?.sku}</div>
                      <div className="text-xs text-gray-500">{line.item?.name}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs">{locationCode}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs">
                      {fmt(Number(line.systemQty || 0))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {showCountedInput ? (
                        <Input
                          type="number"
                          min="0"
                          value={countedLines?.[line.id] ?? ''}
                          onChange={(e) => updateCountedLine(line.id, e.target.value)}
                          placeholder="0"
                          className="h-7 w-24 text-xs tabular-nums text-right"
                        />
                      ) : (
                        <span className="tabular-nums text-xs font-medium">
                          {countedQty != null && countedQty !== '' ? fmt(Number(countedQty)) : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {(isSubmitted || isApproved || isInProgress) && countedQty != null && countedQty !== '' ? (
                        <span className={`inline-flex items-center gap-1 tabular-nums text-xs font-medium ${diffQty > 0 ? 'text-green-600' : diffQty < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {diffQty > 0 ? <TrendingUp className="h-3 w-3" /> : diffQty < 0 ? <TrendingDown className="h-3 w-3" /> : '—'}
                          {diffQty > 0 ? '+' : ''}{fmt(diffQty)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {varianceLines.length > 0 && (isSubmitted || isApproved) && (
              <tfoot className="border-t-2 border-amber-200 bg-amber-50">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-xs font-medium text-amber-700">
                    {varianceLines.length} line(s) with variance
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-medium text-amber-700">Net:</td>
                  <td />
                  <td className={`px-4 py-2 text-right tabular-nums text-xs font-bold ${totalVariance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totalVariance > 0 ? '+' : ''}{fmt(totalVariance)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Variance detail (submitted/approved) */}
        {varianceLines.length > 0 && (isSubmitted || isApproved) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Variance Detail
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-amber-600">
                  <th className="text-left font-medium">Item</th>
                  <th className="text-left font-medium">Location</th>
                  <th className="text-right font-medium">System</th>
                  <th className="text-right font-medium">Counted</th>
                  <th className="text-right font-medium">Variance</th>
                  <th className="text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {varianceLines.map((line) => {
                  const locationCode = line.location?.code || flatLocations.find((l) => l.id === line.locationId)?.code || '-'
                  const dv = Number(line.diffQty || 0)
                  return (
                    <tr key={line.id} className="border-t border-amber-100">
                      <td className="py-1.5 font-mono">{line.item?.sku}</td>
                      <td className="py-1.5 font-mono">{locationCode}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmt(Number(line.systemQty))}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmt(Number(line.countedQty))}</td>
                      <td className={`py-1.5 text-right tabular-nums font-bold ${dv > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {dv > 0 ? '+' : ''}{fmt(dv)}
                      </td>
                      <td className="py-1.5 text-right text-amber-700">
                        {dv > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* APPROVE DIALOG */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Cycle Count</DialogTitle>
            <DialogDescription>
              Approving will auto-create and post a Stock Adjustment for all {varianceLines.length} variance line(s).
              {varianceLines.length === 0 && ' No variances found — no adjustments will be created.'}
            </DialogDescription>
          </DialogHeader>

          {varianceLines.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs">
              <div className="mb-1 font-semibold text-amber-700">Variance Summary</div>
              {varianceLines.map((l) => {
                const dv = Number(l.diffQty || 0)
                const locationCode = l.location?.code || flatLocations.find((loc) => loc.id === l.locationId)?.code || '-'
                return (
                  <div key={l.id} className="flex justify-between">
                    <span className="font-mono">{l.item?.sku} @ {locationCode}</span>
                    <span className={`font-medium tabular-nums ${dv > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {dv > 0 ? '+' : ''}{fmt(dv)}
                    </span>
                  </div>
                )
              })}
              <div className="flex justify-between border-t border-amber-200 pt-1.5 font-semibold">
                <span>Total Variance</span>
                <span className={`tabular-nums ${totalVariance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalVariance > 0 ? '+' : ''}{fmt(totalVariance)}
                </span>
              </div>
            </div>
          )}

          <div className="rounded border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-700">
            Stock Ledger and FIFO will be updated automatically. This action cannot be undone.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700"
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending}>
              {approveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
