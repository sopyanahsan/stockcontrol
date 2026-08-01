import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MapPin, CheckCircle2 } from 'lucide-react'

export function ScanLocationCard({ onScan, isLoading }) {
  const [locationCode, setLocationCode] = useState('')
  const inputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!locationCode.trim()) return
    onScan(locationCode.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-blue-200 bg-blue-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-medium text-blue-700">Scan Location Barcode</span>
      </div>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          placeholder="Scan or type location code..."
          className="h-9 flex-1 text-sm font-mono"
          autoFocus
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 bg-blue-600 hover:bg-blue-700"
          disabled={isLoading || !locationCode.trim()}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go'}
        </Button>
      </div>
    </form>
  )
}
