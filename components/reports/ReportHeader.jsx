// ============================================================
// ReportHeader — section title bar
// Reusable across all report pages
// ============================================================

import { cn } from '@/lib/utils'

/**
 * <ReportHeader
 *   title        = "Receiving Report"
 *   subtitle    = "All GRN entries in the selected period"
 *   actions    = <div />
 *   className
 * />
 */
export function ReportHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-4', className)}>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
