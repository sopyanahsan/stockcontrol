'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ErrorState } from '@/components/ErrorState'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import BarcodeInput, { createScanSession } from '@/components/barcode-input'
import ItemSelector from '@/components/inventory/ItemSelector'
import AttachmentManager from '@/components/attachments/AttachmentManager'
import EvidenceCapture from '@/components/evidence/EvidenceCapture'
import { EVIDENCE_TYPES_LINE } from '@/lib/evidence/evidence-utils'
import { ArrowLeft, Plus, Trash2, Loader2, Play, Send, Ban, ChevronRight, Barcode, PackageCheck, AlertTriangle, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

const STATUS_META = {
  DRAFT:           { label: 'Draft',            class: 'bg-gray-100 text-gray-700' },
  RECEIVING:       { label: 'Receiving',        class: 'bg-blue-100 text-blue-700' },
  WAITING_PUTAWAY: { label: 'Waiting Putaway',  class: 'bg-amber-100 text-amber-700' },
  COMPLETED:       { label: 'Completed',        class: 'bg-green-100 text-green-700' },
  CANCELLED:       { label: 'Cancelled',        class: 'bg-red-100 text-red-700' },
}

const STAGES = ['DRAFT', 'RECEIVING', 'WAITING_PUTAWAY', 'COMPLETED']

// Receiving Resolution (RCV-2.4) — variance disposition options.
const VARIANCE_REASONS = [
  'Supplier Short Shipment',
  'Supplier Over Shipment',
  'Wrong Item',
  'Damaged During Delivery',
  'Counting Error',
  'Pending Confirmation',
  'Other',
]

const RESOLUTIONS = [
  'Continue Partial',
  'Create Outstanding',
  'Return To Supplier',
  'Manager Approval',
  'Pending Supplier Confirmation',
]

const RESOLUTION_STATUS_META = {
  'FULL RECEIVED':    { class: 'border-green-200 bg-green-50 text-green-700' },
  'PARTIAL RECEIVED': { class: 'border-amber-200 bg-amber-50 text-amber-700' },
  'OVER RECEIVED':    { class: 'border-blue-200 bg-blue-50 text-blue-700' },
  'ITEM MISMATCH':    { class: 'border-red-200 bg-red-50 text-red-700' },
}

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

function SummaryItem({ label, value, accent = 'text-gray-700' }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  )
}

function StatusFlow({ status }) {
  if (status === 'CANCELLED') return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
  const idx = STAGES.indexOf(status)
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`rounded-full px-2 py-0.5 ${
              i < idx ? 'bg-green-100 text-green-700' :
              i === idx ? 'bg-blue-100 text-blue-700 font-medium' :
              'bg-gray-100 text-gray-400'
            }`}
          >
            {STATUS_META[s].label}
          </div>
          {i < STAGES.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
        </div>
      ))}
    </div>
  )
}

