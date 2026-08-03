'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import DataTable from '@/components/data-table'
import HelpButton from '@/components/help/HelpButton'
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
import SupplierImportWizard from '@/components/suppliers/import-wizard'
import { Plus, Pencil, Trash2, Loader2, Upload, FileDown, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'

const supplierSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(2, 'Supplier name is required'),
  picName: z.string().min(1, 'PIC name is required'),
  phone: z.string().min(3, 'Phone is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  leadTimeDays: z.coerce.number().min(0, 'Lead time must be >= 0'),
  taxNumber: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
})

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

  // /api/suppliers returns { data, total } — extract the rows array for the table.
  const { data: suppliersRes = { data: [] }, isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: () => api('/suppliers') })
  const suppliers = suppliersRes.data || []

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
      await downloadFile('/suppliers/template', 'Supplier Template.xlsx')
      toast.success('Template downloaded')
    } catch (e) {
      toast.error(e.message)
    }
  }, [downloadFile])

  const exportSuppliers = useCallback(async (scope) => {
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
        ? `/suppliers/export?ids=${encodeURIComponent(ids.join(','))}`
        : '/suppliers/export'
      await downloadFile(path, `suppliers-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('Export downloaded')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }, [downloadFile])

  const form = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: { code: '', name: '', picName: '', phone: '', email: '', address: '', city: '', province: '', postalCode: '', leadTimeDays: 0, taxNumber: '', website: '', notes: '', isActive: true },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ code: '', name: '', picName: '', phone: '', email: '', address: '', city: '', province: '', postalCode: '', leadTimeDays: 0, taxNumber: '', website: '', notes: '', isActive: true })
    setDialogOpen(true)
  }

  const openEdit = (s) => {
    setEditing(s)
    form.reset({
      code: s.code, name: s.name, picName: s.picName, phone: s.phone, email: s.email || '',
      address: s.address || '', city: s.city || '', province: s.province || '', postalCode: s.postalCode || '',
      leadTimeDays: s.leadTimeDays || 0, taxNumber: s.taxNumber || '', website: s.website || '', notes: s.notes || '',
      isActive: !!s.isActive,
    })
    setDialogOpen(true)
  }

  const invalidateSupplierQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    queryClient.invalidateQueries({ queryKey: ['meta'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
  }

  const saveMutation = useMutation({
    mutationFn: (values) =>
      editing ? api(`/suppliers/${editing.id}`, { method: 'PUT', body: values }) : api('/suppliers', { method: 'POST', body: values }),
    onSuccess: () => {
      toast.success(editing ? 'Supplier updated' : 'Supplier created')
      invalidateSupplierQueries()
      setDialogOpen(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api(`/suppliers/${id}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      toast.success(res.deactivated ? 'Supplier deactivated' : 'Supplier deleted')
      invalidateSupplierQueries()
      setDeleting(null)
    },
    onError: (e) => toast.error(e.message),
  })

  const columns = useMemo(
    () => [
      { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Supplier' },
      { accessorKey: 'picName', header: 'PIC' },
      { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.phone}</span> },
      { accessorKey: 'city', header: 'City', cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.city || '-'}</span> },
      {
        accessorKey: 'leadTimeDays',
        header: 'Lead Time',
        cell: ({ row }) => <span className="tabular-nums text-gray-500">{row.original.leadTimeDays} days</span>,
      },
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
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => <span className="text-xs text-gray-500">{format(new Date(row.original.createdAt), 'dd MMM yyyy')}</span>,
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
      title="Supplier"
      subtitle="Supplier master data used on Receiving. Suppliers must be active to appear in Receiving."
      actions={
        <>
          {canManage ? (
            <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Supplier
            </Button>
          ) : null}
          <HelpButton pageId="suppliers" />
        </>
      }
    >
      <DataTable
        columns={columns}
        data={suppliers}
        isLoading={isLoading}
        searchPlaceholder="Search code, name, PIC, phone, city..."
        exportName="suppliers"
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
                  <DropdownMenuItem className="text-xs" onSelect={() => exportSuppliers('page')}>Current Page</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onSelect={() => exportSuppliers('filtered')}>Filtered Rows</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onSelect={() => exportSuppliers('all')}>All Suppliers</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />

      <SupplierImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={invalidateSupplierQueries}
      />

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{editing ? `Edit Supplier — ${editing.code}` : 'New Supplier'}</DialogTitle>
            <DialogDescription className="text-xs">
              {editing ? 'Update supplier master data. Deleting is handled from the table.' : 'Supplier code is auto-generated unless you provide one.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Supplier Code</Label>
                <Input {...form.register('code')} disabled={!!editing} className="h-8 font-mono text-xs" placeholder="SUP-000001 (auto)" />
                {form.formState.errors.code && <p className="text-[11px] text-red-600">{form.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lead Time (days)</Label>
                <Input type="number" min="0" step="1" {...form.register('leadTimeDays')} className="h-8 text-xs" />
                {form.formState.errors.leadTimeDays && <p className="text-[11px] text-red-600">{form.formState.errors.leadTimeDays.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Supplier Name *</Label>
              <Input {...form.register('name')} className="h-8 text-sm" />
              {form.formState.errors.name && <p className="text-[11px] text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">PIC Name *</Label>
                <Input {...form.register('picName')} className="h-8 text-xs" />
                {form.formState.errors.picName && <p className="text-[11px] text-red-600">{form.formState.errors.picName.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone *</Label>
                <Input {...form.register('phone')} className="h-8 text-xs" />
                {form.formState.errors.phone && <p className="text-[11px] text-red-600">{form.formState.errors.phone.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" {...form.register('email')} className="h-8 text-xs" />
                {form.formState.errors.email && <p className="text-[11px] text-red-600">{form.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Website</Label>
                <Input {...form.register('website')} className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input {...form.register('address')} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input {...form.register('city')} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Province</Label>
                <Input {...form.register('province')} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Postal Code</Label>
                <Input {...form.register('postalCode')} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tax Number / NPWP</Label>
                <Input {...form.register('taxNumber')} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.watch('isActive') ? 'active' : 'inactive'} onValueChange={(v) => form.setValue('isActive', v === 'active')}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active" className="text-xs">Active</SelectItem>
                    <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea {...form.register('notes')} rows={2} className="text-xs" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saveMutation.isPending} className="h-8 bg-blue-600 text-xs hover:bg-blue-700">
                {saveMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete supplier {deleting?.code}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              If this supplier has been used on any Receiving it will be deactivated instead, preserving full traceability. This action is recorded in the Audit Trail.
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
