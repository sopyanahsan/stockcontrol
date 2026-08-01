'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * <ErrorState
 *   error     = string | Error | null
 *   onRetry   = () => {}
 *   title     = "Failed to load"  (optional)
 *   className
 * />
 */
export function ErrorState({
  error = null,
  onRetry,
  title = 'Failed to load',
  className,
}) {
  const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'An unexpected error occurred.')

  return (
    <div className={cn('flex flex-col items-center justify-center rounded-md border border-red-100 bg-red-50 py-12 text-center', className)}>
      <div className="rounded-full bg-red-100 p-2.5">
        <AlertCircle className="h-5 w-5 text-red-500" />
      </div>
      <div className="mt-3 text-sm font-medium text-red-700">{title}</div>
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
