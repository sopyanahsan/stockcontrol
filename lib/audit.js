import prisma from '@/lib/prisma'

// Every mutation in the system MUST call this helper.
export async function logAudit({ user, action, module, entityType, entityId = null, description, before = null, after = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action,
        module,
        entityType,
        entityId,
        description,
        before: before ?? undefined,
        after: after ?? undefined,
      },
    })
  } catch (e) {
    console.error('Audit log failure:', e.message)
  }
}
