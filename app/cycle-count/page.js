'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ClipboardList, Plus, ArrowRight, Loader2, CheckCircle2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const STATUS_META = {
  DRAFT:        { label: 'Draft',        class: 'bg-gray-100 text-gray-700 border-gray-200' },
  ASSIGNED:      { label: 'Assigned',       class: 'bg-blue-100 text-blue-700 border-blue-200' },
  IN_PROGRESS:  { label: 'In Progress',   class: 'bg-amber-100 text-amber-700 border-amber-200' },
  SUBMITTED:     { label: 'Submitted',      class: 'bg-purple-100 text-purple-700 border-purple-200' },
  APPROVED:      { label: 'Approved',       class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:     { label: 'Cancelled',      class: 'bg-red-100 text-red-700 border-red-200' },
}

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [populatedLines, setPopulatedLines] = useState([])
  const [extraLines, setExtraLines] = useState([])
  const [warehouseId, setWarehouseId] = useState('')

  const { data: listData, isLoading } = useQuery({
    queryKey: ['cycle-counts-list', status],
    queryFn: () => api(`/cycle-count${status !== 'ALL' ? `?status=${status}` : ''}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const flatLocations = meta?.warehouses?.flatMap((wh) =>
    wh.zones?.flatMap((z) => z.locations || []) || []
  ) || []

  const loadItems = async (locId) => {
    if (!locId) { setPopulatedLines([]); return }
    try {
      const items = await api(`/cycle-count/items?locationId=${locId}`)
      setPopulatedLines(items || [])
    } catch {
      setPopulatedLines([])
    }
  }

  const addExtraLine = () => setExtraLines((p) => [...p, { itemId: '', systemQty: '' }])
  const removeExtraLine = (i) => setExtraLines((p) => p.filter((_, idx) => idx !== i))
  const updateExtraLine = (i, field, value) =>
    setExtraLines((p) => p.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const createMut = useMutation({
    mutationFn: (payload) => api('/cycle-count', { method: 'POST', body: payload }),
    onSuccess: (cc) => {
      toast.success(`Cycle count ${cc.countNumber} created`)
      setCreateOpen(false)
      setLocationId('')
      setAssignedToId('')
      setRemarks('')
      setPopulatedLines([])
      setExtraLines([])
      setWarehouseId('')
      qc.invalidateQueries({ queryKey: ['cycle-counts-list'] })
      router.push(`/cycle-count/${cc.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const handleCreate = () => {
    const allLines = [
      ...populatedLines.filter((l) => l.itemId).map((l) => ({
        itemId: l.itemId,
        locationId: locationId,
        systemQty: Number(l.systemQty) || 0,
      })),
      ...extraLines.filter((l) => l.itemId).map((l) => ({
        itemId: l.itemId,
        locationId: locationId,
        systemQty: Number(l.systemQty) || 0,
      })),
    ]
    if (allLines.length === 0) { toast.error('At least one line item is required'); return }
    createMut.mutate({
      lines: allLines,
      assignedToId: assignedToId || undefined,
      remarks: remarks || undefined,
    })
  }

  const whLocations = warehouseId
    ? flatLocations.filter((l) => meta?.warehouses?.find((wh) => wh.id === warehouseId)?.zones?.find((z) => z.id === l.zoneId))
    : flatLocations

  return (
    <AppShell
      title="Cycle Count"
      subtitle="Physical stock verification and variance correction"
      actions={
        <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New Cycle Count
        </Button>
      }
    >
      <div className="space-y-4">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="DRAFT">Draft</TabsTrigger>
            <TabsTrigger value="ASSIGNED">Assigned</TabsTrigger>
            <TabsTrigger value="IN_PROGRESS">In Progress</TabsTrigger>
            <TabsTrigger value="SUBMITTED">Submitted</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved</TabsTrigger>
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
              <ClipboardList className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No cycle counts found</div>
              <div className="text-xs text-gray-400">
                {status === 'ALL'
                  ? 'Create a new cycle count session to begin physical verification.'
                  : 'No cycle counts with this status.'}
              </div>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Doc #</th>
                  <th className="px-4 py-2 font-medium">Lines</th>
                  <th className="px-4 py-2 font-medium">Variance</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {listData.data.map((cc) => {
                  const sm = STATUS_META[cc.status] || { label: cc.status, class: 'bg-gray-100 text-gray-700' }
                  const totalVar = cc.lines?.reduce((s, l) => s + Number(l.diffQty || 0), 0) || 0
                  const hasVariance = cc.lines?.some((l) => Number(l.diffQty) !== 0)
                  return (
                    <tr key={cc.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link href={`/cycle-count/${cc.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {cc.countNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{cc.lines?.length || 0} line(s)</td>
                      <td className="px-4 py-2 text-xs">
                        {cc.status === 'DRAFT' || cc.status === 'ASSIGNED' ? (
                          <span className="text-gray-400">—</span>
                        ) : hasVariance ? (
                          <span className={`font-medium tabular-nums ${totalVar > 0 ? 'text-green-600' : totalVar < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                            {totalVar > 0 ? '+' : ''}{fmt(totalVar)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-3 w-3" /> No variance
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`text-[10px] ${sm.class}`}>{sm.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDistanceToNow(new Date(cc.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/cycle-count/${cc.id}`}>
                            View <ArrowRight className="ml-1 h-3.5 w-3.5" />
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
        if (!open) { setCreateOpen(false); setLocationId(''); setAssignedToId(''); setRemarks(''); setPopulatedLines([]); setExtraLines([]); setWarehouseId('') }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Cycle Count</DialogTitle>
            <DialogDescription>
              Select a location to auto-populate items with their system quantities, then optionally add extra lines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Warehouse</Label>
                <Select value={warehouseId} onValueChange={(v) => { setWarehouseId(v); setLocationId('') }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select warehouse..." />
                  </SelectTrigger>
                  <SelectContent>
                    {meta?.warehouses?.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.code} — {wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Location *</Label>
                <Select value={locationId} onValueChange={(v) => { setLocationId(v); loadItems(v) }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {whLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Assign to (optional)</Label>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select counter..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* In production, fetch users with STOCK_CONTROL or SUPERVISOR role */}
                    {meta?.users?.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">{u.name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Remarks</Label>
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional notes..." className="text-sm" />
              </div>
            </div>

            {locationId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-gray-600">
                    Items at {flatLocations.find((l) => l.id === locationId)?.code || locationId} (auto-populated)
                  </Label>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={addExtraLine}>
                    <Plus className="mr-1 h-3 w-3" /> Add Extra Item
                  </Button>
                </div>

                {populatedLines.length === 0 && extraLines.length === 0 && (
                  <div className="rounded border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400">
                    No stock found at this location — add items manually below
                  </div>
                )}

                {/* Auto-populated lines */}
                {populatedLines.map((line, i) => (
                  <div key={line.itemId + '-' + i} className="grid grid-cols-3 gap-2 rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                    <div className="font-mono">{line.item?.sku}</div>
                    <div className="text-gray-500">{line.item?.name}</div>
                    <div className="text-right tabular-nums text-gray-500">
                      System: <span className="font-medium">{fmt(line.systemQty)}</span>
                      <input type="hidden" value={line.itemId} />
                    </div>
                  </div>
                ))}

                {/* Extra manual lines */}
                {extraLines.map((line, i) => (
                  <div key={'extra-' + i} className="grid grid-cols-3 gap-2">
                    <Select value={line.itemId} onValueChange={(v) => updateExtraLine(i, 'itemId', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Item" /></SelectTrigger>
                      <SelectContent>
                        {meta?.items?.map((it) => (
                          <SelectItem key={it.id} value={it.id} className="text-xs">{it.sku}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0" placeholder="System qty" value={line.systemQty}
                      onChange={(e) => updateExtraLine(i, 'systemQty', e.target.value)}
                      className="h-8 text-xs tabular-nums text-right" />
                    <div className="flex items-center gap-1">
                      <span className="flex-1" />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeExtraLine(i)}>×</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreate}
              disabled={createMut.isPending || !locationId}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Cycle Count
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
