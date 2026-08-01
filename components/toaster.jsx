'use client'

import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'

export function ToasterClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (
    <Toaster position="top-right" richColors closeButton toastOptions={{ style: { borderRadius: '6px' } }} />
  )
}
