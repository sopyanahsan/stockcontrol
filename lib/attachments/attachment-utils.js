// Attachment utilities — preview kind, file names, size formatting.

export function sanitizeFileName(name) {
  const base = String(name || 'file').replace(/[^\w.\-]+/g, '_')
  return base.slice(0, 120)
}

export function isImageType(mime) {
  return /^image\//.test(String(mime || ''))
}

export function isPdfType(mime) {
  return String(mime || '') === 'application/pdf'
}

// 'image' | 'pdf' | 'file' — drives preview rendering.
export function previewKind(mime) {
  if (isImageType(mime)) return 'image'
  if (isPdfType(mime)) return 'pdf'
  return 'file'
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
