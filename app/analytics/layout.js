'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import AppShell from '@/components/app-shell'
import HelpButton from '@/components/help/HelpButton'

// Analytics module pages — each maps to a contextual help guide.
const ANALYTICS_PAGES = [
  { href: '/analytics/executive', label: 'Executive Dashboard', description: 'High-level warehouse performance overview', pageId: 'analytics-executive' },
  { href: '/analytics/inventory', label: 'Inventory Analytics', description: 'Stock health, value, and composition', pageId: 'analytics-inventory' },
  { href: '/analytics/warehouse', label: 'Warehouse Analytics', description: 'Warehouse operations performance', pageId: 'analytics-warehouse' },
  { href: '/analytics/suppliers', label: 'Supplier Analytics', description: 'Supplier base and inbound performance', pageId: 'analytics-suppliers' },
  { href: '/analytics/trends', label: 'Trend Analytics', description: 'Operational trends over time', pageId: 'analytics-trends' },
]

export default function AnalyticsLayout({ children }) {
  const pathname = usePathname()
  const current = ANALYTICS_PAGES.find((p) => pathname === p.href) || ANALYTICS_PAGES[0]

  return (
    <AppShell
      title={current.label}
      subtitle={current.description}
      actions={<HelpButton pageId={current.pageId} />}
    >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-gray-500">
        <Link href="/" className="hover:text-blue-600">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/analytics/executive" className="hover:text-blue-600">Analytics</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-gray-700">{current.label}</span>
      </nav>

      {/* Content container */}
      <div className="space-y-4">{children}</div>
    </AppShell>
  )
}
