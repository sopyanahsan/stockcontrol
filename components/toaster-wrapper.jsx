'use client'

import dynamic from 'next/dynamic'

const ToasterClient = dynamic(
  () => import('@/components/toaster').then(m => m.ToasterClient),
  { ssr: false }
)

export function ToasterWrapper() {
  return <ToasterClient />
}
