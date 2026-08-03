// Local storage provider — the ONLY place in the codebase that interacts with
// the local filesystem for attachments.
import fs from 'fs'
import path from 'path'
import { promises as fsp } from 'fs'
import { randomUUID } from 'crypto'
import { StorageProvider } from '../StorageProvider'

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads')

// Deterministic folder: {module}/{referenceId}/header | line-{referenceLineId}
function buildFolder({ module, referenceId, referenceLineId }) {
  const mod = String(module || 'general').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const ref = String(referenceId || 'unknown')
  const line = referenceLineId ? `line-${referenceLineId}` : 'header'
  return `${mod}/${ref}/${line}`
}

export class LocalStorageProvider extends StorageProvider {
  constructor() {
    super()
    this.kind = 'local'
    this.name = 'LOCAL'
  }

  absPath(storageKey) {
    // path.join normalizes forward-slash keys to the OS separator.
    return path.join(UPLOAD_ROOT, storageKey)
  }

  async save(file, options = {}) {
    const folder = buildFolder(options)
    const fileName = randomUUID()
    const storageKey = `${folder}/${fileName}`
    const absPath = this.absPath(storageKey)
    fs.mkdirSync(path.dirname(absPath), { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await fsp.writeFile(absPath, buffer)

    return {
      provider: this.name,
      storageKey,
      storageUrl: `/api/attachments/${options.id}/file`,
      fileName,
    }
  }

  async read(storageKey) {
    const buffer = await fsp.readFile(this.absPath(storageKey))
    return { buffer, contentType: null }
  }

  async delete(storageKey) {
    try {
      await fsp.unlink(this.absPath(storageKey))
    } catch { /* file may already be gone */ }
    return true
  }

  async exists(storageKey) {
    try {
      await fsp.access(this.absPath(storageKey))
      return true
    } catch {
      return false
    }
  }

  getPublicUrl(storageKey, options = {}) {
    return options.id ? `/api/attachments/${options.id}/file` : null
  }

  // RCV-3.2 — LOCAL serves the original through the proxy for all variants
  // (no transformation capability locally; optimization is Cloudinary-only).
  getThumbnailUrl(storageKey, options = {}) {
    return this.getPublicUrl(storageKey, options)
  }

  getPreviewUrl(storageKey, options = {}) {
    return this.getPublicUrl(storageKey, options)
  }

  getDownloadUrl(storageKey, options = {}) {
    return this.getPublicUrl(storageKey, options)
  }
}
