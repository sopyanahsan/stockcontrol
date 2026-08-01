'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import DataTable from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ACTION_COLORS = {
  CREATE: 'border-green-200 bg-green-50 text-green-700',
  UPDATE: 'border-blue-200 bg-blue-50 text-blue-700',
  DELETE: 'border-red-200 bg-red-50 text-red-700',
  POST: 'border-purple-200 bg-purple-50 text-purple-700',
  APPROVE: 'border-teal-200 bg-teal-50 text-teal-700',
  REJECT: 'border-orange-200 bg-orange-50 text-orange-700',
  LOGIN: 'border-gray-200 bg-gray-50 text-gray-600',
  LOGOUT: 'border-gray-200 bg-gray-50 text-gray-600',
}

const MODULES = ['ALL', 'AUTH', 'MASTER_ITEM', 'LOCATION', 'RECEIVING', 'PUTAWAY', 'MOVEMENT', 'ADJUSTMENT', 'CYCLE_COUNT', 'OPNAME']
const ACTIONS = ['ALL', 'CREATE', 'UPDATE', 'DELETE', 'POST', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT']

const App = () => {
  const [moduleFilter, setModuleFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')

  const params = new URLSearchParams()
  if (moduleFilter !== 'ALL') params.set('module', moduleFilter)
  if (actionFilter !== 'ALL') params.set('action', actionFilter)
  params.set('limit', '500')

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', moduleFilter, actionFilter],
    queryFn: () => api(`/audit-logs?${params.toString()}`),
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-gray-500">{format(new Date(row.original.createdAt), 'dd MMM yyyy HH:mm:ss')}</span>,
      },
      { accessorKey: 'userName', header: 'User' },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <Badge variant="outline" className={`text-[11px] ${ACTION_COLORS[row.original.action] || ''}`}>{row.original.action}</Badge>
        ),
      },
      {
        accessorKey: 'module',
        header: 'Module',
        cell: ({ row }) => <span className="text-xs text-gray-600">{row.original.module}</span>,
      },
      { accessorKey: 'entityType', header: 'Entity', cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.entityType}</span> },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="text-[13px]">{row.original.description}</span> },
    ],
    []
  )

  return (
    <AppShell title="Audit Trail" subtitle="Complete traceability — every action in the system is recorded here">
      <DataTable
        columns={columns}
        data={logs}
        isLoading={isLoading}
        searchPlaceholder="Search audit logs..."
        exportName="audit-trail"
        pageSize={50}
        toolbar={
          <div className="flex gap-2">
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">{m === 'ALL' ? 'All Modules' : m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a} className="text-xs">{a === 'ALL' ? 'All Actions' : a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
    </AppShell>
  )
}

export default App
