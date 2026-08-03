// Reusable Enterprise Attachment Service (RCV-3.0).
// Storage is provider-driven (see lib/storage) — swap backend via STORAGE_PROVIDER.
import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { validateAttachmentInput } from './attachment-validator'
import { getStorageProvider, getStorageProviderByName } from '@/lib/storage/StorageFactory'

// Create an attachment: validate, store via the active provider, persist
// metadata, and record an "Attachment added" audit entry.
export async function createAttachment({ user, module, referenceId, referenceLineId = null, file, description = null }) {
  validateAttachmentInput({ module, referenceId, file })

  const id = crypto.randomUUID()
  const provider = getStorageProvider()
  const result = await provider.save(file, { id, module, referenceId, referenceLineId })

  const attachment = await prisma.attachment.create({
    data: {
      module,
      referenceId,
      referenceLineId,
      fileName: result.fileName,
      originalName: file.name || 'file',
      fileType: file.type || 'application/octet-stream',
      fileSize: Number(file.size) || 0,
      description,
      uploadedById: user.id,
      storageProvider: result.provider,
      storageKey: result.storageKey,
      storageUrl: result.storageUrl,
    },
  })

  await logAudit({
    user,
    action: 'CREATE',
    module,
    entityType: 'Attachment',
    entityId: id,
    description: `Attachment added: ${attachment.originalName}${attachment.description ? ` (${attachment.description})` : ''} on ${module} ${referenceId}`,
    after: { id, originalName: attachment.originalName, description: attachment.description, module, referenceId, referenceLineId, storageProvider: result.provider },
  })

  return attachment
}

// List attachments for a module/reference (optionally per line).
export async function listAttachments({ module, referenceId, referenceLineId = null, activeOnly = true }) {
  const where = { module, referenceId, ...(activeOnly ? { isActive: true } : {}) }
  if (referenceLineId) where.referenceLineId = referenceLineId
  return prisma.attachment.findMany({
    where,
    orderBy: { uploadedAt: 'desc' },
    include: { uploadedBy: { select: { name: true } } },
  })
}

export async function getAttachment(id) {
  return prisma.attachment.findUnique({ where: { id } })
}

// Soft-delete (isActive=false), remove the physical asset via the provider, and
// record an "Attachment removed" audit entry.
export async function deleteAttachment({ user, id }) {
  const att = await prisma.attachment.findUnique({ where: { id } })
  if (!att) throw new Error('Attachment not found')

  const provider = getStorageProviderByName(att.storageProvider)
  try {
    await provider.delete(att.storageKey)
  } catch { /* physical asset may already be gone */ }

  const updated = await prisma.attachment.update({ where: { id }, data: { isActive: false } })

  await logAudit({
    user,
    action: 'DELETE',
    module: att.module,
    entityType: 'Attachment',
    entityId: id,
    description: `Attachment removed: ${att.originalName}`,
    before: { id, originalName: att.originalName, module: att.module, referenceId: att.referenceId, storageProvider: att.storageProvider },
  })

  return updated
}

// Read the stored asset for preview / download. The provider's read() handles
// both LOCAL (filesystem) and CLOUDINARY (proxy via getPublicUrl) transparently.
export async function readAttachmentFile(attachment) {
  const provider = getStorageProviderByName(attachment.storageProvider)
  const read = await provider.read(attachment.storageKey, { id: attachment.id })
  return {
    ...read,
    contentType: read.contentType || attachment.fileType,
    originalName: attachment.originalName,
  }
}
