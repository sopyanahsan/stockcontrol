'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import AppShell from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const CreateNewPage = () => {
  const router = useRouter()
  const [remarks, setRemarks] = useState('')

  const createMut = useMutation({
    mutationFn: (payload) => api('/stock-opname', { method: 'POST', body: payload }),
    onSuccess: (so) => {
      toast.success(`Stock opname ${so.opnameNumber} created`)
      router.push(`/stock-opname/${so.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const handleCreate = () => {
    createMut.mutate({ remarks: remarks || undefined })
  }

  if (createMut.isPending) {
    return (
      <AppShell title="New Stock Opname" subtitle="Creating...">
        <div className="mx-auto max-w-lg">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-6 shadow-sm">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <div className="flex justify-end gap-3">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-36" />
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      title="New Stock Opname"
      subtitle="Create a new physical stock verification session"
      actions={
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/stock-opname">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      }
    >
      <div className="mx-auto max-w-lg">
        <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Create New Stock Opname</h2>
          <p className="mb-6 text-xs text-gray-500">
            A new stock opname session will be created in Draft status. You can start counting after saving.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="remarks" className="text-xs text-gray-600">
                Remarks (optional)
              </Label>
              <Input
                id="remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g., Monthly stock verification — August 2026"
                className="text-sm"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => router.push('/stock-opname')}
              disabled={createMut.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreate}
              disabled={createMut.isPending}
            >
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Stock Opname
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default CreateNewPage
