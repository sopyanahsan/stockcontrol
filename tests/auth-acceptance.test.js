/**
 * auth-acceptance.test.js
 *
 * Acceptance tests for Milestone 1 — Authentication & Session.
 *
 * Covers:
 *   - Password hashing / verification (bcrypt roundtrip)
 *   - Access token creation + cookie helpers
 *   - getAuthUser: cookie, Bearer header, missing/invalid token, inactive user
 *   - RBAC permission helpers
 *
 * Users are created once in setup.js::beforeAll (global.admin, global.supervisor,
 * global.stockClerk). No inventory/warehouse seed is required here.
 *
 * Run: npx jest
 */

const { describe, test, expect } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const {
  hashPassword,
  verifyPassword,
  createAccessToken,
  accessCookie,
  clearCookie,
  getAuthUser,
  hasPermission,
  canManageMaster,
} = require('../lib/auth')

function cookieRequest(token) {
  return {
    cookies: { get: (name) => (name === 'access_token' ? { value: token } : undefined) },
    headers: { get: () => null },
  }
}

function bearerRequest(token) {
  return {
    cookies: { get: () => undefined },
    headers: { get: (name) => (name === 'authorization' ? `Bearer ${token}` : null) },
  }
}

// ---------------------------------------------------------------------------
// Password hashing / verification
// ---------------------------------------------------------------------------

test('auth: hashPassword + verifyPassword roundtrip', () => {
  const hash = hashPassword('S3cret-warehouse!')
  expect(hash).toBeTruthy()
  expect(hash.startsWith('$2')).toBe(true)
  expect(hash).not.toContain('S3cret-warehouse!')

  expect(verifyPassword('S3cret-warehouse!', hash)).toBe(true)
  expect(verifyPassword('wrong-password', hash)).toBe(false)
})

// ---------------------------------------------------------------------------
// Token + cookie helpers
// ---------------------------------------------------------------------------

test('auth: accessCookie / clearCookie shape', () => {
  const token = 'abc123'
  const cookie = accessCookie(token)
  expect(cookie.name).toBe('access_token')
  expect(cookie.value).toBe(token)
  expect(cookie.httpOnly).toBe(true)
  expect(cookie.secure).toBe(true)
  expect(cookie.path).toBe('/')
  expect(cookie.maxAge).toBeGreaterThan(0)

  const cleared = clearCookie()
  expect(cleared.name).toBe('access_token')
  expect(cleared.value).toBe('')
  expect(cleared.maxAge).toBe(0)
})

test('auth: createAccessToken embeds identity + role + type', async () => {
  const token = createAccessToken(global.admin)
  expect(token).toBeTruthy()

  const user = await getAuthUser(cookieRequest(token))
  expect(user).not.toBeNull()
  expect(user.id).toBe(global.admin.id)
  expect(user.email).toBe(global.admin.email)
  expect(user.role).toBe('ADMINISTRATOR')
})

// ---------------------------------------------------------------------------
// getAuthUser — session resolution
// ---------------------------------------------------------------------------

test('auth: getAuthUser resolves user from httpOnly cookie', async () => {
  const token = createAccessToken(global.supervisor)
  const user = await getAuthUser(cookieRequest(token))
  expect(user).not.toBeNull()
  expect(user.id).toBe(global.supervisor.id)
  expect(user.role).toBe('SUPERVISOR')
})

test('auth: getAuthUser resolves user from Bearer header fallback', async () => {
  const token = createAccessToken(global.stockClerk)
  const user = await getAuthUser(bearerRequest(token))
  expect(user).not.toBeNull()
  expect(user.id).toBe(global.stockClerk.id)
  expect(user.role).toBe('STOCK_CONTROL')
})

test('auth: getAuthUser returns null when no token is present', async () => {
  const request = { cookies: { get: () => undefined }, headers: { get: () => null } }
  expect(await getAuthUser(request)).toBeNull()
})

test('auth: getAuthUser rejects a tampered / invalid token', async () => {
  expect(await getAuthUser(cookieRequest('not-a-real-jwt'))).toBeNull()
  expect(await getAuthUser(bearerRequest('Bearer garbage.token.value'))).toBeNull()
})

test('auth: getAuthUser rejects a token with non-access type', async () => {
  const { createAccessToken } = require('../lib/auth')
  const jwt = require('jsonwebtoken')
  const refreshToken = jwt.sign(
    { sub: global.admin.id, email: global.admin.email, role: global.admin.role, type: 'refresh' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256' }
  )
  expect(await getAuthUser(cookieRequest(refreshToken))).toBeNull()
})

test('auth: getAuthUser blocks an inactive (disabled) user', async () => {
  const email = `inactive_${global.seedKey}@test.internal`
  const inactiveUser = await prisma.user.create({
    data: { email, passwordHash: hashPassword('x'), name: 'Disabled User', role: 'STOCK_CONTROL', isActive: false },
  })
  try {
    const token = createAccessToken(inactiveUser)
    expect(await getAuthUser(cookieRequest(token))).toBeNull()
  } finally {
    await prisma.user.delete({ where: { id: inactiveUser.id } })
  }
})

test('auth: getAuthUser returns null for a token of a deleted user', async () => {
  const token = createAccessToken({ id: 'user-does-not-exist', email: 'ghost@test.internal', name: 'Ghost', role: 'ADMINISTRATOR' })
  expect(await getAuthUser(cookieRequest(token))).toBeNull()
})

// ---------------------------------------------------------------------------
// RBAC helpers
// ---------------------------------------------------------------------------

test('auth: RBAC role hierarchy (hasPermission)', () => {
  // ADMINISTRATOR has everything
  expect(hasPermission('ADMINISTRATOR', 'approve')).toBe(true)
  expect(hasPermission('ADMINISTRATOR', 'anything')).toBe(true)

  // SUPERVISOR can approve
  expect(hasPermission('SUPERVISOR', 'approve')).toBe(true)
  expect(hasPermission('SUPERVISOR', 'view')).toBe(true)

  // STOCK_CONTROL cannot approve
  expect(hasPermission('STOCK_CONTROL', 'approve')).toBe(false)
  expect(hasPermission('STOCK_CONTROL', 'post')).toBe(true)

  // Unknown role gets nothing
  expect(hasPermission('UNKNOWN_ROLE', 'view')).toBe(false)
})

test('auth: RBAC master-data guard (canManageMaster)', () => {
  expect(canManageMaster('ADMINISTRATOR')).toBe(true)
  expect(canManageMaster('SUPERVISOR')).toBe(true)
  expect(canManageMaster('STOCK_CONTROL')).toBe(false)
})
