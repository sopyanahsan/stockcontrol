import prisma from '@/lib/prisma'

// ============================================================
// First-Time Initialization Gate
// ------------------------------------------------------------
// The system is considered initialized once at least one user
// exists in the database.
// ============================================================

export async function isInitialized() {
  const count = await prisma.user.count()

  console.log('========================================')
  console.log('[Init]')
  console.log(
    'DATABASE =',
    process.env.DATABASE_URL
      ?.replace(/:\/\/.*?:.*?@/, '://****:****@')
  )
  console.log('USER COUNT =', count)
  console.log('INITIALIZED =', count > 0)
  console.log('========================================')

  return count > 0
}