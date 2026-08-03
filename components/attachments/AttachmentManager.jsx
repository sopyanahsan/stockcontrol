'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ImageIcon, FileText, File, Download, Trash2, Loader2, Upload, Paperclip } from 'lucide-react'
import { ATTACHMENT_TYPES, ATTACHMENT_TYPE_LIST } from '@/lib/attachments/attachment-types'
import { previewKind, formatFileSize } from '@/lib/attachments/attachment-utils'

// Reusable Enterprise Attachment Manager (RCV-3.0).
// Shared by every warehouse module — Receiving, Putaway, Movement, etc.
function AttachmentPreview({ attachment }) {
  const kind = previewKind(attachment.fileType)
  if (kind === 'image') {
    return <ImageIcon className="h-4 w-4 shrink-0 text-green-600" />
  }
  if (kind === 'pdf') {
    return <FileText className="h-4 w-4 shrink-0 text-red-500" />
  }
  return <File className="h-4 w-4 shrink-0 text-gray-500" />
}

export default function AttachmentManager({
  module,
  referenceId,
  referenceLineId = null,
  editable = false,
  types = ATTACHMENT_TYPE_LIST.map((t) => t.key),
  compact = false,
  onChanged,
}) {
  const qc = useQueryClient()
  const fileInput = useRef(null)
  const [type, setType] = useState(types[0] || 'OTHER')
  const [description, setDescription] = useState('')

  const queryKey = ['attachments', module, referenceId, referenceLineId || 'all']
  const { data: attachments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api(
        `/attachments?module=${encodeURIComponent(module)}&referenceId=${encodeURIComponent(referenceId)}${
          referenceLineId ? `&referenceLineId=${encodeURIComponent(referenceLineId)}` : ''
        }`
      ),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attachments'] })
    onChanged && onChanged()
  }

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const form = new FormData()
      form.append('module', module)
      form.append('referenceId', referenceId)
      if (referenceLineId) form.append('referenceLineId', referenceLineId)
      form.append('description', description)
      form.append('file', file)
      return fetch('/api/attachments', { method: 'POST', body: form, credentials: 'include' }).then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        return data
      })
    },
    onSuccess: () => {
      setDescription('')
      if (fileInput.current) fileInput.current.value = ''
      invalidate()
    },
    onError: (e) => {
      // surface upload errors via the button label
      alert(e.message)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (e) => alert(e.message),
  })

  const selectedType = ATTACHMENT_TYPES[type]

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Paperclip className="h-3.5 w-3.5 text-gray-400" />
          Attachments
          {attachments.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{attachments.length}</Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
      ) : attachments.length ? (
        <div className="space-y-1">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
              <AttachmentPreview attachment={a} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-gray-700">{a.originalName}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span>{formatFileSize(a.fileSize)}</span>
                  {a.description && <Badge variant="outline" className="text-[9px]">{a.description}</Badge>}
                  {a.uploadedBy?.name && <span>· {a.uploadedBy.name}</span>}
                </div>
              </div>
              <a href={a.storageUrl} target="_blank" rel="noreferrer" className="rounded p-1 text-gray-400 hover:text-gray-700" title="Download">
                <Download className="h-3.5 w-3.5" />
              </a>
              {editable && (
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(a.id)}
                  disabled={deleteMut.isPending}
                  className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-1 text-[11px] text-gray-400">No attachments</div>
      )}

      {editable && (
        <div className="rounded-md border border-dashed border-gray-200 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{ATTACHMENT_TYPES[t]?.label || t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="h-7 min-w-0 flex-1 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={uploadMut.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {uploadMut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
              Upload
            </Button>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadMut.mutate(f)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
