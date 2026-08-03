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
import {
  ArrowRightLeft, Plus, ArrowRight, ArrowLeft, Loader2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_META = {
  DRAFT:       { label: 'Draft',       class: 'bg-gray-100 text-gray-700 border-gray-200' },
  PENDING_APPROVAL: { label: 'Pending',  class: 'bg-amber-100 text-amber-700 border-amber-200' },
  APPROVED:     { label: 'Approved',     class: 'bg-blue-100 text-blue-700 border-blue-200' },
  COMPLETED:    { label: 'Completed',    class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:    { label: 'Cancelled',   class: 'bg-red-100 text-red-700 border-red-200' },
}

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [lines, setLines] = useState([{ itemId: '', fromLocationId: '', toLocationId: '', qty: '' }])
  const [remarks, setRemarks] = useState('')

  const { data: listData, isLoading } = useQuery({
    queryKey: ['movements-list', status],
    queryFn: () => api(`/movements${status !== 'ALL' ? `?status=${status}` : ''}`),
  })

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['meta'],
    queryFn: () => api('/meta'),
  })

  const openCount = listData?.data?.filter((m) => m.status === 'DRAFT').length || 0

  const createMut = useMutation({
    mutationFn: (payload) => api('/movements', { method: 'POST', body: payload }),
    onSuccess: (m) => {
      toast.success(`Movement ${m.transferNumber} created`)
      setCreateOpen(false)
      setLines([{ itemId: '', fromLocationId: '', toLocationId: '', qty: '' }])
      setRemarks('')
      qc.invalidateQueries({ queryKey: ['movements-list'] })
      router.push(`/movement/${m.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const addLine = () => setLines((prev) => [...prev, { itemId: '', fromLocationId: '', toLocationId: '', qty: '' }])
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))
  const updateLine = (i, field, value) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const handleCreate = () => {
    const validLines = lines.filter((l) => l.itemId && l.fromLocationId && l.toLocationId && Number(l.qty) > 0)
    if (validLines.length === 0) { toast.error('Add at least one valid line'); return }
    createMut.mutate({ lines: validLines, remarks: remarks || undefined })
  }

  const flatLocations = meta?.warehouses?.flatMap((wh) =>
    wh.zones?.flatMap((z) => z.locations || []) || []
  ) || []

  return (
    <AppShell
      title="Stock Movement"
      subtitle="Transfer inventory between warehouse locations"
      actions={
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
              {openCount} draft
            </Badge>
          )}
          <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => { qc.invalidateQueries({ queryKey: ['meta'] }); setCreateOpen(true) }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Movement
          </Button>
          <HelpButton pageId="movement" />
        </div>
      }
    >
      <div className="space-y-4">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="DRAFT">Draft</TabsTrigger>
            <TabsTrigger value="PENDING_APPROVAL">Pending</TabsTrigger>
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
              <ArrowRightLeft className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No movements found</div>
              <div className="text-xs text-gray-400">
                {status === 'ALL'
                  ? 'Create a new movement to transfer stock between locations.'
                  : 'No movements with this status.'}
              </div>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Doc #</th>
                  <th className="px-4 py-2 font-medium">Lines</th>
                  <th className="px-4 py-2 font-medium">Items</th>
                  <th className="px-4 py-2 text-right font-medium">Total Qty</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {listData.data.map((m) => {
                  const meta2 = STATUS_META[m.status] || { label: m.status, class: 'bg-gray-100 text-gray-700' }
                  const totalQty = m.lines?.reduce((s, l) => s + Number(l.qty), 0) || 0
                  const itemNames = [...new Set(m.lines?.map((l) => l.item?.sku).filter(Boolean))].join(', ')
                  return (
                    <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link href={`/movement/${m.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {m.transferNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{m.lines?.length || 0} line(s)</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{itemNames || '-'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs">{totalQty}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`${meta2.class} text-[10px]`}>{meta2.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/movement/${m.id}`}>
                            {m.status === 'DRAFT' ? 'Edit' : 'View'} <ArrowRight className="ml-1 h-3.5 w-3.5" />
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
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setLines([{ itemId: '', fromLocationId: '', toLocationId: '', qty: '' }]); setRemarks('') } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Stock Movement</DialogTitle>
            <DialogDescription>
              Create a new movement to transfer inventory between locations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Header fields */}
            <div className="space-y-1.5">
              <Label htmlFor="remarks" className="text-xs text-gray-600">Remarks (optional)</Label>
              <Input
                id="remarks"
                placeholder="e.g. Reorganizing fast-moving SKUs to staging"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600">Line Items</Label>
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={addLine}>
                  <Plus className="mr-1 h-3 w-3" /> Add Line
                </Button>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-4 gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                <div>Item</div>
                <div>From Location</div>
                <div>To Location</div>
                <div className="text-right">Qty</div>
              </div>

              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-4 gap-2">
                  <Select
                    value={line.itemId}
                    onValueChange={(v) => updateLine(i, 'itemId', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta?.items?.map((it) => (
                        <SelectItem key={it.id} value={it.id} className="text-xs">
                          {it.sku} — {it.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={line.fromLocationId}
                    onValueChange={(v) => updateLine(i, 'fromLocationId', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="From" />
                    </SelectTrigger>
                    <SelectContent>
                      {flatLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id} className="text-xs">
                          {loc.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={line.toLocationId}
                    onValueChange={(v) => updateLine(i, 'toLocationId', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="To" />
                    </SelectTrigger>
                    <SelectContent>
                      {flatLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id} className="text-xs">
                          {loc.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="1"
                      placeholder="0"
                      value={line.qty}
                      onChange={(e) => updateLine(i, 'qty', e.target.value)}
                      className="h-8 text-xs tabular-nums text-right"
                    />
                    {lines.length > 1 && (
                      <Button
                        variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeLine(i)}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreate}
              disabled={createMut.isPending || metaLoading}
            >
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Movement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
