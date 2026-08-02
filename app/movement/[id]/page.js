'use client'

export const dynamic = 'force-dynamic'

import { use, useState } from 'react'
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
  AlertCircle, ArrowRight, Package,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/currency'

const STATUS_META = {
  DRAFT:           { label: 'Draft',        class: 'bg-gray-100 text-gray-700 border-gray-200' },
  PENDING_APPROVAL:{ label: 'Pending',      class: 'bg-amber-100 text-amber-700 border-amber-200' },
  APPROVED:        { label: 'Approved',     class: 'bg-blue-100 text-blue-700 border-blue-200' },
  COMPLETED:       { label: 'Completed',    class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:       { label: 'Cancelled',    class: 'bg-red-100 text-red-700 border-red-200' },
}

function StatusFlow({ status }) {
  if (status === 'CANCELLED') return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
  const steps = [
    { label: 'Draft', status: 'DRAFT' },
    { label: 'Pending', status: 'PENDING_APPROVAL' },
    { label: 'Approved', status: 'APPROVED' },
    { label: 'Completed', status: 'COMPLETED' },
  ]
  const order = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED']
  const current = order.indexOf(status)
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {steps.map((s, i) => {
        const isDone = i < current
        const isActive = i === current
        return (
          <div key={s.status} className="flex items-center gap-1">
            <div
              className={`rounded-full px-2 py-0.5 ${
                isDone ? 'bg-green-100 text-green-700' :
                isActive ? 'bg-amber-100 text-amber-700 font-medium' :
                'bg-gray-100 text-gray-400'
              }`}
            >
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['movement', id],
    queryFn: () => api(`/movements/${id}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const [editLines, setEditLines] = useState(null) // null = not editing
  const [remarks, setRemarks] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const flatLocations = meta?.warehouses?.flatMap((wh) =>
    wh.zones?.flatMap((z) => z.locations || []) || []
  ) || []

  const cancelMut = useMutation({
    mutationFn: (reason) => api(`/movements/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { toast.success('Movement cancelled'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const startEdit = () => {
    setEditLines(data.lines.map((l) => ({ ...l })))
    setRemarks(data.remarks || '')
  }

  const updateEditLine = (i, field, value) =>
    setEditLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const saveEdit = async () => {
    // Simple: just save remarks + lines by recreating the movement (draft is editable)
    // For now, save just marks that edits are done — movements in DRAFT state can be re-fetched
    toast.success('Line changes noted — save not yet implemented (PR required)')
    setEditLines(null)
  }

  const openPreview = async () => {
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError('')
    setPreviewData(null)
    try {
      const linesToPreview = (editLines || data.lines).map((l) => ({
        id: l.id,
        itemId: l.itemId,
        fromLocationId: l.fromLocationId,
        toLocationId: l.toLocationId,
        qty: Number(l.qty),
      }))
      const result = await api('/movements/' + id + '/preview', {
        method: 'POST',
        body: { lines: linesToPreview },
      })
      setPreviewData(result)
    } catch (e) {
      setPreviewError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const executeMut = useMutation({
    mutationFn: () => api('/movements/' + id + '/execute', {
      method: 'POST',
      body: { remarks: remarks || data.remarks || undefined },
    }),
    onSuccess: (m) => {
      toast.success(`Movement ${m.transferNumber} executed successfully`)
      setPreviewOpen(false)
      refetch()
      qc.invalidateQueries({ queryKey: ['movements-list'] })
    },
    onError: (e) => {
      toast.error(e.message)
      setPreviewOpen(false)
    },
  })

  const isDraft      = data?.status === 'DRAFT'
  const isCompleted  = data?.status === 'COMPLETED'
  const isCancelled = data?.status === 'CANCELLED'

  if (isLoading) {
    return (
      <AppShell title="Movement" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <AppShell title="Movement" subtitle="Not found">
        <div className="rounded-md border p-8 text-center text-sm text-gray-500">
          Movement not found. <Link className="text-blue-600 underline" href="/movement">Back to list</Link>
        </div>
      </AppShell>
    )
  }

  const statusMeta = STATUS_META[data.status] || { label: data.status, class: 'bg-gray-100 text-gray-700' }
  const lines = editLines ?? data.lines

  return (
    <AppShell
      title={data.transferNumber}
      subtitle={data.remarks || 'Stock Movement'}
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/movement"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-semibold">{data.transferNumber}</div>
                <Badge variant="outline" className={`text-[10px] ${statusMeta.class}`}>{statusMeta.label}</Badge>
              </div>
              <div className="text-xs text-gray-500">
                {data.lines?.length || 0} line(s)
                {data.remarks && <> · {data.remarks}</>}
              </div>
              <div className="text-[11px] text-gray-400">
                Created by {data.createdBy?.name || 'Unknown'}
                {' · '}{formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}
                {data.postedAt && ` · Executed ${formatDistanceToNow(new Date(data.postedAt), { addSuffix: true })}`}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex gap-2">
                {(isDraft) && (
                  <>
                    <Button
                      size="sm" variant="outline"
                      className="h-8 text-red-600 hover:text-red-700"
                      onClick={() => {
                        const reason = window.prompt('Cancel reason (optional):') ?? null
                        if (reason !== null) cancelMut.mutate(reason)
                      }}
                      disabled={cancelMut.isPending}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-8"
                      onClick={isDraft && !editLines ? startEdit : saveEdit}
                    >
                      {isDraft && !editLines ? 'Edit Lines' : 'Save Lines'}
                    </Button>
                    <Button
                      size="sm" className="h-8 bg-blue-600 hover:bg-blue-700"
                      onClick={openPreview}
                      disabled={previewLoading}
                    >
                      {previewLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      Execute Movement
                    </Button>
                  </>
                )}
                {isCompleted && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href="/movement"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
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
            <div className="text-sm font-medium text-green-800">Movement Executed</div>
            <div className="mt-1 text-xs text-green-600">
              {data.transferNumber} — {data.lines?.reduce((s, l) => s + Number(l.qty), 0)} total units transferred
            </div>
          </div>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center">
            <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
            <div className="text-sm font-medium text-red-800">Movement Cancelled</div>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/movement"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
            </Button>
          </div>
        )}

        {/* Line items table */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
            Line Items
          </div>
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium w-8">#</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">To</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                {isDraft && <th className="px-4 py-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const fromCode = line.fromLocation?.code || flatLocations.find((l) => l.id === line.fromLocationId)?.code || line.fromLocationId || '-'
                const toCode   = line.toLocation?.code   || flatLocations.find((l) => l.id === line.toLocationId)?.code   || line.toLocationId   || '-'
                return (
                  <tr key={line.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2">
                      {editLines ? (
                        <Select value={line.itemId} onValueChange={(v) => updateEditLine(i, 'itemId', v)}>
                          <SelectTrigger className="h-7 w-48 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {meta?.items?.map((it) => (
                              <SelectItem key={it.id} value={it.id} className="text-xs">
                                {it.sku} — {it.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <>
                          <div className="font-mono text-xs">{line.item?.sku}</div>
                          <div className="text-xs text-gray-500">{line.item?.name}</div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editLines ? (
                        <Select value={line.fromLocationId} onValueChange={(v) => updateEditLine(i, 'fromLocationId', v)}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {flatLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.code}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="font-mono text-xs">{fromCode}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editLines ? (
                        <Select value={line.toLocationId} onValueChange={(v) => updateEditLine(i, 'toLocationId', v)}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {flatLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.code}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="font-mono text-xs">{toCode}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editLines ? (
                        <Input
                          type="number"
                          min="1"
                          value={line.qty}
                          onChange={(e) => updateEditLine(i, 'qty', e.target.value)}
                          className="h-7 w-20 text-xs tabular-nums text-right"
                        />
                      ) : (
                        <span className="tabular-nums text-xs">{Number(line.qty)}</span>
                      )}
                    </td>
                    {isDraft && (
                      <td className="px-4 py-2">
                        {editLines && lines.length > 1 && (
                          <button
                            onClick={() => setEditLines((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-gray-400 hover:text-red-500 text-sm"
                          >×</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-xs text-gray-500">Total</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums text-xs">
                  {lines.reduce((s, l) => s + Number(l.qty), 0)}
                </td>
                {isDraft && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Remarks */}
        {(isDraft && editLines) && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Remarks</Label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes for this movement"
              className="text-sm"
            />
          </div>
        )}
      </div>

      {/* FIFO PREVIEW DIALOG */}
      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) setPreviewOpen(false) }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Movement Preview — FIFO Allocation</DialogTitle>
            <DialogDescription>
              Review the FIFO layers that will be consumed and the ledger entries that will be created before executing this movement.
            </DialogDescription>
          </DialogHeader>

          {previewLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">Calculating FIFO allocation…</span>
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
              {previewData.allocations?.length > 0 ? (
                previewData.allocations.map((alloc, ai) => (
                  <div key={alloc.lineId || ai} className="rounded-md border border-gray-200 bg-white">
                    {/* Line header */}
                    <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                      <Package className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-mono text-xs font-medium">{alloc.itemSku}</span>
                      <span className="text-xs text-gray-500">{alloc.itemName}</span>
                      <ArrowRight className="h-3 w-3 text-gray-300" />
                      <span className="font-mono text-xs">{alloc.fromLocationCode}</span>
                      <ArrowRight className="h-3 w-3 text-gray-300" />
                      <span className="font-mono text-xs font-medium">{alloc.toLocationCode}</span>
                      <span className="ml-auto font-medium tabular-nums text-xs">
                        {alloc.qty} unit{alloc.qty !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* FIFO layers being consumed */}
                    <div className="px-4 py-2">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        FIFO Layers Consumed (oldest first)
                      </div>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-gray-400">
                            <th className="text-left font-medium">Ref</th>
                            <th className="text-left font-medium">Received</th>
                            <th className="text-right font-medium">Unit Cost</th>
                            <th className="text-right font-medium">Available</th>
                            <th className="text-right font-medium">Consuming</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alloc.fifoLayers?.map((layer) => (
                            <tr key={layer.layerId} className="border-t border-gray-50">
                              <td className="py-1 font-mono text-gray-600">{layer.refNumber || '-'}</td>
                              <td className="py-1 text-gray-500">
                                {layer.receivedAt ? new Date(layer.receivedAt).toLocaleDateString('en-GB') : '-'}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {layer.unitCost != null ? formatCurrency(layer.unitCost) : '-'}
                              </td>
                              <td className="py-1 text-right tabular-nums text-gray-500">{layer.available}</td>
                              <td className="py-1 text-right tabular-nums font-medium text-blue-700">{layer.qtyToConsume}</td>
                            </tr>
                          ))}
                          {!alloc.fifoLayers?.length && (
                            <tr>
                              <td colSpan={5} className="py-1 text-center text-gray-400">No FIFO layers found</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 font-medium">
                            <td colSpan={3} className="pt-1 text-right text-gray-500">Avg Unit Cost:</td>
                            <td className="pt-1 text-right tabular-nums">
                              {alloc.avgUnitCost ? formatCurrency(alloc.avgUnitCost) : '-'}
                            </td>
                            <td className="pt-1 text-right tabular-nums text-blue-700">{alloc.qty}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Destination layer preview */}
                    <div className="border-t border-gray-100 bg-blue-50 px-4 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                        Destination FIFO Layer (preserved identity)
                      </div>
                      <div className="mt-0.5 flex items-center gap-4 text-[11px] text-blue-700">
                        {alloc.fifoLayers?.[0] && (
                          <>
                            <span>
                              Ref: <span className="font-mono">{alloc.fifoLayers[0].refNumber || 'MOVEMENT'}</span>
                            </span>
                            <span>
                              Received: <span>{alloc.fifoLayers[0].receivedAt
                                ? new Date(alloc.fifoLayers[0].receivedAt).toLocaleDateString('en-GB')
                                : 'N/A'}</span>
                            </span>
                            <span>
                              Unit Cost: <span>{alloc.fifoLayers[0].unitCost != null ? formatCurrency(alloc.fifoLayers[0].unitCost) : '-'}</span>
                            </span>
                            <span>
                              → {alloc.toLocationCode}: <span className="font-medium">+{alloc.qty}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-gray-200 p-6 text-center text-sm text-gray-500">
                  No allocations to preview
                </div>
              )}

              {/* Ledger entry summary */}
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
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${e.txnType === 'TRANSFER_OUT'
                                ? 'border-red-200 bg-red-50 text-red-600'
                                : 'border-green-200 bg-green-50 text-green-600'}`}
                            >
                              {e.txnType}
                            </Badge>
                          </td>
                          <td className="py-1 font-mono">{e.locationCode || e.locationId}</td>
                          <td className={`py-1 text-right tabular-nums ${e.qty < 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {e.qty > 0 ? '+' : ''}{e.qty}
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
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => executeMut.mutate()}
                disabled={executeMut.isPending}
              >
                {executeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Execution
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
