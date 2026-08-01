'use client'

import { useState, useCallback } from 'react'
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
  Ship, ArrowLeft, AlertCircle, Package, CheckCircle2, X,
  Eye, Lock, RefreshCw, RotateCcw, Check,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const SHIPMENT_STATUS_META = {
  QUEUE:       { label: 'Queue',        class: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress',  class: 'bg-amber-50 text-amber-700 border-amber-200' },
  READY:       { label: 'Ready',         class: 'bg-purple-50 text-purple-700 border-purple-200' },
  COMPLETED:   { label: 'Completed',     class: 'bg-green-50 text-green-700 border-green-200' },
  FAILED:     { label: 'Failed',        class: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED:   { label: 'Cancelled',     class: 'bg-gray-50 text-gray-700 border-gray-200' },
}

const PKG_STATUS_META = {
  PENDING:   { label: 'Pending',   class: 'bg-gray-100 text-gray-600', icon: Package },
  VERIFIED:  { label: 'Verified',  class: 'bg-blue-50 text-blue-700', icon: Check },
  CONFIRMED: { label: 'Locked',    class: 'bg-green-50 text-green-700', icon: Lock },
  FAILED:    { label: 'Failed',    class: 'bg-red-50 text-red-700', icon: X },
}

function PreviewDialog({ shipmentId, onClose }) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadPreview = async () => {
    setLoading(true)
    try {
      const data = await api('/shipping/' + shipmentId + '/preview', { method: 'POST' })
      setPreview(data)
    } catch (e) {
      toast.error(e.message || 'Failed to load preview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-medium">Shipment Preview</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {!preview && !loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Eye className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">Click below to preview FIFO impact and ledger entries.</p>
              <Button size="sm" onClick={loadPreview} className="bg-blue-600 hover:bg-blue-700">
                <Eye className="mr-1 h-3.5 w-3.5" /> Load Preview
              </Button>
            </div>
          )}
          {loading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>}
          {preview && (
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-xs font-medium text-gray-500">Packages ({preview.packages.length})</h4>
                {preview.packages.map((pkg) => (
                  <div key={pkg.shipmentPackageId} className="mb-3 rounded border border-gray-100 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-mono text-xs font-medium">{pkg.packageNumber}</span>
                      <Badge variant="outline" className={`${PKG_STATUS_META[pkg.status]?.class || ''} text-[10px]`}>
                        {PKG_STATUS_META[pkg.status]?.label || pkg.status}
                      </Badge>
                    </div>
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium text-gray-500">Item</th>
                          <th className="px-2 py-1 text-right font-medium text-gray-500">Qty</th>
                          <th className="px-2 py-1 text-right font-medium text-gray-500">FIFO Layers</th>
                          <th className="px-2 py-1 text-right font-medium text-gray-500">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {pkg.items.map((item) => (
                          <tr key={item.itemId}>
                            <td className="px-2 py-1">
                              <span className="font-mono">{item.sku}</span>
                              <span className="ml-1 text-gray-400">{item.name}</span>
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">{item.qty}</td>
                            <td className="px-2 py-1 text-right tabular-nums text-gray-500">
                              {item.fifoLayers.length} layer(s)
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {item.avgUnitCost > 0 ? '$' + item.avgUnitCost.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium text-gray-500">Stock Ledger Preview (SHIP_OUT)</h4>
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-500">SKU</th>
                      <th className="px-3 py-1.5 text-right font-medium text-gray-500">Qty</th>
                      <th className="px-3 py-1.5 text-right font-medium text-gray-500">Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.ledgerPreview.map((entry, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono">{entry.sku}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{entry.qty}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {entry.unitCost > 0 ? '$' + entry.unitCost.toFixed(2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-gray-200 px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default function ShippingDetailPage({ params }) {
  const shipmentId = params.id
  const qc = useQueryClient()

  const [showPreview, setShowPreview] = useState(false)
  const [scanInput, setScanInput] = useState('')
  const [verifyingPkgId, setVerifyingPkgId] = useState(null)

  const { data: shipment, isLoading } = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: () => api('/shipping/' + shipmentId),
    refetchInterval: 3000,
  })

  const startShipment = async () => {
    try {
      await api('/shipping/' + shipmentId + '/start', { method: 'POST' })
      toast.success('Shipment started')
      qc.invalidateQueries({ queryKey: ['shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
    } catch (e) { toast.error(e.message) }
  }

  const confirmShipment = async () => {
    if (!confirm('Confirm this shipment? FIFO will be consumed and inventory will be reduced. This cannot be undone.')) return
    try {
      const res = await api('/shipping/' + shipmentId + '/confirm', { method: 'POST' })
      toast.success('Shipment confirmed: ' + res.shipmentNumber)
      qc.invalidateQueries({ queryKey: ['shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
    } catch (e) { toast.error(e.message) }
  }

  const retryShipment = async () => {
    try {
      const res = await api('/shipping/' + shipmentId + '/retry', { method: 'POST' })
      toast.success('Shipment reset to READY: ' + res.shipmentNumber)
      qc.invalidateQueries({ queryKey: ['shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
    } catch (e) { toast.error(e.message) }
  }

  const cancelShipment = async () => {
    const reason = prompt('Reason for cancellation:')
    if (reason === null) return
    try {
      await api('/shipping/' + shipmentId + '/cancel', {
        method: 'POST',
        body: { reason: reason || '' },
      })
      toast.success('Shipment cancelled')
      qc.invalidateQueries({ queryKey: ['shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
    } catch (e) { toast.error(e.message) }
  }

  const handleScan = useCallback(async (code) => {
    if (!shipment) return { ok: false, message: 'Loading...' }
    if (shipment.status !== 'IN_PROGRESS') {
      return { ok: false, message: 'Shipment is not in progress' }
    }
    try {
      const res = await api('/shipping/' + shipmentId + '/packages/' + encodeURIComponent(code) + '/scan', {
        method: 'POST',
        body: { packageNumber: code },
      })
      toast.success('Package scanned: ' + (res.packages?.find(p => !res.packages?.find(rp => rp.id !== p.id))?.packageNumber || code))
      qc.invalidateQueries({ queryKey: ['shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
      return { ok: true, message: 'Package added' }
    } catch (e) {
      toast.error(e.message || 'Failed to scan package')
      return { ok: false, message: e.message }
    }
  }, [shipment, shipmentId, qc])

  const verifyPackage = async (pkgId) => {
    setVerifyingPkgId(pkgId)
    try {
      const res = await api('/shipping/' + shipmentId + '/packages/' + pkgId + '/verify', {
        method: 'POST',
        body: { packageId: pkgId },
      })
      toast.success('Package verified')
      qc.invalidateQueries({ queryKey: ['shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
    } catch (e) { toast.error(e.message) }
    setVerifyingPkgId(null)
  }

  if (isLoading) {
    return (
      <AppShell title="Shipping" subtitle="Loading...">
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-60 w-full" /></div>
      </AppShell>
    )
  }

  if (!shipment) {
    return (
      <AppShell title="Shipping" subtitle="Not found">
        <div className="flex flex-col items-center gap-3 py-16">
          <AlertCircle className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">Shipment not found</p>
          <Button asChild variant="outline" size="sm"><Link href="/shipping"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button>
        </div>
      </AppShell>
    )
  }

  const statusMeta = SHIPMENT_STATUS_META[shipment.status] || { label: shipment.status, class: 'bg-gray-100 text-gray-700' }
  const packages = shipment.packages || []
  const packingOrder = shipment.packingOrder

  const canStart = shipment.status === 'QUEUE'
  const canScan = shipment.status === 'IN_PROGRESS'
  const canConfirm = shipment.status === 'READY'
  const canRetry = shipment.status === 'FAILED'
  const canCancel = ['QUEUE', 'IN_PROGRESS', 'READY'].includes(shipment.status)
  const isCompleted = shipment.status === 'COMPLETED'
  const isLocked = isCompleted || shipment.status === 'CANCELLED'

  return (
    <AppShell
      title={"Shipping: " + shipment.shipmentNumber}
      subtitle={packingOrder ? 'From: ' + packingOrder.packingNumber : null}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/shipping"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back</Link>
          </Button>
          {canStart && <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={startShipment}>
            <Ship className="mr-1 h-3.5 w-3.5" /> Start
          </Button>}
          {canScan && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setShowPreview(true)}>
              <Eye className="mr-1 h-3.5 w-3.5" /> Preview
            </Button>
          )}
          {canConfirm && <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={confirmShipment}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirm Shipment
          </Button>}
          {canRetry && <Button size="sm" variant="outline" className="h-8" onClick={retryShipment}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>}
          {canCancel && <Button size="sm" variant="outline" className="h-8 border-red-200 text-red-600 hover:bg-red-50" onClick={cancelShipment}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>}
        </div>
      }
    >
      {/* Preview dialog */}
      {showPreview && (
        <PreviewDialog
          shipmentId={shipmentId}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left: Packages + Source info */}
        <div className="min-w-0 flex-1 space-y-4">

          {/* Status bar */}
          <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <Badge variant="outline" className={`${statusMeta.class} text-[11px]`}>{statusMeta.label}</Badge>
            {packingOrder && <span className="text-xs text-gray-500">From: {packingOrder.packingNumber}</span>}
            {shipment.startedAt && <span className="text-xs text-gray-400">Started {formatDistanceToNow(new Date(shipment.startedAt), { addSuffix: true })}</span>}
            {shipment.shippedAt && <span className="text-xs text-green-600">Shipped {formatDistanceToNow(new Date(shipment.shippedAt), { addSuffix: true })}</span>}
          </div>

          {/* Packages in shipment */}
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-sm font-medium">Packages ({packages.length})</span>
              {isCompleted && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                  <Lock className="mr-1 h-3 w-3" /> Locked
                </Badge>
              )}
            </div>

            {packages.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Package className="h-6 w-6 text-gray-300" />
                <p className="text-xs text-gray-400">No packages scanned yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {packages.map((sp) => {
                  const meta = PKG_STATUS_META[sp.status] || PKG_STATUS_META.PENDING
                  const Icon = meta.icon
                  return (
                    <div key={sp.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-gray-400" />
                          <span className="font-mono text-xs font-medium">{sp.packageId?.slice(0, 8)}...</span>
                          <Badge variant="outline" className={`${meta.class} text-[10px]`}>{meta.label}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {sp.verifiedAt && (
                            <span className="text-[10px] text-gray-400">
                              Verified {formatDistanceToNow(new Date(sp.verifiedAt), { addSuffix: true })}
                            </span>
                          )}
                          {sp.verifiedBy && (
                            <span className="text-[10px] text-gray-500">{sp.verifiedBy.name}</span>
                          )}
                          {canScan && sp.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] text-blue-600 hover:bg-blue-50"
                              onClick={() => verifyPackage(sp.packageId)}
                              disabled={verifyingPkgId === sp.packageId}
                            >
                              {verifyingPkgId === sp.packageId ? 'Verifying...' : 'Verify'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Source packing order summary */}
          {packingOrder && (
            <div className="rounded-md border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-4 py-3">
                <span className="text-sm font-medium">Source Packing Order</span>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Packing #</span>
                    <div className="font-mono font-medium">{packingOrder.packingNumber}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Picking #</span>
                    <div className="font-mono font-medium">{packingOrder.pickingOrder?.pickingNumber || '—'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Packages</span>
                    <div className="font-medium">{packages.length}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Status</span>
                    <div className="font-medium">{statusMeta.label}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Scan panel */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <div className={`rounded-md border p-4 shadow-sm ${canScan ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="mb-3 text-sm font-medium text-amber-900">
              {canScan ? 'Scan Package Barcode' : 'Scan Panel'}
            </div>

            {!canScan && (
              <div className="text-[11px] text-gray-500">
                {isCompleted
                  ? 'Shipment is completed. Packages are locked.'
                  : shipment.status === 'QUEUE'
                  ? 'Start the shipment to begin scanning packages.'
                  : shipment.status === 'READY'
                  ? 'All packages verified. Ready to confirm.'
                  : shipment.status === 'FAILED'
                  ? 'Shipment failed. Use Retry to reset.'
                  : 'Scan panel inactive.'}
              </div>
            )}

            {canScan && (
              <div className="space-y-3">
                <div className="text-[11px] text-amber-700">
                  Scan or type the package barcode to add it to this shipment.
                </div>
                <BarcodeInput
                  onScan={handleScan}
                  placeholder="Scan package barcode..."
                  disabled={!canScan}
                  size="lg"
                />
                <div className="rounded border border-amber-200 bg-amber-100/50 px-3 py-2 text-[10px] text-amber-800">
                  <strong>Validation:</strong> Package must be CLOSED, match warehouse, and not already shipped.
                </div>
                {packages.length > 0 && (
                  <div className="text-[11px] text-amber-700">
                    {packages.filter(p => p.status === 'PENDING').length} package(s) pending verification
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action summary */}
          {(canConfirm || canRetry || isCompleted) && (
            <div className={`rounded-md border p-4 shadow-sm ${canConfirm ? 'border-purple-200 bg-purple-50' : isCompleted ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="mb-2 text-sm font-medium">
                {isCompleted ? 'Shipment Completed' : canConfirm ? 'Ready to Ship' : 'Action Required'}
              </div>
              <div className="space-y-1 text-[11px]">
                {packages.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Packages</span>
                    <span className="font-medium">{packages.length}</span>
                  </div>
                )}
                {packages.filter(p => p.status === 'VERIFIED' || p.status === 'CONFIRMED').length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Verified</span>
                    <span className="font-medium text-blue-600">
                      {packages.filter(p => p.status === 'VERIFIED' || p.status === 'CONFIRMED').length}
                    </span>
                  </div>
                )}
                {packages.filter(p => p.status === 'PENDING').length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pending</span>
                    <span className="font-medium text-amber-600">
                      {packages.filter(p => p.status === 'PENDING').length}
                    </span>
                  </div>
                )}
              </div>
              {canConfirm && (
                <div className="mt-3 text-[11px] text-purple-700">
                  All packages verified. Click <strong>Confirm Shipment</strong> to execute.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
