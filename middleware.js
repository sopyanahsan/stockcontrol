import { NextResponse } from 'next/server'
import { isInitialized } from '@/lib/init'

// ============================================================
// First-Time Setup Middleware — Phase 10.1
// ------------------------------------------------------------
// Before the first administrator is created (SELECT COUNT(*) FROM User == 0),
// every request except static assets, /setup, the setup API, /login, and the
// auth API is redirected to /setup.
//
// After initialization, /setup and the setup API are permanently locked:
//   - /api/setup  -> 403
//   - /setup      -> redirect to the dashboard
//
// Node.js runtime (stable since Next.js 15.5) so Prisma can query the DB.
// ============================================================

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs',
}

export async function middleware(request) {
  const { pathname } = request.nextUrl

  const isSetupPage = pathname === '/setup'
  const isSetupApi = pathname === '/api/setup'
  const isLoginPage = pathname === '/login'
  const isAuthApi = pathname === '/api/auth' || pathname.startsWith('/api/auth/')

  const initialized = await isInitialized()

  // ---- After initialization: /setup is locked forever ----
  if (initialized) {
    if (isSetupApi) {
      return NextResponse.json(
        {
          success: false,
          message: 'Setup is already complete',
          error: 'Setup is already complete',
          errors: [{ message: 'Setup is already complete' }],
        },
        { status: 403 }
      )
    }
    if (isSetupPage) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  // ---- Not initialized: force everything toward /setup ----
  if (isSetupPage || isSetupApi || isLoginPage || isAuthApi) return NextResponse.next()
  return NextResponse.redirect(new URL('/setup', request.url))
}
