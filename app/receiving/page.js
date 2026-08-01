'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import { Plus, PackagePlus, Loader2, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const STATUS_META = {
  DRAFT:            { label: 'Draft',            class: 'bg-gray-100 text-gray-700 border-gray-200' },
  RECEIVING:        { label: 'Receiving',        class: 'bg-blue-100 text-blue-700 border-blue-200' },
  WAITING_PUTAWAY:  { label: 'Waiting Putaway',  class: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED:        { label: 'Completed',        class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:        { label: 'Cancelled',        class: 'bg-red-100 text-red-700 border-red-200' },
}

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ALL')
  const [openCreate, setOpenCreate] = useState(false)

  const { data: list, isLoading } = useQuery({
    queryKey: ['receiving-list', status],
    queryFn: () => api(`/receiving${status !== 'ALL' ? `?status=${status}` : ''}`),
  })

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const [form, setForm] = useState({ warehouseId: '', supplier: '', refDocument: '', remarks: '' })

  const createMut = useMutation({
    mutationFn: (payload) => api('/receiving', { method: 'POST', body: payload }),
    onSuccess: (r) => {
      toast.success(`Created ${r.grnNumber}`)
      setOpenCreate(false)
      setForm({ warehouseId: '', supplier: '', refDocument: '', remarks: '' })
      qc.invalidateQueries({ queryKey: ['receiving-list'] })
      router.push(`/receiving/${r.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const submitCreate = () => {
    if (!form.warehouseId) { toast.error('Warehouse is required'); return }
    createMut.mutate({ ...form, lines: [] })
  }

  return (
    <AppShell
      title="Receiving"
      subtitle="Goods Receipt Notes - stock enters STAGING, then flows to Putaway"
      actions={
        <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={() => setOpenCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Receiving
        </Button>
      }
    >
      <div className="space-y-4">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="DRAFT">Draft</TabsTrigger>
            <TabsTrigger value="RECEIVING">Receiving</TabsTrigger>
            <TabsTrigger value="WAITING_PUTAWAY">Waiting Putaway</TabsTrigger>
            <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
            <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !list?.length ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <PackagePlus className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium text-gray-500">No receiving documents yet</div>
              <div className="text-xs text-gray-400">Create a new Goods Receipt Note to begin.</div>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setOpenCreate(true)}>
                <Plus className="mr-1 h-4 w-4" /> New Receiving
              </Button>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">GRN</th>
                  <th className="px-4 py-2 font-medium">Warehouse</th>
                  <th className="px-4 py-2 font-medium">Staging</th>
                  <th className="px-4 py-2 font-medium">Supplier / Ref</th>
                  <th className="px-4 py-2 text-right font-medium">Lines</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, class: 'bg-gray-100 text-gray-700' }
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{r.grnNumber}</td>
                      <td className="px-4 py-2">{r.warehouse?.code}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.stagingLocation?.code}</td>
                      <td className="px-4 py-2">
                        {r.supplier || <span className="text-gray-400">-</span>}
                        {r.refDocument && <div className="text-[11px] text-gray-400">Ref: {r.refDocument}</div>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.lines?.length || 0}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`${meta.class} text-[10px]`}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</td>
                      <td className="px-4 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/receiving/${r.id}`}>Open <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
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

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Receiving</DialogTitle>
            <DialogDescription>GRN number is auto-generated. Add items after creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Warehouse *</Label>
              <Select value={form.warehouseId} onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {(meta?.warehouses || []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <Input className="h-9" value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name (optional)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference Document</Label>
              <Input className="h-9" value={form.refDocument} onChange={(e) => setForm((f) => ({ ...f, refDocument: e.target.value }))} placeholder="PO / Invoice / Ref number (optional)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Remarks</Label>
              <Textarea rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Notes (optional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submitCreate} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
