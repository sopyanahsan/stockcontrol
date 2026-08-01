// ============================================================
// ReportFilter — Configurable filter bar
// Generic: conditionally renders filter controls based on props.
// Uses existing shadcn components.
// ============================================================

import { useState } from 'react'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { X, Filter, CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function DateRangePicker({ from, to, onChange }) {
  const [open, setOpen] = useState(false)
  const [fromDate, setFromDate] = useState(from ? new Date(from) : null)
  const [toDate, setToDate] = useState(to ? new Date(to) : null)

  const handleSelect = (date) => {
    if (!fromDate) {
      setFromDate(date)
    } else if (!toDate || date < fromDate) {
      setFromDate(date)
      setToDate(null)
    } else {
      setToDate(date)
      setOpen(false)
      onChange({
        fromDate: format(date, 'yyyy-MM-dd'),
        toDate: format(toDate || date, 'yyyy-MM-dd'),
      })
    }
  }

  const label = () => {
    if (fromDate && toDate) return `${format(fromDate, 'dd MMM')} – ${format(toDate, 'dd MMM yyyy')}`
    if (fromDate) return `From ${format(fromDate, 'dd MMM yyyy')}`
    return 'Date Range'
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-auto gap-1.5 text-xs">
          <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
          <span className={cn(!fromDate && 'text-gray-400')}>{label()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={fromDate}
          onSelect={handleSelect}
          numberOfMonths={2}
          className="rounded-md border"
        />
        <div className="flex items-center justify-between border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setFromDate(null); setToDate(null); onChange({ fromDate: undefined, toDate: undefined }) }}
          >
            Clear
          </Button>
          {fromDate && !toDate && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setToDate(new Date())}>
              Set end today
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ActiveFilters({ filters, onRemove }) {
  const active = Object.entries(filters).filter(([, v]) => v != null && v !== '' && v !== 'ALL')
  if (!active.length) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      {active.map(([key, val]) => (
        <Badge key={key} variant="secondary" className="gap-1 text-[11px]">
          <span className="text-gray-400">{key}:</span> {String(val)}
          <button
            onClick={() => onRemove(key)}
            className="ml-0.5 rounded text-gray-400 hover:text-gray-600"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  )
}

/**
 * <ReportFilter
 *   showDate        = true
 *   showWarehouse   = true
 *   showLocation   = true
 *   showItem       = true
 *   showCategory   = true
 *   showStatus     = true
 *   showOperator   = true
 *   showDocument   = true
 *   warehouses     = []
 *   locations      = []
 *   items         = []
 *   categories     = []
 *   statuses      = []
 *   operators     = []
 *   filterValues  = {}
 *   onChange      = (filters) => {}
 * />
 */
export function ReportFilter({
  showDate = false,
  showWarehouse = false,
  showLocation = false,
  showItem = false,
  showCategory = false,
  showStatus = false,
  showOperator = false,
  showDocument = false,
  warehouses = [],
  locations = [],
  items = [],
  categories = [],
  statuses = [],
  operators = [],
  filterValues = {},
  onChange,
  className,
}) {
  const update = (key, value) => onChange({ ...filterValues, [key]: value })
  const remove = (key) => {
    const next = { ...filterValues }
    delete next[key]
    onChange(next)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* Date Range */}
      {showDate && (
        <DateRangePicker
          from={filterValues.fromDate}
          to={filterValues.toDate}
          onChange={(d) => onChange({ ...filterValues, ...d })}
        />
      )}

      {/* Warehouse */}
      {showWarehouse && (
        <Select value={filterValues.warehouseId || ''} onValueChange={(v) => update('warehouseId', v || undefined)}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Warehouse" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id} className="text-xs">{w.code} — {w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Location */}
      {showLocation && (
        <Select value={filterValues.locationId || ''} onValueChange={(v) => update('locationId', v || undefined)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Location" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-xs">{l.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Item */}
      {showItem && (
        <Select value={filterValues.itemId || ''} onValueChange={(v) => update('itemId', v || undefined)}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Item / SKU" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Items</SelectItem>
            {items.map((it) => (
              <SelectItem key={it.id} value={it.id} className="text-xs">{it.sku} — {it.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Category */}
      {showCategory && (
        <Select value={filterValues.categoryId || ''} onValueChange={(v) => update('categoryId', v || undefined)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Status */}
      {showStatus && (
        <Select value={filterValues.status || ''} onValueChange={(v) => update('status', v || undefined)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">{s.label || s.value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Operator */}
      {showOperator && (
        <Select value={filterValues.operatorId || ''} onValueChange={(v) => update('operatorId', v || undefined)}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Operator" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Operators</SelectItem>
            {operators.map((o) => (
              <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Document Number */}
      {showDocument && (
        <Input
          placeholder="Document #"
          value={filterValues.documentNumber || ''}
          onChange={(e) => update('documentNumber', e.target.value || undefined)}
          className="h-8 w-[160px] text-xs"
        />
      )}

      {/* Active filter pills */}
      <ActiveFilters filters={filterValues} onRemove={remove} />

      {Object.keys(filterValues).some((k) => filterValues[k] != null && filterValues[k] !== '') && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-gray-400 hover:text-gray-600"
          onClick={() => onChange({})}
        >
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  )
}
