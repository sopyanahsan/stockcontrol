'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import DataTable from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Warehouse, Layers, Loader2 } from 'lucide-react'

const TYPE_COLORS = {
  STORAGE: 'border-blue-200 bg-blue-50 text-blue-700',
  PICKING: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  RECEIVING: 'border-green-200 bg-green-50 text-green-700',
  STAGING: 'border-amber-200 bg-amber-50 text-amber-700',
  DAMAGED: 'border-red-200 bg-red-50 text-red-700',
}

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

const App = () => {
  const queryClient = useQueryClient()
  const [locDialog, setLocDialog] = useState(false)
  const [zoneDialog, setZoneDialog] = useState(false)
  const [locForm, setLocForm] = useState({ zoneId: '', code: '', type: 'STORAGE' })
  const [zoneForm, setZoneForm] = useState({ warehouseId: '', code: '', name: '' })

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me') })
  const canManage = ['ADMINISTRATOR', 'SUPERVISOR'].includes(me?.user?.role)

  const { data: locations = [], isLoading } = useQuery({ queryKey: ['locations'], queryFn: () => api('/locations') })
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => api('/warehouses') })

  const allZones = useMemo(() => warehouses.flatMap((w) => (w.zones || []).map((z) => ({ ...z, warehouse: w }))), [warehouses])

  const createLocation = useMutation({
    mutationFn: (body) => api('/locations', { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Location created')
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      queryClient.invalidateQueries({ queryKey: ['meta'] })
      setLocDialog(false)
      setLocForm({ zoneId: '', code: '', type: 'STORAGE' })
    },
    onError: (e) => toast.error(e.message),
  })

  const createZone = useMutation({
    mutationFn: (body) => api('/zones', { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Zone created')
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      queryClient.invalidateQueries({ queryKey: ['meta'] })
      setZoneDialog(false)
      setZoneForm({ warehouseId: '', code: '', name: '' })
    },
    onError: (e) => toast.error(e.message),
  })

  const columns = useMemo(
    () => [
      { accessorKey: 'code', header: 'Location Code', cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.code}</span> },
      { id: 'zone', header: 'Zone', accessorFn: (r) => `${r.zone?.code} — ${r.zone?.name}` },
      { id: 'warehouse', header: 'Warehouse', accessorFn: (r) => r.zone?.warehouse?.code || '' },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${TYPE_COLORS[row.original.type] || ''}`}>{row.original.type}</Badge>
        ),
      },
      {
        accessorKey: 'onHand',
        header: 'Units Stored',
        cell: ({ row }) => <span className="tabular-nums">{fmt(row.original.onHand)}</span>,
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
    ],
    []
  )

  return (
    <AppShell
      title="Warehouse Location"
      subtitle="Warehouse → Zone → Location hierarchy"
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setZoneDialog(true)}>
              <Layers className="mr-1 h-3.5 w-3.5" /> New Zone
            </Button>
            <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setLocDialog(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Location
            </Button>
          </div>
        ) : null
      }
    >
      {/* Warehouse summary cards */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {warehouses.map((w) => (
          <div key={w.id} className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-blue-50 p-2 text-blue-600">
                <Warehouse className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{w.code} — {w.name}</div>
                <div className="text-[11px] text-gray-500">
                  {(w.zones || []).length} zones · {(w.zones || []).reduce((s, z) => s + (z.locations || []).length, 0)} locations
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <DataTable columns={columns} data={locations} isLoading={isLoading} searchPlaceholder="Search location, zone, warehouse..." exportName="locations" />

      {/* New location dialog */}
      <Dialog open={locDialog} onOpenChange={setLocDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">New Location</DialogTitle>
            <DialogDescription className="text-xs">Create a storage bin / location inside a zone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Zone *</Label>
              <Select value={locForm.zoneId} onValueChange={(v) => setLocForm({ ...locForm, zoneId: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select zone" /></SelectTrigger>
                <SelectContent>
                  {allZones.map((z) => (
                    <SelectItem key={z.id} value={z.id} className="text-xs">
                      {z.warehouse?.code} / {z.code} — {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location Code *</Label>
              <Input value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value.toUpperCase() })} placeholder="A-03-01" className="h-8 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={locForm.type} onValueChange={(v) => setLocForm({ ...locForm, type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['STORAGE', 'PICKING', 'RECEIVING', 'STAGING', 'DAMAGED'].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLocDialog(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!locForm.zoneId || !locForm.code || createLocation.isPending}
              className="h-8 bg-blue-600 text-xs hover:bg-blue-700"
              onClick={() => createLocation.mutate(locForm)}
            >
              {createLocation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New zone dialog */}
      <Dialog open={zoneDialog} onOpenChange={setZoneDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">New Zone</DialogTitle>
            <DialogDescription className="text-xs">Create a zone inside a warehouse.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Warehouse *</Label>
              <Select value={zoneForm.warehouseId} onValueChange={(v) => setZoneForm({ ...zoneForm, warehouseId: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} className="text-xs">{w.code} — {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zone Code *</Label>
              <Input value={zoneForm.code} onChange={(e) => setZoneForm({ ...zoneForm, code: e.target.value.toUpperCase() })} placeholder="C" className="h-8 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zone Name *</Label>
              <Input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="Zone C - Overflow" className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setZoneDialog(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!zoneForm.warehouseId || !zoneForm.code || !zoneForm.name || createZone.isPending}
              className="h-8 bg-blue-600 text-xs hover:bg-blue-700"
              onClick={() => createZone.mutate(zoneForm)}
            >
              {createZone.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default App
