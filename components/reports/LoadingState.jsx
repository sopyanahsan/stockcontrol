// ============================================================
// LoadingState — Skeleton variants for report pages
// Generic: renders shimmer placeholders, no business logic
// ============================================================

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ---------- Single skeleton card ----------
export function ReportCardSkeleton({ className }) {
  return (
    <div className={cn('rounded-md border border-gray-200 bg-white p-4 shadow-sm', className)}>
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-6 w-16 mb-1" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

// ---------- KPI grid skeleton ----------
export function KPIGridSkeleton({ count = 4, className }) {
  return (
    <div className={cn('grid gap-3 grid-cols-2 lg:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <ReportCardSkeleton key={i} />
      ))}
    </div>
  )
}

// ---------- Chart skeleton ----------
export function ChartSkeleton({ height = 240, className }) {
  return (
    <div
      className={cn('rounded-md border border-gray-200 bg-white p-4 shadow-sm flex flex-col justify-end', className)}
      style={{ height }}
    >
      <div className="flex items-end gap-1 h-full pb-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-3 w-full mt-3" />
    </div>
  )
}

// ---------- Table skeleton (matches DataTable layout) ----------
export function ReportTableSkeleton({ columns = 5, rows = 8, className }) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Toolbar skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-24 ml-auto" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Table skeleton */}
      <div className="rounded-md border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-3 py-2 text-left">
                  <Skeleton className="h-3 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-t border-gray-100">
                {Array.from({ length: columns }).map((_, j) => (
                  <td key={j} className="px-3 py-2">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination skeleton */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-32" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-7" />)}
        </div>
      </div>
    </div>
  )
}

// ---------- Full page loading ----------
export function ReportPageSkeleton({ className }) {
  return (
    <div className={cn('space-y-4', className)}>
      <KPIGridSkeleton count={4} />
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <ReportTableSkeleton />
    </div>
  )
}
