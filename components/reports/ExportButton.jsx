// ============================================================
// ExportButton — Dropdown with CSV / XLSX / Print export
// Uses exportReport() from lib/reports/export-service.js
// Generic: receives rows, columns, filename — knows nothing about data
// ============================================================

'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, Printer, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { exportReport } from '@/lib/reports/export-service'
import { cn } from '@/lib/utils'

/**
 * <ExportButton
 *   rows       = []
 *   columns    = []
 *   filename   = 'report'
 *   title      = 'Report'       // display title for exports
 *   filters    = null           // applied filters string for print header
 *   disabled   = false
 *   className
 * />
 */
export function ExportButton({
  rows = [],
  columns = [],
  filename = 'report',
  title,
  filters = null,
  disabled = false,
  className,
}) {
  const [exporting, setExporting] = useState(null)

  const handleExport = async (format) => {
    if (!rows?.length) return
    setExporting(format)
    try {
      await exportReport(rows, columns, filename, format, {
        title: title || filename,
        filters,
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !rows?.length}
          className={cn('h-8 gap-1.5 text-xs', className)}
        >
          <Download className="h-3.5 w-3.5" />
          Export
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => handleExport('csv')}
          disabled={exporting !== null}
          className="gap-2 text-xs cursor-pointer"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
          {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('xlsx')}
          disabled={exporting !== null}
          className="gap-2 text-xs cursor-pointer"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
          {exporting === 'xlsx' ? 'Exporting...' : 'Export Excel'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('print')}
          disabled={exporting !== null}
          className="gap-2 text-xs cursor-pointer"
        >
          <Printer className="h-3.5 w-3.5 text-gray-500" />
          Print View
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
