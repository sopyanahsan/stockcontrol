'use client'

import { useMemo, useState } from 'react'
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
import BarcodeInput, { createScanSession } from '@/components/barcode-input'
import {
  ArrowLeft, Play, CheckCircle2, XCircle, MapPin, Package, Barcode,
  Loader2, Ban, ChevronRight, PackageCheck, AlertCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_META = {
  OPEN:        { label: 'Open',        class: 'bg-blue-100 text-blue-700 border-blue-200', step: 0 },
  IN_PROGRESS: { label: 'In Progress', class: 'bg-amber-100 text-amber-700 border-amber-200', step: 1 },
  COMPLETED:   { label: 'Completed',   class: 'bg-green-100 text-green-700 border-green-200', step: 2 },
  CANCELLED:   { label: 'Cancelled',   class: 'bg-red-100 text-red-700 border-red-200', step: -1 },
}

function StatusFlow({ status }) {
  if (status === 'CANCELLED') return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
  const steps = [
    { label: 'Open', status: 'OPEN' },
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
  const { id } = params
  const router = useRouter()
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['putaway', id],
    queryFn: () => api(`/putaway/${id}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const startMut = useMutation({
    mutationFn: () => api(`/putaway/${id}/start`, { method: 'POST' }),
    onSuccess: (r) => { toast.success('Task started'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const cancelMut = useMutation({
    mutationFn: (reason) => api(`/putaway/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { toast.success('Task cancelled'); router.push('/putaway') },
    onError: (e) => toast.error(e.message),
  })

  // ---------- Execution state ----------
  const [step, setStep] = useState(1) // 1=scan location, 2=scan item/serials, 3=confirm
  const [scannedLocation, setScannedLocation] = useState(null) // { code, id }
  const [scannedItem, setScannedItem] = useState(null)
  const [serials, setSerials] = useState([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [itemError, setItemError] = useState('')

  const isOpen       = data?.status === 'OPEN'
  const isInProgress = data?.status === 'IN_PROGRESS'
  const isCompleted  = data?.status === 'COMPLETED'
  const isCancelled  = data?.status === 'CANCELLED'
  const serialTracked = !!data?.item?.serialTracked

  const qtyRemaining = (data?.qty || 0) - (data?.qtyPutaway || 0)

  // Serial scan session
  const serialSession = useMemo(() => {
    const s = createScanSession()
    serials.forEach((sn) => s.add(sn))
    return s
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id])

  // ---------- Location scan ----------
  const handleLocationScan = async (code) => {
    setLocationError('')
    const result = await api(`/barcode?code=${encodeURIComponent(code)}`)
    if (result.type === 'LOCATION') {
      const loc = result.location
      if (!loc.isActive) {
        setLocationError(`Location "${code}" is inactive`)
        return { ok: false, message: 'Location is inactive' }
      }
      if (loc.locationType !== 'STORAGE') {
        setLocationError(`"${code}" is ${loc.locationType} — must be STORAGE bin`)
        return { ok: false, message: 'Not a STORAGE location' }
      }
      if (data?.fromLocation?.code && loc.code === data.fromLocation.code) {
        setLocationError(`"${code}" is the same as the staging location`)
        return { ok: false, message: 'Same as staging location' }
      }
      setScannedLocation({ id: loc.id, code: loc.code })
      setStep(2)
      return { ok: true, message: `Destination accepted: ${loc.code}` }
    }
    setLocationError(`"${code}" is not a valid location`)
    return { ok: false, message: 'Location not found' }
  }

  // ---------- Item/serial scan ----------
  const handleItemScan = async (code) => {
    setItemError('')
    const result = await api(`/barcode?code=${encodeURIComponent(code)}`)
    if (result.type === 'SERIAL') {
      // Serial scan for serial-tracked items
      if (!serialTracked) {
        setItemError(`"${code}" is a serial number — this item is not serial-tracked`)
        return { ok: false, message: 'Item is not serial-tracked' }
      }
      const sn = result.serial
      if (sn.status !== 'IN_STAGING') {
        setItemError(`Serial "${code}" is not in staging (status: ${sn.status})`)
        return { ok: false, message: 'Serial not in staging' }
      }
      if (sn.currentLocation !== data?.fromLocation?.code) {
        setItemError(`Serial "${code}" is not at ${data?.fromLocation?.code} (currently at ${sn.currentLocation || 'unknown'})`)
        return { ok: false, message: 'Serial not at staging location' }
      }
      if (sn.item?.sku !== data?.item?.sku) {
        setItemError(`Serial "${code}" belongs to ${sn.item?.sku || 'different item'}`)
        return { ok: false, message: 'Wrong item' }
      }
      if (serialSession.has(code)) {
        setItemError(`"${code}" already scanned`)
        return { ok: false, message: 'Duplicate scan' }
      }
      if (serials.length >= qtyRemaining) {
        setItemError(`Already have ${qtyRemaining} serials for this putaway`)
        return { ok: false, message: 'All serials already scanned' }
      }
      serialSession.add(code)
      setSerials((prev) => [...prev, code])
      return { ok: true, message: `Added ${code} (${serials.length + 1}/${qtyRemaining})` }
    }
    if (result.type === 'ITEM') {
      // Direct item scan
      if (result.item.id !== data?.itemId) {
        setItemError(`Scanned ${result.item.sku} — expected ${data?.item?.sku}`)
        return { ok: false, message: 'Wrong item' }
      }
      // For non-serial items, item scan is enough to proceed
      if (!serialTracked) {
        setScannedItem({ id: result.item.id, sku: result.item.sku })
        setStep(3)
        return { ok: true, message: `Item confirmed: ${result.item.sku}` }
      }
      // For serial items, item scan is just informational — serials are needed
      setItemError(`Serial-tracked item — scan ${qtyRemaining} serial number(s) (${serials.length}/${qtyRemaining} done)`)
      return { ok: false, message: 'Scan serial numbers for this item' }
    }
    setItemError(`"${code}" not recognized as item or serial`)
    return { ok: false, message: 'Unknown barcode' }
  }

  const removeSerial = (sn) => {
    serialSession.remove(sn)
    setSerials((prev) => prev.filter((s) => s !== sn))
  }

  // ---------- Can proceed to confirmation? ----------
  const canConfirm = scannedLocation && (
    !serialTracked || serials.length === qtyRemaining
  )

  // ---------- Execute putaway ----------
  const completeMut = useMutation({
    mutationFn: () => api(`/putaway/${id}/complete`, {
      method: 'POST',
      body: {
        scannedLocationCode: scannedLocation.code,
        serials,
        qty: qtyRemaining,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Putaway completed — ${qtyRemaining} × ${data.item?.sku} moved to ${scannedLocation.code}`)
      setConfirmOpen(false)
      refetch()
      if (r.status === 'COMPLETED') {
        setStep(4)
      } else {
        setStep(1)
        setScannedLocation(null)
        setScannedItem(null)
        setSerials([])
        setItemError('')
        qc.invalidateQueries({ queryKey: ['putaway-list'] })
      }
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) {
    return (
      <AppShell title="Putaway Task" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <AppShell title="Putaway Task" subtitle="Not found">
        <div className="rounded-md border p-8 text-center text-sm text-gray-500">
          Task not found. <Link className="text-blue-600 underline" href="/putaway">Back to queue</Link>
        </div>
      </AppShell>
    )
  }

  const statusMeta = STATUS_META[data.status] || { label: data.status, class: 'bg-gray-100' }

  return (
    <AppShell
      title={data.taskNumber}
      subtitle={`${data.item?.sku} — ${data.item?.name}`}
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/putaway"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm font-semibold">{data.taskNumber}</div>
                <Badge variant="outline" className={`text-[10px] ${statusMeta.class}`}>{statusMeta.label}</Badge>
              </div>
              <div className="text-xs text-gray-500">
                Item: <span className="font-medium text-gray-700">{data.item?.sku}</span>
                {data.item?.serialTracked && (
                  <Badge variant="outline" className="ml-1 text-[10px] border-amber-300 text-amber-600">SN</Badge>
                )}
              </div>
              <div className="text-xs text-gray-500">
                Qty to put away: <span className="font-medium text-gray-700">{qtyRemaining}</span>
                {data.qtyPutaway > 0 && (
                  <span className="ml-1 text-gray-400">({data.qtyPutaway} previously done)</span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                From: <span className="font-mono font-medium">{data.fromLocation?.code}</span>
                {data.receiving && (
                  <> — GRN <Link href={`/receiving/${data.receiving.id}`} className="font-mono text-blue-600 hover:underline">{data.receiving.grnNumber}</Link></>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {data.toLocation
                  ? <>To: <span className="font-mono font-medium">{data.toLocation.code}</span></>
                  : <span className="text-gray-400">Destination: not set</span>}
              </div>
              <div className="text-[11px] text-gray-400">
                Created {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}
                {data.startedAt && ` · Started ${formatDistanceToNow(new Date(data.startedAt), { addSuffix: true })}`}
                {data.completedAt && ` · Completed ${formatDistanceToNow(new Date(data.completedAt), { addSuffix: true })}`}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusFlow status={data.status} />
              <div className="flex gap-2">
                {isOpen && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700" onClick={() => {
                      const reason = window.prompt('Cancel reason (optional):') ?? null
                      if (reason !== null) cancelMut.mutate(reason)
                    }}>
                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                      {startMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      Start Task
                    </Button>
                  </>
                )}
                {isInProgress && (
                  <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700" onClick={() => {
                    const reason = window.prompt('Cancel reason (optional):') ?? null
                    if (reason !== null) cancelMut.mutate(reason)
                  }}>
                    <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                  </Button>
                )}
                {isCompleted && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href="/putaway"><PackageCheck className="mr-1 h-3.5 w-3.5" /> Back to Queue</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Completed state */}
        {isCompleted && (
          <div className="rounded-md border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500" />
            <div className="text-sm font-medium text-green-800">Putaway Completed</div>
            <div className="mt-1 text-xs text-green-600">
              {qtyRemaining === 0
                ? `${data.qty} units moved to ${data.toLocation?.code || 'destination'}`
                : `${data.qtyPutaway} of ${data.qty} units put away`}
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/putaway"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Queue</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Cancelled state */}
        {isCancelled && (
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center">
            <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
            <div className="text-sm font-medium text-red-800">Task Cancelled</div>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/putaway"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Queue</Link>
            </Button>
          </div>
        )}

        {/* Execution flow — only for IN_PROGRESS */}
        {isInProgress && step !== 4 && (
          <div className="space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${step >= 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                <MapPin className="h-3 w-3" /> 1. Scan Destination
              </div>
              <ChevronRight className="h-3 w-3 text-gray-300" />
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${step >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                <Package className="h-3 w-3" /> 2. Scan Item {serialTracked ? '/ Serials' : ''}
              </div>
              <ChevronRight className="h-3 w-3 text-gray-300" />
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${step >= 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                <CheckCircle2 className="h-3 w-3" /> 3. Confirm
              </div>
            </div>

            {/* Step 1: Scan destination location */}
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">1</div>
                <div className="text-sm font-medium">Scan Destination Location</div>
              </div>
              <BarcodeInput
                onScan={handleLocationScan}
                placeholder="Scan or type bin location, then press Enter"
                hint="Scan a STORAGE bin barcode. Staging locations are not allowed."
                disabled={!!scannedLocation}
                size="lg"
              />
              {locationError && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" /> {locationError}
                </div>
              )}
              {scannedLocation && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Destination set: <span className="font-mono font-medium">{scannedLocation.code}</span>
                  <Button
                    variant="ghost" size="sm" className="ml-2 h-5 text-[10px] text-gray-400 hover:text-gray-600"
                    onClick={() => { setScannedLocation(null); setStep(1); setLocationError('') }}
                  >
                    Change
                  </Button>
                </div>
              )}
            </div>

            {/* Step 2: Scan item / serials */}
            {scannedLocation && (
              <div className="rounded-md border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">2</div>
                  <div className="text-sm font-medium">
                    {serialTracked ? `Scan Serial Numbers (${serials.length}/${qtyRemaining})` : 'Scan / Confirm Item'}
                  </div>
                </div>
                <BarcodeInput
                  onScan={handleItemScan}
                  placeholder={serialTracked
                    ? `Scan serial number (${serials.length}/${qtyRemaining})`
                    : 'Scan item barcode or press Enter to confirm'}
                  hint={serialTracked
                    ? `${qtyRemaining - serials.length} more serial(s) needed`
                    : 'Confirm the item being put away'}
                  disabled={step > 2}
                  size="lg"
                />
                {itemError && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" /> {itemError}
                  </div>
                )}
                {serialTracked && serials.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {serials.map((sn, i) => (
                      <Badge key={sn} variant="outline" className="gap-1 border-blue-300 bg-blue-50 pl-2 pr-1 text-[10px]">
                        <span className="text-gray-400">{i + 1}.</span>
                        <span className="font-mono">{sn}</span>
                        <button
                          onClick={() => removeSerial(sn)}
                          className="ml-1 rounded p-0.5 text-red-500 hover:bg-red-100"
                          aria-label={`Remove ${sn}`}
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Confirmation preview */}
            {canConfirm && step < 3 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">3</div>
                  <div className="text-sm font-medium text-blue-900">Ready to Confirm</div>
                </div>
                <div className="mb-3 space-y-1 text-xs text-blue-800">
                  <div>Move <span className="font-medium">{qtyRemaining}</span> × <span className="font-mono">{data.item?.sku}</span></div>
                  <div>From <span className="font-mono">{data.fromLocation?.code}</span> → <span className="font-mono font-medium">{scannedLocation.code}</span></div>
                  {serialTracked && <div>{serials.length} serial number(s) will be migrated</div>}
                </div>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                  onClick={() => setStep(3)}
                >
                  Review &amp; Confirm
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIRM DIALOG */}
      <Dialog open={step === 3} onOpenChange={(open) => { if (!open) setStep(2) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Putaway</DialogTitle>
            <DialogDescription>
              Review the details below before executing this putaway transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="text-gray-500">Task Number</div>
              <div className="font-mono font-medium">{data.taskNumber}</div>

              <div className="text-gray-500">Item</div>
              <div>
                <div className="font-mono">{data.item?.sku}</div>
                <div className="text-gray-500">{data.item?.name}</div>
              </div>

              <div className="text-gray-500">Quantity</div>
              <div className="font-medium tabular-nums">
                {qtyRemaining} {data.item?.uom?.code || 'units'}
                {serialTracked && <span className="ml-1 text-gray-400">({serials.length} serials)</span>}
              </div>

              <div className="text-gray-500">From</div>
              <div className="font-mono">{data.fromLocation?.code} <span className="text-gray-400">(staging)</span></div>

              <div className="text-gray-500">To</div>
              <div className="font-mono font-medium">{scannedLocation.code} <span className="text-gray-400">(storage bin)</span></div>

              {data.receiving && (
                <>
                  <div className="text-gray-500">GRN Reference</div>
                  <div className="font-mono">{data.receiving.grnNumber}</div>
                </>
              )}
            </div>

            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-700">
              This will create a <strong>Stock Ledger entry</strong> moving inventory from staging to the bin,
              update serial statuses, and log an <strong>Audit Trail</strong> record.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => completeMut.mutate()}
              disabled={completeMut.isPending}
            >
              {completeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Putaway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
