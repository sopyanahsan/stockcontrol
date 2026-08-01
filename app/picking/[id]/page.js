'use client'

export const dynamic = 'force-dynamic'

import { use, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import BarcodeInput, { createScanSession } from '@/components/barcode-input'
import {
  ArrowLeft, Play, CheckCircle2, XCircle, MapPin, Package, Barcode,
  Loader2, Ban, ChevronRight, PackageCheck, AlertCircle, SkipForward,
  Search, Save, RefreshCw,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_META = {
  DRAFT:       { label: 'Draft',       class: 'bg-gray-100 text-gray-600 border-gray-200', step: 0 },
  ASSIGNED:    { label: 'Assigned',    class: 'bg-blue-100 text-blue-700 border-blue-200', step: 1 },
  IN_PROGRESS: { label: 'In Progress', class: 'bg-amber-100 text-amber-700 border-amber-200', step: 1 },
  COMPLETED:   { label: 'Completed',   class: 'bg-green-100 text-green-700 border-green-200', step: 3 },
  CANCELLED:   { label: 'Cancelled',   class: 'bg-red-100 text-red-700 border-red-200', step: -1 },
}

const TASK_STATUS_META = {
  OPEN:        { label: 'Open',        class: 'bg-gray-100 text-gray-600' },
  IN_PROGRESS: { label: 'In Progress', class: 'bg-amber-100 text-amber-700' },
  COMPLETED:   { label: 'Completed',   class: 'bg-green-100 text-green-700' },
  SKIPPED:     { label: 'Skipped',     class: 'bg-red-50 text-red-500' },
}

function StatusFlow({ status }) {
  if (status === 'CANCELLED') return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
  const steps = [
    { label: 'Draft', status: 'DRAFT' },
    { label: 'Assigned', status: 'ASSIGNED' },
    { label: 'In Progress', status: 'IN_PROGRESS' },
    { label: 'Completed', status: 'COMPLETED' },
  ]
  const current = STATUS_META[status]?.step ?? 0
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

  const [error, setError] = useState(null)
  const activeTaskRowRef = useRef(null)
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [step, setStep] = useState(1) // 1=location, 2=item, 3=serial, 4=qty, 5=confirm
  const [scannedLocation, setScannedLocation] = useState(null)
  const [scannedItem, setScannedItem] = useState(null)
  const [serials, setSerials] = useState([])
  const [qtyInput, setQtyInput] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['picking', id],
    queryFn: () => api(`/picking/${id}`),
    onError: (e) => setError(e),
  })

  // Scroll active task row into view
  useEffect(() => {
    if (activeTaskId && activeTaskRowRef.current) {
      activeTaskRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeTaskId])

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  // Mutations
  const suggestMut = useMutation({
    mutationFn: () => api(`/picking/${id}/suggest`, { method: 'POST' }),
    onSuccess: () => { toast.success('FIFO suggestions generated'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const assignMut = useMutation({
    mutationFn: (assignedToId) => api(`/picking/${id}/assign`, { method: 'POST', body: { assignedToId } }),
    onSuccess: () => { toast.success('Picker assigned'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const startMut = useMutation({
    mutationFn: () => api(`/picking/${id}/start`, { method: 'POST' }),
    onSuccess: () => { toast.success('Picking started'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const completeMut = useMutation({
    mutationFn: () => api(`/picking/${id}/complete`, { method: 'POST' }),
    onSuccess: () => { toast.success('Picking order completed'); qc.invalidateQueries({ queryKey: ['picking-list'] }); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const cancelMut = useMutation({
    mutationFn: (reason) => api(`/picking/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { toast.success('Order cancelled'); router.push('/picking') },
    onError: (e) => toast.error(e.message),
  })

  // Errors
  const [locationError, setLocationError] = useState('')
  const [itemError, setItemError] = useState('')
  const [serialError, setSerialError] = useState('')
  const [qtyError, setQtyError] = useState('')

  const activeTask = useMemo(
    () => data?.lines?.flatMap((l) => l.tasks || []).find((t) => t.id === activeTaskId) || null,
    [data, activeTaskId]
  )

  const serialSession = useMemo(() => {
    const s = createScanSession()
    serials.forEach((sn) => s.add(sn))
    return s
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId])

  const serialTracked = !!activeTask?.pickingLine?.item?.serialTracked
  const qtyRemaining = activeTask ? Number(activeTask.qty) - Number(activeTask.qtyPicked) : 0

  // Auto-set qtyInput when task becomes active
  useMemo(() => {
    if (activeTask) setQtyInput(String(qtyRemaining))
  }, [activeTaskId]) // eslint-disable-line

  // ---------- Location Scan ----------
  const handleLocationScan = async (code) => {
    setLocationError('')
    try {
      const result = await api(`/barcode?code=${encodeURIComponent(code)}`)
      if (result.type === 'LOCATION') {
        const loc = result.location
        if (!loc.isActive) {
          setLocationError(`Location "${code}" is inactive`)
          return { ok: false, message: 'Location is inactive' }
        }
        if (loc.id !== activeTask?.locationId) {
          setLocationError(`Wrong location. Expected: ${activeTask?.location?.code}, Scanned: ${loc.code}`)
          return { ok: false, message: 'Location mismatch' }
        }
        setScannedLocation({ id: loc.id, code: loc.code })
        setStep(2)
        return { ok: true, message: `Location confirmed: ${loc.code}` }
      }
      setLocationError(`"${code}" is not a valid location`)
      return { ok: false, message: 'Location not found' }
    } catch {
      setLocationError('Barcode lookup failed')
      return { ok: false, message: 'Lookup failed' }
    }
  }

  // ---------- Item Scan ----------
  const handleItemScan = async (code) => {
    setItemError('')
    try {
      const result = await api(`/barcode?code=${encodeURIComponent(code)}`)
      if (result.type === 'SERIAL') {
        // For serial-tracked items, item scan redirects to serial handling
        if (!serialTracked) {
          setItemError(`"${code}" is a serial number but this item is not serial-tracked`)
          return { ok: false, message: 'Item is not serial-tracked' }
        }
        // Check serial belongs to this task's item and location
        const sn = result.serial
        if (sn.item?.sku !== activeTask?.pickingLine?.item?.sku) {
          setItemError(`Serial belongs to ${sn.item?.sku || 'different item'}, expected ${activeTask?.pickingLine?.item?.sku}`)
          return { ok: false, message: 'Wrong item for this serial' }
        }
        if (sn.currentLocation !== activeTask?.location?.code) {
          setItemError(`Serial at ${sn.currentLocation || 'unknown'}, expected ${activeTask?.location?.code}`)
          return { ok: false, message: 'Serial not at expected location' }
        }
        if (sn.status !== 'IN_STOCK') {
          setItemError(`Serial status is ${sn.status}, must be IN_STOCK`)
          return { ok: false, message: 'Serial not in stock' }
        }
        if (serialSession.has(code)) {
          setSerialError(`"${code}" already scanned`)
          return { ok: false, message: 'Duplicate serial' }
        }
        if (serials.length >= qtyRemaining) {
          setSerialError(`Already have ${qtyRemaining} serial(s) (task qty)`)
          return { ok: false, message: 'All serials scanned' }
        }
        serialSession.add(code)
        setSerials((prev) => [...prev, code])
        setSerialError('')
        return { ok: true, message: `Added ${code} (${serials.length + 1}/${qtyRemaining})` }
      }
      if (result.type === 'ITEM') {
        if (result.item.id !== activeTask?.pickingLine?.item?.id) {
          setItemError(`Wrong item. Expected: ${activeTask?.pickingLine?.item?.sku}, Scanned: ${result.item.sku}`)
          return { ok: false, message: 'Item mismatch' }
        }
        setScannedItem({ id: result.item.id, sku: result.item.sku })
        if (serialTracked) {
          setStep(3)
        } else {
          setStep(4)
        }
        return { ok: true, message: `Item confirmed: ${result.item.sku}` }
      }
      setItemError(`"${code}" not recognized as item or serial`)
      return { ok: false, message: 'Unknown barcode' }
    } catch {
      setItemError('Barcode lookup failed')
      return { ok: false, message: 'Lookup failed' }
    }
  }

  // ---------- Serial Scan (dedicated) ----------
  const handleSerialScan = async (code) => {
    setSerialError('')
    try {
      const result = await api(`/barcode?code=${encodeURIComponent(code)}`)
      if (result.type !== 'SERIAL') {
        setSerialError(`"${code}" is not a serial number`)
        return { ok: false, message: 'Not a serial number' }
      }
      const sn = result.serial
      if (sn.item?.sku !== activeTask?.pickingLine?.item?.sku) {
        setSerialError(`Serial belongs to ${sn.item?.sku || 'different item'}`)
        return { ok: false, message: 'Wrong item' }
      }
      if (sn.currentLocation !== activeTask?.location?.code) {
        setSerialError(`Serial at ${sn.currentLocation || 'unknown'}, expected ${activeTask?.location?.code}`)
        return { ok: false, message: 'Wrong location' }
      }
      if (sn.status !== 'IN_STOCK') {
        setSerialError(`Serial status is ${sn.status}, must be IN_STOCK`)
        return { ok: false, message: 'Serial not in stock' }
      }
      if (serialSession.has(code)) {
        setSerialError(`"${code}" already scanned`)
        return { ok: false, message: 'Duplicate serial' }
      }
      if (serials.length >= qtyRemaining) {
        setSerialError(`All ${qtyRemaining} serials already scanned`)
        return { ok: false, message: 'Task complete' }
      }
      serialSession.add(code)
      setSerials((prev) => [...prev, code])
      return { ok: true, message: `Added ${code} (${serials.length + 1}/${qtyRemaining})` }
    } catch {
      setSerialError('Barcode lookup failed')
      return { ok: false, message: 'Lookup failed' }
    }
  }

  const removeSerial = (sn) => {
    serialSession.remove(sn)
    setSerials((prev) => prev.filter((s) => s !== sn))
  }

  // ---------- Confirm Pick ----------
  const pickTaskMut = useMutation({
    mutationFn: () => api(`/picking/${id}/pick-task/${activeTaskId}`, {
      method: 'POST',
      body: {
        scannedLocationCode: scannedLocation?.code,
        scannedItemCode: scannedItem?.id || scannedItem?.sku || null,
        serials,
        qty: Number(qtyInput),
      },
    }),
    onSuccess: (task) => {
      toast.success('Pick confirmed')
      setConfirmOpen(false)
      setScannedLocation(null)
      setScannedItem(null)
      setSerials([])
      setQtyInput('')
      setStep(1)
      setLocationError('')
      setItemError('')
      setSerialError('')
      setQtyError('')
      setActiveTaskId(null)
      qc.invalidateQueries({ queryKey: ['picking-list'] })
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const skipTaskMut = useMutation({
    mutationFn: () => api(`/picking/${id}/skip-task/${activeTaskId}`, {
      method: 'POST',
      body: { reason: skipReason || null },
    }),
    onSuccess: () => {
      toast.success('Task skipped')
      setSkipOpen(false)
      setSkipReason('')
      setActiveTaskId(null)
      setStep(1)
      setScannedLocation(null)
      setScannedItem(null)
      setSerials([])
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const openTask = (taskId) => {
    setActiveTaskId(taskId)
    setStep(1)
    setScannedLocation(null)
    setScannedItem(null)
    setSerials([])
    setQtyInput('')
    setLocationError('')
    setItemError('')
    setSerialError('')
    setQtyError('')
  }

  const canConfirm = scannedLocation && (scannedItem || !serialTracked) && (
    !serialTracked || serials.length === qtyRemaining
  ) && Number(qtyInput) > 0

  const allTasks = data?.lines?.flatMap((l) => l.tasks || []) || []
  const completedTasks = allTasks.filter((t) => t.status === 'COMPLETED').length
  const totalTasks = allTasks.length
  const allTasksDone = totalTasks > 0 && completedTasks === totalTasks

  if (isLoading) {
    return (
      <AppShell title="Picking Order" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      </AppShell>
    )
  }

  if (error || !data) {
    return (
      <AppShell title="Picking Order" subtitle="Error">
        <ErrorState
          error={error}
          onRetry={() => { setError(null); refetch() }}
          title="Failed to load picking order"
        />
      </AppShell>
    )
  }

  const statusMeta = STATUS_META[data.status] || { label: data.status, class: 'bg-gray-100' }
  const totalOrdered = (data.lines || []).reduce((s, l) => s + Number(l.qtyOrdered), 0)
  const totalPicked = (data.lines || []).reduce((s, l) => s + Number(l.qtyPicked || 0), 0)

  return (
    <AppShell
      title={data.pickingNumber}
      subtitle={`${(data.lines || []).length} line(s) — ${totalPicked}/${totalOrdered} picked`}
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/picking"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-semibold">{data.pickingNumber}</div>
                <Badge variant="outline" className={`${statusMeta.class} text-[10px]`}>{statusMeta.label}</Badge>
                <Badge variant="outline" className={`text-[10px] ${
                  data.priority === 'URGENT' ? 'border-red-300 text-red-600' :
                  data.priority === 'HIGH' ? 'border-orange-300 text-orange-600' :
                  'border-blue-200 text-blue-600'
                }`}>
                  {data.priority}
                </Badge>
              </div>
              <div className="text-xs text-gray-500">
                {totalPicked} of {totalOrdered} units picked
                {totalTasks > 0 && <> — {completedTasks}/{totalTasks} tasks done</>}
              </div>
              <div className="text-xs text-gray-500">
                Created by {data.createdBy?.name || 'unknown'}
                {data.assignedTo && <> — Assigned to {data.assignedTo.name}</>}
              </div>
              <div className="text-[11px] text-gray-400">
                {data.notes && <span className="mr-3">{data.notes}</span>}
                Created {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}
                {data.startedAt && ` · Started ${formatDistanceToNow(new Date(data.startedAt), { addSuffix: true })}`}
                {data.completedAt && ` · Completed ${formatDistanceToNow(new Date(data.completedAt), { addSuffix: true })}`}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex flex-wrap gap-2">
                {data.status === 'DRAFT' && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700"
                      onClick={() => {
                        const reason = window.prompt('Cancel reason (optional):') ?? null
                        if (reason !== null) cancelMut.mutate(reason)
                      }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" variant="outline" className="h-8"
                      onClick={() => assignMut.mutate(null)} disabled={!assignMut.isPending && !meta?.users?.length}>
                      <Save className="mr-1 h-3.5 w-3.5" /> Assign
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => suggestMut.mutate()} disabled={suggestMut.isPending}>
                      {suggestMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                      Generate Picks
                    </Button>
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        suggestMut.mutate()
                        setTimeout(() => assignMut.mutate(null), 500)
                      }}
                      disabled={suggestMut.isPending || assignMut.isPending}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Assign &amp; Suggest
                    </Button>
                  </>
                )}
                {data.status === 'ASSIGNED' && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700"
                      onClick={() => {
                        const reason = window.prompt('Cancel reason (optional):') ?? null
                        if (reason !== null) cancelMut.mutate(reason)
                      }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                      {startMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      Start Picking
                    </Button>
                  </>
                )}
                {data.status === 'IN_PROGRESS' && allTasksDone && (
                  <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={() => completeMut.mutate()} disabled={completeMut.isPending}>
                    {completeMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                    Complete Order
                  </Button>
                )}
                {(data.status === 'COMPLETED' || data.status === 'CANCELLED') && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href="/picking"><PackageCheck className="mr-1 h-3.5 w-3.5" /> Back to List</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Completed state */}
        {data.status === 'COMPLETED' && (
          <div className="rounded-md border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500" />
            <div className="text-sm font-medium text-green-800">Picking Completed</div>
            <div className="mt-1 text-xs text-green-600">
              {totalPicked} units picked across {(data.lines || []).length} line(s)
            </div>
          </div>
        )}

        {/* Cancelled state */}
        {data.status === 'CANCELLED' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center">
            <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
            <div className="text-sm font-medium text-red-800">Order Cancelled</div>
          </div>
        )}

        {/* Lines and Tasks */}
        {(data.status === 'DRAFT' || data.status === 'ASSIGNED' || data.status === 'IN_PROGRESS') && (
          <div className="space-y-3">
            {(data.lines || []).map((line) => {
              const lineTasks = line.tasks || []
              const lineDone = line.status === 'COMPLETED'
              const lineProgress = lineTasks.length > 0
                ? lineTasks.filter((t) => t.status === 'COMPLETED').length + '/' + lineTasks.length
                : null

              return (
                <div key={line.id} className={`rounded-md border ${lineDone ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'} shadow-sm`}>
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium">{line.item?.sku}</span>
                          <span className="text-xs text-gray-600">{line.item?.name}</span>
                          {line.item?.serialTracked && (
                            <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600">SN</Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {lineDone
                            ? `${line.qtyPicked}/${line.qtyOrdered} picked — COMPLETED`
                            : `${line.qtyPicked || 0}/${line.qtyOrdered} picked`
                          }
                          {lineProgress && !lineDone && ` — ${lineProgress} tasks`}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className={`${TASK_STATUS_META[line.status]?.class || 'bg-gray-100 text-gray-600'} text-[10px]`}>
                      {TASK_STATUS_META[line.status]?.label || line.status}
                    </Badge>
                  </div>

                  {lineTasks.length > 0 && (
                    <div className="divide-y divide-gray-50">
                      {lineTasks.map((task) => {
                        const taskMeta = TASK_STATUS_META[task.status] || { label: task.status, class: 'bg-gray-100 text-gray-600' }
                        const isActive = task.id === activeTaskId
                        const isPickable = data.status === 'IN_PROGRESS' && (task.status === 'OPEN' || task.status === 'IN_PROGRESS')

                        return (
                          <div key={task.id} ref={isActive ? activeTaskRowRef : null} className={`px-4 py-2 ${isActive ? 'bg-blue-50' : ''}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                                  task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                  task.status === 'SKIPPED' ? 'bg-red-50 text-red-400' :
                                  isActive ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {task.status === 'COMPLETED' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                                   task.status === 'SKIPPED' ? <XCircle className="h-3.5 w-3.5" /> :
                                   task.sequence || '#'}
                                </div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs">Loc: <strong>{task.location?.code}</strong></span>
                                    <span className="text-xs text-gray-500">
                                      {task.qtyPicked > 0 ? `${task.qtyPicked}/` : ''}{task.qty} picked
                                    </span>
                                    {task.qtyPicked > 0 && task.qtyPicked < task.qty && (
                                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200">Partial</Badge>
                                    )}
                                  </div>
                                  {task.serials?.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {task.serials.map((s) => (
                                        <Badge key={s.id} variant="outline" className="text-[9px] border-blue-300 bg-blue-50 font-mono">
                                          {s.serialNo}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`${taskMeta.class} text-[10px]`}>{taskMeta.label}</Badge>
                                {isPickable && (
                                  <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                                    onClick={() => isActive ? setActiveTaskId(null) : openTask(task.id)}>
                                    {isActive ? 'Close' : 'Pick'}
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Inline picking UI */}
                            {isActive && isPickable && (
                              <div className="mt-3 space-y-3 rounded-md border border-blue-200 bg-blue-50/50 p-3">
                                {/* Step indicator */}
                                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                  <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${step >= 1 ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-400'}`}>
                                    <MapPin className="h-3 w-3" /> 1. Location
                                  </div>
                                  <ChevronRight className="h-3 w-3" />
                                  <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${step >= 2 ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-400'}`}>
                                    <Package className="h-3 w-3" /> 2. Item
                                  </div>
                                  {serialTracked && (
                                    <>
                                      <ChevronRight className="h-3 w-3" />
                                      <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${step >= 3 ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-400'}`}>
                                        <Barcode className="h-3 w-3" /> 3. Serials
                                      </div>
                                    </>
                                  )}
                                  <ChevronRight className="h-3 w-3" />
                                  <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${step >= 4 ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-400'}`}>
                                    <Package className="h-3 w-3" /> {serialTracked ? '4.' : '3.'} Qty
                                  </div>
                                </div>

                                {/* Step 1: Location */}
                                <div>
                                  <div className="mb-1.5 flex items-center justify-between">
                                    <span className="text-xs font-medium">
                                      Step 1 — Scan Location <span className="font-mono text-blue-600">({task.location?.code})</span>
                                    </span>
                                    {scannedLocation && (
                                      <span className="flex items-center gap-1 text-[11px] text-green-600">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> {scannedLocation.code}
                                      </span>
                                    )}
                                  </div>
                                  <BarcodeInput
                                    onScan={handleLocationScan}
                                    placeholder={`Scan ${task.location?.code}...`}
                                    hint="Scan the bin location barcode to confirm"
                                    disabled={!!scannedLocation}
                                    size="md"
                                  />
                                  {locationError && (
                                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-600">
                                      <AlertCircle className="h-3.5 w-3.5" /> {locationError}
                                    </div>
                                  )}
                                </div>

                                {/* Step 2: Item */}
                                {scannedLocation && (
                                  <div>
                                    <div className="mb-1.5 flex items-center justify-between">
                                      <span className="text-xs font-medium">
                                        Step 2 — Scan Item <span className="font-mono text-blue-600">({task.pickingLine?.item?.sku})</span>
                                      </span>
                                      {scannedItem && (
                                        <span className="flex items-center gap-1 text-[11px] text-green-600">
                                          <CheckCircle2 className="h-3.5 w-3.5" /> {scannedItem.sku}
                                        </span>
                                      )}
                                    </div>
                                    <BarcodeInput
                                      onScan={handleItemScan}
                                      placeholder={serialTracked ? 'Scan item or serial number...' : 'Scan item barcode...'}
                                      hint={serialTracked ? `Scan ${task.pickingLine?.item?.sku} or its serial numbers` : 'Scan the item barcode to confirm'}
                                      disabled={!!scannedItem && !serialTracked}
                                      size="md"
                                    />
                                    {itemError && (
                                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-600">
                                        <AlertCircle className="h-3.5 w-3.5" /> {itemError}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Step 3: Serials */}
                                {scannedLocation && serialTracked && (
                                  <div>
                                    <div className="mb-1.5 flex items-center justify-between">
                                      <span className="text-xs font-medium">
                                        Step 3 — Scan Serials <span className="text-blue-600">({serials.length}/{qtyRemaining})</span>
                                      </span>
                                    </div>
                                    <BarcodeInput
                                      onScan={handleSerialScan}
                                      placeholder={`Scan serial ${serials.length + 1} of ${qtyRemaining}...`}
                                      hint={`${qtyRemaining - serials.length} more serial(s) needed`}
                                      size="md"
                                    />
                                    {serialError && (
                                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-600">
                                        <AlertCircle className="h-3.5 w-3.5" /> {serialError}
                                      </div>
                                    )}
                                    {serials.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {serials.map((sn, i) => (
                                          <Badge key={sn} variant="outline" className="gap-1 border-blue-300 bg-blue-50 pl-2 pr-1 text-[10px]">
                                            <span className="text-gray-400">{i + 1}.</span>
                                            <span className="font-mono">{sn}</span>
                                            <button
                                              onClick={() => removeSerial(sn)}
                                              className="ml-1 rounded p-0.5 text-red-500 hover:bg-red-100"
                                            >
                                              <XCircle className="h-3 w-3" />
                                            </button>
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Step 4: Qty + Confirm */}
                                {scannedLocation && (!serialTracked || serials.length === qtyRemaining) && (
                                  <div>
                                    <div className="mb-1.5 text-xs font-medium">
                                      {serialTracked ? 'Step 4' : 'Step 3'} — Confirm Quantity
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-32">
                                        <Input
                                          type="number"
                                          min="1"
                                          max={qtyRemaining}
                                          value={qtyInput}
                                          onChange={(e) => setQtyInput(e.target.value)}
                                          className="h-9 text-sm tabular-nums text-center font-mono"
                                        />
                                      </div>
                                      <span className="text-xs text-gray-500">of {qtyRemaining} remaining</span>
                                      <div className="ml-auto flex gap-2">
                                        <Button size="sm" variant="outline" className="h-8 text-xs"
                                          onClick={() => { setQtyInput(String(qtyRemaining)) }}>
                                          Full
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-8 text-xs text-amber-600 hover:text-amber-700"
                                          onClick={() => { setActiveTaskId(null); setStep(1); setScannedLocation(null); setScannedItem(null); setSerials([]); setLocationError(''); setItemError(''); setSerialError('') }}>
                                          <SkipForward className="mr-1 h-3.5 w-3.5" /> Skip
                                        </Button>
                                        <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-xs"
                                          onClick={() => setConfirmOpen(true)} disabled={!canConfirm}>
                                          Confirm Pick
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CONFIRM DIALOG */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Pick</DialogTitle>
            <DialogDescription>Review and confirm the pick details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="text-gray-500">Location</div>
              <div className="font-mono font-medium">{scannedLocation?.code}</div>
              <div className="text-gray-500">Item</div>
              <div className="font-mono">{activeTask?.pickingLine?.item?.sku}</div>
              <div className="text-gray-500">Quantity</div>
              <div className="font-medium tabular-nums">{qtyInput}</div>
              {serialTracked && (
                <>
                  <div className="text-gray-500">Serials</div>
                  <div className="flex flex-wrap gap-1">
                    {serials.map((sn) => (
                      <Badge key={sn} variant="outline" className="text-[10px] font-mono">{sn}</Badge>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-700">
              This will mark the pick as confirmed. Stock will be consumed during shipping.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Back</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => pickTaskMut.mutate()} disabled={pickTaskMut.isPending}>
              {pickTaskMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Pick
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SKIP DIALOG */}
      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Skip Task</DialogTitle>
            <DialogDescription>Provide a reason for skipping this pick task.</DialogDescription>
          </DialogHeader>
          <Input
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason (optional)..."
            className="h-9"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => skipTaskMut.mutate()} disabled={skipTaskMut.isPending}>
              {skipTaskMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Skip Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
