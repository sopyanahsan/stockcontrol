'use client'

export const dynamic = 'force-dynamic'

import { use, useMemo, useState } from 'react'
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
import HelpButton from '@/components/help/HelpButton'
import BarcodeInput from '@/components/barcode-input'
import EvidenceCapture from '@/components/evidence/EvidenceCapture'
import { EVIDENCE_TYPES_HEADER } from '@/lib/evidence/evidence-utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  ArrowLeft, Ban, Loader2, Save, Send, PackageCheck, ChevronRight, UserPlus, Play, Clock,
  CheckCircle2, SkipForward, RotateCcw, Pencil, Sparkles, ThumbsUp, EyeOff, ShieldAlert, AlertTriangle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_META = {
  DRAFT:      { label: 'Draft',      class: 'bg-gray-100 text-gray-700 border-gray-200', step: 0 },
  RELEASED:   { label: 'Released',   class: 'bg-blue-100 text-blue-700 border-blue-200', step: 1 },
  ASSIGNED:   { label: 'Assigned',   class: 'bg-indigo-100 text-indigo-700 border-indigo-200', step: 2 },
  IN_PROGRESS:{ label: 'In Progress',class: 'bg-amber-100 text-amber-700 border-amber-200', step: 3 },
  COMPLETED:  { label: 'Completed',  class: 'bg-green-100 text-green-700 border-green-200', step: 4 },
  CANCELLED:  { label: 'Cancelled',  class: 'bg-red-100 text-red-700 border-red-200', step: -1 },
}

const LINE_STATUS_META = {
  WAITING:    { label: 'Waiting',    class: 'bg-gray-100 text-gray-700 border-gray-200' },
  ASSIGNED:   { label: 'Assigned',   class: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  IN_PROGRESS:{ label: 'In Progress',class: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED:  { label: 'Completed',  class: 'bg-green-100 text-green-700 border-green-200' },
  SKIPPED:    { label: 'Skipped',    class: 'bg-red-100 text-red-700 border-red-200' },
}

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const STATUS_FLOW = ['DRAFT', 'RELEASED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']
const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const TIMELINE_META = {
  CREATE:       { label: 'Generated', icon: PackageCheck, class: 'bg-green-100 text-green-600' },
  GENERATE:     { label: 'Generated From Receiving', icon: PackageCheck, class: 'bg-green-100 text-green-600' },
  RELEASE:      { label: 'Released', icon: Send, class: 'bg-blue-100 text-blue-600' },
  ASSIGN:       { label: 'Assigned', icon: UserPlus, class: 'bg-indigo-100 text-indigo-600' },
  START:        { label: 'Started', icon: Play, class: 'bg-blue-100 text-blue-600' },
  LINE_START:   { label: 'Line Started', icon: Play, class: 'bg-amber-100 text-amber-600' },
  LINE_COMPLETE:{ label: 'Line Completed', icon: CheckCircle2, class: 'bg-green-100 text-green-600' },
  LINE_SKIP:    { label: 'Line Skipped', icon: SkipForward, class: 'bg-red-100 text-red-600' },
  LINE_RESUME:  { label: 'Line Resumed', icon: RotateCcw, class: 'bg-amber-100 text-amber-600' },
  UPDATE:       { label: 'Updated', icon: Pencil, class: 'bg-gray-100 text-gray-600' },
  RECOMMENDATION_GENERATED:  { label: 'Recommendation Generated', icon: Sparkles, class: 'bg-violet-100 text-violet-600' },
  RECOMMENDATION_ACCEPTED:   { label: 'Recommendation Accepted', icon: ThumbsUp, class: 'bg-green-100 text-green-600' },
  RECOMMENDATION_IGNORED:    { label: 'Recommendation Ignored', icon: EyeOff, class: 'bg-gray-100 text-gray-600' },
  RECOMMENDATION_OVERRIDDEN: { label: 'Recommendation Overridden', icon: ShieldAlert, class: 'bg-amber-100 text-amber-600' },
}

const CAPACITY_META = {
  AVAILABLE:  { label: 'Available',  class: 'bg-green-100 text-green-700 border-green-200' },
  UNLIMITED:  { label: 'Unlimited',  class: 'bg-gray-100 text-gray-700 border-gray-200' },
  FULL:       { label: 'Full',       class: 'bg-red-100 text-red-700 border-red-200' },
  OVERFLOW:   { label: 'Overflow',   class: 'bg-red-100 text-red-700 border-red-200' },
  INACTIVE:   { label: 'Inactive',   class: 'bg-red-100 text-red-700 border-red-200' },
  WRONG_TYPE: { label: 'Wrong Type', class: 'bg-amber-100 text-amber-700 border-amber-200' },
}

function StatusFlow({ status }) {
  if (status === 'CANCELLED') return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
  const idx = STATUS_FLOW.indexOf(status)
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {STATUS_FLOW.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={cn(
            'rounded-full px-2 py-0.5',
            i < idx ? 'bg-green-100 text-green-700' : i === idx ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-400'
          )}>
            {STATUS_META[s].label}
          </div>
          {i < STATUS_FLOW.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
        </div>
      ))}
    </div>
  )
}

