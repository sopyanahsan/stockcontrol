// Evidence Capture shared utilities (RCV-3.3).
// Reusable across Receiving, Putaway, Movement, Adjustment, Cycle Count,
// Picking, Packing, Shipping and Audit.
import { ATTACHMENT_TYPES } from '@/lib/attachments/attachment-types'

// Evidence types reuse the shared attachment-type constants (no duplication).
export const EVIDENCE_TYPES_HEADER = [
  ATTACHMENT_TYPES.DELIVERY_NOTE.key,
  ATTACHMENT_TYPES.INVOICE.key,
  ATTACHMENT_TYPES.TRUCK.key,
  ATTACHMENT_TYPES.SEAL_PHOTO.key,
  ATTACHMENT_TYPES.VEHICLE.key,
  ATTACHMENT_TYPES.OTHER.key,
]

export const EVIDENCE_TYPES_LINE = [
  ATTACHMENT_TYPES.ITEM_PHOTO.key,
  ATTACHMENT_TYPES.DAMAGE_PHOTO.key,
  ATTACHMENT_TYPES.BATCH_PHOTO.key,
  ATTACHMENT_TYPES.BARCODE_PHOTO.key,
  ATTACHMENT_TYPES.SERIAL_PHOTO.key,
  ATTACHMENT_TYPES.LABEL_PHOTO.key,
]

export function isMediaDevicesSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

export function isMobileDevice() {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
}

export function canvasToBlob(canvas, mimeType = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Capture failed'))), mimeType, quality)
  })
}

// Draw the live camera frame to a canvas and return a JPEG Blob.
export async function captureVideoFrame(video, width = 1280, height = 720) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, width, height)
  const blob = await canvasToBlob(canvas)
  return { blob, fileName: `evidence-${Date.now()}.jpg`, mimeType: blob.type || 'image/jpeg' }
}