const App = ({ params }) => {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()

  const [error, setError] = useState(null)
  const lineItemRefs = useRef([])
  const lineExpectedQtyRefs = useRef([])
  const lineUnitCostRefs = useRef([])
  const lineBatchRefs = useRef([])
  const saveDraftButtonRef = useRef(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receiving', id],
    queryFn: () => api(`/receiving/${id}`),
    onError: (e) => setError(e),
  })
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })
  const { data: items } = useQuery({ queryKey: ['items'], queryFn: () => api('/items') })

  const isEditable = data?.status === 'DRAFT'
  const isReceiving = data?.status === 'RECEIVING'

  // ---------- Header details (draft edit) ----------
  const [detailsForm, setDetailsForm] = useState(null)
  const [openDetails, setOpenDetails] = useState(false)
  const detailsForEdit = detailsForm ?? {
    supplierId: data?.supplierRel?.id || '',
    supplier: data?.supplier || '',
    refDocument: data?.refDocument || '',
    invoiceNumber: data?.invoiceNumber || '',
    vehicleNumber: data?.vehicleNumber || '',
    driverName: data?.driverName || '',
  }
  const openDetailsDialog = () => { setDetailsForm(null); setOpenDetails(true); qc.invalidateQueries({ queryKey: ['meta'] }) }

  const detailsMut = useMutation({
    mutationFn: (payload) => api(`/receiving/${id}`, { method: 'PUT', body: payload }),
    onSuccess: () => {
      toast.success('Details saved')
      setOpenDetails(false)
      qc.invalidateQueries({ queryKey: ['receiving', id] })
      qc.invalidateQueries({ queryKey: ['meta'] })
      qc.invalidateQueries({ queryKey: ['items'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const setDetails = (patch) => setDetailsForm((f) => ({ ...(f ?? detailsForEdit), ...patch }))

  // ---------- Lines (draft edit) ----------
  const [draftLines, setDraftLines] = useState(null) // null => not yet initialized
  const linesForEdit = draftLines ?? ((data?.lines?.map((l) => ({
    id: l.id,
    itemId: l.itemId,
    itemLabel: l.item ? `${l.item.sku} - ${l.item.name}` : '',
    serialTracked: !!l.item?.serialTracked,
    expectedQty: l.expectedQty || 0,
    receivedQty: l.receivedQty || 0,
    unitCost: l.unitCost || 0,
    batchNo: l.batchNo || '',
    varianceReason: l.varianceReason || '',
    resolution: l.resolution || '',
    outstandingQty: l.outstandingQty || 0,
    returnQty: l.returnQty || 0,
  })) || []))

  const setEditLines = (updater) => setDraftLines((prev) => {
    const base = prev ?? (data?.lines?.map((l) => ({
      id: l.id, itemId: l.itemId,
      itemLabel: l.item ? `${l.item.sku} - ${l.item.name}` : '',
      serialTracked: !!l.item?.serialTracked,
      expectedQty: l.expectedQty || 0, receivedQty: l.receivedQty || 0,
      unitCost: l.unitCost || 0, batchNo: l.batchNo || '',
      varianceReason: l.varianceReason || '',
      resolution: l.resolution || '',
      outstandingQty: l.outstandingQty || 0,
      returnQty: l.returnQty || 0,
    })) || [])
    return updater(base)
  })

  const newLineObj = () => ({
    itemId: '', expectedQty: 1, receivedQty: 0, unitCost: 0, batchNo: '', itemLabel: '', serialTracked: false,
    varianceReason: '', resolution: '', outstandingQty: 0, returnQty: 0,
  })

  const addLine = () => {
    // Ensure the item dropdown always includes the newest master items.
    qc.invalidateQueries({ queryKey: ['items'] })
    setEditLines((lines) => {
      // Receiving may only contain ONE empty line — reuse the existing one.
      if (lines.some((l) => !l.itemId)) return lines
      return [...lines, newLineObj()]
    })
  }
  const removeLine = (i) => setEditLines((lines) => lines.filter((_, idx) => idx !== i))
  const updateLine = (i, patch) => setEditLines((lines) => lines.map((l, idx) => idx === i ? { ...l, ...patch } : l))

  // ---------- Continuous scanning (auto-create the next empty line) ----------
  const [pendingFocusIndex, setPendingFocusIndex] = useState(null)
  const [flashLineIndex, setFlashLineIndex] = useState(null)

  const insertEmptyLineAfter = (i) => {
    // Maximum ONE empty line in the whole list (reuse it instead of duplicating).
    const hasOtherEmpty = linesForEdit.some((l, idx) => idx !== i && !l.itemId)
    if (hasOtherEmpty) return
    setEditLines((lines) => [...lines.slice(0, i + 1), newLineObj(), ...lines.slice(i + 1)])
    setPendingFocusIndex(i + 1)
    setFlashLineIndex(i + 1)
  }

  // After a successful scan selection, fill the current line and open a fresh
  // empty line below it so the operator can scan continuously. Re-selecting
  // the same item on the same line keeps the existing behavior (no duplicate
  // line, no quantity merge).
  const handleItemSelected = (i, it) => {
    const current = linesForEdit[i]
    updateLine(i, {
      itemId: it.id,
      itemLabel: it ? `${it.sku} - ${it.name}` : '',
      serialTracked: !!it?.serialTracked,
      unitCost: it?.unitCost || current?.unitCost || 0,
    })
    if (current && current.itemId === it.id) return
    insertEmptyLineAfter(i)
  }

  // Focus + smooth-scroll the freshly created empty line's ItemSelector.
  useEffect(() => {
    if (pendingFocusIndex == null) return
    const el = lineItemRefs.current[pendingFocusIndex]
    if (el) {
      el.focus()
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPendingFocusIndex(null)
    }
  }, [pendingFocusIndex, linesForEdit])

  // Clear the light-blue "new line" flash after 500ms.
  useEffect(() => {
    if (flashLineIndex == null) return
    const t = setTimeout(() => setFlashLineIndex(null), 500)
    return () => clearTimeout(t)
  }, [flashLineIndex])

  // ---------- Receiving Resolution (RCV-2.4) ----------
  // Summary + status derived from the line set (never stored on the header).
  const resolutionSummary = useMemo(() => {
    const lines = linesForEdit || []
    const summary = { expectedQty: 0, receivedQty: 0, varianceQty: 0, outstandingQty: 0, resolutionCount: 0, unresolved: 0 }
    for (const l of lines) {
      const exp = Number(l.expectedQty) || 0
      const rec = Number(l.receivedQty) || 0
      summary.expectedQty += exp
      summary.receivedQty += rec
      summary.varianceQty += rec - exp
      const short = exp - rec
      if (short > 0) {
        summary.outstandingQty += l.resolution === 'Create Outstanding' ? short : Number(l.outstandingQty) || 0
      }
      if (rec !== exp) {
        if (l.resolution && l.varianceReason) summary.resolutionCount += 1
        else summary.unresolved += 1
      }
    }
    return summary
  }, [linesForEdit])

  const resolutionStatus = useMemo(() => {
    const lines = linesForEdit || data?.lines || []
    if (lines.some((l) => l.varianceReason === 'Wrong Item')) return 'ITEM MISMATCH'
    const hasOver = lines.some((l) => Number(l.receivedQty) > Number(l.expectedQty))
    const hasShort = lines.some((l) => Number(l.receivedQty) < Number(l.expectedQty))
    if (hasOver) return 'OVER RECEIVED'
    if (hasShort) return 'PARTIAL RECEIVED'
    return 'FULL RECEIVED'
  }, [linesForEdit, data])

  // Posting stays blocked until approval when a line needs Manager Approval.
  const blockedByApproval = (linesForEdit || data?.lines || []).some((l) => l.resolution === 'Manager Approval')

  // Enter-key navigation for draft lines table
  const handleDraftLineKeyDown = (e, rowIdx, field) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const totalLines = linesForEdit.length
    if (field === 'itemId') {
      lineExpectedQtyRefs.current[rowIdx]?.focus()
    } else if (field === 'expectedQty') {
      lineUnitCostRefs.current[rowIdx]?.focus()
    } else if (field === 'unitCost') {
      lineBatchRefs.current[rowIdx]?.focus()
    } else if (field === 'batchNo') {
      if (rowIdx < totalLines - 1) {
        lineItemRefs.current[rowIdx + 1]?.focus()
      } else if (draftLines && !saveMut.isPending) {
        saveDraftButtonRef.current?.focus()
      }
    }
  }

  const saveMut = useMutation({
    mutationFn: () => api(`/receiving/${id}`, {
      method: 'PUT',
      body: {
        lines: (draftLines || [])
          .filter((l) => l.itemId)
          .map((l) => ({
            itemId: l.itemId, expectedQty: Number(l.expectedQty) || 0,
            receivedQty: Number(l.receivedQty) || 0, unitCost: Number(l.unitCost) || 0,
            batchNo: l.batchNo || null,
            varianceReason: l.varianceReason || null,
            resolution: l.resolution || null,
            outstandingQty: Number(l.outstandingQty) || 0,
            returnQty: Number(l.returnQty) || 0,
          })),
      },
    }),
    onSuccess: () => {
      toast.success('Draft saved')
      setDraftLines(null)
      qc.invalidateQueries({ queryKey: ['receiving', id] })
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['meta'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const startMut = useMutation({
    mutationFn: () => api(`/receiving/${id}/start`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Receiving started')
      qc.invalidateQueries({ queryKey: ['receiving', id] })
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['meta'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const cancelMut = useMutation({
    mutationFn: (reason) => api(`/receiving/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { toast.success('Cancelled'); qc.invalidateQueries({ queryKey: ['receiving', id] }); qc.invalidateQueries({ queryKey: ['receiving-list'] }) },
    onError: (e) => toast.error(e.message),
  })

  // ---------- Posting (line receivedQty + serials) ----------
  const [postState, setPostState] = useState({}) // { [lineId]: { receivedQty, serials: [] } }
  const initPostState = () => {
    if (!data?.lines) return {}
    const s = {}
    for (const l of data.lines) {
      s[l.id] = { receivedQty: l.receivedQty || l.expectedQty || 0, serials: l.serials?.map((sn) => sn.serialNo) || [] }
    }
    return s
  }
  const [openPost, setOpenPost] = useState(false)
  const openPostDialog = () => { setPostState(initPostState()); setOpenPost(true) }

  const postMut = useMutation({
    mutationFn: () => api(`/receiving/${id}/post`, {
      method: 'POST',
      body: {
        lines: Object.entries(postState).map(([lineId, v]) => ({
          lineId,
          receivedQty: Number(v.receivedQty) || 0,
          serials: v.serials,
        })),
      },
    }),
    onSuccess: (r) => {
      toast.success(`Posted ${r.grnNumber} - moved to Waiting Putaway`)
      setOpenPost(false)
      qc.invalidateQueries({ queryKey: ['receiving', id] })
      qc.invalidateQueries({ queryKey: ['receiving-list'] })
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['meta'] })
    },
    onError: (e) => toast.error(e.message),
  })

  // ---------- Outstanding Receipt (RCV-2.5) ----------
  const [openOutstanding, setOpenOutstanding] = useState(false)
  const [outstandingForm, setOutstandingForm] = useState({}) // { lineId: receiveNow }
  const outstandingLines = (data?.lines || []).filter((l) => (l.outstandingQty || 0) > 0)
  const totalOutstanding = outstandingLines.reduce((s, l) => s + (l.outstandingQty || 0), 0)
  const outstandingStatus = totalOutstanding === 0
    ? 'COMPLETED'
    : (data?.outstandingActivities?.length ? 'PARTIAL' : 'OPEN')
  const outstandingUom = outstandingLines[0]?.item?.uom?.code || ''
  const outstandingResolution = outstandingLines[0]?.resolution || ''

  const openOutstandingDialog = () => {
    const init = {}
    for (const l of outstandingLines) init[l.id] = ''
    setOutstandingForm(init)
    setOpenOutstanding(true)
  }

  const outstandingMut = useMutation({
    mutationFn: () => api(`/receiving/${id}/outstanding`, {
      method: 'POST',
      body: {
        lines: Object.entries(outstandingForm)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([lineId, qty]) => ({ lineId, receivedQty: Number(qty) || 0 })),
      },
    }),
    onSuccess: (r) => {
      toast.success('Outstanding received — same GRN updated')
      setOpenOutstanding(false)
      setOutstandingForm({})
      qc.invalidateQueries({ queryKey: ['receiving', id] })
      qc.invalidateQueries({ queryKey: ['receiving-list'] })
      qc.invalidateQueries({ queryKey: ['meta'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const submitOutstanding = () => {
    const invalid = Object.entries(outstandingForm).some(([lineId, qty]) => {
      const q = Number(qty) || 0
      const line = outstandingLines.find((l) => l.id === lineId)
      if (q === 0) return false
      return q < 0 || q > (line?.outstandingQty || 0)
    })
    if (invalid) { toast.error('Receive Now must be > 0 and <= Outstanding Qty'); return }
    if (!Object.values(outstandingForm).some((q) => Number(q) > 0)) { toast.error('Enter an amount to receive'); return }
    outstandingMut.mutate()
  }

  if (isLoading) {
    return (
      <AppShell title="Receiving" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      </AppShell>
    )
  }
  if (error || !data) {
    return (
      <AppShell title="Receiving" subtitle="Error">
        <ErrorState
          error={error}
          onRetry={() => { setError(null); refetch() }}
          title="Failed to load receiving document"
        />
      </AppShell>
    )
  }

  const statusMeta = STATUS_META[data.status] || { label: data.status, class: 'bg-gray-100' }

  return (
    <AppShell
      title={data.grnNumber}
      subtitle={`Receiving into ${data.stagingLocation?.code} @ ${data.warehouse?.code}`}
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/receiving"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-semibold">{data.grnNumber}</div>
                <Badge variant="outline" className={`text-[10px] ${statusMeta.class}`}>{statusMeta.label}</Badge>
                {resolutionStatus && (
                  <Badge variant="outline" className={`text-[10px] ${RESOLUTION_STATUS_META[resolutionStatus]?.class || ''}`}>
                    {resolutionStatus}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-gray-500">
                Warehouse <span className="font-medium text-gray-700">{data.warehouse?.code}</span> · Staging <span className="font-mono text-gray-700">{data.stagingLocation?.code}</span>
              </div>
              <div className="text-xs text-gray-500">
                Supplier: <span className="text-gray-700">{data.supplierRel ? `${data.supplierRel.code} - ${data.supplierRel.name}` : (data.supplier || '-')}</span>
                {data.refDocument && <> · Ref: <span className="text-gray-700">{data.refDocument}</span></>}
              </div>
              {(data.invoiceNumber || data.vehicleNumber || data.driverName) && (
                <div className="text-xs text-gray-500">
                  {data.invoiceNumber && <>Invoice: <span className="text-gray-700">{data.invoiceNumber}</span></>}
                  {data.vehicleNumber && <> · Vehicle: <span className="text-gray-700">{data.vehicleNumber}</span></>}
                  {data.driverName && <> · Driver: <span className="text-gray-700">{data.driverName}</span></>}
                </div>
              )}
              <div className="text-[11px] text-gray-400">Created {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex gap-2">
                {data.status === 'DRAFT' && (
                  <>
                    <Button size="sm" variant="outline" className="h-8" onClick={openDetailsDialog}>
                      Details
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700" onClick={() => {
                      const reason = window.prompt('Cancel reason (optional):') ?? null
                      if (reason !== null) cancelMut.mutate(reason)
                    }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => startMut.mutate()} disabled={startMut.isPending || !data.lines?.length}>
                      {startMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      Start Receiving
                    </Button>
                  </>
                )}
                {isReceiving && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700" onClick={() => {
                      const reason = window.prompt('Cancel reason (optional):') ?? null
                      if (reason !== null) cancelMut.mutate(reason)
                    }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={openPostDialog} disabled={postMut.isPending || blockedByApproval} title={blockedByApproval ? 'Posting is blocked until Manager Approval is resolved' : undefined}>
                      <Send className="mr-1 h-3.5 w-3.5" /> Post to Staging
                    </Button>
                  </>
                )}
                {data.status === 'WAITING_PUTAWAY' && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href="/putaway"><PackageCheck className="mr-1 h-3.5 w-3.5" /> View Putaway Tasks</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Outstanding Receipt panel (RCV-2.5) */}
        {totalOutstanding > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50/40 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-xs font-semibold text-blue-800">Outstanding Receipt</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <span>
                    Outstanding Qty: <strong className="tabular-nums text-blue-800">{fmt(totalOutstanding)} {outstandingUom}</strong>
                  </span>
                  <span>Resolution: {outstandingResolution || '—'}</span>
                  <span>
                    Status: <Badge variant="outline" className="border-blue-200 bg-white text-[10px] text-blue-700">{outstandingStatus}</Badge>
                  </span>
                </div>
              </div>
              <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={openOutstandingDialog}>
                <PackageCheck className="mr-1.5 h-3.5 w-3.5" /> Receive Remaining
              </Button>
            </div>
          </div>
        )}

        {/* Outstanding Activity history (same GRN) */}
        {data?.outstandingActivities?.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium">Outstanding Activity</span>
              <span className="ml-auto text-[11px] text-gray-400">Same GRN · no new document</span>
            </div>
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Operator</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Received</th>
                  <th className="px-4 py-2 text-right font-medium">Outstanding Before</th>
                  <th className="px-4 py-2 text-right font-medium">Outstanding After</th>
                </tr>
              </thead>
              <tbody>
                {data.outstandingActivities.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-xs text-gray-500">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</td>
                    <td className="px-4 py-2 text-xs">{a.operator?.name || '—'}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs">{a.item?.sku || '—'}</span>
                      <span className="ml-1 text-xs text-gray-500">{a.item?.name}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">+{fmt(a.receivedQty)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmt(a.outstandingBefore)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmt(a.outstandingAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Header Attachments card (RCV-3.0) */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-2.5">
            <div className="text-sm font-medium">Attachments</div>
            <div className="text-[11px] text-gray-400">Purchase Order · Delivery Order · Invoice · Other</div>
          </div>
          <div className="px-4 py-3">
            <AttachmentManager
              module="Receiving"
              referenceId={id}
              editable={isEditable}
              types={['PURCHASE_ORDER', 'DELIVERY_NOTE', 'INVOICE', 'OTHER']}
            />
          </div>
        </div>

        {/* Lines */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
            <div className="text-sm font-medium">Lines ({data.lines?.length || 0})</div>
            {isEditable && (
              <div className="flex gap-2">
                {draftLines && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraftLines(null)}>Discard changes</Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
                </Button>
                {draftLines && (
                  <Button ref={saveDraftButtonRef} size="sm" className="h-7 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                    {saveMut.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Save Draft
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Receiving Resolution summary */}
          {(!isEditable ? data.lines : linesForEdit)?.length > 0 && (
            <div className="border-b border-gray-100 px-4 py-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <SummaryItem label="Expected Qty" value={fmt(resolutionSummary.expectedQty)} />
                <SummaryItem label="Received Qty" value={fmt(resolutionSummary.receivedQty)} />
                <SummaryItem label="Variance Qty" value={`${resolutionSummary.varianceQty >= 0 ? '+' : ''}${fmt(resolutionSummary.varianceQty)}`} accent={resolutionSummary.varianceQty === 0 ? 'text-gray-500' : resolutionSummary.varianceQty > 0 ? 'text-blue-600' : 'text-amber-600'} />
                <SummaryItem label="Outstanding Qty" value={fmt(resolutionSummary.outstandingQty)} />
                <SummaryItem label="Resolved" value={`${fmt(resolutionSummary.resolutionCount)}/${fmt(resolutionSummary.resolutionCount + resolutionSummary.unresolved)}`} accent={resolutionSummary.unresolved > 0 ? 'text-amber-600' : 'text-green-600'} />
              </div>
              {resolutionSummary.unresolved > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  There are unresolved variances. Resolve them before posting.
                </div>
              )}
              {blockedByApproval && (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <Ban className="h-3.5 w-3.5" />
                  A line requires Manager Approval — posting is blocked until approved.
                </div>
              )}
            </div>
          )}

          {(!isEditable ? data.lines : linesForEdit)?.length ? (
            <div className="space-y-3 p-3">
              {isEditable
                ? linesForEdit.map((l, i) => (
                    <DraftLineCard
                      key={i}
                      index={i}
                      line={l}
                      items={items}
                      receivingId={id}
                      isEditable={isEditable}
                      onUpdate={(patch) => updateLine(i, patch)}
                      onItemSelect={(it) => handleItemSelected(i, it)}
                      onRemove={() => removeLine(i)}
                      onKeyDown={handleDraftLineKeyDown}
                      flashNew={flashLineIndex === i}
                      refs={{ lineItemRefs, lineExpectedQtyRefs, lineUnitCostRefs, lineBatchRefs }}
                    />
                  ))
                : data.lines.map((l) => (
                    <ReadOnlyLineCard key={l.id} line={l} receivingId={id} />
                  ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              No lines yet. {isEditable && <button onClick={addLine} className="text-blue-600 underline">Add the first line</button>}
            </div>
          )}
        </div>

        {/* Putaway tasks generated */}
        {data.status !== 'DRAFT' && data.lines?.some((l) => l.putawayTasks?.length) && (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-2.5 text-sm font-medium">Generated Putaway Tasks</div>
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr><th className="px-4 py-2 font-medium">Task</th><th className="px-4 py-2 font-medium">Item</th><th className="px-4 py-2 text-right font-medium">Qty</th><th className="px-4 py-2 font-medium">Destination</th><th className="px-4 py-2 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {data.lines.flatMap((l) => (l.putawayTasks || []).map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-mono text-xs">{t.taskNumber}</td>
                    <td className="px-4 py-2 font-mono text-xs">{l.item?.sku}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.receivedQty}</td>
                    <td className="px-4 py-2 font-mono text-xs">{t.toLocationId || <span className="text-gray-400">not assigned</span>}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{t.status}</Badge></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAILS DIALOG (draft) */}
      <Dialog open={openDetails} onOpenChange={setOpenDetails}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Receiving Details</DialogTitle>
            <DialogDescription>Update supplier and inbound shipment information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <Select value={detailsForEdit.supplierId} onValueChange={(v) => setDetails({ supplierId: v, supplier: v ? (meta?.suppliers || []).find((s) => s.id === v)?.name || '' : '' })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {(meta?.suppliers || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference Document</Label>
              <Input className="h-9" value={detailsForEdit.refDocument} onChange={(e) => setDetails({ refDocument: e.target.value })} placeholder="PO / Ref number (optional)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Invoice Number</Label>
              <Input className="h-9" value={detailsForEdit.invoiceNumber} onChange={(e) => setDetails({ invoiceNumber: e.target.value })} placeholder="Invoice number (optional)" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Vehicle Number</Label>
                <Input className="h-9" value={detailsForEdit.vehicleNumber} onChange={(e) => setDetails({ vehicleNumber: e.target.value })} placeholder="Vehicle plate (optional)" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Driver Name</Label>
                <Input className="h-9" value={detailsForEdit.driverName} onChange={(e) => setDetails({ driverName: e.target.value })} placeholder="Driver (optional)" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDetails(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => detailsMut.mutate({
              supplierId: detailsForEdit.supplierId || null,
              refDocument: detailsForEdit.refDocument,
              invoiceNumber: detailsForEdit.invoiceNumber,
              vehicleNumber: detailsForEdit.vehicleNumber,
              driverName: detailsForEdit.driverName,
            })} disabled={detailsMut.isPending}>
              {detailsMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OUTSTANDING RECEIPT DIALOG (RCV-2.5) */}
      <Dialog open={openOutstanding} onOpenChange={setOpenOutstanding}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Remaining — Outstanding</DialogTitle>
            <DialogDescription>Receive part or all of the outstanding quantity using the same GRN. No new document is created.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {outstandingLines.map((l) => (
              <div key={l.id} className="rounded-md border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs font-medium">{l.item?.sku || '—'}</div>
                    <div className="text-xs text-gray-500">{l.item?.name}</div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>Expected: <strong className="tabular-nums">{fmt(l.expectedQty)}</strong></span>
                    <span>Previously Received: <strong className="tabular-nums">{fmt(l.receivedQty)}</strong></span>
                    <span>Outstanding: <strong className="tabular-nums text-blue-700">{fmt(l.outstandingQty)}</strong></span>
                    <div>
                      <Label className="text-[11px]">Receive Now</Label>
                      <Input
                        type="number" min="0" step="1"
                        value={outstandingForm[l.id] ?? ''}
                        onChange={(e) => setOutstandingForm((f) => ({ ...f, [l.id]: e.target.value }))}
                        className="mt-0.5 h-8 w-24 text-right text-xs"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
                {/* Outstanding attachments (RCV-3.0) — Delivery Note / Item Photo */}
                {l.id && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <AttachmentManager
                      module="Receiving"
                      referenceId={id}
                      referenceLineId={l.id}
                      editable
                      compact
                      types={['DELIVERY_NOTE', 'ITEM_PHOTO', 'OTHER']}
                    />
                  </div>
                )}
              </div>
            ))}
            {outstandingLines.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">No outstanding quantity left</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenOutstanding(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submitOutstanding} disabled={outstandingMut.isPending || outstandingLines.length === 0}>
              {outstandingMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post Outstanding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POST DIALOG */}
      <Dialog open={openPost} onOpenChange={setOpenPost}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Post Receiving → Staging</DialogTitle>
            <DialogDescription>Confirm received quantities. Scan serial numbers for tracked items. This creates stock ledger entries at {data.stagingLocation?.code} and generates putaway tasks.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {data.lines?.map((l) => (
              <PostLineRow
                key={l.id}
                line={l}
                state={postState[l.id] || { receivedQty: 0, serials: [] }}
                setState={(patch) => setPostState((s) => ({ ...s, [l.id]: { ...s[l.id], ...patch } }))}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPost(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => postMut.mutate()} disabled={postMut.isPending}>
              {postMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post to Staging
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

function PostLineRow({ line, state, setState }) {
  const serialTracked = !!line.item?.serialTracked
  const receivedQty = Number(state.receivedQty) || 0
  const serials = state.serials || []
  const session = useMemo(() => {
    const s = createScanSession()
    serials.forEach((v) => s.add(v))
    return s
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]) // reset only when line changes

  const onScan = (code) => {
    if (session.has(code)) return { ok: false, message: `Duplicate: ${code} already scanned` }
    if (serials.length >= receivedQty) return { ok: false, message: `Already have ${receivedQty} serials for this line` }
    session.add(code)
    setState({ serials: [...serials, code] })
    return { ok: true, message: `Added ${code} (${serials.length + 1}/${receivedQty})` }
  }

  const removeSerial = (code) => {
    session.remove(code)
    setState({ serials: serials.filter((s) => s !== code) })
  }

  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs">{line.item?.sku}</div>
          <div className="text-xs text-gray-500">{line.item?.name}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-gray-500">Expected {line.expectedQty} {line.item?.uom?.code}</div>
          <div>
            <Label className="text-[11px]">Received Qty</Label>
            <Input type="number" min="0" step="1" value={state.receivedQty}
              onChange={(e) => setState({ receivedQty: e.target.value })}
              className="h-8 w-24 text-right text-xs" />
          </div>
        </div>
      </div>

      {serialTracked && (
        <div className="mt-3 space-y-2 rounded-md border border-dashed border-amber-200 bg-amber-50/40 p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
            <Barcode className="h-3.5 w-3.5" /> Serial-tracked item — scan {receivedQty || '?'} serial numbers ({serials.length}/{receivedQty || '?'})
          </div>
          <BarcodeInput
            onScan={onScan}
            placeholder="Scan or type serial number, press Enter"
            hint="Duplicates are blocked. Serials must be unique across the whole system."
            disabled={!receivedQty || serials.length >= receivedQty}
            size="md"
          />
          {!!serials.length && (
            <div className="flex flex-wrap gap-1.5">
              {serials.map((s, i) => (
                <Badge key={s} variant="outline" className="gap-1 border-amber-300 bg-white pl-2 pr-1 text-[10px]">
                  <span className="text-gray-400">{i + 1}.</span>
                  <span className="font-mono">{s}</span>
                  <button onClick={() => removeSerial(s)} className="ml-1 rounded p-0.5 text-red-500 hover:bg-red-100" aria-label={`Remove ${s}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tracking badge (future tracking types: NONE / BATCH / SERIAL) ───────────
function TrackingBadge({ type }) {
  if (type === 'SERIAL') return <Badge className="bg-amber-100 text-[10px] text-amber-700">SERIAL</Badge>
  if (type === 'BATCH') return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">BATCH</Badge>
  return <Badge variant="outline" className="text-[10px]">NONE</Badge>
}

// ─── Editable (draft) receiving line — enterprise card layout ───────────────
function DraftLineCard({ index, line, items, receivingId, isEditable, onUpdate, onItemSelect, onRemove, onKeyDown, refs, flashNew }) {
  const item = (items || []).find((x) => x.id === line.itemId)
  const trackingType = line.serialTracked ? 'SERIAL' : 'BATCH'
  const expectedQty = Number(line.expectedQty) || 0
  const receivedQty = Number(line.receivedQty) || 0
  const diff = receivedQty - expectedQty
  const short = expectedQty - receivedQty
  const hasVariance = diff !== 0

  return (
    <div
      className={cn(
        'rounded-md border border-gray-200 bg-white shadow-sm transition-colors',
        flashNew && 'border-blue-300 bg-blue-50/40'
      )}
    >
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Line {index + 1}</span>
          {item && <span className="font-mono text-xs font-medium text-gray-800">{item.sku}</span>}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Section 1 — Item selector */}
        <div>
          <Label className="text-xs">Item</Label>
          <div className="mt-1" onKeyDown={(e) => onKeyDown(e, index, 'itemId')}>
            <ItemSelector
              value={line.itemId}
              onChange={(it) => onItemSelect(it)}
              items={items}
              inputRef={(el) => { refs.lineItemRefs.current[index] = el }}
              disabled={!isEditable}
            />
          </div>
        </div>

        {/* Section 2 — Item information */}
        {item && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">SKU</div>
                <div className="font-mono text-xs font-medium text-gray-800">{item.sku}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Item Name</div>
                <div className="text-xs text-gray-700">{item.name}</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {item.category?.name && <Badge variant="outline" className="text-[10px]">{item.category.name}</Badge>}
              {item.uom?.code && <Badge variant="outline" className="text-[10px]">{item.uom.code}</Badge>}
              <TrackingBadge type={trackingType} />
            </div>
          </div>
        )}

        {/* Section 3 — Quantity */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Expected Qty</Label>
            <Input
              type="number" min="0" step="1" value={line.expectedQty} readOnly
              onKeyDown={(e) => onKeyDown(e, index, 'expectedQty')}
              ref={(el) => { refs.lineExpectedQtyRefs.current[index] = el }}
              className="mt-1 h-8 bg-gray-50 text-right text-xs text-gray-500"
            />
          </div>
          <div>
            <Label className="text-xs">Received Qty</Label>
            <Input
              type="number" min="0" step="1" value={line.receivedQty}
              onChange={(e) => onUpdate({ receivedQty: e.target.value })}
              className="mt-1 h-8 text-right text-xs"
            />
          </div>
        </div>

        {/* Section 4 — Unit cost */}
        <div className="sm:max-w-xs">
          <Label className="text-xs">Unit Cost</Label>
          <Input
            type="number" min="0" step="0.01" value={line.unitCost}
            onChange={(e) => onUpdate({ unitCost: e.target.value })}
            onKeyDown={(e) => onKeyDown(e, index, 'unitCost')}
            ref={(el) => { refs.lineUnitCostRefs.current[index] = el }}
            className="mt-1 h-8 text-right text-xs"
          />
        </div>

        {/* Section 5 — Tracking */}
        {trackingType === 'BATCH' ? (
          <div className="sm:max-w-xs">
            <Label className="text-xs">Batch / Lot Number</Label>
            <Input
              value={line.batchNo}
              onChange={(e) => onUpdate({ batchNo: e.target.value })}
              onKeyDown={(e) => onKeyDown(e, index, 'batchNo')}
              ref={(el) => { refs.lineBatchRefs.current[index] = el }}
              className="mt-1 h-8 text-xs"
              placeholder="optional"
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-amber-200 bg-amber-50/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Serial Status</div>
            <div className="mt-1 text-xs text-gray-600">0 / {line.expectedQty || '?'} scanned</div>
            <div className="text-[11px] text-gray-400">Serials are captured during posting. Scanner coming soon.</div>
          </div>
        )}

        {/* Section 5b — Variance resolution (RCV-2.4) */}
        {hasVariance && (
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Variance Resolution</div>
              <Badge variant="outline" className="border-amber-200 bg-white text-[10px] text-amber-700">
                {diff < 0 ? `Short ${fmt(short)}` : `Over ${fmt(diff)}`}
              </Badge>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Reason *</Label>
                <Select value={line.varianceReason} onValueChange={(v) => onUpdate({ varianceReason: v })}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {VARIANCE_REASONS.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Resolution *</Label>
                <Select value={line.resolution} onValueChange={(v) => onUpdate({ resolution: v, ...(v === 'Create Outstanding' ? { outstandingQty: short > 0 ? short : 0 } : {}) })}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select resolution" /></SelectTrigger>
                  <SelectContent>
                    {RESOLUTIONS.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {line.resolution === 'Create Outstanding' && (
              <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs">
                <span className="text-gray-500">Outstanding Qty:</span>{' '}
                <strong className="tabular-nums text-blue-700">{fmt(short)}</strong>
                <span className="ml-2 text-gray-500">Status: <Badge variant="outline" className="text-[9px]">OPEN</Badge></span>
                <div className="mt-0.5 text-[11px] text-gray-400">Recorded on this Receiving — no new GRN.</div>
              </div>
            )}
            {line.resolution === 'Return To Supplier' && (
              <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <Label className="text-[11px]">Return Qty</Label>
                    <Input
                      type="number" min="0" step="1" value={line.returnQty || 0}
                      onChange={(e) => onUpdate({ returnQty: e.target.value })}
                      className="mt-0.5 h-8 w-24 text-right text-xs"
                    />
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Status: <Badge variant="outline" className="text-[9px]">WAITING PICKUP</Badge>
                    <div className="mt-0.5 text-gray-400">No stock movement yet.</div>
                  </div>
                </div>
              </div>
            )}
            {line.resolution === 'Manager Approval' && (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs">
                Status: <Badge variant="outline" className="text-[9px]">WAITING APPROVAL</Badge>
                <span className="ml-2 text-gray-500">Posting remains blocked until approved.</span>
              </div>
            )}
          </div>
        )}

        {/* Evidence capture (RCV-3.3) — line evidence — saved lines only */}
        {line.id && (
          <div className="rounded-md border border-gray-200 p-3">
            <EvidenceCapture
              module="Receiving"
              referenceId={receivingId}
              referenceLineId={line.id}
              editable={isEditable}
              evidenceTypes={EVIDENCE_TYPES_LINE}
            />
          </div>
        )}

        {/* Section 7 — Delete (bottom-right) */}
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={onRemove}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove Line
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Read-only (posted) receiving line — card layout ────────────────────────
function ReadOnlyLineCard({ line, receivingId }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
        <div className="min-w-0">
          <div className="font-mono text-xs font-medium text-gray-800">{line.item?.sku}</div>
          <div className="truncate text-xs text-gray-500">{line.item?.name}</div>
        </div>
        {line.item?.serialTracked ? (
          line.serials?.length ? <Badge variant="outline" className="text-[10px]">{line.serials.length} scanned</Badge> : <span className="text-[11px] text-amber-600">SN required</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Expected</div>
          <div className="text-xs tabular-nums">{line.expectedQty} {line.item?.uom?.code}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Received</div>
          <div className="text-xs font-medium tabular-nums">{line.receivedQty} {line.item?.uom?.code}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Unit Cost</div>
          <div className="text-xs tabular-nums text-gray-500">{formatCurrency(line.unitCost)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Batch / Serials</div>
          <div className="text-xs text-gray-500">{line.batchNo || (line.item?.serialTracked ? `${line.serials?.length || 0} serials` : '—')}</div>
        </div>
      </div>

      {(line.resolution || line.varianceReason || line.outstandingQty > 0 || line.returnQty > 0) && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
            {line.varianceReason && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">Reason: {line.varianceReason}</Badge>}
            {line.resolution && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">{line.resolution}</Badge>}
            {line.outstandingQty > 0 && <Badge variant="outline" className="text-[10px]">Outstanding: {fmt(line.outstandingQty)}</Badge>}
            {line.returnQty > 0 && <Badge variant="outline" className="border-orange-200 bg-orange-50 text-[10px] text-orange-700">Return: {fmt(line.returnQty)}</Badge>}
          </div>
        </div>
      )}

      {line.id && (
        <div className="border-t border-gray-100 px-4 py-3">
          <EvidenceCapture
            module="Receiving"
            referenceId={receivingId}
            referenceLineId={line.id}
            editable={false}
            evidenceTypes={EVIDENCE_TYPES_LINE}
          />
        </div>
      )}
    </div>
  )
}

export default App