const App = ({ params }) => {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['putaway-doc', id],
    queryFn: () => api(`/putaway/documents/${id}`),
  })
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const warehouse = (meta?.warehouses || []).find((w) => w.id === data?.warehouseId)
  const targetLocations = useMemo(() => {
    const locs = []
    for (const z of warehouse?.zones || []) {
      for (const l of z.locations || []) {
        if (l.type === 'STORAGE' && l.isActive) locs.push(l)
      }
    }
    return locs.sort((a, b) => a.code.localeCompare(b.code))
  }, [warehouse])

  const operatorNames = Object.fromEntries((meta?.users || []).map((u) => [u.id, u.name]))

  // ---------- Execution Engine (PTW-1.4/1.5) ----------
  const execEnabled = !!data?.status && data.status !== 'DRAFT'
  const { data: execSummary } = useQuery({
    queryKey: ['putaway-exec', id],
    queryFn: () => api(`/putaway/documents/${id}/execution-summary`),
    enabled: execEnabled,
  })
  const { data: timeline } = useQuery({
    queryKey: ['putaway-timeline', id],
    queryFn: () => api(`/audit-logs?module=PUTAWAY&entityId=${id}`),
    enabled: execEnabled,
  })

  // ---------- Smart Location / Recommendation (PTW-2.x / PTW-2.4) ----------
  const recommendEnabled = ['RELEASED', 'ASSIGNED', 'IN_PROGRESS'].includes(data?.status)
  const [openOverride, setOpenOverride] = useState(false)
  const [overrideFor, setOverrideFor] = useState(null)
  const [overrideSearch, setOverrideSearch] = useState('')
  const [overrideLocId, setOverrideLocId] = useState('')

  const selectLocMut = useMutation({
    mutationFn: ({ lineId, locationId, mode }) =>
      api(`/putaway/documents/${id}/lines/${lineId}/select-location`, { method: 'POST', body: { locationId, mode } }),
    onSuccess: (_r, vars) => {
      toast.success(vars.mode === 'ACCEPT' ? 'Recommendation accepted' : 'Location overridden')
      setOpenOverride(false)
      setOverrideFor(null)
      qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
      qc.invalidateQueries({ queryKey: ['putaway-recommendation'] })
      qc.invalidateQueries({ queryKey: ['putaway-timeline', id] })
    },
    onError: (e) => toast.error(e.message),
  })

  const overrideLocations = useMemo(() => {
    const locs = []
    for (const z of warehouse?.zones || []) {
      for (const l of z.locations || []) {
        if (l.type === 'STORAGE' && l.isActive) locs.push(l)
      }
    }
    const q = overrideSearch.trim().toLowerCase()
    return locs
      .filter((l) => !q || l.code.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [warehouse, overrideSearch])

  // ---------- Inventory Posting (PTW-4/5) ----------
  const { data: postStatus } = useQuery({
    queryKey: ['putaway-post-status', id],
    queryFn: () => api(`/putaway/documents/${id}/post-status`),
    enabled: data?.status === 'COMPLETED',
  })
  const [postResult, setPostResult] = useState(null)
  const [openPost, setOpenPost] = useState(false)
  const postMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${id}/post`, { method: 'POST' }),
    onSuccess: (r) => {
      toast.success('Inventory posted')
      setPostResult(r)
      setOpenPost(true)
      qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
      qc.invalidateQueries({ queryKey: ['putaway-post-status', id] })
    },
    onError: (e) => toast.error(e.message),
  })

  const refreshExec = () => {
    qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
    qc.invalidateQueries({ queryKey: ['putaway-exec', id] })
    qc.invalidateQueries({ queryKey: ['putaway-timeline', id] })
    qc.invalidateQueries({ queryKey: ['putaway-queue'] })
  }

  const lineMut = useMutation({
    mutationFn: ({ op, lineId, remark }) =>
      api(`/putaway/documents/${id}/lines/${lineId}/${op}`, { method: 'POST', body: { remark: remark || undefined } }),
    onSuccess: (_r, vars) => {
      toast.success({ start: 'Line started', complete: 'Line completed', skip: 'Line skipped', resume: 'Line resumed' }[vars.op])
      refreshExec()
    },
    onError: (e) => toast.error(e.message),
  })
  const lineAction = (op, line) => {
    if (op === 'skip') {
      const remark = window.prompt('Skip reason (optional):') ?? null
      if (remark !== null) lineMut.mutate({ op, lineId: line.id, remark })
    } else {
      lineMut.mutate({ op, lineId: line.id })
    }
  }

  // ---------- Draft editing ----------
  const [form, setForm] = useState(null)
  const formForEdit = form ?? {
    priority: data?.priority || 'NORMAL',
    operatorId: data?.operatorId || '',
    remarks: data?.remarks || '',
    targets: Object.fromEntries((data?.lines || []).map((l) => [l.id, l.targetLocationId || ''])),
  }
  const isDraft = data?.status === 'DRAFT'
  const isReleased = data?.status === 'RELEASED'
  const isAssigned = data?.status === 'ASSIGNED'
  const isInProgress = data?.status === 'IN_PROGRESS'

  const saveMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${id}`, {
      method: 'PUT',
      body: {
        priority: formForEdit.priority,
        operatorId: formForEdit.operatorId || null,
        remarks: formForEdit.remarks,
        lines: Object.entries(formForEdit.targets)
          .filter(([, v]) => v !== '')
          .map(([lineId, targetLocationId]) => ({ lineId, targetLocationId })),
      },
    }),
    onSuccess: () => {
      toast.success('Draft saved')
      setForm(null)
      qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
      qc.invalidateQueries({ queryKey: ['putaway-docs'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const releaseMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${id}/release`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Putaway released')
      qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
      qc.invalidateQueries({ queryKey: ['putaway-docs'] })
      qc.invalidateQueries({ queryKey: ['putaway-queue'] })
    },
    onError: (e) => toast.error(e.message),
  })

  // ---------- Assignment (PTW-1.3) ----------
  const [openAssign, setOpenAssign] = useState(false)
  const [assignForm, setAssignForm] = useState(null)
  const assignForEdit = assignForm ?? {
    assignedTo: data?.assignedTo || '',
    priority: data?.priority || 'NORMAL',
    estimatedDuration: data?.estimatedDuration || 60,
    remarks: data?.remarks || '',
  }

  const assignMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${id}/assign`, {
      method: 'POST',
      body: {
        assignedTo: assignForEdit.assignedTo,
        priority: assignForEdit.priority,
        estimatedDuration: Number(assignForEdit.estimatedDuration) || null,
        remarks: assignForEdit.remarks,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Assigned to ${r.assignedName || 'operator'}`)
      setOpenAssign(false)
      setAssignForm(null)
      qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
      qc.invalidateQueries({ queryKey: ['putaway-queue'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const startMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${id}/start`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Putaway started')
      qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
      qc.invalidateQueries({ queryKey: ['putaway-queue'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const cancelMut = useMutation({
    mutationFn: (reason) => api(`/putaway/documents/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Putaway cancelled')
      qc.invalidateQueries({ queryKey: ['putaway-doc', id] })
      qc.invalidateQueries({ queryKey: ['putaway-docs'] })
      qc.invalidateQueries({ queryKey: ['putaway-queue'] })
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) {
    return (
      <AppShell title="Putaway" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      </AppShell>
    )
  }
  if (error || !data) {
    return (
      <AppShell title="Putaway" subtitle="Error">
        <ErrorState error={error} onRetry={() => refetch()} title="Failed to load putaway document" />
      </AppShell>
    )
  }

  const statusMeta = STATUS_META[data.status] || { label: data.status, class: 'bg-gray-100' }

  return (
    <AppShell
      title={data.putawayNo}
      subtitle={`Putaway ${data.status.toLowerCase()} · ${data.warehouseName || data.warehouseId}`}
      actions={
        <div className="flex items-center gap-2">
          <HelpButton pageId="putaway-execution" />
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/putaway"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-semibold">{data.putawayNo}</div>
                <Badge variant="outline" className={`text-[10px] ${statusMeta.class}`}>{statusMeta.label}</Badge>
              </div>
              <div className="text-xs text-gray-500">
                Source: <Link href={`/receiving/${data.sourceId}`} className="font-mono text-blue-600 hover:underline">{data.sourceNumber || '-'}</Link>
                {' · '}Warehouse: <span className="font-medium text-gray-700">{data.warehouseName || '-'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>Priority: <span className="font-medium text-gray-700">{data.priority}</span></span>
                <span>Assigned: <span className="font-medium text-gray-700">{data.assignedName || operatorNames[data.operatorId] || 'Unassigned'}</span></span>
                {data.estimatedDuration && <span>Est. time: <span className="font-medium text-gray-700">{data.estimatedDuration} min</span></span>}
                <span>Created by: <span className="font-medium text-gray-700">{operatorNames[data.createdBy] || '-'}</span></span>
              </div>
              {data.remarks && <div className="text-xs text-gray-500">Remarks: <span className="text-gray-700">{data.remarks}</span></div>}
              <div className="text-[11px] text-gray-400">
                Created {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}
                {data.assignedAt && <> · Assigned {formatDistanceToNow(new Date(data.assignedAt), { addSuffix: true })}</>}
                {data.startedAt && <> · Started {formatDistanceToNow(new Date(data.startedAt), { addSuffix: true })}</>}
                {data.completedAt && <> · Completed {formatDistanceToNow(new Date(data.completedAt), { addSuffix: true })}</>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex gap-2">
                {isDraft && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700" onClick={() => {
                      const reason = window.prompt('Cancel reason (optional):') ?? null
                      if (reason !== null) cancelMut.mutate(reason)
                    }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                      {saveMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                      Save Draft
                    </Button>
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => releaseMut.mutate()} disabled={releaseMut.isPending || !data.lines?.length}>
                      {releaseMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                      Release
                    </Button>
                  </>
                )}
                {isReleased && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700" onClick={() => {
                      const reason = window.prompt('Cancel reason (optional):') ?? null
                      if (reason !== null) cancelMut.mutate(reason)
                    }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700" onClick={() => { setAssignForm(null); setOpenAssign(true) }} disabled={assignMut.isPending}>
                      <UserPlus className="mr-1 h-3.5 w-3.5" /> Assign Operator
                    </Button>
                  </>
                )}
                {isAssigned && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700" onClick={() => {
                      const reason = window.prompt('Cancel reason (optional):') ?? null
                      if (reason !== null) cancelMut.mutate(reason)
                    }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                      {startMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      Start
                    </Button>
                  </>
                )}
                {(data.status === 'IN_PROGRESS' || data.status === 'COMPLETED') && (
                  <>
                    {data.status === 'COMPLETED' && !postStatus?.posted && (
                      <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => postMut.mutate()} disabled={postMut.isPending}>
                        {postMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="mr-1 h-3.5 w-3.5" />}
                        Post Inventory
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline" className="h-8">
                      <Link href="/putaway"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Draft edit panel */}
        {isDraft && (
          <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-medium">Draft Settings</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={formForEdit.priority} onValueChange={(v) => setForm((f) => ({ ...(f ?? formForEdit), priority: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Operator</Label>
                <Select value={formForEdit.operatorId} onValueChange={(v) => setForm((f) => ({ ...(f ?? formForEdit), operatorId: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {(meta?.users || []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Remarks</Label>
                <Input className="mt-1 h-9 text-sm" value={formForEdit.remarks || ''} onChange={(e) => setForm((f) => ({ ...(f ?? formForEdit), remarks: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </div>
        )}

        {/* Execution Progress Card (PTW-1.4/1.5) */}
        {execSummary && (
          <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Execution Progress</div>
              <Badge variant="outline" className={`${statusMeta.class} text-[10px]`}>{statusMeta.label}</Badge>
            </div>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${execSummary.progressPct || 0}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: 'Progress', value: `${execSummary.progressPct}%` },
                { label: 'Completed Lines', value: execSummary.completedLines },
                { label: 'Remaining Lines', value: execSummary.remainingLines },
                { label: 'Skipped Lines', value: execSummary.skippedLines },
                { label: 'Execution Duration', value: execSummary.executionDuration != null ? `${execSummary.executionDuration} min` : '—' },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s.label}</div>
                  <div className="text-sm font-semibold tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Execution Timeline Card */}
        {timeline?.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-2.5 text-sm font-medium">Execution Timeline</div>
            <div className="max-h-80 overflow-y-auto p-4">
              <div className="space-y-3">
                {timeline.slice().reverse().map((ev) => {
                  const t = TIMELINE_META[ev.action] || { label: ev.action, icon: Clock, class: 'bg-gray-100 text-gray-600' }
                  const Icon = t.icon
                  return (
                    <div key={ev.id} className="flex gap-3">
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${t.class}`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-800">{t.label}</div>
                        <div className="text-[11px] text-gray-500">{ev.description}</div>
                        <div className="text-[10px] text-gray-400">{ev.userName} · {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Lines table */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-2.5 text-sm font-medium">Lines ({data.lines?.length || 0})</div>
          {data.lines?.length ? (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Barcode</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Completed Qty</th>
                  <th className="px-4 py-2 font-medium">Target</th>
                  <th className="px-4 py-2 font-medium">Line Status</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Completed</th>
                  <th className="px-4 py-2 font-medium">Executed By</th>
                  <th className="px-4 py-2 font-medium">Remark</th>
                  {isInProgress && <th className="px-4 py-2 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => {
                  const lm = LINE_STATUS_META[l.status] || { label: l.status, class: 'bg-gray-100 text-gray-700 border-gray-200' }
                  return (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-xs text-gray-400">{l.lineNo}</td>
                      <td className="px-4 py-2 font-mono text-xs">{l.sku}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{l.barcode || '—'}</td>
                      <td className="px-4 py-2 text-xs">
                        <div className="font-medium text-gray-800">{l.itemName}</div>
                        {l.batchNo && <div className="text-[11px] text-gray-400">Batch: {l.batchNo}</div>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(l.qty)} {l.uom || ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(l.qtyCompleted)}</td>
                      <td className="px-4 py-2">
                        {isDraft ? (
                          <Select value={formForEdit.targets[l.id] || ''} onValueChange={(v) => setForm((f) => ({ ...(f ?? formForEdit), targets: { ...((f ?? formForEdit).targets), [l.id]: v } }))}>
                            <SelectTrigger className="h-8 font-mono text-xs"><SelectValue placeholder="Select bin" /></SelectTrigger>
                            <SelectContent>
                              {targetLocations.map((loc) => <SelectItem key={loc.id} value={loc.id} className="font-mono">{loc.code}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="font-mono text-xs text-gray-700">{l.targetLocationId ? (targetLocations.find((t) => t.id === l.targetLocationId)?.code || '—') : '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`${lm.class} text-[10px]`}>{lm.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {l.startedAt ? formatDistanceToNow(new Date(l.startedAt), { addSuffix: true }) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {l.completedAt ? formatDistanceToNow(new Date(l.completedAt), { addSuffix: true }) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs">{l.executedByName || '—'}</td>
                      <td className="max-w-[180px] px-4 py-2 text-xs text-gray-500">
                        <div className="truncate" title={l.executionRemark || l.remarks || ''}>{l.executionRemark || l.remarks || '—'}</div>
                      </td>
                      {isInProgress && (
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            {(l.status === 'WAITING' || l.status === 'ASSIGNED') && (
                              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => lineAction('start', l)} disabled={lineMut.isPending}>
                                <Play className="mr-1 h-3 w-3" /> Start
                              </Button>
                            )}
                            {l.status === 'IN_PROGRESS' && (
                              <>
                                <Button size="sm" className="h-7 bg-green-600 text-[11px] hover:bg-green-700" onClick={() => lineAction('complete', l)} disabled={lineMut.isPending}>
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Complete
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600 hover:text-red-700" onClick={() => lineAction('skip', l)} disabled={lineMut.isPending}>
                                  <SkipForward className="mr-1 h-3 w-3" /> Skip
                                </Button>
                              </>
                            )}
                            {l.status === 'SKIPPED' && (
                              <Button size="sm" variant="outline" className="h-7 text-[11px] text-amber-700 hover:text-amber-800" onClick={() => lineAction('resume', l)} disabled={lineMut.isPending}>
                                <RotateCcw className="mr-1 h-3 w-3" /> Resume
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-gray-400">No lines</div>
          )}
        </div>

        {/* Recommendation Score panel (PTW-2.4) */}
        {recommendEnabled && data.lines?.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
              <div className="text-sm font-medium">Location Recommendations</div>
              <div className="text-[11px] text-gray-400">Scored 0-100 · recommendation only — inventory is not moved</div>
            </div>
            <div className="divide-y divide-gray-100">
              {data.lines.map((line) => (
                <LineRecommendation
                  key={line.id}
                  line={line}
                  docId={id}
                  selectLocMut={selectLocMut}
                  onOverride={(suggestion) => { setOverrideFor({ lineId: line.id, sku: line.sku }); setOverrideSearch(''); setOverrideLocId(suggestion.location.id); setOpenOverride(true) }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Barcode Execution Panel (PTW-3.x) */}
        {isInProgress && data.lines?.length > 0 && (
          <ExecutionPanel docId={id} lines={data.lines} targetCodeById={Object.fromEntries(targetLocations.map((l) => [l.id, l.code]))} />
        )}

        {/* Posting Summary Card (PTW-4/5) */}
        {(postStatus?.posted || postResult) && (
          <div className="rounded-md border border-green-200 bg-green-50/40 shadow-sm">
            <div className="flex items-center justify-between border-b border-green-200 px-4 py-2.5">
              <div className="text-sm font-medium text-green-900">Inventory Posting</div>
              <Badge variant="outline" className="border-green-200 bg-green-100 text-[10px] text-green-700">
                {postResult?.status || 'POSTED'} · {postResult ? formatDistanceToNow(new Date(postResult.postedAt || Date.now()), { addSuffix: true }) : 'completed'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
              {[
                { label: 'Lines', value: postResult?.lineCount ?? postStatus?.lineCount ?? 0 },
                { label: 'Moved Qty', value: fmt(postResult?.movedQty ?? 0) },
                { label: 'Ledger Entries', value: fmt(postResult?.ledgerEntries ?? 0) },
                { label: 'Stock Cards', value: fmt(postResult?.stockCardEntries ?? 0) },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-green-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s.label}</div>
                  <div className="text-sm font-semibold tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>
            {postResult?.sourceLocations?.length > 0 && (
              <div className="px-4 pb-2 text-[11px] text-gray-600">
                Source: <span className="font-mono">{postResult.sourceLocations.join(', ')}</span>
                {' → '}Target: <span className="font-mono">{postResult.targetLocations.join(', ')}</span>
              </div>
            )}
            {postResult?.binOccupancy?.length > 0 && (
              <div className="space-y-1 px-4 pb-4">
                {postResult.binOccupancy.map((b) => (
                  <div key={b.locationId} className="flex items-center gap-2 text-[11px] text-gray-600">
                    <span className="font-mono">{b.locationCode}</span>
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${b.utilizationPct || 0}%` }} />
                    </div>
                    <span>{b.currentQty} / {b.maxCapacity > 0 ? b.maxCapacity : 'unlimited'} · {b.utilizationPct != null ? `${b.utilizationPct}%` : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Evidence (PTW-4/5 — reuse existing EvidenceCapture) */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-2.5">
            <div className="text-sm font-medium">Evidence</div>
            <div className="text-[11px] text-gray-400">Photo / document proof attached to this putaway</div>
          </div>
          <div className="px-4 py-3">
            <EvidenceCapture
              module="Putaway"
              referenceId={id}
              editable={data.status !== 'CANCELLED'}
              evidenceTypes={EVIDENCE_TYPES_HEADER}
            />
          </div>
        </div>
      </div>

      {/* ASSIGN OPERATOR DIALOG (PTW-1.3) */}
      <Dialog open={openAssign} onOpenChange={setOpenAssign}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Operator</DialogTitle>
            <DialogDescription>Assign this putaway to an operator to prepare for execution. No inventory is moved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Operator *</Label>
              <Select value={assignForEdit.assignedTo} onValueChange={(v) => setAssignForm((f) => ({ ...(f ?? assignForEdit), assignedTo: v }))}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select operator" /></SelectTrigger>
                <SelectContent>
                  {(meta?.users || []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={assignForEdit.priority} onValueChange={(v) => setAssignForm((f) => ({ ...(f ?? assignForEdit), priority: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Estimated Duration (min)</Label>
                <Input type="number" min="1" step="1" className="mt-1 h-9 text-right text-sm" value={assignForEdit.estimatedDuration ?? ''} onChange={(e) => setAssignForm((f) => ({ ...(f ?? assignForEdit), estimatedDuration: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Remarks</Label>
              <Input className="mt-1 h-9 text-sm" value={assignForEdit.remarks || ''} onChange={(e) => setAssignForm((f) => ({ ...(f ?? assignForEdit), remarks: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAssign(false)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => assignMut.mutate()} disabled={assignMut.isPending || !assignForEdit.assignedTo}>
              {assignMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OVERRIDE LOCATION DIALOG (PTW-2.x) */}
      <Dialog open={openOverride} onOpenChange={setOpenOverride}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Override Location</DialogTitle>
            <DialogDescription>
              {overrideFor ? <>Select a different storage bin for line {overrideFor.sku}.</> : 'Select a storage bin.'} This records an override — inventory is not moved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input className="h-9 text-sm" value={overrideSearch} onChange={(e) => setOverrideSearch(e.target.value)} placeholder="Search location code..." autoFocus />
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {overrideLocations.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setOverrideLocId(l.id)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${overrideLocId === l.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="font-mono">{l.code}</span>
                  <span className="text-[10px] text-gray-400">{l.maxCapacity > 0 ? `Cap ${l.maxCapacity}` : 'Unlimited'}</span>
                </button>
              ))}
              {!overrideLocations.length && <div className="py-6 text-center text-xs text-gray-400">No matching storage locations</div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenOverride(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => overrideFor && selectLocMut.mutate({ lineId: overrideFor.lineId, locationId: overrideLocId, mode: 'OVERRIDE' })} disabled={selectLocMut.isPending || !overrideLocId}>
              {selectLocMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* POSTING RESULT DIALOG (PTW-4/5) */}
      <Dialog open={openPost} onOpenChange={setOpenPost}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inventory Posted</DialogTitle>
            <DialogDescription>
              Stock moved from STAGING to the target bins. Ledger, stock card, stock on hand and bin occupancy are updated atomically.
            </DialogDescription>
          </DialogHeader>
          {postResult && (
            <div className="space-y-2 rounded-md border border-green-200 bg-green-50/50 p-4 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Putaway</span><span className="font-mono font-medium">{postResult.putawayNo}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Lines</span><span className="font-medium">{postResult.lineCount}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Moved Qty</span><span className="font-medium tabular-nums">{fmt(postResult.movedQty)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Ledger Entries</span><span className="font-medium tabular-nums">{fmt(postResult.ledgerEntries)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Source → Target</span><span className="font-mono">{postResult.sourceLocations?.join(', ')} → {postResult.targetLocations?.join(', ')}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => setOpenPost(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

function scoreColor(score) {
  if (score >= 80) return 'bg-green-100 text-green-700 border-green-200'
  if (score >= 50) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

// Per-line recommendation card — fetches its own scored recommendation.
function LineRecommendation({ line, docId, selectLocMut, onOverride }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['putaway-recommendation', docId, line.id],
    queryFn: () => api(`/putaway/documents/${docId}/lines/${line.id}/recommendation`),
  })

  if (isLoading) {
    return <div className="p-4"><Skeleton className="h-16 w-full" /></div>
  }
  if (!data?.primary) {
    return (
      <div className="p-4 text-xs text-gray-500">
        Line {line.lineNo} — <span className="font-mono">{line.sku}</span>: no recommendation available
      </div>
    )
  }

  const p = data.primary
  const cm = p.capacity ? CAPACITY_META[p.capacity.status] || { label: p.capacity.status, class: 'bg-gray-100 text-gray-700' } : null

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-800">Line {line.lineNo} — <span className="font-mono">{line.sku}</span></span>
            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] text-violet-700">
              <Sparkles className="mr-1 h-3 w-3" /> {p.score}/100
            </Badge>
            <span className="font-mono text-sm font-semibold text-green-700">{p.location.code}</span>
            {cm && <Badge variant="outline" className={`${cm.class} text-[10px]`}>{cm.label}</Badge>}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">Strategy: <span className="font-medium text-gray-700">{p.strategy}</span></div>
          {p.reasons?.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-gray-600">
              {p.reasons.map((r, i) => (
                <li key={i} className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {r}</li>
              ))}
            </ul>
          )}
          {p.warnings?.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700">
              {p.warnings.map((w, i) => (
                <li key={i} className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {w}</li>
              ))}
            </ul>
          )}
          {p.capacity && (
            <div className="mt-1 text-[11px] text-gray-500">
              Occupied {fmt(p.capacity.occupied)} / {p.capacity.maxCapacity > 0 ? fmt(p.capacity.maxCapacity) : 'unlimited'}
              {p.capacity.remaining != null && <> · Remaining {fmt(p.capacity.remaining)}</>}
            </div>
          )}
          {data.alternatives?.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Alternatives</div>
              {data.alternatives.map((a) => (
                <div key={a.location.id} className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                  <Badge variant="outline" className={`${scoreColor(a.score)} text-[10px]`}>{a.score}</Badge>
                  <span className="font-mono">{a.location.code}</span>
                  {a.reasons?.slice(0, 3).map((r) => <span key={r} className="text-gray-400">· {r}</span>)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onOverride(p)} disabled={selectLocMut.isPending}>
            Override
          </Button>
          <Button size="sm" className="h-7 bg-green-600 text-[11px] hover:bg-green-700" onClick={() => selectLocMut.mutate({ lineId: line.id, locationId: p.location.id, mode: 'ACCEPT' })} disabled={selectLocMut.isPending || !p.available}>
            {p.available ? <><CheckCircle2 className="mr-1 h-3 w-3" /> Accept</> : 'Unavailable'}
          </Button>
        </div>
      </div>
      {data.ranked && (
        <button onClick={() => refetch()} className="mt-2 text-[10px] text-gray-400 hover:underline">Refresh scores</button>
      )}
    </div>
  )
}

const SCAN_STATUS_META = {
  SUCCESS: { label: 'Validated', class: 'bg-green-100 text-green-700 border-green-200' },
  WARNING: { label: 'Warning', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  ERROR:   { label: 'Error', class: 'bg-red-100 text-red-700 border-red-200' },
}

function ScanResult({ result }) {
  if (!result) return null
  const meta = SCAN_STATUS_META[result.status] || { label: result.status, class: 'bg-gray-100 text-gray-700' }
  return (
    <div className={`rounded-md border p-2 text-[11px] ${result.status === 'ERROR' ? 'border-red-200 bg-red-50 text-red-700' : result.status === 'WARNING' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`${meta.class} text-[10px]`}>{meta.label}</Badge>
        <span className="font-medium">{result.message}</span>
      </div>
      <div className="mt-1 text-gray-600">
        Expected: <span className="font-mono">{result.expected || '—'}</span>
        {' · '}Scanned: <span className="font-mono">{result.actual || '—'}</span>
      </div>
    </div>
  )
}

// Barcode execution panel — continuous scan: validates location then item,
// completes the line, auto-advances to the next WAITING line. No inventory movement.
function ExecutionPanel({ docId, lines, targetCodeById }) {
  const qc = useQueryClient()
  const [stage, setStage] = useState('location')
  const [locResult, setLocResult] = useState(null)
  const [itemResult, setItemResult] = useState(null)

  const { data: session } = useQuery({
    queryKey: ['putaway-session', docId],
    queryFn: () => api(`/putaway/documents/${docId}/session`),
  })
  const { data: nextLine } = useQuery({
    queryKey: ['putaway-next-line', docId],
    queryFn: () => api(`/putaway/documents/${docId}/next-line`),
    enabled: !!session && !session.finishedAt,
  })
  const { data: scanHistory } = useQuery({
    queryKey: ['putaway-scan-history', docId],
    queryFn: () => api(`/putaway/documents/${docId}/scan-history`),
    enabled: !!session,
  })

  const currentLine = lines.find((l) => l.id === session?.lineId) || lines[0]
  const { data: recommendation } = useQuery({
    queryKey: ['putaway-recommendation', docId, currentLine?.id],
    queryFn: () => api(`/putaway/documents/${docId}/lines/${currentLine?.id}/recommendation`),
    enabled: !!currentLine?.id,
  })

  const expectedLocCode = currentLine?.targetLocationId
    ? (targetCodeById[currentLine.targetLocationId] || '—')
    : (recommendation?.primary?.location?.code || '—')

  const active = !!session && !session.finishedAt
  const ready = !!nextLine?.ready
  const sessionStatus = !session ? 'Ready' : !active ? 'Finished' : session.lastScanStatus === 'SUCCESS' ? 'Validated' : session.lastScanStatus === 'ERROR' ? 'Error' : 'Scanning'

  const refreshPanel = () => {
    qc.invalidateQueries({ queryKey: ['putaway-session', docId] })
    qc.invalidateQueries({ queryKey: ['putaway-next-line', docId] })
    qc.invalidateQueries({ queryKey: ['putaway-scan-history', docId] })
    qc.invalidateQueries({ queryKey: ['putaway-exec', docId] })
    qc.invalidateQueries({ queryKey: ['putaway-doc', docId] })
  }

  const startMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${docId}/start-session`, { method: 'POST' }),
    onSuccess: () => { toast.success('Scan session started'); setLocResult(null); setItemResult(null); setStage('location'); refreshPanel() },
    onError: (e) => toast.error(e.message),
  })
  const scanLocMut = useMutation({
    mutationFn: (code) => api(`/putaway/documents/${docId}/scan/location`, { method: 'POST', body: { code } }),
    onSuccess: (r) => {
      setLocResult(r.result)
      if (r.result.status === 'SUCCESS') { toast.success('Location validated'); setStage('item'); setItemResult(null) }
      else if (r.result.status === 'WARNING') toast.warning(r.result.message)
      else toast.error(r.result.message)
      refreshPanel()
    },
    onError: (e) => toast.error(e.message),
  })
  const scanItemMut = useMutation({
    mutationFn: (code) => api(`/putaway/documents/${docId}/scan/item`, { method: 'POST', body: { code } }),
    onSuccess: (r) => {
      setItemResult(r.result)
      if (r.result.status === 'SUCCESS') toast.success('Item validated')
      else if (r.result.status === 'WARNING') toast.warning(r.result.message)
      else toast.error(r.result.message)
      refreshPanel()
    },
    onError: (e) => toast.error(e.message),
  })
  const completeExecMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${docId}/lines/${currentLine?.id}/complete-execution`, { method: 'POST' }),
    onSuccess: (r) => {
      if (r.ready) toast.success('All lines completed — ready to finish')
      else toast.success(`Line completed — advanced to line ${r.nextLine?.lineNo || '?'}`)
      setStage('location')
      setLocResult(null)
      setItemResult(null)
      refreshPanel()
    },
    onError: (e) => toast.error(e.message),
  })
  const completePutawayMut = useMutation({
    mutationFn: () => api(`/putaway/documents/${docId}/complete`, { method: 'POST' }),
    onSuccess: () => { toast.success('Putaway completed'); refreshPanel() },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="rounded-md border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <div className="text-sm font-medium">Barcode Execution</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{session?.scanCount || 0} scans</Badge>
          <Badge variant="outline" className={`text-[10px] ${sessionStatus === 'Validated' ? 'bg-green-100 text-green-700 border-green-200' : sessionStatus === 'Error' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>{sessionStatus}</Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Current / Next line */}
        {active && (
          <div className="flex items-center gap-3 text-xs">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Current Line</div>
              <div className="font-medium text-gray-800">{currentLine ? `Line ${currentLine.lineNo} — ${currentLine.sku}` : '—'}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300" />
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Next Line</div>
              <div className="font-medium text-gray-800">{nextLine?.nextLine ? `Line ${nextLine.nextLine.lineNo} — ${nextLine.nextLine.sku}` : (ready ? 'None' : '—')}</div>
            </div>
            {!active && (
              <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                {startMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                Start Scan Session
              </Button>
            )}
          </div>
        )}
        {!active && (
          <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
            {startMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
            Start Scan Session
          </Button>
        )}

        {active && (
          <>
            {/* Ready To Complete banner */}
            {ready && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
                All lines completed — this putaway is ready to complete.
              </div>
            )}

            {/* Location card */}
            <div className="rounded-md border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium text-gray-700">1. Scan Location</div>
                <div className="text-[11px] text-gray-500">Expected: <span className="font-mono text-gray-700">{expectedLocCode}</span></div>
              </div>
              {stage === 'location' ? (
                <BarcodeInput
                  onScan={async (code) => { scanLocMut.mutate(code); return { ok: true, message: `Scanned ${code}` } }}
                  placeholder="Scan / type location code, press Enter"
                  hint="Must match the expected storage bin"
                  disabled={scanLocMut.isPending}
                  size="lg"
                />
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Location validated — proceed to item scan
                  <button onClick={() => { setStage('location'); setLocResult(null) }} className="ml-auto text-gray-400 underline hover:text-gray-600">Re-scan</button>
                </div>
              )}
              {locResult && <div className="mt-2"><ScanResult result={locResult} /></div>}
            </div>

            {/* Item card */}
            <div className="rounded-md border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium text-gray-700">2. Scan Item</div>
                <div className="text-[11px] text-gray-500">Expected: <span className="font-mono text-gray-700">{currentLine?.sku}</span></div>
              </div>
              {stage === 'item' ? (
                <BarcodeInput
                  onScan={async (code) => { scanItemMut.mutate(code); return { ok: true, message: `Scanned ${code}` } }}
                  placeholder="Scan / type item barcode or SKU, press Enter"
                  hint="Barcode, SKU, or item ID accepted"
                  disabled={scanItemMut.isPending}
                  size="lg"
                />
              ) : (
                <div className="text-[11px] text-gray-400">Validate the location first.</div>
              )}
              {itemResult && <div className="mt-2"><ScanResult result={itemResult} /></div>}
              {itemResult?.status === 'SUCCESS' && (
                <div className="mt-3">
                  <Button size="sm" className="h-8 w-full bg-green-600 text-xs hover:bg-green-700" onClick={() => completeExecMut.mutate()} disabled={completeExecMut.isPending}>
                    {completeExecMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                    Complete Line &amp; Auto-Advance
                  </Button>
                </div>
              )}
            </div>

            {/* Complete Putaway */}
            {ready && (
              <Button size="sm" className="h-9 w-full bg-blue-600 text-xs hover:bg-blue-700" onClick={() => completePutawayMut.mutate()} disabled={completePutawayMut.isPending}>
                {completePutawayMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="mr-1 h-3.5 w-3.5" />}
                Complete Putaway
              </Button>
            )}
          </>
        )}

        {/* Execution History */}
        {scanHistory?.length > 0 && (
          <div className="rounded-md border border-gray-200">
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-medium text-gray-700">Execution History</div>
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-left text-[10px] text-gray-500">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Time</th>
                  <th className="px-3 py-1.5 font-medium">Scan</th>
                  <th className="px-3 py-1.5 font-medium">Expected</th>
                  <th className="px-3 py-1.5 font-medium">Actual</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {scanHistory.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-[11px] text-gray-500">{formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}</td>
                    <td className="px-3 py-1.5"><Badge variant="outline" className={`text-[10px] ${h.scanType === 'LOCATION' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>{h.scanType}</Badge></td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-gray-600">{h.expectedValue || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-gray-600">{h.actualValue || '—'}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className={`text-[10px] ${h.validationStatus === 'SUCCESS' ? 'bg-green-100 text-green-700 border-green-200' : h.validationStatus === 'WARNING' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-red-100 text-red-700 border-red-200'}`}>{h.validationStatus}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
