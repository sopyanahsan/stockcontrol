'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/currency'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import DataTable from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ImportWizard from '@/components/items/import-wizard'
import { Plus, Pencil, Trash2, Loader2, Upload, FileDown, FileSpreadsheet, ChevronDown } from 'lucide-react'

const itemSchema = z.object({
  sku: z.string().min(2, 'SKU is required'),
  name: z.string().min(2, 'Name is required'),
  description: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().min(1, 'Category is required'),
  uomId: z.string().min(1, 'UOM is required'),
  minStock: z.coerce.number().min(0),
  reorderPoint: z.coerce.number().min(0),
  maxStock: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0),
  serialTracked: z.boolean().default(false),
})

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const App = () => {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const tableRef = useRef(null)

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me') })
  const canManage = ['ADMINISTRATOR', 'SUPERVISOR'].includes(me?.user?.role)
  const isAdmin = me?.user?.role === 'ADMINISTRATOR'

  const { data: items = [], isLoading } = useQuery({ queryKey: ['items'], queryFn: () => api('/items') })
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api('/meta') })

  const downloadFile = useCallback(async (path, filename) => {
    const res = await fetch(`/api${path}`, { credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || data.message || 'Download failed')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const downloadTemplate = useCallback(async () => {
    try {
      await downloadFile('/items/template', 'Master Item Template.xlsx')
      toast.success('Template downloaded')
    } catch (e) {
      toast.error(e.message)
    }
  }, [downloadFile])

  const exportItems = useCallback(async (scope) => {
    setExporting(true)
    try {
      let ids = []
      if (scope === 'page') {
        const rows = tableRef.current?.getRowModel().rows || []
        ids = rows.map((r) => r.original.id)
      } else if (scope === 'filtered') {
        const rows = tableRef.current?.getFilteredRowModel().rows || []
        ids = rows.map((r) => r.original.id)
      }
      const path = ids.length
        ? `/items/export?ids=${encodeURIComponent(ids.join(','))}`
        : '/items/export'
      await downloadFile(path, `master-items-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('Export downloaded')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }, [downloadFile])

  const form = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues: { sku: '', name: '', description: '', barcode: '', categoryId: '', uomId: '', minStock: 0, reorderPoint: 0, maxStock: 0, unitCost: 0, serialTracked: false },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ sku: '', name: '', description: '', barcode: '', categoryId: '', uomId: '', minStock: 0, reorderPoint: 0, maxStock: 0, unitCost: 0, serialTracked: false })
    setDialogOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    form.reset({
      sku: item.sku, name: item.name, description: item.description || '', barcode: item.barcode || '',
      categoryId: item.categoryId, uomId: item.uomId,
      minStock: item.minStock, reorderPoint: item.reorderPoint, maxStock: item.maxStock, unitCost: item.unitCost,
      serialTracked: !!item.serialTracked,
    })
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: (values) =>
      editing ? api(`/items/${editing.id}`, { method: 'PUT', body: values }) : api('/items', { method: 'POST', body: values }),
    onSuccess: () => {
      toast.success(editing ? 'Item updated' : 'Item created')
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['meta'] })
      setDialogOpen(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api(`/items/${id}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      toast.success(res.deactivated ? 'Item deactivated (has ledger history)' : 'Item deleted')
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['meta'] })
      setDeleting(null)
    },
    onError: (e) => toast.error(e.message),
  })

  const columns = useMemo(
    () => [
      { accessorKey: 'sku', header: 'SKU', cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span> },
      { accessorKey: 'name', header: 'Item Name' },
      { accessorKey: 'category.name', header: 'Category', id: 'category', accessorFn: (r) => r.category?.name || '' },
      { accessorKey: 'uom.code', header: 'UOM', id: 'uom', accessorFn: (r) => r.uom?.code || '' },
      {
        accessorKey: 'onHand',
        header: 'On Hand',
        cell: ({ row }) => {
          const { onHand, reorderPoint, minStock } = row.original
          const cls = onHand <= minStock ? 'border-red-200 bg-red-50 text-red-700' : onHand <= reorderPoint ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-green-200 bg-green-50 text-green-700'
          return <Badge variant="outline" className={`tabular-nums ${cls}`}>{fmt(onHand)}</Badge>
        },
      },
      { accessorKey: 'reorderPoint', header: 'Reorder Pt', cell: ({ row }) => <span className="tabular-nums text-gray-500">{fmt(row.original.reorderPoint)}</span> },
      { accessorKey: 'unitCost', header: 'Unit Cost', cell: ({ row }) => <span className="tabular-nums">{formatCurrency(row.original.unitCost)}</span> },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Active</Badge>
          ) : (
            <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-500">Inactive</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {canManage && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row.original)}>
                <Pencil className="h-3.5 w-3.5 text-gray-500" />
              </Button>
            )}
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(row.original)}>
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canManage, isAdmin]
  )

  return (
    <AppShell
      title="Master Item"
      subtitle="Item master data — on-hand quantity is always computed from the Stock Ledger"
      actions={
        canManage ? (
          <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Item
          </Button>
        ) : null
      }
    >
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        searchPlaceholder="Search SKU, name, category..."
        exportName="master-items"
        tableRef={tableRef}
        toolbar={
          canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadTemplate}>
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Template
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs" disabled={exporting}>
                    {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
                    Excel
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  <DropdownMenuItem className="text-xs" onSelect={() => exportItems('page')}>Current Page</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onSelect={() => exportItems('filtered')}>Filtered Rows</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onSelect={() => exportItems('all')}>All Items</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />

      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['items'] })
          queryClient.invalidateQueries({ queryKey: ['meta'] })
        }}
      />

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{editing ? `Edit Item — ${editing.sku}` : 'New Item'}</DialogTitle>
            <DialogDescription className="text-xs">
              {editing ? 'Update master data. Stock quantity cannot be edited here — use inventory transactions.' : 'Create a new item master record.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">SKU *</Label>
                <Input {...form.register('sku')} disabled={!!editing} className="h-8 font-mono text-xs" placeholder="FUR-CHR-001" />
                {form.formState.errors.sku && <p className="text-[11px] text-red-600">{form.formState.errors.sku.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Barcode</Label>
                <Input {...form.register('barcode')} className="h-8 font-mono text-xs" placeholder="same as SKU if empty" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Item Name *</Label>
              <Input {...form.register('name')} className="h-8 text-sm" />
              {form.formState.errors.name && <p className="text-[11px] text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select value={form.watch('categoryId')} onValueChange={(v) => form.setValue('categoryId', v, { shouldValidate: true })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(meta?.categories || []).map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.categoryId && <p className="text-[11px] text-red-600">{form.formState.errors.categoryId.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit of Measure *</Label>
                <Select value={form.watch('uomId')} onValueChange={(v) => form.setValue('uomId', v, { shouldValidate: true })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select UOM" /></SelectTrigger>
                  <SelectContent>
                    {(meta?.uoms || []).map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">{u.code} — {u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.uomId && <p className="text-[11px] text-red-600">{form.formState.errors.uomId.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Min Stock</Label>
                <Input type="number" step="any" {...form.register('minStock')} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reorder Pt</Label>
                <Input type="number" step="any" {...form.register('reorderPoint')} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Stock</Label>
                <Input type="number" step="any" {...form.register('maxStock')} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit Cost (Rp)</Label>
                <Input type="number" step="any" {...form.register('unitCost')} className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2.5">
              <input
                id="serialTracked"
                type="checkbox"
                {...form.register('serialTracked')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="serialTracked" className="text-xs">
                <span className="font-medium">Serial-tracked item</span>
                <span className="ml-2 text-gray-500">Every unit must have a unique serial number captured on Receiving.</span>
              </label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea {...form.register('description')} rows={2} className="text-xs" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saveMutation.isPending} className="h-8 bg-blue-600 text-xs hover:bg-blue-700">
                {saveMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete item {deleting?.sku}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              If this item has stock ledger history it will be deactivated instead of deleted, preserving full traceability. This action is recorded in the Audit Trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-8 bg-red-600 text-xs hover:bg-red-700" onClick={() => deleteMutation.mutate(deleting.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

export default App
