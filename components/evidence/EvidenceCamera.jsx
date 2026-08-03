'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { captureVideoFrame } from '@/lib/evidence/evidence-utils'

// Desktop camera capture using navigator.mediaDevices.getUserMedia().
// Live preview → capture frame → Blob → onCapture. Camera is released
// immediately after capture / unmount.
export default function EvidenceCamera({ onCapture, onCancel }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        setError('Camera unavailable — please use Upload Evidence instead.')
      }
    }
    start()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  const capture = async () => {
    if (!videoRef.current || busy) return
    setBusy(true)
    try {
      const { blob, fileName, mimeType } = await captureVideoFrame(videoRef.current)
      onCapture({ blob, fileName, mimeType })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border border-gray-200 bg-black">
        <video ref={videoRef} className="h-48 w-full object-cover" autoPlay playsInline muted />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white">
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Starting camera...
          </div>
        )}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-8 text-xs" onClick={capture} disabled={!ready || busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1.5 h-3.5 w-3.5" />}
          Capture
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onCancel}>
          <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
        </Button>
      </div>
    </div>
  )
}
