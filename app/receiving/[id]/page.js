'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState, use, useRef } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ErrorState } from '@/components/ErrorState'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import BarcodeInput, { createScanSession } from '@/components/barcode-input'
import { ArrowLeft, Plus, Trash2, Loader2, Play, Send, Ban, ChevronRight, Barcode, PackageCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_META = {
  DRAFT:           { label: 'Draft',            class: 'bg-gray-100 text-gray-700' },
  RECEIVING:       { label: 'Receiving',        class: 'bg-blue-100 text-blue-700' },
  WAITING_PUTAWAY: { label: 'Waiting Putaway',  class: 'bg-amber-100 text-amber-700' },
  COMPLETED:       { label: 'Completed',        class: 'bg-green-100 text-green-700' },
  CANCELLED:       { label: 'Cancelled',        class: 'bg-red-100 text-red-700' },
}

const STAGES = ['DRAFT', 'RECEIVING', 'WAITING_PUTAWAY', 'COMPLETED']

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
  })) || []))

  const setEditLines = (updater) => setDraftLines((prev) => {
    const base = prev ?? (data?.lines?.map((l) => ({
      id: l.id, itemId: l.itemId,
      itemLabel: l.item ? `${l.item.sku} - ${l.item.name}` : '',
      serialTracked: !!l.item?.serialTracked,
      expectedQty: l.expectedQty || 0, receivedQty: l.receivedQty || 0,
      unitCost: l.unitCost || 0, batchNo: l.batchNo || '',
    })) || [])
    return updater(base)
  })

  const addLine = () => setEditLines((lines) => [...lines, { itemId: '', expectedQty: 1, receivedQty: 0, unitCost: 0, batchNo: '', itemLabel: '', serialTracked: false }])
  const removeLine = (i) => setEditLines((lines) => lines.filter((_, idx) => idx !== i))
  const updateLine = (i, patch) => setEditLines((lines) => lines.map((l, idx) => idx === i ? { ...l, ...patch } : l))

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
        lines: (draftLines || []).map((l) => ({
          itemId: l.itemId, expectedQty: Number(l.expectedQty) || 0,
          receivedQty: Number(l.receivedQty) || 0, unitCost: Number(l.unitCost) || 0,
          batchNo: l.batchNo || null,
        })),
      },
    }),
    onSuccess: () => { toast.success('Draft saved'); setDraftLines(null); qc.invalidateQueries({ queryKey: ['receiving', id] }) },
    onError: (e) => toast.error(e.message),
  })

  const startMut = useMutation({
    mutationFn: () => api(`/receiving/${id}/start`, { method: 'POST' }),
    onSuccess: () => { toast.success('Receiving started'); qc.invalidateQueries({ queryKey: ['receiving', id] }) },
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
    },
    onError: (e) => toast.error(e.message),
  })

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
              </div>
              <div className="text-xs text-gray-500">
                Warehouse <span className="font-medium text-gray-700">{data.warehouse?.code}</span> · Staging <span className="font-mono text-gray-700">{data.stagingLocation?.code}</span>
              </div>
              {(data.supplier || data.refDocument) && (
                <div className="text-xs text-gray-500">
                  {data.supplier && <>Supplier: <span className="text-gray-700">{data.supplier}</span></>}
                  {data.supplier && data.refDocument && ' · '}
                  {data.refDocument && <>Ref: <span className="text-gray-700">{data.refDocument}</span></>}
                </div>
              )}
              <div className="text-[11px] text-gray-400">Created {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex gap-2">
                {data.status === 'DRAFT' && (
                  <>
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
                    <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={openPostDialog}>
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

          {(!isEditable ? data.lines : linesForEdit)?.length ? (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Expected</th>
                  <th className="px-4 py-2 text-right font-medium">Received</th>
                  <th className="px-4 py-2 text-right font-medium">Unit Cost</th>
                  <th className="px-4 py-2 font-medium">Batch</th>
                  <th className="px-4 py-2 font-medium">Serials</th>
                  {isEditable && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {isEditable
                  ? linesForEdit.map((l, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          <Select value={l.itemId} onValueChange={(v) => {
                            const it = (items || []).find((x) => x.id === v)
                            updateLine(i, { itemId: v, itemLabel: it ? `${it.sku} - ${it.name}` : '', serialTracked: !!it?.serialTracked, unitCost: it?.unitCost || l.unitCost })
                          }}>
                            <SelectTrigger
                              ref={(el) => { lineItemRefs.current[i] = el ? el.querySelector('[role="combobox"]') : null }}
                              className="h-8 text-xs"
                              onKeyDown={(e) => handleDraftLineKeyDown(e, i, 'itemId')}
                            >
                              <SelectValue placeholder="Select item..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(items || []).filter((x) => x.isActive).map((x) => (
                                <SelectItem key={x.id} value={x.id}>{x.sku} - {x.name}{x.serialTracked ? ' (SN)' : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            type="number" min="0" step="1" value={l.expectedQty}
                            onChange={(e) => updateLine(i, { expectedQty: e.target.value })}
                            onKeyDown={(e) => handleDraftLineKeyDown(e, i, 'expectedQty')}
                            ref={(el) => { lineExpectedQtyRefs.current[i] = el }}
                            className="h-8 w-24 text-right text-xs"
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400">-</td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            type="number" min="0" step="0.01" value={l.unitCost}
                            onChange={(e) => updateLine(i, { unitCost: e.target.value })}
                            onKeyDown={(e) => handleDraftLineKeyDown(e, i, 'unitCost')}
                            ref={(el) => { lineUnitCostRefs.current[i] = el }}
                            className="h-8 w-24 text-right text-xs"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            value={l.batchNo}
                            onChange={(e) => updateLine(i, { batchNo: e.target.value })}
                            onKeyDown={(e) => handleDraftLineKeyDown(e, i, 'batchNo')}
                            ref={(el) => { lineBatchRefs.current[i] = el }}
                            className="h-8 w-24 text-xs"
                            placeholder="optional"
                          />
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-400">{l.serialTracked ? 'Required on post' : '-'}</td>
                        <td className="px-4 py-2 text-right">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    ))
                  : data.lines.map((l) => (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs">{l.item?.sku}</div>
                        <div className="text-xs text-gray-500">{l.item?.name}</div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{l.expectedQty} {l.item?.uom?.code}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{l.receivedQty} {l.item?.uom?.code}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">${l.unitCost}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{l.batchNo || '-'}</td>
                      <td className="px-4 py-2 text-xs">
                        {l.item?.serialTracked ? (
                          l.serials?.length ? <Badge variant="outline" className="text-[10px]">{l.serials.length} scanned</Badge> : <span className="text-amber-600">SN required</span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
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

export default App
