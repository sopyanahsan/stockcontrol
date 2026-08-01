// ============================================================
// SummaryCard — Single KPI stat card
// Generic: accepts icon, label, value, sub-value, accent color
// ============================================================

import { cn } from '@/lib/utils'

const AccentClasses = {
  blue:   'bg-blue-50 text-blue-600',
  green:  'bg-green-50 text-green-600',
  amber:  'bg-amber-50 text-amber-600',
  red:    'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  orange: 'bg-orange-50 text-orange-600',
  gray:   'bg-gray-50 text-gray-500',
}

const defaultAccents = ['blue', 'green', 'amber', 'purple', 'indigo', 'orange']

export function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'blue',
  className,
}) {
  return (
    <div className={cn('rounded-md border border-gray-200 bg-white p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-500 truncate">{label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums truncate">{value ?? '—'}</div>
          {sub != null && <div className="mt-0.5 text-[11px] text-gray-400 truncate">{sub}</div>}
        </div>
        {Icon && (
          <div className={cn('ml-3 rounded-md p-2 shrink-0', AccentClasses[accent] || AccentClasses.blue)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  )
}

export { AccentClasses, defaultAccents }
