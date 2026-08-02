'use client'

export const dynamic = 'force-dynamic'

import { use, useState, useRef } from 'react'
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
import { ErrorState } from '@/components/ErrorState'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  ArrowLeft, Play, CheckCircle2, XCircle, Loader2, Ban, ChevronRight,
  AlertCircle, TrendingUp, TrendingDown, Package,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/currency'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const STATUS_META = {
  DRAFT:     { label: 'Draft',     class: 'bg-gray-100 text-gray-700 border-gray-200' },
  COMPLETED:  { label: 'Completed',  class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:  { label: 'Cancelled',  class: 'bg-red-100 text-red-700 border-red-200' },
}

function StatusFlow({ status }) {
  if (status === 'CANCELLED') return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
  const steps = [
    { label: 'Draft', status: 'DRAFT' },
    { label: 'Completed', status: 'COMPLETED' },
  ]
  const order = ['DRAFT', 'COMPLETED']
  const current = order.indexOf(status)
  return (
    <div className="flex items-center gap-1 text-[11px]">
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
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()

  const [error, setError] = useState(null)
  const [activeEditRow, setActiveEditRow] = useState(-1) // which row is focused
  const [activeEditField, setActiveEditField] = useState('') // 'itemId' | 'locationId' | 'qty' | 'unitCost'
  const lineItemRefs = useRef([])
  const lineLocationRefs = useRef([])
  const lineQtyRefs = useRef([])
  const lineCostRefs = useRef([])
  const previewButtonRef = useRef(null)

  const handleLineKeyDown = (e, rowIdx, field) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const totalLines = (editLines || data?.lines || []).length
    if (field === 'itemId') {
      lineLocationRefs.current[rowIdx]?.focus()
    } else if (field === 'locationId') {
      lineQtyRefs.current[rowIdx]?.focus()
    } else if (field === 'qty') {
      lineCostRefs.current[rowIdx]?.focus()
    } else if (field === 'unitCost') {
      if (rowIdx < totalLines - 1) {
        lineItemRefs.current[rowIdx + 1]?.focus()
      } else if (isDraft && !previewLoading) {
        previewButtonRef.current?.focus()
      }
    }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['adjustment', id],
    queryFn: () => api(`/adjustments/${id}`),
    onError: (e) => setError(e),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const adjReasonCodes = meta?.reasonCodes?.filter((r) => r.type === 'ADJUSTMENT' && r.isActive) || []
  const flatLocations = meta?.warehouses?.flatMap((wh) =>
    wh.zones?.flatMap((z) => z.locations || []) || []
  ) || []

  const [editLines, setEditLines] = useState(null)
  const [reasonCodeId, setReasonCodeId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const startEdit = () => {
    setEditLines(data.lines.map((l) => ({ ...l })))
    setReasonCodeId(data.reasonCodeId || '')
    setRemarks(data.remarks || '')
  }

  const cancelEdit = () => { setEditLines(null) }

  const updateEditLine = (i, field, value) =>
    setEditLines((p) => p.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const openPreview = async () => {
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError('')
    setPreviewData(null)
    try {
      const linesToPreview = (editLines || data.lines).map((l) => ({
        id: l.id,
        itemId: l.itemId,
        locationId: l.locationId,
        qty: Number(l.qty),
        unitCost: l.unitCost,
      }))
      const result = await api(`/adjustments/${id}/preview`, {
        method: 'POST',
        body: { lines: linesToPreview, reasonCodeId: reasonCodeId || data.reasonCodeId },
      })
      setPreviewData(result)
    } catch (e) {
      setPreviewError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const previewMut = useMutation({
    mutationFn: (payload) => api(`/adjustments/${id}/preview`, {
      method: 'POST',
      body: payload,
    }),
    onSuccess: (r) => setPreviewData(r),
    onError: (e) => toast.error(e.message),
  })

  const postMut = useMutation({
    mutationFn: () => api(`/adjustments/${id}/post`, {
      method: 'POST',
      body: { reasonCodeId: reasonCodeId || data.reasonCodeId },
    }),
    onSuccess: (adj) => {
      toast.success(`Adjustment ${adj.adjustmentNumber} posted successfully`)
      setPreviewOpen(false)
      setPreviewData(null)
      refetch()
      qc.invalidateQueries({ queryKey: ['adjustments-list'] })
    },
    onError: (e) => { toast.error(e.message); setPreviewOpen(false) },
  })

  const cancelMut = useMutation({
    mutationFn: (reason) => api(`/adjustments/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { toast.success('Adjustment cancelled'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const isDraft = data?.status === 'DRAFT'
  const isCompleted = data?.status === 'COMPLETED'
  const isCancelled = data?.status === 'CANCELLED'

  if (isLoading) {
    return (
      <AppShell title="Adjustment" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      </AppShell>
    )
  }

  if (error || !data) {
    return (
      <AppShell title="Adjustment" subtitle="Error">
        <ErrorState
          error={error}
          onRetry={() => { setError(null); refetch() }}
          title="Failed to load adjustment"
        />
      </AppShell>
    )
  }

  const statusMeta = STATUS_META[data.status] || { label: data.status, class: 'bg-gray-100' }
  const lines = editLines ?? data.lines

  return (
    <AppShell
      title={data.adjustmentNumber}
      subtitle={data.reasonCode ? `${data.reasonCode.code} — ${data.reasonCode.description}` : 'Stock Adjustment'}
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/adjustment"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-semibold">{data.adjustmentNumber}</div>
                <Badge variant="outline" className={`text-[10px] ${statusMeta.class}`}>{statusMeta.label}</Badge>
              </div>
              <div className="text-xs text-gray-500">
                Reason: <span className="font-medium text-gray-700">{data.reasonCode?.code || '—'}</span>
                {data.reasonCode?.description && <span className="text-gray-400"> — {data.reasonCode.description}</span>}
              </div>
              {data.remarks && <div className="text-xs text-gray-500">{data.remarks}</div>}
              <div className="text-[11px] text-gray-400">
                Created by {data.createdBy?.name || 'Unknown'}
                {' · '}{formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}
                {data.postedAt && ` · Posted ${formatDistanceToNow(new Date(data.postedAt), { addSuffix: true })}`}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex gap-2">
                {isDraft && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700"
                      onClick={() => {
                        const reason = window.prompt('Cancel reason (optional):') ?? null
                        if (reason !== null) cancelMut.mutate(reason)
                      }}
                      disabled={cancelMut.isPending}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    {!editLines && (
                      <Button size="sm" variant="outline" className="h-8" onClick={startEdit}>
                        Edit Lines
                      </Button>
                    )}
                    {(editLines) && (
                      <Button size="sm" variant="outline" className="h-8" onClick={cancelEdit}>
                        Cancel Edit
                      </Button>
                    )}
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700"
                      ref={previewButtonRef}
                      onClick={openPreview}
                      disabled={previewLoading}>
                      {previewLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      Preview & Post
                    </Button>
                  </>
                )}
                {isCompleted && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href="/adjustment"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Completed banner */}
        {isCompleted && (
          <div className="rounded-md border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500" />
            <div className="text-sm font-medium text-green-800">Adjustment Posted</div>
            <div className="mt-1 text-xs text-green-600">
              {data.lines?.reduce((s, l) => s + Number(l.qty), 0) >= 0 ? 'Net increase' : 'Net decrease'} of {Math.abs(data.lines?.reduce((s, l) => s + Number(l.qty), 0))} units
            </div>
          </div>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center">
            <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
            <div className="text-sm font-medium text-red-800">Adjustment Cancelled</div>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/adjustment"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
            </Button>
          </div>
        )}

        {/* Line items table */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
            Line Items
          </div>
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium w-8">#</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 text-right font-medium">System Qty</th>
                <th className="px-4 py-2 text-right font-medium">Adj Qty</th>
                <th className="px-4 py-2 text-right font-medium">Unit Cost</th>
                {isDraft && <th className="px-4 py-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const isIn = Number(line.qty) > 0
                const locationCode = line.location?.code || flatLocations.find((l) => l.id === line.locationId)?.code || line.locationId || '-'
                return (
                  <tr key={line.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2">
                      {editLines ? (
                        <Select value={line.itemId} onValueChange={(v) => updateEditLine(i, 'itemId', v)}>
                          <SelectTrigger
                            ref={(el) => { lineItemRefs.current[i] = el ? el.querySelector('[role="combobox"]') : null }}
                            className="h-7 w-40 text-xs"
                            onKeyDown={(e) => handleLineKeyDown(e, i, 'itemId')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {meta?.items?.map((it) => (
                              <SelectItem key={it.id} value={it.id} className="text-xs">{it.sku} — {it.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="font-mono text-xs">{line.item?.sku}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editLines ? (
                        <Select value={line.locationId} onValueChange={(v) => updateEditLine(i, 'locationId', v)}>
                          <SelectTrigger
                            ref={(el) => { lineLocationRefs.current[i] = el ? el.querySelector('[role="combobox"]') : null }}
                            className="h-7 w-28 text-xs"
                            onKeyDown={(e) => handleLineKeyDown(e, i, 'locationId')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {flatLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.code}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="font-mono text-xs">{locationCode}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-500">
                      {Number(line.systemQty || 0)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editLines ? (
                        <Input
                          type="number"
                          value={line.qty}
                          onChange={(e) => updateEditLine(i, 'qty', e.target.value)}
                          onKeyDown={(e) => handleLineKeyDown(e, i, 'qty')}
                          ref={(el) => { lineQtyRefs.current[i] = el }}
                          className="h-7 w-24 text-xs tabular-nums text-right"
                        />
                      ) : (
                        <span className={`inline-flex items-center gap-1 tabular-nums text-xs font-medium ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                          {isIn ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {isIn ? '+' : ''}{Number(line.qty)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-500">
                      {editLines ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.unitCost || ''}
                          onChange={(e) => updateEditLine(i, 'unitCost', e.target.value)}
                          onKeyDown={(e) => handleLineKeyDown(e, i, 'unitCost')}
                          ref={(el) => { lineCostRefs.current[i] = el }}
                          className="h-7 w-24 text-xs tabular-nums text-right"
                        />
                      ) : (
                        line.unitCost != null ? formatCurrency(line.unitCost) : '-'
                      )}
                    </td>
                    {isDraft && (
                      <td className="px-4 py-2">
                        {editLines && lines.length > 1 && (
                          <button onClick={() => setEditLines((p) => p.filter((_, idx) => idx !== i))}
                            className="text-gray-400 hover:text-red-500 text-sm">×</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-xs text-gray-500">Net Total</td>
                <td className={`px-4 py-2 text-right tabular-nums text-xs font-medium ${lines.reduce((s, l) => s + Number(l.qty || 0), 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {lines.reduce((s, l) => s + Number(l.qty || 0), 0) >= 0 ? '+' : ''}{lines.reduce((s, l) => s + Number(l.qty || 0), 0)}
                </td>
                <td />
                {isDraft && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Reason code (editable in draft) */}
        {isDraft && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Reason Code *</Label>
              <Select value={reasonCodeId || data.reasonCodeId || ''} onValueChange={setReasonCodeId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select reason code..." />
                </SelectTrigger>
                <SelectContent>
                  {adjReasonCodes.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">{r.code} — {r.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Remarks</Label>
              <Input value={remarks || data.remarks || ''} onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional notes..." className="text-sm" />
            </div>
          </div>
        )}
      </div>

      {/* PREVIEW DIALOG */}
      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) { setPreviewOpen(false); setPreviewData(null) } }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adjustment Preview</DialogTitle>
            <DialogDescription>
              Review FIFO consumption and ledger entries before posting. ADJUSTMENT_IN creates a new FIFO layer; ADJUSTMENT_OUT consumes existing layers.
            </DialogDescription>
          </DialogHeader>

          {previewLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">Calculating…</span>
            </div>
          )}

          {previewError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Preview failed</div>
                <div className="text-xs text-red-600">{previewError}</div>
              </div>
            </div>
          )}

          {previewData && !previewLoading && (
            <div className="space-y-4">
              {previewData.allocations?.map((alloc, ai) => (
                <div key={alloc.lineId || ai} className="rounded-md border border-gray-200 bg-white">
                  <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                    <Package className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-mono text-xs font-medium">{alloc.itemSku}</span>
                    <span className="text-xs text-gray-500">{alloc.itemName}</span>
                    <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        alloc.direction === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                      {alloc.direction === 'IN' ? 'INCREASE' : 'DECREASE'}
                    </span>
                    <span className="ml-auto font-medium tabular-nums text-xs">
                      {alloc.qty > 0 ? '+' : ''}{alloc.qty}
                    </span>
                  </div>

                  {alloc.direction === 'IN' ? (
                    <div className="px-4 py-2 space-y-1 text-[11px]">
                      <div className="flex gap-4 text-gray-600">
                        <span>Location: <span className="font-mono font-medium">{alloc.locationCode}</span></span>
                        <span>Unit Cost: <span className="font-medium">{formatCurrency(alloc.unitCost || 0)}</span></span>
                        <span>→ New FIFO layer +{alloc.qty} units</span>
                      </div>
                      <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-green-700">
                        New FIFO layer: {alloc.locationCode}, qty +{alloc.qty}, cost {formatCurrency(alloc.unitCost || 0)}
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-2 space-y-1 text-[11px]">
                      <div className="text-gray-500">
                        Location: <span className="font-mono">{alloc.locationCode}</span>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr className="text-gray-400">
                            <th className="text-left font-medium">Ref</th>
                            <th className="text-left font-medium">Received</th>
                            <th className="text-right font-medium">Available</th>
                            <th className="text-right font-medium">Consuming</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alloc.fifoLayers?.map((l) => (
                            <tr key={l.layerId} className="border-t border-gray-50">
                              <td className="py-1 font-mono text-gray-600">{l.refNumber || '-'}</td>
                              <td className="py-1 text-gray-500">{l.receivedAt ? new Date(l.receivedAt).toLocaleDateString('en-GB') : '-'}</td>
                              <td className="py-1 text-right tabular-nums text-gray-500">{l.available}</td>
                              <td className="py-1 text-right tabular-nums font-medium text-red-700">{l.qtyToConsume}</td>
                            </tr>
                          ))}
                          {!alloc.fifoLayers?.length && (
                            <tr><td colSpan={4} className="py-1 text-center text-gray-400">No FIFO layers found</td></tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 font-medium">
                            <td colSpan={3} className="pt-1 text-right text-gray-500">Avg Cost:</td>
                            <td className="pt-1 text-right tabular-nums">{alloc.avgUnitCost ? formatCurrency(alloc.avgUnitCost) : '-'}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))}

              {/* Ledger summary */}
              {previewData.ledgerEntries?.length > 0 && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Stock Ledger Entries (to be created)
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left font-medium">Type</th>
                        <th className="text-left font-medium">Location</th>
                        <th className="text-right font-medium">Qty</th>
                        <th className="text-right font-medium">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.ledgerEntries.map((e, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1">
                            <Badge variant="outline" className={`text-[10px] ${e.txnType === 'ADJUSTMENT_IN' ? 'border-green-200 bg-green-50 text-green-600' : 'border-red-200 bg-red-50 text-red-600'}`}>
                              {e.txnType}
                            </Badge>
                          </td>
                          <td className="py-1 font-mono">{e.locationCode}</td>
                          <td className={`py-1 text-right tabular-nums ${e.qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {e.qty >= 0 ? '+' : ''}{e.qty}
                          </td>
                          <td className="py-1 text-right tabular-nums text-gray-500">
                            {e.unitCost != null ? formatCurrency(e.unitCost) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Back</Button>
            {previewData && !previewLoading && (
              <Button className="bg-green-600 hover:bg-green-700"
                onClick={() => postMut.mutate()}
                disabled={postMut.isPending}>
                {postMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Post
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
