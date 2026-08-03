'use client'

import { TrendingUp } from 'lucide-react'

export default function TrendAnalyticsPage() {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-8">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-purple-50 p-2 text-purple-600"><TrendingUp className="h-4 w-4" /></div>
        <h2 className="text-sm font-semibold">Trend Analytics</h2>
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Coming Soon</span>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-gray-500">
        Operational trends over time — inbound, outbound, and movement patterns.
        This module is under construction.
      </p>
    </div>
  )
}
