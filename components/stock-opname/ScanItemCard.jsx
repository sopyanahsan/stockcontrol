import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Package, CheckCircle2 } from 'lucide-react'

export function ScanItemCard({ onScan, isLoading, scannedItem }) {
  const [barcode, setBarcode] = useState('')
  const inputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!barcode.trim()) return
    onScan(barcode.trim())
    setBarcode('')
    inputRef.current?.focus()
  }

  return (
    <div className="rounded-md border border-green-200 bg-green-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Package className="h-4 w-4 text-green-600" />
        <span className="text-xs font-medium text-green-700">Scan Item Barcode</span>
        {scannedItem && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Scanned
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Scan item barcode..."
          className="h-9 flex-1 text-sm font-mono"
          autoFocus={!scannedItem}
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 bg-green-600 hover:bg-green-700"
          disabled={isLoading || !barcode.trim()}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go'}
        </Button>
      </form>

      {scannedItem && (
        <div className="mt-2 flex items-center gap-2 rounded border border-green-200 bg-white px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs font-medium">{scannedItem.item?.sku}</div>
            <div className="truncate text-[11px] text-gray-500">{scannedItem.item?.name}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-gray-500">System</div>
            <div className="font-mono text-xs tabular-nums">{scannedItem.line?.systemQty}</div>
          </div>
        </div>
      )}
    </div>
  )
}
