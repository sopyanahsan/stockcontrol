// ============================================================
// ReportTable — DataTable wrapper for report API responses
// Handles loading, empty, and error states + report response shape
// Reuses existing DataTable component
// Integrates ExportButton with loaded data (never re-queries)
// ============================================================

import DataTable from '@/components/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportTableSkeleton } from './LoadingState'
import { ReportTableEmpty } from './EmptyState'
import { ReportTableError } from './ErrorState'
import { ExportButton } from './ExportButton'

/**
 * <ReportTable
 *   columns     = []       // TanStack Table column defs
 *   data        = []        // report data rows (from API response)
 *   isLoading   = false
 *   error       = null
 *   searchPlaceholder = 'Search records...'
 *   exportName  = 'report'       // filename for exports
 *   exportTitle = null           // display title for exports (defaults to exportName)
 *   exportFilters = null         // applied filters string for print header
 *   onRetry    = () => {}
 *   toolbar     = <div />
 *   pageSize = 25
 * />
 *
 * Export uses SAME data already loaded — never re-queries the API.
 */
export function ReportTable({
  columns = [],
  data = [],
  isLoading = false,
  error = null,
  searchPlaceholder = 'Search records...',
  exportName = 'report',
  exportTitle,
  exportFilters = null,
  onRetry,
  toolbar,
  pageSize = 25,
}) {
  if (isLoading) return <ReportTableSkeleton columns={columns.length} />
  if (error) return <ReportTableError error={error} onRetry={onRetry} />

  const exportColumns = columns
    .filter((c) => c.accessorKey || c.id)
    .map((c) => ({
      accessorKey: c.accessorKey || c.id,
      label: typeof c.header === 'string' ? c.header : (c.id || ''),
    }))

  const exportToolbar = (
    <>
      {toolbar}
      <ExportButton
        rows={data}
        columns={exportColumns}
        filename={exportName}
        title={exportTitle || exportName}
        filters={exportFilters}
      />
    </>
  )

  if (!isLoading && !error && data.length === 0) {
    return <ReportTableEmpty />
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={false}
      searchPlaceholder={searchPlaceholder}
      exportName={exportName}
      toolbar={exportToolbar}
      pageSize={pageSize}
    />
  )
}
