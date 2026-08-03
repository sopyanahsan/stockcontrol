'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import HelpButton from '@/components/help/HelpButton'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SlidersHorizontal, Plus, ArrowRight, Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const STATUS_META = {
  DRAFT:      { label: 'Draft',      class: 'bg-gray-100 text-gray-700 border-gray-200' },
  COMPLETED:  { label: 'Completed',  class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:  { label: 'Cancelled',  class: 'bg-red-100 text-red-700 border-red-200' },
}

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [lines, setLines] = useState([{ itemId: '', locationId: '', qty: '', systemQty: '', unitCost: '' }])
  const [reasonCodeId, setReasonCodeId] = useState('')
  const [remarks, setRemarks] = useState('')

  const { data: listData, isLoading } = useQuery({
    queryKey: ['adjustments-list', status],
    queryFn: () => api(`/adjustments${status !== 'ALL' ? `?status=${status}` : ''}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const adjReasonCodes = meta?.reasonCodes?.filter((r) => r.type === 'ADJUSTMENT' && r.isActive) || []
  const flatLocations = meta?.warehouses?.flatMap((wh) =>
    wh.zones?.flatMap((z) => z.locations || []) || []
  ) || []

  const createMut = useMutation({
    mutationFn: (payload) => api('/adjustments', { method: 'POST', body: payload }),
    onSuccess: (adj) => {
      toast.success(`Adjustment ${adj.adjustmentNumber} created`)
      setCreateOpen(false)
      setLines([{ itemId: '', locationId: '', qty: '', systemQty: '', unitCost: '' }])
      setReasonCodeId('')
      setRemarks('')
      qc.invalidateQueries({ queryKey: ['adjustments-list'] })
      router.push(`/adjustment/${adj.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const addLine = () => setLines((p) => [...p, { itemId: '', locationId: '', qty: '', systemQty: '', unitCost: '' }])
  const removeLine = (i) => setLines((p) => p.filter((_, idx) => idx !== i))
  const updateLine = (i, field, value) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const handleCreate = () => {
    if (!reasonCodeId) { toast.error('Reason code is required'); return }
    const validLines = lines.filter((l) => l.itemId && l.locationId && l.qty && Number(l.qty) !== 0)
    if (validLines.length === 0) { toast.error('At least one line with qty ≠ 0 is required'); return }
    createMut.mutate({ lines: validLines, reasonCodeId, remarks: remarks || undefined })
  }

  const openCreateDialog = () => {
    // Refetch master data so new Items / Locations / Reason Codes appear in
    // the dropdowns every time the dialog is opened.
    qc.invalidateQueries({ queryKey: ['meta'] })
    setCreateOpen(true)
  }

  return (
    <AppShell
      title="Stock Adjustment"
      subtitle="Record inventory corrections — increases and decreases"
      actions={
        <>
          <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={openCreateDialog}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Adjustment
          </Button>
          <HelpButton pageId="adjustment" />
        </>
      }
    >
      <div className="space-y-4">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="DRAFT">Draft</TabsTrigger>
            <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
            <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !listData?.data?.length ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <SlidersHorizontal className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No adjustments found</div>
              <div className="text-xs text-gray-400">
                {status === 'ALL'
                  ? 'Create a new adjustment to record inventory corrections.'
                  : 'No adjustments with this status.'}
              </div>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Doc #</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 font-medium">Lines</th>
                  <th className="px-4 py-2 text-right font-medium">Net Qty</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {listData.data.map((adj) => {
                  const sm = STATUS_META[adj.status] || { label: adj.status, class: 'bg-gray-100 text-gray-700' }
                  const netQty = adj.lines?.reduce((s, l) => s + Number(l.qty || 0), 0) || 0
                  const hasIn = adj.lines?.some((l) => Number(l.qty) > 0)
                  const hasOut = adj.lines?.some((l) => Number(l.qty) < 0)
                  return (
                    <tr key={adj.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link href={`/adjustment/${adj.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {adj.adjustmentNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {adj.reasonCode?.code || '-'}
                        {adj.reasonCode?.description && (
                          <span className="ml-1 text-gray-400">({adj.reasonCode.description})</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {adj.lines?.length || 0} line(s)
                        {hasIn && <TrendingUp className="ml-1 inline h-3 w-3 text-green-500" />}
                        {hasOut && <TrendingDown className="ml-0.5 inline h-3 w-3 text-red-500" />}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs">
                        <span className={netQty >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {netQty >= 0 ? '+' : ''}{fmt(netQty)}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`text-[10px] ${sm.class}`}>{sm.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDistanceToNow(new Date(adj.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/adjustment/${adj.id}`}>
                            {adj.status === 'DRAFT' ? 'Edit' : 'View'} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        if (!open) { setCreateOpen(false); setLines([{ itemId: '', locationId: '', qty: '', systemQty: '', unitCost: '' }]); setReasonCodeId(''); setRemarks('') }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Stock Adjustment</DialogTitle>
            <DialogDescription>
              Record a positive qty for increase (IN) or negative for decrease (OUT).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="adj-reason" className="text-xs text-gray-600">Reason Code *</Label>
              <Select value={reasonCodeId} onValueChange={setReasonCodeId}>
                <SelectTrigger id="adj-reason" className="h-9 text-sm">
                  <SelectValue placeholder="Select a reason code..." />
                </SelectTrigger>
                <SelectContent>
                  {adjReasonCodes.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.code} — {r.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-remarks" className="text-xs text-gray-600">Remarks</Label>
              <Input id="adj-remarks" placeholder="Optional notes..." value={remarks} onChange={(e) => setRemarks(e.target.value)} className="text-sm" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600">Line Items</Label>
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={addLine}>
                  <Plus className="mr-1 h-3 w-3" /> Add Line
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                <div>Item</div>
                <div>Location</div>
                <div>System Qty</div>
                <div>Adj Qty (+/-)</div>
                <div className="text-right">
                  <div>Unit Cost</div>
                  <div className="normal-case font-normal text-gray-400">(IN only)</div>
                </div>
              </div>

              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-5 gap-2">
                  <Select value={line.itemId} onValueChange={(v) => updateLine(i, 'itemId', v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Item" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta?.items?.map((it) => (
                        <SelectItem key={it.id} value={it.id} className="text-xs">{it.sku}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={line.locationId} onValueChange={(v) => updateLine(i, 'locationId', v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      {flatLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input type="number" min="0" placeholder="0" value={line.systemQty}
                    onChange={(e) => updateLine(i, 'systemQty', e.target.value)}
                    className="h-8 text-xs tabular-nums text-right" />

                  <Input type="number" placeholder="+5 or -3" value={line.qty}
                    onChange={(e) => updateLine(i, 'qty', e.target.value)}
                    className="h-8 text-xs tabular-nums text-right" />

                  <div className="flex items-center gap-1">
                    <Input type="number" min="0" step="0.0001" placeholder="0.00" value={line.unitCost}
                      onChange={(e) => updateLine(i, 'unitCost', e.target.value)}
                      className="h-8 text-xs tabular-nums text-right" />
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeLine(i)}>×</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreate}
              disabled={createMut.isPending || !reasonCodeId}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
