'use client'

export const dynamic = 'force-dynamic'

import { use, useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { StockOpnameHeader } from '@/components/stock-opname/StockOpnameHeader'
import { VarianceSummaryCard } from '@/components/stock-opname/VarianceSummaryCard'
import { ScanLocationCard } from '@/components/stock-opname/ScanLocationCard'
import { ScanItemCard } from '@/components/stock-opname/ScanItemCard'
import { ConfirmDialog } from '@/components/stock-opname/ConfirmDialog'
import { EmptyState } from '@/components/stock-opname/EmptyState'
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, Minus,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

function varianceColor(diffQty) {
  if (diffQty === 0) return 'text-green-600'
  if (diffQty > 0) return 'text-blue-500'
  return 'text-red-500'
}

function varianceBg(diffQty) {
  if (diffQty === 0) return 'bg-green-50'
  if (diffQty > 0) return 'bg-blue-50'
  return 'bg-red-50'
}

function VarianceIcon({ diffQty }) {
  if (diffQty === 0) return <Minus className="h-3 w-3 text-gray-400" />
  if (diffQty > 0) return <TrendingUp className="h-3 w-3 text-blue-500" />
  return <TrendingDown className="h-3 w-3 text-red-500" />
}

const DetailPage = ({ params }) => {
  const { id } = use(params)
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stock-opname', id],
    queryFn: () => api(`/stock-opname/${id}`),
    refetchInterval: false,
  })

  const { data: summaryData } = useQuery({
    queryKey: ['stock-opname-summary', id],
    queryFn: () => api(`/stock-opname/${id}/summary`),
    enabled: !!id && !!data,
    refetchInterval: false,
  })

  // Counted qty state: keyed by lineId
  const [countedQtys, setCountedQtys] = useState({})
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [highlightedLineId, setHighlightedLineId] = useState(null)
  const [scannedLocation, setScannedLocation] = useState(null)
  const [scannedItem, setScannedItem] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  // Dialogs
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [cancelReason, setCancelReason] = useState('')

  // Refs for auto-focus
  const lineInputRefs = useRef({})
  const locationInputRef = useRef(null)
  const itemInputRef = useRef(null)

  // Sync countedQtys when data loads
  useEffect(() => {
    if (data?.lines) {
      const initial = {}
      data.lines.forEach((l) => {
        initial[l.id] = l.countedQty != null ? String(l.countedQty) : ''
      })
      setCountedQtys(initial)
    }
  }, [data?.id])

  // Auto-focus item input when an item is scanned + auto-scroll to row
  useEffect(() => {
    if (highlightedLineId && lineInputRefs.current[highlightedLineId]) {
      lineInputRefs.current[highlightedLineId].focus()
      lineInputRefs.current[highlightedLineId].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedLineId])

  // Mutations
  const startMut = useMutation({
    mutationFn: () => api(`/stock-opname/${id}/start`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Stock opname started — snapshot captured')
      setCountedQtys({})
      setSelectedLocationId(null)
      setHighlightedLineId(null)
      setScannedLocation(null)
      setScannedItem(null)
      refetch()
      qc.invalidateQueries({ queryKey: ['stock-opname-summary', id] })
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setActionLoading(null),
  })

  const scanLocationMut = useMutation({
    mutationFn: (body) => api(`/stock-opname/${id}/scan-location`, { method: 'POST', body }),
    onSuccess: (result) => {
      setScannedLocation(result)
      setSelectedLocationId(result.location?.id || null)
      setHighlightedLineId(null)
      setScannedItem(null)
      toast.success(`Location ${result.location.code} selected — ${result.linesAtLocation} line(s) here`)
      locationInputRef.current?.focus()
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setActionLoading(null),
  })

  const scanItemMut = useMutation({
    mutationFn: (body) => api(`/stock-opname/${id}/scan-item`, { method: 'POST', body }),
    onSuccess: (result) => {
      setScannedItem(result)
      setHighlightedLineId(result.line?.id || null)
      setSelectedLocationId(result.location?.id || null)
      toast.success(`Item ${result.item?.sku} scanned`)
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setActionLoading(null),
  })

  const updateCountMut = useMutation({
    mutationFn: ({ lineId, countedQty }) =>
      api(`/stock-opname/${id}/count`, {
        method: 'PATCH',
        body: { lineId, countedQty },
      }),
    onSuccess: () => {
      refetch()
      qc.invalidateQueries({ queryKey: ['stock-opname-summary', id] })
    },
    onError: (e) => toast.error(e.message),
  })

  const submitMut = useMutation({
    mutationFn: () => api(`/stock-opname/${id}/submit`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Stock opname submitted for approval')
      setHighlightedLineId(null)
      setScannedLocation(null)
      setScannedItem(null)
      refetch()
      qc.invalidateQueries({ queryKey: ['stock-opname-summary', id] })
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setActionLoading(null),
  })

  const rejectMut = useMutation({
    mutationFn: (reason) =>
      api(`/stock-opname/${id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Stock opname rejected — returned to counting')
      setRejectDialogOpen(false)
      setRejectReason('')
      refetch()
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setActionLoading(null),
  })

  const approveMut = useMutation({
    mutationFn: () => api(`/stock-opname/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Stock opname approved and completed')
      setApproveDialogOpen(false)
      refetch()
      qc.invalidateQueries({ queryKey: ['stock-opname-summary', id] })
      qc.invalidateQueries({ queryKey: ['stock-opname-list'] })
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setActionLoading(null),
  })

  const cancelMut = useMutation({
    mutationFn: (reason) =>
      api(`/stock-opname/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Stock opname cancelled')
      setCancelDialogOpen(false)
      setCancelReason('')
      refetch()
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setActionLoading(null),
  })

  // Handle action button clicks from header
  const handleAction = (action) => {
    setActionLoading(action)
    if (action === 'start') startMut.mutate()
    else if (action === 'submit') submitMut.mutate()
    else if (action === 'approve') setApproveDialogOpen(true)
    else if (action === 'reject') setRejectDialogOpen(true)
    else if (action === 'cancel') setCancelDialogOpen(true)
  }

  // Update counted qty locally + API call (debounced in caller)
  const updateCountedQty = useCallback((lineId, value) => {
    setCountedQtys((p) => ({ ...p, [lineId]: value }))
  }, [])

  // On blur, sync to API
  const handleCountBlur = (lineId, value) => {
    const qty = Number(value)
    if (isNaN(qty) || qty < 0) return
    updateCountMut.mutate({ lineId, countedQty: qty })
  }

  // Keyboard navigation: Enter moves to next row
  const handleCountKeyDown = (e, lineIds, currentIndex) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const nextIndex = currentIndex + 1
      if (nextIndex < lineIds.length) {
        const nextId = lineIds[nextIndex]
        setHighlightedLineId(nextId)
        setTimeout(() => lineInputRefs.current[nextId]?.focus(), 50)
      }
    }
  }

  if (isLoading) {
    return (
      <AppShell title="Stock Opname" subtitle="Loading...">
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <AppShell
        title="Stock Opname"
        subtitle="Not found"
        actions={
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/stock-opname"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
          </Button>
        }
      >
        <div className="rounded-md border p-8 text-center text-sm text-gray-500">
          Stock opname not found.{' '}
          <Link className="text-blue-600 underline" href="/stock-opname">Back to list</Link>
        </div>
      </AppShell>
    )
  }

  const isInProgress = data.status === 'IN_PROGRESS'
  const isSubmitted = data.status === 'SUBMITTED'
  const isCompleted = data.status === 'COMPLETED'
  const isCancelled = data.status === 'CANCELLED'
  const isApproved = data.status === 'APPROVED'
  const isDraft = data.status === 'DRAFT'

  // Group lines by location
  const linesByLocation = {}
  for (const line of data.lines || []) {
    const locId = line.locationId
    if (!linesByLocation[locId]) linesByLocation[locId] = []
    linesByLocation[locId].push(line)
  }
  const locationIds = Object.keys(linesByLocation)
  const selectedLines = selectedLocationId ? (linesByLocation[selectedLocationId] || []) : data.lines || []
  const orderedLines = selectedLines.sort((a, b) => {
    const aCode = a.item?.sku || ''
    const bCode = b.item?.sku || ''
    return aCode.localeCompare(bCode)
  })
  const lineIds = orderedLines.map((l) => l.id)

  const varianceLines = (data.lines || []).filter((l) => Number(l.diffQty) !== 0)
  const totalDiff = varianceLines.reduce((s, l) => s + Number(l.diffQty || 0), 0)

  return (
    <AppShell
      title={data.opnameNumber}
      subtitle="Stock Opname"
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/stock-opname"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <StockOpnameHeader
          data={data}
          onAction={handleAction}
          loading={!!actionLoading}
        />

        {/* Start banner */}
        {isDraft && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-6 text-center">
            <div className="mb-3 text-sm font-medium text-blue-800">
              Stock opname is in Draft status
            </div>
            <p className="mb-4 text-xs text-blue-600">
              Click <strong>Start Count</strong> to capture the current system quantities and begin physical counting.
              Once started, you cannot change the snapshot.
            </p>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => handleAction('start')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'start' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Start Count
            </Button>
          </div>
        )}

        {/* Scanning cards — IN_PROGRESS */}
        {isInProgress && (
          <div className="grid gap-3 sm:grid-cols-2">
            <ScanLocationCard
              onScan={(code) => {
                setActionLoading('scan-location')
                scanLocationMut.mutate({ locationCode: code })
              }}
              isLoading={actionLoading === 'scan-location'}
            />
            <ScanItemCard
              onScan={(barcode) => {
                setActionLoading('scan-item')
                scanItemMut.mutate({
                  barcode,
                  ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
                })
              }}
              isLoading={actionLoading === 'scan-item'}
              scannedItem={scannedItem}
            />
          </div>
        )}

        {/* Variance summary — IN_PROGRESS and later */}
        {(isInProgress || isSubmitted || isApproved || isCompleted) && summaryData && (
          <VarianceSummaryCard summary={summaryData} />
        )}

        {/* Variance warning — submitted */}
        {isSubmitted && varianceLines.length > 0 && (
          <div className={`rounded-md border p-4 text-xs ${
            totalDiff > 0
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-red-200 bg-red-50 text-red-600'
          }`}>
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {varianceLines.length} line(s) with variance — net:{' '}
              <strong>{totalDiff > 0 ? '+' : ''}{fmt(totalDiff)}</strong>
            </div>
            <div className="text-[11px] opacity-80">
              Approving will auto-create a Stock Adjustment to correct inventory.
            </div>
          </div>
        )}

        {/* Completed banner */}
        {isCompleted && (
          <div className="rounded-md border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500" />
            <div className="text-sm font-medium text-green-800">Stock Opname Completed</div>
            <div className="mt-1 text-xs text-green-600">
              {varianceLines.length === 0
                ? 'No variances found — no adjustments were created.'
                : `${varianceLines.length} variance line(s) corrected via auto-created adjustment.`}
            </div>
          </div>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center">
            <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
            <div className="text-sm font-medium text-red-800">Stock Opname Cancelled</div>
          </div>
        )}

        {/* Count table */}
        {data.lines && data.lines.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            {/* Location filter pills — IN_PROGRESS */}
            {isInProgress && locationIds.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                <span className="text-[11px] text-gray-500">Location:</span>
                <button
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    !selectedLocationId
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => { setSelectedLocationId(null); setHighlightedLineId(null) }}
                >
                  All ({data.lines.length})
                </button>
                {locationIds.map((locId) => {
                  const loc = data.lines.find((l) => l.locationId === locId)?.location
                  const count = linesByLocation[locId]?.length || 0
                  return (
                    <button
                      key={locId}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        selectedLocationId === locId
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setSelectedLocationId(locId)
                        setHighlightedLineId(null)
                      }}
                    >
                      {loc?.code || locId} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            <div className="px-4 py-2 text-xs font-medium text-gray-500">
              {isInProgress
                ? `Count Lines${selectedLocationId ? ` — ${data.lines.find((l) => l.locationId === selectedLocationId)?.location?.code || ''}` : ''}`
                : 'Count Lines'}
            </div>

            <table className="w-full text-[13px]">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 text-right font-medium">Barcode</th>
                  <th className="px-4 py-2 text-right font-medium">System Qty</th>
                  <th className="px-4 py-2 text-right font-medium">
                    {isInProgress ? 'Counted Qty *' : 'Counted Qty'}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Difference</th>
                  <th className="px-4 py-2 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {orderedLines.map((line, i) => {
                  const isHighlighted = highlightedLineId === line.id
                  const countedQty = countedQtys[line.id] ?? (line.countedQty != null ? String(line.countedQty) : '')
                  const diffQty = countedQty !== '' && countedQty != null
                    ? Number(countedQty) - Number(line.systemQty || 0)
                    : null
                  const hasVariance = diffQty != null && diffQty !== 0
                  const isCounted = countedQty !== '' && countedQty != null

                  return (
                    <tr
                      key={line.id}
                      className={`border-t border-gray-100 transition-colors ${
                        isHighlighted ? 'bg-blue-50 ring-1 ring-blue-300' : hasVariance ? varianceBg(diffQty) : ''
                      }`}
                    >
                      <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs">{line.item?.sku}</div>
                        <div className="max-w-40 truncate text-[11px] text-gray-500">{line.item?.name}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs">{line.location?.code || '—'}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                        {line.item?.barcode || '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs font-medium">
                        {fmt(Number(line.systemQty || 0))}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isInProgress ? (
                          <Input
                            ref={(el) => { lineInputRefs.current[line.id] = el }}
                            type="number"
                            min="0"
                            value={countedQty}
                            onChange={(e) => updateCountedQty(line.id, e.target.value)}
                            onBlur={(e) => handleCountBlur(line.id, e.target.value)}
                            onKeyDown={(e) => handleCountKeyDown(e, lineIds, i)}
                            placeholder="0"
                            className={`h-7 w-24 text-xs tabular-nums text-right ${isHighlighted ? 'border-blue-400 bg-white' : ''}`}
                          />
                        ) : (
                          <span className={`tabular-nums text-xs font-medium ${isCounted ? '' : 'text-gray-400'}`}>
                            {isCounted ? fmt(Number(countedQty)) : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {diffQty != null ? (
                          <span className={`inline-flex items-center gap-1 tabular-nums text-xs font-medium ${varianceColor(diffQty)}`}>
                            <VarianceIcon diffQty={diffQty} />
                            {diffQty > 0 ? '+' : ''}{fmt(diffQty)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {diffQty != null ? (
                          diffQty === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                              <CheckCircle2 className="h-3 w-3" /> Matched
                            </span>
                          ) : diffQty < 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-red-500">
                              <XCircle className="h-3 w-3" /> Missing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-blue-500">
                              <TrendingUp className="h-3 w-3" /> Over
                            </span>
                          )
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {isInProgress && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-400">
                * Press <kbd className="rounded border border-gray-200 bg-white px-1 font-mono">Enter</kbd> to move to the next row
              </div>
            )}
          </div>
        )}

        {data.lines && data.lines.length === 0 && !isDraft && (
          <EmptyState
            title="No lines in this stock opname"
            description="Start the count to capture a snapshot of system quantities."
          />
        )}

        {data.lines && data.lines.length === 0 && isDraft && (
          <EmptyState
            title="No lines yet"
            description="Click Start Count to capture the current inventory snapshot."
          />
        )}
      </div>

      {/* APPROVE DIALOG */}
      <ConfirmDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        title="Approve Stock Opname"
        description={
          varianceLines.length === 0
            ? 'No variances detected. Approving will mark this opname as complete.'
            : `Approving will auto-create a Stock Adjustment for ${varianceLines.length} variance line(s). Inventory and FIFO will be updated. This cannot be undone.`
        }
        confirmLabel="Confirm Approval"
        onConfirm={() => approveMut.mutate()}
        isLoading={actionLoading === 'approve'}
        variant="default"
      >
        {varianceLines.length > 0 && (
          <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs">
            <div className="mb-1 font-semibold text-amber-700">Variance Summary</div>
            {varianceLines.slice(0, 5).map((l) => {
              const dv = Number(l.diffQty || 0)
              return (
                <div key={l.id} className="flex justify-between">
                  <span className="font-mono">
                    {l.item?.sku} @ {l.location?.code || '—'}
                  </span>
                  <span className={`font-medium tabular-nums ${varianceColor(dv)}`}>
                    {dv > 0 ? '+' : ''}{fmt(dv)}
                  </span>
                </div>
              )
            })}
            {varianceLines.length > 5 && (
              <div className="text-gray-500">...and {varianceLines.length - 5} more</div>
            )}
          </div>
        )}
      </ConfirmDialog>

      {/* REJECT DIALOG */}
      <ConfirmDialog
        open={rejectDialogOpen}
        onOpenChange={(open) => { if (!open) { setRejectDialogOpen(false); setRejectReason('') } }}
        title="Reject Stock Opname"
        description="This will return the opname to IN_PROGRESS status so the counter can recount."
        confirmLabel="Reject"
        onConfirm={() => rejectMut.mutate(rejectReason || undefined)}
        isLoading={actionLoading === 'reject'}
        variant="default"
      >
        <div className="mt-3 space-y-1.5">
          <label className="text-xs text-gray-600">Reason (optional)</label>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g., Incorrect counted quantities"
            className="text-sm"
          />
        </div>
      </ConfirmDialog>

      {/* CANCEL DIALOG */}
      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={(open) => { if (!open) { setCancelDialogOpen(false); setCancelReason('') } }}
        title="Cancel Stock Opname"
        description="This action cannot be undone. The opname will be permanently cancelled."
        confirmLabel="Cancel Opname"
        onConfirm={() => cancelMut.mutate(cancelReason || undefined)}
        isLoading={actionLoading === 'cancel'}
        variant="destructive"
      >
        <div className="mt-3 space-y-1.5">
          <label className="text-xs text-gray-600">Reason (optional)</label>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g., Cancelled by supervisor"
            className="text-sm"
          />
        </div>
      </ConfirmDialog>
    </AppShell>
  )
}

export default DetailPage
