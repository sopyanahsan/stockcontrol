'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { CheckCircle2, XCircle, ScanLine } from 'lucide-react'

// ============================================================
// BarcodeInput
// ------------------------------------------------------------
// Hardware-independent barcode input.
// Works with:
//   - Keyboard typing (press Enter)
//   - USB / Bluetooth scanners (emit keystrokes + Enter)
//   - Copy & paste
//   - Camera / mobile scanners can be added later without
//     changing the parent's business logic - just call `submit()`
//     via ref or pass an initialValue.
// ------------------------------------------------------------
// Props:
//   onScan(code)                Required. Called with trimmed code.
//   validator(code) -> {ok,msg} Optional. Sync validator run before onScan.
//   duplicateGuardMs            Default 400ms - blocks identical repeat scans.
//   autoFocus                   Default true.
//   placeholder                 Default 'Scan or type barcode...'
//   disabled                    Boolean.
//   size                        'md' | 'lg' (default md)
// ============================================================

export default function BarcodeInput({
  onScan,
  validator,
  duplicateGuardMs = 400,
  autoFocus = true,
  placeholder = 'Scan or type barcode, then press Enter',
  disabled = false,
  size = 'md',
  label,
  hint,
}) {
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState(null) // { ok, message }
  const inputRef = useRef(null)
  const lastRef = useRef({ code: '', at: 0 })

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [autoFocus])

  const submit = useCallback(async () => {
    const code = String(value).trim()
    if (!code) return

    // Duplicate guard - same code within window
    const now = Date.now()
    if (lastRef.current.code === code && now - lastRef.current.at < duplicateGuardMs) {
      setFeedback({ ok: false, message: `Duplicate scan blocked (${code})` })
      setValue('')
      inputRef.current?.focus()
      return
    }

    // Sync validator
    if (validator) {
      const v = validator(code)
      if (v && v.ok === false) {
        setFeedback({ ok: false, message: v.message || 'Invalid barcode' })
        setValue('')
        inputRef.current?.focus()
        return
      }
    }

    try {
      const result = await onScan(code)
      lastRef.current = { code, at: now }
      if (result && result.ok === false) {
        setFeedback({ ok: false, message: result.message || 'Rejected' })
      } else {
        setFeedback({ ok: true, message: (result && result.message) || `Accepted: ${code}` })
      }
    } catch (e) {
      setFeedback({ ok: false, message: e?.message || 'Scan failed' })
    } finally {
      setValue('')
      // Auto-refocus for continuous scanning
      inputRef.current?.focus()
    }
  }, [value, validator, onScan, duplicateGuardMs])

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const sizeClasses = size === 'lg' ? 'h-11 text-base' : 'h-9 text-sm'

  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs font-medium text-gray-700">{label}</div>}
      <div className="relative">
        <ScanLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={`pl-8 font-mono ${sizeClasses}`}
          autoComplete="off"
          spellCheck={false}
          data-barcode-input
        />
      </div>
      {hint && !feedback && <div className="text-[11px] text-gray-500">{hint}</div>}
      {feedback && (
        <div
          className={`flex items-center gap-1.5 text-[11px] ${feedback.ok ? 'text-green-600' : 'text-red-600'}`}
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {feedback.message}
        </div>
      )}
    </div>
  )
}

// ============================================================
// createScanSession - reusable client-side session tracker
// ------------------------------------------------------------
// Prevents duplicate scans within a single transaction (e.g.,
// same serial number scanned twice on a receiving line).
// ============================================================
export function createScanSession() {
  const set = new Set()
  const list = []
  return {
    has: (code) => set.has(code),
    add: (code) => {
      if (set.has(code)) return false
      set.add(code)
      list.push(code)
      return true
    },
    remove: (code) => {
      if (!set.has(code)) return false
      set.delete(code)
      const i = list.indexOf(code)
      if (i >= 0) list.splice(i, 1)
      return true
    },
    clear: () => {
      set.clear()
      list.length = 0
    },
    list: () => [...list],
    size: () => set.size,
  }
}
