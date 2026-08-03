// Attachment input validation — shared by every upload path.
import { ATTACHMENT_MODULES } from './attachment-types'

export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024 // 5 MB

export function validateAttachmentInput({ module, referenceId, file }) {
  if (!module || typeof module !== 'string') throw new Error('Module is required')
  if (!ATTACHMENT_MODULES.includes(module)) throw new Error(`Unsupported module: ${module}`)
  if (!referenceId) throw new Error('Reference ID is required')
  if (!file) throw new Error('File is required')
  const size = Number(file.size || 0)
  if (!size || size <= 0) throw new Error('File is empty')
  if (size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`File exceeds the ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)} MB limit`)
  }
  return true
}
