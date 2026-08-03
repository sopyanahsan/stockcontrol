'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Barcode, Loader2, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Enterprise Item Selector — reusable across Receiving, Putaway, Movement,
// Adjustment, Picking, Packing, Shipping, Cycle Count and Stock Opname.
//
// Features:
//   - Case-insensitive autocomplete on SKU, barcode, AND item name.
//   - 250ms debounce, max 20 suggestions.
//   - USB barcode scanner support (scanners act as keyboards):
//       scanner → barcode → ENTER → exact match → immediate selection.
//   - Exact match attempted on ENTER against Barcode / SKU before autocomplete.
//   - Success flash (green), inline "Barcode not found" warning with Scan Again.
//   - Autofocus + cleared input after every selection for continuous scanning.
//   - Keyboard: ArrowUp / ArrowDown / Enter / Escape.
//   - `onScanClick` is reserved for the future camera scanner (no-op for now).

const MAX_SUGGESTIONS = 20
const DEBOUNCE_MS = 250
const FLASH_MS = 500

export default function ItemSelector({
  value,
  onChange,
  onScanClick,
  disabled = false,
  placeholder = 'Search SKU, barcode, or item name...',
  items: preloadedItems,
  inputRef,
  onKeyDown,
}) {
  // Data source: reuse a preloaded item list (e.g. from the parent page) or
  // fetch the shared master-item list once.
  const { data: fetchedItems = [], isLoading } = useQuery({
    queryKey: ['items'],
    queryFn: () => api('/items'),
    enabled: !preloadedItems,
  })
  const allItems = preloadedItems || fetchedItems

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [flash, setFlash] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const innerInputRef = useRef(null)
  const containerRef = useRef(null)
  const flashTimeoutRef = useRef(null)

  // Combined ref: keep the parent's ref (e.g. Receiving keyboard navigation)
  // and an internal ref so the selector can re-focus after every selection.
  const setInputRef = (el) => {
    innerInputRef.current = el
    if (typeof inputRef === 'function') inputRef(el)
  }

  // 250ms debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // Clear any pending success flash when the component unmounts.
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    }
  }, [])

  const selectedItem = useMemo(
    () => (value ? allItems.find((i) => i.id === value) || null : null),
    [value, allItems]
  )

  const activeItems = useMemo(() => allItems.filter((it) => it.isActive !== false), [allItems])

  // Simultaneous search on SKU, barcode, and item name. Case-insensitive,
  // whitespace trimmed, capped at MAX_SUGGESTIONS (no filtering after 20).
  const suggestions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return []
    const results = []
    for (const it of activeItems) {
      if (results.length >= MAX_SUGGESTIONS) break
      const sku = String(it.sku || '').toLowerCase()
      const name = String(it.name || '').toLowerCase()
      const barcode = String(it.barcode || '').toLowerCase()
      if (sku.includes(q) || name.includes(q) || barcode.includes(q)) {
        results.push(it)
      }
    }
    return results
  }, [activeItems, debouncedQuery])

  // Exact match on the RAW input (works even before the 250ms debounce fires,
  // which is what USB scanners need: barcode typed fast, then ENTER).
  const exactMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return activeItems.filter(
      (it) =>
        String(it.barcode || '').toLowerCase() === q ||
        String(it.sku || '').toLowerCase() === q
    )
  }, [query, activeItems])

  // Any partial match on the raw input — used to avoid a false "not found"
  // warning while the debounced autocomplete is still computing.
  const hasAnyMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return false
    return activeItems.some(
      (it) =>
        String(it.barcode || '').toLowerCase().includes(q) ||
        String(it.sku || '').toLowerCase().includes(q) ||
        String(it.name || '').toLowerCase().includes(q)
    )
  }, [query, activeItems])

  const showDropdown = open && debouncedQuery.trim() !== ''

  // Keep the first suggestion highlighted so Enter selects it by default.
  useEffect(() => {
    if (showDropdown && suggestions.length > 0) setHighlighted(0)
    else if (showDropdown) setHighlighted(-1)
  }, [debouncedQuery, showDropdown, suggestions.length])

  const flashSuccess = () => {
    setFlash(true)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setFlash(false), FLASH_MS)
  }

  const focusInput = () => {
    // Small delay lets the state settle (input clears) before focusing.
    setTimeout(() => innerInputRef.current?.focus(), 0)
  }

  const selectItem = (item) => {
    setQuery('')
    setDebouncedQuery('')
    setOpen(false)
    setHighlighted(-1)
    setNotFound(false)
    flashSuccess()
    onChange && onChange(item)
    focusInput()
  }

  const handleScanAgain = () => {
    setNotFound(false)
    setQuery('')
    setDebouncedQuery('')
    focusInput()
  }

  const handleScanClick = () => {
    if (onScanClick) onScanClick()
    else console.log('[ItemSelector] Barcode scan not implemented yet')
  }

  const handleEnter = (e) => {
    const q = query.trim()

    // USB scanner flow: barcode/SKU typed → ENTER → exact match → select now.
    if (q) {
      if (exactMatches.length === 1) {
        e.preventDefault()
        selectItem(exactMatches[0])
        return
      }
      // No single exact match — preserve autocomplete behavior.
      if (showDropdown && highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault()
        selectItem(suggestions[highlighted])
        return
      }
      // Nothing selected: warn only when the input matches nothing at all.
      if (!hasAnyMatch) {
        e.preventDefault()
        setNotFound(true)
        return
      }
      // Partial matches exist but nothing chosen yet — let the event bubble
      // (keeps Receiving's Enter-to-next-field navigation working).
      if (typeof onKeyDown === 'function') onKeyDown(e)
      return
    }

    // Empty input → bubble to the parent (field navigation).
    if (typeof onKeyDown === 'function') onKeyDown(e)
  }

  const handleKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Enter') {
      handleEnter(e)
      return
    }
    if (!showDropdown || suggestions.length === 0) {
      // No active suggestions — let the event bubble to the parent.
      if (typeof onKeyDown === 'function') onKeyDown(e)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setHighlighted(-1)
    }
  }

  // While focused the input stays empty (ready for the next scan); when blurred
  // it shows the currently selected item so the operator can review the card.
  const inputValue =
    query !== '' ? query : focused ? '' : selectedItem ? `${selectedItem.sku} - ${selectedItem.name}` : ''

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 transition-colors',
          focused && 'border-blue-400 ring-1 ring-blue-100',
          flash && 'border-green-400 bg-green-50 ring-1 ring-green-100',
          disabled && 'bg-gray-50 opacity-60'
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input
          ref={setInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setQuery(e.target.value)
            setNotFound(false)
            setOpen(true)
          }}
          onFocus={() => {
            setFocused(true)
            setOpen(true)
          }}
          onBlur={() =>
            setTimeout(() => {
              setFocused(false)
              setOpen(false)
              setHighlighted(-1)
            }, 150)
          }
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          className="h-full w-full min-w-0 bg-transparent text-xs outline-none"
        />
        {isLoading && !preloadedItems && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />}
        <button
          type="button"
          tabIndex={-1}
          onClick={handleScanClick}
          disabled={disabled}
          title="Scan barcode (coming soon)"
          aria-label="Scan barcode"
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
        >
          <Barcode className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Unknown barcode inline warning (no dialogs, no new item creation) */}
      {notFound && (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5">
          <span className="text-[11px] text-red-600">Barcode not found</span>
          <button
            type="button"
            onClick={handleScanAgain}
            className="flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-100"
          >
            <RotateCcw className="h-3 w-3" /> Scan Again
          </button>
        </div>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.length > 0 ? (
            suggestions.map((it, idx) => (
              <button
                key={it.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectItem(it)
                }}
                onMouseEnter={() => setHighlighted(idx)}
                className={cn(
                  'block w-full px-3 py-2 text-left',
                  highlighted === idx && 'bg-blue-50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-medium text-gray-800">{it.sku}</div>
                    <div className="truncate text-xs text-gray-600">{it.name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {it.category?.name && (
                      <Badge variant="outline" className="text-[9px]">{it.category.name}</Badge>
                    )}
                    {it.uom?.code && (
                      <Badge variant="outline" className="text-[9px]">{it.uom.code}</Badge>
                    )}
                    {it.serialTracked && (
                      <Badge className="bg-amber-100 text-[9px] text-amber-700">SN</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-xs text-gray-400">No items found</div>
          )}
        </div>
      )}
    </div>
  )
}
