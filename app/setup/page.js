'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Warehouse, Check, Loader2 } from 'lucide-react'

const STEPS = ['Administrator', 'Company', 'Warehouse', 'Locations', 'Reason Codes', 'Finish']

const DEFAULT_LOCATIONS = [
  { code: 'STAGING', name: 'Staging Area' },
  { code: 'RECEIVING', name: 'Receiving Dock' },
  { code: 'RETURN', name: 'Return Area' },
  { code: 'SCRAP', name: 'Scrap / Damaged' },
]

const DEFAULT_REASON_CODES = [
  { code: 'RECEIVING', type: 'RECEIVING' },
  { code: 'ADJUSTMENT', type: 'ADJUSTMENT' },
  { code: 'OPNAME', type: 'OPNAME' },
  { code: 'MOVEMENT', type: 'MOVEMENT' },
  { code: 'RETURN', type: 'MOVEMENT' },
]

const emptyForm = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  companyName: '',
  address: '',
  phone: '',
  warehouseName: '',
  warehouseCode: '',
}

const App = () => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const validateStep = (s) => {
    if (s === 0) {
      if (!form.fullName.trim()) return 'Full name is required'
      if (!form.email.trim()) return 'Email is required'
      if (form.password.length < 8) return 'Password must be at least 8 characters'
      if (form.password !== form.confirmPassword) return 'Passwords do not match'
    }
    if (s === 1) {
      if (!form.companyName.trim()) return 'Company name is required'
    }
    if (s === 2) {
      if (!form.warehouseName.trim()) return 'Warehouse name is required'
      if (!form.warehouseCode.trim()) return 'Warehouse code is required'
    }
    return ''
  }

  const next = () => {
    const message = validateStep(step)
    if (message) return setError(message)
    setError('')
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const back = () => {
    setError('')
    setStep((s) => Math.max(s - 1, 0))
  }

  const submit = async () => {
    const message = validateStep(2)
    if (message) return setError(message)
    setError('')
    setLoading(true)
    try {
      await api('/setup', {
        method: 'POST',
        body: {
          admin: { fullName: form.fullName, email: form.email, password: form.password, confirmPassword: form.confirmPassword },
          company: { companyName: form.companyName, address: form.address, phone: form.phone },
          warehouse: { name: form.warehouseName, code: form.warehouseCode, address: form.address },
        },
      })
      queryClient.clear()
      router.replace('/')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const field = (label, id, value, onChange, props = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} required value={value} onChange={onChange} className="h-9 text-sm" {...props} />
    </div>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 text-white">
            <Warehouse className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">StockControl WMS</h1>
          <p className="text-xs text-gray-500">First-time system setup</p>
        </div>

        <div className="mb-4 flex items-center gap-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                  i < step
                    ? 'bg-blue-600 text-white'
                    : i === step
                      ? 'border-2 border-blue-600 text-blue-700'
                      : 'border border-gray-300 bg-white text-gray-400'
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[10px] ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{label}</span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Administrator</h2>
                <p className="mt-0.5 text-xs text-gray-500">First administrator account. Role: Administrator.</p>
              </div>
              {field('Full name', 'fullName', form.fullName, set('fullName'), { placeholder: 'John Doe', autoFocus: true })}
              {field('Email', 'email', form.email, set('email'), { type: 'email', placeholder: 'admin@company.com' })}
              {field('Password', 'password', form.password, set('password'), { type: 'password', placeholder: 'Min. 8 characters' })}
              {field('Confirm password', 'confirmPassword', form.confirmPassword, set('confirmPassword'), { type: 'password', placeholder: 'Re-enter password' })}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Company</h2>
                <p className="mt-0.5 text-xs text-gray-500">Company configuration stored on first run.</p>
              </div>
              {field('Company name', 'companyName', form.companyName, set('companyName'), { placeholder: 'PT Furniture Nusantara', autoFocus: true })}
              {field('Address', 'address', form.address, set('address'), { placeholder: 'Jl. Industri Raya No. 1' })}
              {field('Phone', 'phone', form.phone, set('phone'), { placeholder: '+62 21 555 0000' })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Warehouse</h2>
                <p className="mt-0.5 text-xs text-gray-500">Single warehouse. Code is used in document numbers.</p>
              </div>
              {field('Warehouse name', 'warehouseName', form.warehouseName, set('warehouseName'), { placeholder: 'Jakarta Main Warehouse', autoFocus: true })}
              {field('Warehouse code', 'warehouseCode', form.warehouseCode, set('warehouseCode'), { placeholder: 'WH01' })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Default Locations</h2>
                <p className="mt-0.5 text-xs text-gray-500">Created once, never duplicated.</p>
              </div>
              <div className="space-y-2">
                {DEFAULT_LOCATIONS.map((loc) => (
                  <div key={loc.code} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
                    <Check className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-xs font-medium">{loc.code}</span>
                    <span className="text-xs text-gray-500">{loc.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Default Reason Codes</h2>
                <p className="mt-0.5 text-xs text-gray-500">Created once, never duplicated.</p>
              </div>
              <div className="space-y-2">
                {DEFAULT_REASON_CODES.map((rc) => (
                  <div key={rc.code} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
                    <Check className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-xs font-medium">{rc.code}</span>
                    <span className="text-xs text-gray-500">{rc.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Finish</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Initialize the system. You will be signed in automatically as <span className="font-medium">{form.fullName || 'Administrator'}</span>.
                </p>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Company: {form.companyName || '—'} · Warehouse: {form.warehouseName || '—'} ({form.warehouseCode || '—'})
              </div>
            </div>
          )}

          {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          <div className="mt-6 flex items-center gap-2">
            {step > 0 && step < 5 && (
              <Button type="button" variant="outline" onClick={back} className="h-9 text-sm" disabled={loading}>
                Back
              </Button>
            )}
            {step < 5 && (
              <Button type="button" onClick={next} className="h-9 flex-1 bg-blue-600 text-sm hover:bg-blue-700">
                Continue
              </Button>
            )}
            {step === 5 && (
              <Button type="button" onClick={submit} disabled={loading} className="h-9 flex-1 bg-blue-600 text-sm hover:bg-blue-700">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Initialize system
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
