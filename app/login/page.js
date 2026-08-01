'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Warehouse, Loader2 } from 'lucide-react'

const DEMO_USERS = [
  { label: 'Administrator', email: 'admin@stockcontrol.com', password: 'admin123' },
  { label: 'Supervisor', email: 'supervisor@stockcontrol.com', password: 'supervisor123' },
  { label: 'Stock Control', email: 'stock@stockcontrol.com', password: 'stock123' },
]

const App = () => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e, creds) => {
    e?.preventDefault?.()
    setError('')
    setLoading(true)
    try {
      await api('/auth/login', { method: 'POST', body: creds || { email, password } })
      queryClient.clear()
      router.replace('/')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 text-white">
            <Warehouse className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">StockControl WMS</h1>
          <p className="text-xs text-gray-500">Enterprise Stock Control Inventory System</p>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-9 text-sm" />
            </div>
            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            <Button type="submit" disabled={loading} className="h-9 w-full bg-blue-600 text-sm hover:bg-blue-700">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>

        <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Demo accounts</div>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                disabled={loading}
                onClick={(e) => submit(e, { email: u.email, password: u.password })}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-[11px] text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
