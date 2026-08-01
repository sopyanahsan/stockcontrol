// ============================================================
// EmptyState — Report-specific empty state
// Generic: no business logic
// ============================================================

import { FileSearch } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * <EmptyState
 *   title    = 'No records found'
 *   message  = 'Try adjusting your filters or date range.'
 *   className
 * />
 */
export function EmptyState({
  title = 'No records found',
  message = 'Try adjusting your filters or date range.',
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-md border border-gray-200 bg-white py-16 text-center', className)}>
      <div className="rounded-full bg-gray-50 p-3">
        <FileSearch className="h-6 w-6 text-gray-300" />
      </div>
      <div className="mt-3 text-sm font-medium text-gray-700">{title}</div>
      {message && <div className="mt-1 text-xs text-gray-400">{message}</div>}
    </div>
  )
}

// Convenience variant for table context
export function ReportTableEmpty() {
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileSearch className="h-6 w-6 text-gray-300" />
        <div className="mt-2 text-sm font-medium text-gray-700">No records found</div>
        <div className="mt-1 text-xs text-gray-400">Try adjusting your filters or date range.</div>
      </div>
    </div>
  )
}
