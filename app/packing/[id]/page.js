'use client'

export const dynamic = 'force-dynamic'

import { use, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import BarcodeInput from '@/components/barcode-input'
import {
  Package, Plus, Lock, Unlock, CheckCircle2, ArrowLeft, AlertCircle,
  PackageOpen, Scale, Ruler, PackageCheck, X, ShoppingCart,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const PKG_STATUS_META = {
  OPEN:   { label: 'Open',   class: 'bg-amber-50 text-amber-700 border-amber-200', Icon: PackageOpen },
  CLOSED: { label: 'Closed', class: 'bg-green-50 text-green-700 border-green-200', Icon: PackageCheck },
}

const ORDER_STATUS_META = {
  QUEUE:       { label: 'Queue',        class: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress',  class: 'bg-amber-50 text-amber-700 border-amber-200' },
  COMPLETED:    { label: 'Completed',    class: 'bg-green-50 text-green-700 border-green-200' },
  CANCELLED:    { label: 'Cancelled',    class: 'bg-red-50 text-red-700 border-red-200' },
}

// States for the scan panel
const SCAN_STEP = {
  IDLE:          'idle',           // No package selected
  ITEM:           'item',           // Package ready, scan item
  SERIAL:         'serial',         // Serial-tracked, scan serials one-by-one
  QTY:            'qty',            // Non-serial, confirm qty
  CONFIRM:        'confirm',        // Ready to confirm
}

function computePackedByItem(packages) {
  const map = {}
  for (const pkg of packages) {
    for (const pi of pkg.items || []) {
      map[pi.itemId] = (map[pi.itemId] || 0) + Number(pi.qty)
    }
  }
  return map
}

function computePackedSerialsByItem(packages) {
  const map = {}
  for (const pkg of packages) {
    for (const s of pkg.serials || []) {
      if (s.pickingLine) {
        const itemId = s.pickingLine.itemId
        map[itemId] = (map[itemId] || 0) + 1
      }
    }
  }
  return map
}

export default function PackingDetailPage({ params }) {
  const { id } = use(params)
  const packingId = id
  const qc = useQueryClient()

  // Active package selection — exactly one OPEN package at a time
  const [activePkgId, setActivePkgId] = useState(null)

  // Scan state machine
  const [step, setStep] = useState(SCAN_STEP.IDLE)

  // Scanned item context
  const [scannedItem, setScannedItem] = useState(null)
  // { item, line, remaining, pendingSerials[], pendingQty }

  // Edit dims state
  const [editPkgId, setEditPkgId] = useState(null)
  const [pkgDims, setPkgDims] = useState({ weight: '', length: '', width: '', height: '' })

  const { data: order, isLoading } = useQuery({
    queryKey: ['packing', packingId],
    queryFn: () => api('/packing/' + packingId),
    refetchInterval: 3000,
  })

  // Auto-select first OPEN package when order is loaded
  useEffect(() => {
    if (!order) return
    const packages = order.packages || []
    const openPkgs = packages.filter((p) => p.status === 'OPEN')
    if (openPkgs.length > 0 && !activePkgId) {
      setActivePkgId(openPkgs[0].id)
      setStep(SCAN_STEP.ITEM)
    }
    if (openPkgs.length === 0) {
      setActivePkgId(null)
      setStep(SCAN_STEP.IDLE)
    }
  }, [order, activePkgId])

  // Reset scan state when package changes
  const resetScan = useCallback(() => {
    setScannedItem(null)
    setStep(activePkgId ? SCAN_STEP.ITEM : SCAN_STEP.IDLE)
  }, [activePkgId])

  const startPacking = async () => {
    try {
      await api('/packing/' + packingId + '/start', { method: 'POST' })
      toast.success('Packing started')
      qc.invalidateQueries({ queryKey: ['packing', packingId] })
    } catch (e) { toast.error(e.message) }
  }

  const completePacking = async () => {
    if (!confirm('Complete this packing order? All items must be packed.')) return
    try {
      await api('/packing/' + packingId + '/complete', { method: 'POST' })
      toast.success('Packing order completed')
      qc.invalidateQueries({ queryKey: ['packing', packingId] })
    } catch (e) { toast.error(e.message) }
  }

  const createPackage = async () => {
    try {
      const pkg = await api('/packing/' + packingId + '/packages', { method: 'POST' })
      toast.success('Package created: ' + pkg.packageNumber)
      setActivePkgId(pkg.id)
      setStep(SCAN_STEP.ITEM)
      qc.invalidateQueries({ queryKey: ['packing', packingId] })
    } catch (e) { toast.error(e.message) }
  }

  const selectPackage = (pkgId) => {
    const pkg = order.packages.find((p) => p.id === pkgId)
    if (!pkg) return
    if (pkg.status === 'CLOSED') {
      toast.error('Package is closed — reopen it first')
      return
    }
    setActivePkgId(pkgId)
    setScannedItem(null)
    setStep(SCAN_STEP.ITEM)
  }

  const closePackage = async (pkgId) => {
    try {
      await api(`/packing/${packingId}/packages/${pkgId}/close`, { method: 'POST' })
      toast.success('Package closed')
      if (activePkgId === pkgId) {
        setActivePkgId(null)
        setStep(SCAN_STEP.IDLE)
        setScannedItem(null)
      }
      qc.invalidateQueries({ queryKey: ['packing', packingId] })
    } catch (e) { toast.error(e.message) }
  }

  const reopenPackage = async (pkgId) => {
    try {
      await api(`/packing/${packingId}/packages/${pkgId}/reopen`, { method: 'POST' })
      toast.success('Package reopened')
      qc.invalidateQueries({ queryKey: ['packing', packingId] })
    } catch (e) { toast.error(e.message) }
  }

  const updatePackageDims = async () => {
    try {
      await api(`/packing/${packingId}/packages/${editPkgId}`, {
        method: 'PUT',
        body: {
          weight: pkgDims.weight || undefined,
          length: pkgDims.length || undefined,
          width: pkgDims.width || undefined,
          height: pkgDims.height || undefined,
        },
      })
      toast.success('Package updated')
      setEditPkgId(null)
      qc.invalidateQueries({ queryKey: ['packing', packingId] })
    } catch (e) { toast.error(e.message) }
  }

  // -------------------------------------------------------------------------
  // Barcode scan handler
  // -------------------------------------------------------------------------
  const handleScan = useCallback(async (code) => {
    if (step === SCAN_STEP.IDLE) {
      toast.error('Select or create a package first')
      return { ok: false, message: 'No package selected' }
    }

    // --- STEP: Scan Item ---
    if (step === SCAN_STEP.ITEM) {
      const line = order.pickingOrder.lines.find(
        (l) => l.item.id === code || l.item.sku === code || l.item.barcode === code
      )
      if (!line) {
        toast.error('Item not in this packing order: ' + code)
        return { ok: false, message: 'Item not in order' }
      }

      const packedMap = computePackedByItem(order.packages)
      const totalPicked = line.tasks.reduce((s, t) => s + Number(t.qtyPicked || 0), 0)
      const alreadyPacked = packedMap[line.item.id] || 0
      const remaining = totalPicked - alreadyPacked

      if (remaining <= 0) {
        toast.error('All units of ' + line.item.sku + ' already packed')
        return { ok: false, message: 'Already packed' }
      }

      setScannedItem({
        item: line.item,
        line,
        remaining,
        pendingQty: remaining,
        pendingSerials: [],
      })

      if (line.item.serialTracked) {
        setStep(SCAN_STEP.SERIAL)
      } else {
        setStep(SCAN_STEP.QTY)
      }
      return { ok: true, message: line.item.sku + ' — ' + remaining + ' remaining' }
    }

    // --- STEP: Scan Serial ---
    if (step === SCAN_STEP.SERIAL && scannedItem) {
      const allSerials = scannedItem.line.tasks.flatMap((t) => t.serials || [])
      const match = allSerials.find((s) => s.serialNo === code)
      if (!match) {
        toast.error('Serial not picked for this item: ' + code)
        return { ok: false, message: 'Serial not picked' }
      }
      // Check not already in any package
      const alreadyInAny = order.packages.some((p) =>
        p.serials?.some((s) => s.serialNo === code)
      )
      if (alreadyInAny) {
        toast.error('Serial already packed: ' + code)
        return { ok: false, message: 'Serial already packed' }
      }
      const next = [...scannedItem.pendingSerials, code]
      setScannedItem((prev) => ({ ...prev, pendingSerials: next }))

      if (next.length === scannedItem.pendingQty) {
        setStep(SCAN_STEP.CONFIRM)
        return { ok: true, message: 'All ' + next.length + ' serials scanned' }
      }
      return { ok: true, message: `Serial ${next.length}/${scannedItem.pendingQty}: ${code}` }
    }

    return { ok: false, message: 'Unexpected scan state' }
  }, [step, order, scannedItem])

  // Qty change
  const setQty = (val) => {
    if (!scannedItem) return
    const v = Math.max(1, Math.min(Number(val) || 1, scannedItem.remaining))
    setScannedItem((prev) => ({ ...prev, pendingQty: v }))
  }

  // Confirm scan
  const confirmScan = async () => {
    if (!activePkgId) {
      toast.error('No active package selected')
      return
    }
    try {
      await api(`/packing/${packingId}/packages/${activePkgId}/scan`, {
        method: 'POST',
        body: {
          scannedItemCode: scannedItem.item.id,
          qty: scannedItem.pendingQty,
          serials: scannedItem.pendingSerials,
        },
      })
      toast.success(
        'Added ' + scannedItem.pendingQty + ' × ' + scannedItem.item.sku +
        (scannedItem.pendingSerials.length ? ' (' + scannedItem.pendingSerials.length + ' serials)' : '')
      )
      setScannedItem(null)
      setStep(SCAN_STEP.ITEM)
      qc.invalidateQueries({ queryKey: ['packing', packingId] })
    } catch (e) { toast.error(e.message) }
  }

  // Cancel current scan
  const cancelScan = () => {
    setScannedItem(null)
    setStep(activePkgId ? SCAN_STEP.ITEM : SCAN_STEP.IDLE)
  }

  if (isLoading) {
    return (
      <AppShell title="Packing" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-60 w-full" /></div>
      </AppShell>
    )
  }

  if (!order) {
    return (
      <AppShell title="Packing" subtitle="Not found">
        <div className="flex flex-col items-center gap-3 py-16">
          <AlertCircle className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">Packing order not found</p>
          <Button asChild variant="outline" size="sm"><Link href="/packing"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button>
        </div>
      </AppShell>
    )
  }

  const statusMeta = ORDER_STATUS_META[order.status] || { label: order.status, class: 'bg-gray-100 text-gray-700' }
  const packages = order.packages || []
  const lines = order.pickingOrder?.lines || []
  const packedMap = computePackedByItem(packages)
  const packedSerialsMap = computePackedSerialsByItem(packages)
  const activePkg = packages.find((p) => p.id === activePkgId)
  const canStart = order.status === 'QUEUE'
  const canCreatePkg = order.status === 'IN_PROGRESS'
  const canComplete = order.status === 'IN_PROGRESS'
  const isInProgress = order.status === 'IN_PROGRESS'
  const openPkgCount = packages.filter((p) => p.status === 'OPEN').length

  return (
    <AppShell
      title={"Packing: " + order.packingNumber}
      subtitle={order.pickingOrder ? 'From: ' + order.pickingOrder.pickingNumber : null}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8"><Link href="/packing"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back</Link></Button>
          {canStart && <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={startPacking}><Play className="mr-1 h-3.5 w-3.5" /> Start</Button>}
          {canComplete && <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={completePacking}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete</Button>}
        </div>
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left: Packages + Items */}
        <div className="min-w-0 flex-1 space-y-4">

          {/* Status bar */}
          <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <Badge variant="outline" className={`${statusMeta.class} text-[11px]`}>{statusMeta.label}</Badge>
            {order.pickingOrder && <span className="text-xs text-gray-500">From: {order.pickingOrder.pickingNumber}</span>}
            {order.startedAt && <span className="text-xs text-gray-400">Started {formatDistanceToNow(new Date(order.startedAt), { addSuffix: true })}</span>}
            {order.completedAt && <span className="text-xs text-green-600">Completed {formatDistanceToNow(new Date(order.completedAt), { addSuffix: true })}</span>}
          </div>

          {/* Packages */}
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-sm font-medium">Packages ({packages.length})</span>
              {canCreatePkg && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={createPackage}>
                  <Plus className="mr-1 h-3 w-3" /> New Package
                </Button>
              )}
            </div>

            {packages.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Package className="h-6 w-6 text-gray-300" />
                <p className="text-xs text-gray-400">No packages yet. Create one to start packing.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {packages.map((pkg) => {
                  const pkgMeta = PKG_STATUS_META[pkg.status] || PKG_STATUS_META.OPEN
                  const Icon = pkgMeta.Icon
                  const isActive = pkg.id === activePkgId
                  const isClosed = pkg.status === 'CLOSED'
                  return (
                    <div
                      key={pkg.id}
                      onClick={() => !isClosed && isInProgress && selectPackage(pkg.id)}
                      className={`px-4 py-3 ${!isClosed && isInProgress ? 'cursor-pointer hover:bg-gray-50' : ''} ${isActive ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-gray-400" />
                          <span className="font-mono text-xs font-medium">{pkg.packageNumber}</span>
                          <Badge variant="outline" className={`${pkgMeta.class} text-[10px]`}>{pkgMeta.label}</Badge>
                          {isActive && <span className="text-[10px] text-blue-600 font-medium">✓ active</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {!isClosed && (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); setEditPkgId(pkg.id); setPkgDims({ weight: pkg.weight || '', length: pkg.length || '', width: pkg.width || '', height: pkg.height || '' }) }}>
                                <Ruler className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700" onClick={(e) => { e.stopPropagation(); closePackage(pkg.id) }}>
                                <Lock className="h-3 w-3" /> Close
                              </Button>
                            </>
                          )}
                          {isClosed && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-amber-600 hover:text-amber-700" onClick={(e) => { e.stopPropagation(); reopenPackage(pkg.id) }}>
                              <Unlock className="h-3 w-3" /> Reopen
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Edit dims */}
                      {editPkgId === pkg.id && (
                        <div className="mt-2 grid grid-cols-4 gap-2 rounded bg-gray-50 p-2" onClick={(e) => e.stopPropagation()}>
                          <div><label className="text-[10px] text-gray-500">Weight (kg)</label><Input className="h-7 text-xs" value={pkgDims.weight} onChange={(e) => setPkgDims((p) => ({ ...p, weight: e.target.value }))} placeholder="0" /></div>
                          <div><label className="text-[10px] text-gray-500">L (cm)</label><Input className="h-7 text-xs" value={pkgDims.length} onChange={(e) => setPkgDims((p) => ({ ...p, length: e.target.value }))} placeholder="0" /></div>
                          <div><label className="text-[10px] text-gray-500">W (cm)</label><Input className="h-7 text-xs" value={pkgDims.width} onChange={(e) => setPkgDims((p) => ({ ...p, width: e.target.value }))} placeholder="0" /></div>
                          <div><label className="text-[10px] text-gray-500">H (cm)</label><Input className="h-7 text-xs" value={pkgDims.height} onChange={(e) => setPkgDims((p) => ({ ...p, height: e.target.value }))} placeholder="0" /></div>
                          <div className="col-span-4 flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditPkgId(null)}>Cancel</Button>
                            <Button size="sm" className="h-6 text-[10px]" onClick={updatePackageDims}>Save</Button>
                          </div>
                          {pkg.volume && <div className="col-span-4 text-[10px] text-gray-400">Volume: {pkg.volume} cm³</div>}
                        </div>
                      )}

                      {/* Items in package */}
                      {pkg.items.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {pkg.items.map((pi) => (
                            <div key={pi.id} className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-600">{pi.item.sku}</span>
                              <span className="tabular-nums font-medium">{pi.qty}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Dims summary */}
                      {(pkg.weight || pkg.length || pkg.width || pkg.height || pkg.volume) && (
                        <div className="mt-1 flex gap-3 text-[10px] text-gray-400">
                          {pkg.weight && <span><Scale className="inline h-3 w-3 mr-0.5" />{pkg.weight} kg</span>}
                          {pkg.length && pkg.width && pkg.height && <span>{pkg.length}×{pkg.width}×{pkg.height} cm</span>}
                          {pkg.volume && <span>{pkg.volume.toFixed(0)} cm³</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Items to pack */}
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <span className="text-sm font-medium">Items to Pack</span>
            </div>
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-left text-[11px] text-gray-500">
                <tr>
                  <th className="px-4 py-1.5 font-medium">SKU</th>
                  <th className="px-4 py-1.5 font-medium text-right">Picked</th>
                  <th className="px-4 py-1.5 font-medium text-right">Packed</th>
                  <th className="px-4 py-1.5 font-medium text-right">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((line) => {
                  const totalPicked = line.tasks.reduce((s, t) => s + Number(t.qtyPicked || 0), 0)
                  const packed = packedMap[line.item.id] || 0
                  const packedSerials = packedSerialsMap[line.item.id] || 0
                  const remaining = totalPicked - packed
                  const done = remaining <= 0
                  return (
                    <tr key={line.id} className={done ? 'opacity-50' : ''}>
                      <td className="px-4 py-1.5">
                        <span className="font-mono text-xs">{line.item.sku}</span>
                        {line.item.serialTracked && <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] text-blue-600">S/N</span>}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{totalPicked}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-green-600">{packed}{line.item.serialTracked && packedSerials > 0 ? ` (${packedSerials})` : ''}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {done
                          ? <span className="text-green-600">✓ Done</span>
                          : <span className="text-amber-600">{remaining}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Scan panel */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <div className={`rounded-md border p-4 shadow-sm ${isInProgress && activePkgId ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="mb-3 text-sm font-medium text-blue-900">
              {isInProgress && activePkgId
                ? <>Scan — <span className="font-mono">{activePkg?.packageNumber}</span></>
                : 'Scan Panel'}
            </div>

            {/* No active package */}
            {!isInProgress && (
              <div className="text-[11px] text-gray-500">
                {order.status === 'QUEUE' ? 'Start packing to begin scanning.' : 'Packing is not in progress.'}
              </div>
            )}

            {isInProgress && !activePkgId && openPkgCount === 0 && (
              <div className="space-y-2">
                <div className="text-[11px] text-blue-700">No active package. Create one to start packing.</div>
              </div>
            )}

            {isInProgress && !activePkgId && openPkgCount > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] text-blue-700">Select an open package to continue.</div>
                <div className="space-y-1">
                  {packages.filter((p) => p.status === 'OPEN').map((pkg) => (
                    <Button key={pkg.id} size="sm" variant="outline" className="w-full justify-start text-xs font-mono" onClick={() => selectPackage(pkg.id)}>
                      <Package className="mr-1 h-3 w-3" />{pkg.packageNumber}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP: Scan Item */}
            {step === SCAN_STEP.ITEM && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-blue-700 font-medium">1. Scan Item Barcode</span>
                  {activePkg && (
                    <button onClick={cancelScan} className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                      <X className="h-3 w-3" /> Cancel
                    </button>
                  )}
                </div>
                <BarcodeInput
                  onScan={handleScan}
                  placeholder="Scan or type item barcode..."
                  disabled={!isInProgress || !activePkgId}
                  size="lg"
                />
              </div>
            )}

            {/* STEP: Scan Serial(s) */}
            {step === SCAN_STEP.SERIAL && scannedItem && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-blue-700 font-medium">
                    2. Scan {scannedItem.pendingQty - scannedItem.pendingSerials.length} serial(s) for {scannedItem.item.sku}
                  </span>
                  <button onClick={cancelScan} className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-0.5">
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
                <BarcodeInput
                  onScan={handleScan}
                  placeholder={`Serial ${scannedItem.pendingSerials.length + 1}...`}
                  disabled={!isInProgress}
                  size="lg"
                  label="Serial Number"
                />
                <div className="space-y-0.5">
                  {scannedItem.pendingSerials.map((s) => (
                    <div key={s} className="flex items-center gap-1 text-[10px] font-mono text-gray-600 bg-white rounded px-2 py-0.5">
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />{s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP: Qty (non-serial) */}
            {step === SCAN_STEP.QTY && scannedItem && (
              <div className="space-y-2">
                <div className="text-[11px] text-blue-700 font-medium">
                  2. Confirm quantity for {scannedItem.item.sku}
                </div>
                <div className="text-[11px] text-gray-500">
                  Remaining: <span className="font-mono font-medium text-gray-700">{scannedItem.remaining}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="h-10 text-sm font-mono"
                    value={scannedItem.pendingQty}
                    onChange={(e) => setQty(e.target.value)}
                    min={1}
                    max={scannedItem.remaining}
                  />
                  <Button size="sm" className="h-10" onClick={() => setStep(SCAN_STEP.CONFIRM)}>Next →</Button>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={cancelScan}>Cancel</Button>
              </div>
            )}

            {/* STEP: Confirm */}
            {step === SCAN_STEP.CONFIRM && scannedItem && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-blue-900">3. Confirm</div>
                <div className="rounded bg-white p-2 space-y-1">
                  <div className="flex justify-between text-[12px]">
                    <span className="font-medium">{scannedItem.item.sku}</span>
                    <span className="font-mono font-medium">×{scannedItem.pendingQty}</span>
                  </div>
                  {scannedItem.pendingSerials.length > 0 && (
                    <div className="space-y-0.5 text-[10px] text-gray-500 font-mono">
                      {scannedItem.pendingSerials.map((s) => <div key={s}>{s}</div>)}
                    </div>
                  )}
                </div>
                <Button className="w-full" size="sm" onClick={confirmScan}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Confirm
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={cancelScan}>Cancel</Button>
              </div>
            )}
          </div>

          {/* Active package quick-view */}
          {activePkg && (
            <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-medium">{activePkg.packageNumber}</span>
                <Badge variant="outline" className={`${PKG_STATUS_META[activePkg.status]?.class} text-[10px]`}>
                  {PKG_STATUS_META[activePkg.status]?.label}
                </Badge>
              </div>
              {activePkg.items.length > 0 ? (
                <div className="space-y-1">
                  {activePkg.items.map((pi) => (
                    <div key={pi.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-600">{pi.item.sku}</span>
                      <span className="tabular-nums font-medium">{pi.qty}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-gray-400">Scan items to add.</div>
              )}
            </div>
          )}

          {/* Serial-tracked info */}
          {scannedItem?.item.serialTracked && (
            <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-[11px] text-blue-700">
              <div className="font-medium">Serial-tracked item</div>
              <div>Scan each serial individually. All serials must be scanned before confirming.</div>
            </div>
          )}

          {/* Package reminder */}
          {isInProgress && openPkgCount > 0 && !activePkgId && (
            <div className="rounded-md border border-amber-100 bg-amber-50 p-3 text-[11px] text-amber-700">
              <div className="font-medium">Select a package</div>
              <div>Click an open package above or create a new one.</div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
