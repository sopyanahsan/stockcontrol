import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'

const JWT_ALGORITHM = 'HS256'
const ACCESS_TOKEN_MAX_AGE = 60 * 60 * 12 // 12 hours (warehouse shift)

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(plain, hashed) {
  return bcrypt.compareSync(plain, hashed)
}

export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, type: 'access' },
    process.env.JWT_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn: ACCESS_TOKEN_MAX_AGE }
  )
}

export function accessCookie(token) {
  return {
    name: 'access_token',
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: '/',
  }
}

export function clearCookie() {
  return { name: 'access_token', value: '', httpOnly: true, secure: true, sameSite: 'none', maxAge: 0, path: '/' }
}

// Returns the authenticated user or null. Reads httpOnly cookie, falls back to Bearer header.
export async function getAuthUser(request) {
  let token = request.cookies?.get?.('access_token')?.value
  if (!token) {
    const authHeader = request.headers.get('authorization') || ''
    if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7)
  }
  if (!token) return null
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] })
    if (payload.type !== 'access') return null
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) return null
    return { id: user.id, email: user.email, name: user.name, role: user.role }
  } catch {
    return null
  }
}

// Role hierarchy helpers for RBAC
export const PERMISSIONS = {
  ADMINISTRATOR: ['*'],
  SUPERVISOR: ['view', 'create', 'update', 'approve', 'post', 'export'],
  STOCK_CONTROL: ['view', 'create', 'update', 'post', 'export'],
}

export function hasPermission(role, permission) {
  const perms = PERMISSIONS[role] || []
  return perms.includes('*') || perms.includes(permission)
}

export function canManageMaster(role) {
  return role === 'ADMINISTRATOR' || role === 'SUPERVISOR'
}
