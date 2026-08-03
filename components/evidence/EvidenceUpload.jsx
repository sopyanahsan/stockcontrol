'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ATTACHMENT_TYPES } from '@/lib/attachments/attachment-types'

// Evidence file picker — desktop file selection + PDF, or native mobile camera
// when `capture` is true (accept="image/*" + capture="environment").
export default function EvidenceUpload({ evidenceTypes, uploading = false, onFile, onCancel, capture = false }) {
  const fileInput = useRef(null)
  const [type, setType] = useState(evidenceTypes[0] || 'OTHER')
  const [description, setDescription] = useState('')

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      onFile({ file, type, description })
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-gray-200 p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Evidence Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {evidenceTypes.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{ATTACHMENT_TYPES[t]?.label || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input className="mt-1 h-8 text-xs" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
          {capture ? 'Take Photo' : 'Choose File'}
        </Button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept={capture ? 'image/*' : 'image/*,application/pdf'}
          {...(capture ? { capture: 'environment' } : {})}
          onChange={handleChange}
        />
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
