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
// Node.js runtime so Prisma can query the database.
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
  const isAuthApi =
    pathname === '/api/auth' ||
    pathname.startsWith('/api/auth/')

  const initialized = await isInitialized()

  // ================= DEBUG LOG =================
  console.log('========================================')
  console.log('[Middleware]')
  console.log('PATH        :', pathname)
  console.log('INITIALIZED :', initialized)
  console.log('========================================')
  // =============================================

  // ---- After initialization: /setup is locked forever ----
  if (initialized) {
    if (isSetupApi) {
      console.log('[Middleware] Setup API blocked (already initialized)')

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

    if (isSetupPage) {
      console.log('[Middleware] Redirect /setup -> /')
      return NextResponse.redirect(new URL('/', request.url))
    }

    console.log('[Middleware] Allow request')
    return NextResponse.next()
  }

  // ---- Not initialized ----
  if (isSetupPage || isSetupApi || isLoginPage || isAuthApi) {
    console.log('[Middleware] Allow setup/auth route')
    return NextResponse.next()
  }

  console.log('[Middleware] Redirect -> /setup')
  return NextResponse.redirect(new URL('/setup', request.url))
}