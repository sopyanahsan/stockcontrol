// Shared image optimization helpers (RCV-3.2).
// Pure functions — no Cloudinary SDK here. Providers apply these descriptors
// via their own SDK (Cloudinary) or ignore them (LOCAL).

export function isImage(mime) {
  return /^image\//.test(String(mime || ''))
}

export function isVideo(mime) {
  return /^video\//.test(String(mime || ''))
}

export function isPdf(mime) {
  return String(mime || '') === 'application/pdf'
}

// Only images, PDFs and videos can be previewed/thumbnailed.
// DOCX / XLSX / etc. remain download-only.
export function isPreviewSupported(mime) {
  return isImage(mime) || isPdf(mime) || isVideo(mime)
}

// Thumbnail: 300x300 crop=fill, quality=auto, format=auto.
export function buildThumbnail({ width = 300, height = 300 } = {}) {
  return {
    width,
    height,
    crop: 'fill',
    quality: 'auto',
    format: 'auto',
  }
}

// Preview: optimized image; PDF first page; video first frame.
export function buildPreview(mime) {
  if (isImage(mime)) {
    return { quality: 'auto', fetch_format: 'auto' }
  }
  if (isPdf(mime)) {
    return { quality: 'auto', format: 'auto', page: 1 }
  }
  if (isVideo(mime)) {
    return { quality: 'auto', format: 'jpg', start_offset: 0, resource_type: 'video' }
  }
  return {}
}

// Original file download — no optimization, force attachment disposition.
export function buildDownload() {
  return { flags: 'attachment' }
}
