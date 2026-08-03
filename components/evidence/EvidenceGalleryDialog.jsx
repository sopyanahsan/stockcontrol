'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Trash2, Minus, Plus } from 'lucide-react'
import { previewKind, formatFileSize } from '@/lib/attachments/attachment-utils'

// Reusable evidence gallery — grid + fullscreen preview + zoom + download +
// delete (editable documents only). Uses the same attachment data/API.
export default function EvidenceGalleryDialog({ open, onOpenChange, attachments = [], editable = false, onDelete }) {
  const [selectedId, setSelectedId] = useState(null)
  const [zoom, setZoom] = useState(1)

  const selected = attachments.find((a) => a.id === selectedId) || attachments[0] || null
  const kind = selected ? previewKind(selected.fileType) : null

  const pick = (id) => {
    setSelectedId(id)
    setZoom(1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Evidence Gallery</DialogTitle>
        </DialogHeader>

        {selected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 p-3">
              {kind === 'image' ? (
                <img
                  src={selected.storageUrl}
                  alt={selected.originalName}
                  className="max-h-72 max-w-full object-contain transition-transform"
                  style={{ transform: `scale(${zoom})` }}
                />
              ) : (
                <a
                  href={selected.storageUrl}
                  download={selected.originalName}
                  className="flex flex-col items-center gap-2 text-xs text-gray-600"
                >
                  {kind === 'pdf' ? <FileText className="h-10 w-10 text-red-500" /> : <FileText className="h-10 w-10 text-gray-400" />}
                  {selected.originalName}
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-800">{selected.originalName}</div>
                <div className="mt-0.5 text-gray-500">
                  {formatFileSize(selected.fileSize)}
                  {selected.description && <Badge variant="outline" className="ml-1.5 text-[9px]">{selected.description}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {kind === 'image' && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))} title="Zoom out">
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-12 text-center tabular-nums text-gray-600">{Math.round(zoom * 100)}%</span>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))} title="Zoom in">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </>
                )}
                <a href={selected.storageUrl} download={selected.originalName}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Download className="mr-1 h-3 w-3" /> Download
                  </Button>
                </a>
                {editable && (
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => onDelete && onDelete(selected.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">No evidence yet</div>
        )}

        {attachments.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {attachments.map((a) => {
              const k = previewKind(a.fileType)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pick(a.id)}
                  className={`overflow-hidden rounded-md border ${
                    a.id === (selected?.id) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                  }`}
                >
                  {k === 'image' ? (
                    <img src={a.storageUrl} alt="" className="h-14 w-full object-cover" />
                  ) : (
                    <div className="flex h-14 items-center justify-center bg-gray-100 text-gray-400">
                      <FileText className="h-5 w-5" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
