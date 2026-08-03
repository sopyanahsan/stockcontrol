// Cloudinary storage provider — backend-only uploads (never from the browser).
// Reads credentials exclusively from environment via config.js.
import cloudinary from 'cloudinary'
import { randomUUID } from 'crypto'
import { StorageProvider } from '../StorageProvider'
import { CLOUDINARY_CONFIG } from '../config'
import { buildThumbnail, buildPreview, buildDownload } from '@/lib/attachments/attachment-image'

cloudinary.v2.config({
  cloud_name: CLOUDINARY_CONFIG.cloudName,
  api_key: CLOUDINARY_CONFIG.apiKey,
  api_secret: CLOUDINARY_CONFIG.apiSecret,
})

// Deterministic folder: {root}/{module}/{referenceId}/header | line-{lineId}
function buildFolder({ module, referenceId, referenceLineId }) {
  const mod = String(module || 'general').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const ref = String(referenceId || 'unknown')
  const line = referenceLineId ? `line-${referenceLineId}` : 'header'
  return `${CLOUDINARY_CONFIG.folder}/${mod}/${ref}/${line}`
}

export class CloudinaryStorageProvider extends StorageProvider {
  constructor() {
    super()
    this.kind = 'remote'
    this.name = 'CLOUDINARY'
  }

  async save(file, options = {}) {
    const folder = buildFolder(options)
    const fileName = randomUUID()
    const publicId = `${folder}/${fileName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await new Promise((resolve, reject) => {
      cloudinary.v2.uploader
        .upload_stream(
          {
            public_id: publicId,
            resource_type: CLOUDINARY_CONFIG.resourceType,
            // RCV-3.2 image optimization at upload time.
            quality: 'auto',
            fetch_format: 'auto',
            image_metadata: false,
          },
          (error, res) => (error ? reject(error) : resolve(res))
        )
        .end(buffer)
    })

    return {
      provider: this.name,
      storageKey: result.public_id,
      // Proxy endpoint — the frontend never sees Cloudinary URLs or folder layout.
      storageUrl: `/api/attachments/${options.id}/file`,
      fileName,
    }
  }

  async read(storageKey) {
    // Proxy: fetch the asset via getPublicUrl and stream the bytes. This keeps
    // Cloudinary implementation details out of upper layers.
    const url = this.getPublicUrl(storageKey)
    const res = await fetch(url)
    if (!res.ok) throw new Error('Attachment file unavailable')
    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, contentType: res.headers.get('content-type') }
  }

  async delete(storageKey) {
    await new Promise((resolve, reject) => {
      cloudinary.v2.uploader.destroy(storageKey, { resource_type: CLOUDINARY_CONFIG.resourceType }, (error, result) =>
        error ? reject(error) : resolve(result)
      )
    })
    return true
  }

  async exists(storageKey) {
    try {
      await new Promise((resolve, reject) => {
        cloudinary.v2.api.resource(storageKey, { resource_type: CLOUDINARY_CONFIG.resourceType }, (error, res) =>
          error ? reject(error) : resolve(res)
        )
      })
      return true
    } catch {
      return false
    }
  }

  getPublicUrl(storageKey) {
    return cloudinary.url(storageKey, {
      secure: true,
      resource_type: CLOUDINARY_CONFIG.resourceType,
      type: CLOUDINARY_CONFIG.deliveryType,
    })
  }

  // RCV-3.2 — optimized delivery URLs. Original file is always available via
  // getDownloadUrl (and the existing proxy download endpoint).
  getThumbnailUrl(storageKey) {
    return cloudinary.url(storageKey, {
      secure: true,
      resource_type: CLOUDINARY_CONFIG.resourceType,
      type: CLOUDINARY_CONFIG.deliveryType,
      ...buildThumbnail(),
    })
  }

  getPreviewUrl(storageKey, options = {}) {
    const preview = buildPreview(options.fileType)
    return cloudinary.url(storageKey, {
      secure: true,
      resource_type: preview.resource_type || CLOUDINARY_CONFIG.resourceType,
      type: CLOUDINARY_CONFIG.deliveryType,
      ...preview,
    })
  }

  getDownloadUrl(storageKey) {
    return cloudinary.url(storageKey, {
      secure: true,
      resource_type: CLOUDINARY_CONFIG.resourceType,
      type: CLOUDINARY_CONFIG.deliveryType,
      ...buildDownload(),
    })
  }
}
