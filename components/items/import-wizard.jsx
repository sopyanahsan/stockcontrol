'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, XCircle, Download, RotateCcw } from 'lucide-react'

const MAX_ROWS = 10000

async function readWorkbook(file) {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  return rows.filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''))
}

async function downloadErrorReport(errors, fileName) {
  const XLSX = await import('xlsx')
  const rows = errors.map((e) => [e.row, e.sku || '', (e.reasons || []).join('; ')])
  const ws = XLSX.utils.aoa_to_sheet([['Row', 'SKU', 'Reason'], ...rows])
  ws['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 55 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Errors')
  XLSX.writeFile(wb, `${String(fileName).replace(/\.xlsx$/i, '') || 'master-items'}-errors.xlsx`)
}

const StepBadge = ({ active, done, n }) => (
  <span
    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
      done ? 'bg-green-100 text-green-700' : active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
    }`}
  >
    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
  </span>
)

export default function ImportWizard({ open, onOpenChange, onSuccess }) {
  const fileInput = useRef(null)
  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [totalRows, setTotalRows] = useState(0)
  const [summary, setSummary] = useState(null)
  const [mode, setMode] = useState('')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setStep(1)
    setFileName('')
    setFile(null)
    setPreview([])
    setTotalRows(0)
    setSummary(null)
    setMode('')
    setProgress(0)
    setResult(null)
    setError('')
    setBusy(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleClose = (openState) => {
    if (busy) return
    if (!openState) {
      reset()
      onOpenChange(false)
    }
  }

  const onFileChange = async (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setError('')
    try {
      setBusy(true)
      const rows = await readWorkbook(selected)
      if (rows.length < 2) throw new Error('The file does not contain any data rows')
      const dataRows = rows.slice(1)
      if (dataRows.length > MAX_ROWS) throw new Error(`File exceeds the ${MAX_ROWS.toLocaleString()} row limit`)
      setFileName(selected.name)
      setFile(selected)
      setTotalRows(dataRows.length)
      setPreview(dataRows.slice(0, 15))
      setStep(2)
    } catch (err) {
      setError(err.message || 'Could not read the file')
      toast.error(err.message || 'Could not read the file')
    } finally {
      setBusy(false)
    }
  }

  const runValidation = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    const form = new FormData()
    form.append('file', file)
    form.append('dryRun', 'true')
    try {
      const res = await fetch('/api/items/import', { method: 'POST', body: form, credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || 'Validation failed')
      setSummary(data)
      setStep(3)
    } catch (err) {
      setError(err.message || 'Validation failed')
      toast.error(err.message || 'Validation failed')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (!file || !mode) return
    setBusy(true)
    setError('')
    setProgress(0)
    setResult(null)
    const form = new FormData()
    form.append('file', file)
    form.append('mode', mode)
    try {
      const res = await fetch('/api/items/import', { method: 'POST', body: form, credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.message || 'Import failed')
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('Streaming is not supported by this browser')
      const decoder = new TextDecoder()
      let buf = ''
      let finalResult = null
      let finalError = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.trim()) continue
          const msg = JSON.parse(line)
          if (msg.progress != null) setProgress(msg.progress)
          if (msg.result) finalResult = msg.result
          if (msg.error) finalError = msg.error
        }
      }
      if (finalError) throw new Error(finalError)
      setResult(finalResult)
      setProgress(100)
      setStep(4)
      onSuccess && onSuccess()
      toast.success(`Imported ${finalResult?.imported || 0} item(s)`)
    } catch (err) {
      setError(err.message || 'Import failed')
      toast.error(err.message || 'Import failed')
      setStep(3)
    } finally {
      setBusy(false)
    }
  }

  const stepLabels = ['Upload', 'Preview', 'Validation', 'Import']

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Import Master Items (Excel)</DialogTitle>
          <DialogDescription className="text-xs">
            Upload a <span className="font-mono">.xlsx</span> file matching the template. Up to {MAX_ROWS.toLocaleString()} rows per file.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {stepLabels.map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={label} className="flex items-center gap-1.5">
                <StepBadge active={active} done={done} n={n} />
                <span className={`text-[11px] ${active ? 'font-semibold text-gray-900' : done ? 'text-gray-600' : 'text-gray-400'}`}>{label}</span>
                {n < stepLabels.length && <span className="mx-1 h-px w-6 bg-gray-200" />}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <XCircle className="h-3.5 w-3.5" /> {error}
          </div>
        )}

        {/* STEP 1 — Upload */}
        {step === 1 && (
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center hover:border-blue-400 hover:bg-blue-50/40"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-8 w-8 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">Click to choose an Excel file</p>
            <p className="text-xs text-gray-500">Only .xlsx files are accepted. First row must contain the column headers.</p>
            <input ref={fileInput} type="file" accept=".xlsx" className="hidden" onChange={onFileChange} />
          </div>
        )}

        {/* STEP 2 — Preview */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              <span className="font-medium">{fileName}</span>
              <Badge variant="outline" className="tabular-nums text-[11px]">{totalRows.toLocaleString()} rows</Badge>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    {preview[0]?.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">{String(h ?? '').slice(0, 24) || `Col ${i + 1}`}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-100">
                      {row.map((cell, ci) => <td key={ci} className="whitespace-nowrap px-3 py-1.5 text-gray-600">{String(cell ?? '').slice(0, 32) || '-'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalRows > preview.length && <p className="text-[11px] text-gray-400">Showing first {preview.length} of {totalRows.toLocaleString()} rows.</p>}
          </div>
        )}

        {/* STEP 3 — Validation summary + mode */}
        {step === 3 && summary && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-center">
                <p className="text-lg font-semibold tabular-nums">{summary.totalRows}</p>
                <p className="text-[11px] text-gray-500">Total Rows</p>
              </div>
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center">
                <p className="text-lg font-semibold tabular-nums text-green-700">{summary.validCount}</p>
                <p className="text-[11px] text-green-600">Valid</p>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-center">
                <p className="text-lg font-semibold tabular-nums text-red-700">{summary.invalidCount}</p>
                <p className="text-[11px] text-red-600">Invalid</p>
              </div>
            </div>

            {summary.errors?.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border border-red-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-red-50">
                    <tr className="border-b border-red-200 text-left text-red-700">
                      <th className="px-3 py-1.5 font-medium">Row</th>
                      <th className="px-3 py-1.5 font-medium">SKU</th>
                      <th className="px-3 py-1.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.errors.slice(0, 100).map((e, i) => (
                      <tr key={i} className="border-b border-red-100">
                        <td className="px-3 py-1.5 tabular-nums text-gray-500">{e.row}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-700">{e.sku || '-'}</td>
                        <td className="px-3 py-1.5 text-red-600">{(e.reasons || []).join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
              <Label className="text-xs font-medium">Import Mode</Label>
              <RadioGroup value={mode} onValueChange={setMode}>
                <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5">
                  <RadioGroupItem value="strict" id="mode-strict" className="mt-0.5" />
                  <div>
                    <Label htmlFor="mode-strict" className="text-xs font-medium">Strict — all or nothing</Label>
                    <p className="text-[11px] text-gray-500">If any row is invalid the whole import is aborted. Nothing is written.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5">
                  <RadioGroupItem value="partial" id="mode-partial" className="mt-0.5" />
                  <div>
                    <Label htmlFor="mode-partial" className="text-xs font-medium">Partial — skip invalid rows</Label>
                    <p className="text-[11px] text-gray-500">Valid rows are imported; invalid rows are skipped and reported in the error file.</p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}

        {/* STEP 4 — Progress + result */}
        {step === 4 && (
          <div className="space-y-4 py-2">
            {!result ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing items...</span>
                  <span className="tabular-nums font-medium">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums text-green-700">{result.imported}</p>
                    <p className="text-[11px] text-green-600">Imported</p>
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums text-amber-700">{result.skipped}</p>
                    <p className="text-[11px] text-amber-600">Skipped</p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums">{result.totalRows}</p>
                    <p className="text-[11px] text-gray-500">Total</p>
                  </div>
                </div>
                {result.errors?.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded-md border border-red-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-red-50">
                        <tr className="border-b border-red-200 text-left text-red-700">
                          <th className="px-3 py-1.5 font-medium">Row</th>
                          <th className="px-3 py-1.5 font-medium">SKU</th>
                          <th className="px-3 py-1.5 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.slice(0, 100).map((e, i) => (
                          <tr key={i} className="border-b border-red-100">
                            <td className="px-3 py-1.5 tabular-nums text-gray-500">{e.row}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-700">{e.sku || '-'}</td>
                            <td className="px-3 py-1.5 text-red-600">{(e.reasons || []).join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {step === 4 && result?.errors?.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => downloadErrorReport(result.errors, fileName)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download Error Report
            </Button>
          )}
          {step === 1 && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === 2 && (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setStep(1)}>Back</Button>
              <Button type="button" size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" disabled={busy || !file} onClick={runValidation}>
                {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Validate
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setStep(2)}>Back</Button>
              <Button
                type="button"
                size="sm"
                className="h-8 bg-blue-600 text-xs hover:bg-blue-700"
                disabled={busy || !mode}
                onClick={runImport}
              >
                {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Import ({mode === 'strict' ? 'Strict' : 'Partial'})
              </Button>
            </>
          )}
          {step === 4 && result && (
            <Button type="button" size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => handleClose(false)}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
