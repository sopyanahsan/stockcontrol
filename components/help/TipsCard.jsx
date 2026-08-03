'use client'

import { Lightbulb } from 'lucide-react'

export default function TipsCard({ tips = [] }) {
  if (!Array.isArray(tips) || tips.length === 0) return null

  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
        <Lightbulb className="h-3.5 w-3.5" /> Tips
      </div>
      <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-gray-700">
        {tips.map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ul>
    </div>
  )
}
