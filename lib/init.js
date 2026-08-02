import prisma from '@/lib/prisma'

// First-time initialization gate.
//
// The system is considered "initialized" as soon as a single user exists.
// The first administrator is only ever created through the /setup wizard, so
// a fresh database (SELECT COUNT(*) FROM User == 0) must route to /setup.
export async function isInitialized() {
  const count = await prisma.user.count()
  return count > 0
}
