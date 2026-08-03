'use client'

import { Badge } from '@/components/ui/badge'
import { Clock, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'

function formatUpdatedAt(date) {
  if (!date) return null
  try {
    return format(new Date(date), 'dd MMM yyyy')
  } catch {
    return null
  }
}

export default function GuideHeader({ guide }) {
  if (!guide) return null

  const updated = formatUpdatedAt(guide.updatedAt)

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{guide.title}</h2>

      {(guide.category || guide.difficulty) && (
        <div className="flex flex-wrap items-center gap-2">
          {guide.category && (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">{guide.category}</Badge>
          )}
          {guide.difficulty && (
            <Badge variant="outline" className="border-gray-200 bg-gray-50 text-[10px] text-gray-600">{guide.difficulty}</Badge>
          )}
        </div>
      )}

      {(typeof guide.estimatedRead === 'number' || updated) && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          {typeof guide.estimatedRead === 'number' && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> ±{guide.estimatedRead} menit
            </span>
          )}
          {updated && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> {updated}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
