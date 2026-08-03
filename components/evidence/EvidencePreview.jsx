'use client'

import { ImageIcon, FileText, File, ZoomIn, Trash2, Download } from 'lucide-react'
import { previewKind } from '@/lib/attachments/attachment-utils'

// Compact evidence tile — image thumbnail, PDF/file icon, quick actions.
export default function EvidencePreview({ attachment, editable = false, onOpen, onDelete }) {
  const kind = previewKind(attachment.fileType)

  return (
    <div className="group relative overflow-hidden rounded-md border border-gray-200 bg-gray-50">
      {kind === 'image' ? (
        <img src={attachment.storageUrl} alt={attachment.originalName} className="h-20 w-full object-cover" />
      ) : (
        <div className="flex h-20 w-full flex-col items-center justify-center gap-1">
          {kind === 'pdf' ? <FileText className="h-6 w-6 text-red-500" /> : <File className="h-6 w-6 text-gray-500" />}
          <span className="max-w-[92%] truncate px-1 text-[9px] text-gray-500">{attachment.originalName}</span>
        </div>
      )}
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <a
          href={attachment.storageUrl}
          download={attachment.originalName}
          className="rounded bg-white/90 p-1 text-gray-600 hover:bg-white"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={onOpen}
          className="rounded bg-white/90 p-1 text-gray-600 hover:bg-white"
          title="View"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        {editable && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded bg-white/90 p-1 text-red-500 hover:bg-white"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
