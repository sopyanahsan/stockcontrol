'use client'

import { Warehouse } from 'lucide-react'

export default function WarehouseAnalyticsPage() {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-8">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-amber-50 p-2 text-amber-600"><Warehouse className="h-4 w-4" /></div>
        <h2 className="text-sm font-semibold">Warehouse Analytics</h2>
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Coming Soon</span>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-gray-500">
        Warehouse operations performance — receiving, putaway, movement, adjustment, and cycle count KPIs.
        This module is under construction.
      </p>
    </div>
  )
}
