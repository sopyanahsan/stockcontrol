'use client'

import { ArrowDown } from 'lucide-react'

export default function FlowDiagram({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null

  return (
    <ol className="space-y-0">
      {items.map((label, i) => (
        <li key={i}>
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <span className="font-mono text-[10px] text-gray-400">{i + 1}</span>
            {label}
          </div>
          {i < items.length - 1 && (
            <div className="flex justify-center py-0.5 text-gray-300">
              <ArrowDown className="h-4 w-4" />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
