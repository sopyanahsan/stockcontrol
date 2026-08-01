// ============================================================
// ErrorState — Report-specific error state
// Generic: accepts error message + retry callback
// ============================================================

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * <ErrorState
 *   error     = string | Error | null
 *   onRetry   = () => {}
 *   className
 * />
 */
export function ErrorState({
  error = null,
  onRetry,
  className,
}) {
  const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'An unexpected error occurred.')

  return (
    <div className={cn('flex flex-col items-center justify-center rounded-md border border-red-100 bg-red-50 py-12 text-center', className)}>
      <div className="rounded-full bg-red-100 p-2.5">
        <AlertTriangle className="h-5 w-5 text-red-500" />
      </div>
      <div className="mt-3 text-sm font-medium text-red-700">Failed to load report</div>
      <div className="mt-1 max-w-sm text-xs text-red-500">{message}</div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5 h-8 text-xs border-red-200 text-red-600 hover:bg-red-100"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  )
}

// Convenience variant for table context
export function ReportTableError({ error, onRetry }) {
  return (
    <div className="rounded-md border border-red-100 bg-red-50">
      <ErrorState error={error} onRetry={onRetry} className="rounded-none border-0 bg-transparent py-8" />
    </div>
  )
}
