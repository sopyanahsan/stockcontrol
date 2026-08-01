'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import BarcodeInput from '@/components/barcode-input'
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Package, XCircle, CheckCircle2, Search,
} from 'lucide-react'
import { toast } from 'sonner'

const EMPTY_LINE = () => ({ id: crypto.randomUUID(), itemId: '', item: null, qtyOrdered: '', remarks: '' })

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
]

const App = () => {
  const router = useRouter()
  const qc = useQueryClient()
  const [lines, setLines] = useState([EMPTY_LINE()])
  const [warehouseId, setWarehouseId] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [notes, setNotes] = useState('')
  const [itemSearchOpen, setItemSearchOpen] = useState(false)
  const [activeLineId, setActiveLineId] = useState(null)
  const [itemSearch, setItemSearch] = useState('')
  const [suggestErrors, setSuggestErrors] = useState({})

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['meta'],
    queryFn: () => api('/meta'),
  })

  const createMut = useMutation({
    mutationFn: () => api('/picking', {
      method: 'POST',
      body: {
        warehouseId: warehouseId || null,
        priority,
        notes: notes || null,
        lines: lines
          .filter((l) => l.itemId && Number(l.qtyOrdered) > 0)
          .map((l) => ({ itemId: l.itemId, qtyOrdered: Number(l.qtyOrdered), remarks: l.remarks || null })),
      },
    }),
    onSuccess: (data) => {
      toast.success('Picking order created: ' + data.pickingNumber)
      qc.invalidateQueries({ queryKey: ['picking-list'] })
      router.push('/picking')
    },
    onError: (e) => toast.error(e.message),
  })

  const addLine = () => setLines((prev) => [...prev, EMPTY_LINE()])

  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.id !== id))

  const updateLine = (id, field, value) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        const updated = { ...l, [field]: value }
        if (field === 'item') {
          updated.itemId = value?.id || ''
        }
        return updated
      })
    )
  }

  const openItemSearch = (lineId) => {
    setActiveLineId(lineId)
    setItemSearch('')
    setItemSearchOpen(true)
  }

  const selectItem = (item) => {
    if (activeLineId) {
      updateLine(activeLineId, 'item', item)
      updateLine(activeLineId, 'itemId', item.id)
    }
    setItemSearchOpen(false)
    setActiveLineId(null)
  }

  const filteredItems = (meta?.items || []).filter((item) => {
    if (!itemSearch) return true
    const q = itemSearch.toLowerCase()
    return (
      item.sku.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.barcode || '').toLowerCase().includes(q)
    )
  })

  const handleBarcodeScan = useCallback(
    (code) => {
      const matched = (meta?.items || []).find(
        (item) =>
          item.barcode === code ||
          item.sku === code
      )
      if (matched) {
        selectItem(matched)
        return { ok: true, message: 'Item found: ' + matched.sku }
      }
      return { ok: false, message: 'Item not found: ' + code }
    },
    [meta, selectItem]
  )

  const validLines = lines.filter((l) => l.itemId && Number(l.qtyOrdered) > 0)
  const canSubmit = validLines.length > 0

  return (
    <AppShell
      title="New Picking Order"
      subtitle="Create a picking order to assign warehouse pick tasks"
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/picking"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 text-sm font-medium">Order Details</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select warehouse (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(meta?.warehouses || []).map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.code} — {wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for the picker..."
                className="h-9"
              />
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="text-sm font-medium">Line Items</div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
            </Button>
          </div>

          {lines.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              No line items. Click "Add Line" to add items.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium w-8">#</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium w-32 text-right">Qty to Pick</th>
                  <th className="px-4 py-2 font-medium w-40">Remarks</th>
                  <th className="px-4 py-2 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-2">
                      {line.item ? (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-medium">{line.item.sku}</span>
                            <span className="text-xs text-gray-500">{line.item.name}</span>
                            {line.item.serialTracked && (
                              <Badge variant="outline" className="mt-0.5 w-fit text-[9px] border-amber-300 text-amber-600">
                                Serial
                              </Badge>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-gray-400 hover:text-gray-600"
                            onClick={() => updateLine(line.id, 'item', null)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openItemSearch(line.id)}
                        >
                          <Search className="mr-1 h-3.5 w-3.5" /> Search Item
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min="1"
                        value={line.qtyOrdered}
                        onChange={(e) => updateLine(line.id, 'qtyOrdered', e.target.value)}
                        className="h-8 text-xs tabular-nums text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        value={line.remarks || ''}
                        onChange={(e) => updateLine(line.id, 'remarks', e.target.value)}
                        className="h-8 text-xs"
                        placeholder="Optional"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeLine(line.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/picking">Cancel</Link>
          </Button>
          <Button
            size="sm"
            className="h-9 bg-blue-600 hover:bg-blue-700"
            onClick={() => createMut.mutate()}
            disabled={!canSubmit || createMut.isPending}
          >
            {createMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Create Picking Order
          </Button>
        </div>
      </div>

      {/* Item Search Dialog */}
      <Dialog open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Search Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <BarcodeInput
              onScan={handleBarcodeScan}
              placeholder="Scan barcode or type SKU/name..."
              size="lg"
            />
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Type to filter items..."
              className="h-9"
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredItems.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No items found</div>
              ) : (
                filteredItems.slice(0, 30).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => selectItem(item)}
                    className="flex w-full items-center justify-between rounded-md border border-gray-100 bg-white px-3 py-2 text-left text-xs hover:bg-gray-50"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{item.sku}</span>
                        {item.serialTracked && (
                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600">SN</Badge>
                        )}
                      </div>
                      <span className="text-gray-500">{item.name}</span>
                    </div>
                    {item.barcode && (
                      <span className="font-mono text-gray-400">{item.barcode}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
