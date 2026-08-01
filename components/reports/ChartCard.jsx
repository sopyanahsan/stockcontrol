// ============================================================
// ChartCard — wrapper for charts with consistent card styling
// Reusable across all report pages
// ============================================================

import { cn } from '@/lib/utils'

/**
 * <ChartCard
 *   title       = "Movement Trend"
 *   subtitle   = "30-day inbound vs outbound"
 *   actions   = <div />  // optional right-aligned actions
 *   className
 *   children             // chart content
 * />
 */
export function ChartCard({ title, subtitle, actions, children, className }) {
  return (
    <div className={cn('rounded-md border border-gray-200 bg-white p-4 shadow-sm', className)}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-gray-400">{subtitle}</div>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
