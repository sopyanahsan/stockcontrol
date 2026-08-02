'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
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
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'

const categorySchema = z.object({
  name: z.string().min(2, 'Name is required'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
})

const App = () => {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me') })
  const canManage = ['ADMINISTRATOR', 'SUPERVISOR'].includes(me?.user?.role)
  const isAdmin = me?.user?.role === 'ADMINISTRATOR'

  const { data: res = { data: [] }, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories') })
  const categories = res.data || []

  const form = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '', isActive: true },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ name: '', description: '', isActive: true })
    setDialogOpen(true)
  }

  const openEdit = (category) => {
    setEditing(category)
    form.reset({ name: category.name, description: category.description || '', isActive: category.isActive !== false })
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: (values) =>
      editing ? api(`/categories/${editing.id}`, { method: 'PUT', body: values }) : api('/categories', { method: 'POST', body: values }),
    onSuccess: () => {
      toast.success(editing ? 'Category updated' : 'Category created')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['meta'] })
      setDialogOpen(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Category deleted')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['meta'] })
      setDeleting(null)
    },
    onError: (e) => {
      toast.error(e.message)
      setDeleting(null)
    },
  })

  const columns = useMemo(
    () => [
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium text-xs">{row.original.name}</span> },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.description || '—'}</span> },
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
        accessorKey: 'itemCount',
        header: 'Items',
        cell: ({ row }) => <span className="tabular-nums text-xs text-gray-500">{row.original.itemCount ?? 0}</span>,
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
      title="Master Category"
      subtitle="Reusable product categories — referenced by Master Item"
      actions={
        canManage ? (
          <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Category
          </Button>
        ) : null
      }
    >
      <DataTable columns={columns} data={categories} isLoading={isLoading} searchPlaceholder="Search categories..." exportName="master-categories" />

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{editing ? `Edit Category — ${editing.name}` : 'New Category'}</DialogTitle>
            <DialogDescription className="text-xs">
              {editing ? 'Update category master data. Duplicate names are not allowed.' : 'Create a reusable product category.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input {...form.register('name')} className="h-8 text-sm" placeholder="e.g. Furniture" />
              {form.formState.errors.name && <p className="text-[11px] text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea {...form.register('description')} rows={2} className="text-xs" />
            </div>
            {editing && (
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2.5">
                <input
                  id="categoryActive"
                  type="checkbox"
                  {...form.register('isActive')}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="categoryActive" className="text-xs">Active</label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saveMutation.isPending} className="h-8 bg-blue-600 text-xs hover:bg-blue-700">
                {saveMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete category {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Categories referenced by items cannot be deleted — deactivate them instead. This action is recorded in the Audit Trail.
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
