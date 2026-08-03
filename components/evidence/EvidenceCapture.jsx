'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Upload, Camera, Images, Paperclip } from 'lucide-react'
import EvidenceCamera from './EvidenceCamera'
import EvidenceUpload from './EvidenceUpload'
import EvidencePreview from './EvidencePreview'
import EvidenceGalleryDialog from './EvidenceGalleryDialog'
import { isMediaDevicesSupported, isMobileDevice } from '@/lib/evidence/evidence-utils'

// Reusable Enterprise Evidence Capture (RCV-3.3).
// Upload file / take picture (desktop MediaDevices or mobile native camera) /
// view gallery. All uploads go through POST /api/attachments — no direct
// Cloudinary upload, no credentials on the frontend.
export default function EvidenceCapture({
  module,
  referenceId,
  referenceLineId = null,
  editable = false,
  evidenceTypes,
}) {
  const qc = useQueryClient()
  const [mode, setMode] = useState(null) // null | 'upload' | 'camera' | 'capture'
  const [galleryOpen, setGalleryOpen] = useState(false)

  const cameraSupported = isMediaDevicesSupported()
  const mobile = isMobileDevice()

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

  const uploadToApi = (formData) =>
    fetch('/api/attachments', { method: 'POST', body: formData, credentials: 'include' }).then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      return data
    })

  const uploadMut = useMutation({
    mutationFn: uploadToApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments'] })
      setMode(null)
    },
    onError: (e) => alert(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments'] }),
    onError: (e) => alert(e.message),
  })

  const buildForm = (file, description) => {
    const form = new FormData()
    form.append('module', module)
    form.append('referenceId', referenceId)
    if (referenceLineId) form.append('referenceLineId', referenceLineId)
    form.append('description', description || '')
    form.append('file', file)
    return form
  }

  const handleFile = ({ file, type, description }) => {
    const form = buildForm(file, `${type}${description ? ` — ${description}` : ''}`)
    uploadMut.mutate(form)
  }

  const handleCapture = ({ blob, fileName, mimeType }) => {
    const file = new File([blob], fileName, { type: mimeType })
    const form = buildForm(file, 'Captured evidence')
    uploadMut.mutate(form)
  }

  const handleTakePicture = () => {
    if (mobile) setMode('capture')
    else if (cameraSupported) setMode('camera')
    else setMode('upload')
  }

  const canTakePicture = cameraSupported || mobile

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Paperclip className="h-3.5 w-3.5 text-gray-400" /> Evidence
          <Badge variant="outline" className="text-[10px]">{attachments.length}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!editable} onClick={() => setMode('upload')}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload Evidence
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!editable || !canTakePicture} onClick={handleTakePicture}>
          <Camera className="mr-1.5 h-3.5 w-3.5" /> Take Picture
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={attachments.length === 0} onClick={() => setGalleryOpen(true)}>
          <Images className="mr-1.5 h-3.5 w-3.5" /> View Gallery
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-2">
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </div>
      ) : attachments.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {attachments.map((a) => (
            <EvidencePreview
              key={a.id}
              attachment={a}
              editable={editable}
              onOpen={() => setGalleryOpen(true)}
              onDelete={() => deleteMut.mutate(a.id)}
            />
          ))}
        </div>
      ) : null}

      {mode === 'upload' && editable && (
        <EvidenceUpload
          evidenceTypes={evidenceTypes}
          uploading={uploadMut.isPending}
          onFile={handleFile}
          onCancel={() => setMode(null)}
        />
      )}
      {mode === 'camera' && editable && !mobile && cameraSupported && (
        <EvidenceCamera onCapture={handleCapture} onCancel={() => setMode(null)} />
      )}
      {mode === 'capture' && editable && (
        <div className="rounded-md border border-dashed border-gray-200 p-2 text-[11px] text-gray-400">
          <EvidenceUpload
            evidenceTypes={evidenceTypes}
            uploading={uploadMut.isPending}
            onFile={handleFile}
            onCancel={() => setMode(null)}
            capture
          />
          {mobile && <div className="mt-1">Opens your device rear camera via the file picker.</div>}
        </div>
      )}
      {uploadMut.isPending && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading evidence...
        </div>
      )}

      <EvidenceGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        attachments={attachments}
        editable={editable}
        onDelete={(id) => deleteMut.mutate(id)}
      />
    </div>
  )
}
