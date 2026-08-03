import prisma from '@/lib/prisma'
import { isInitialized } from '@/lib/init'
import { hashPassword, createAccessToken } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// ============================================================
// First-Time System Setup Service — Phase 10.1
// ------------------------------------------------------------
// A fresh database (0 users) is initialized through the /setup
// wizard. The system only ever becomes "initialized" once ALL
// steps succeed — the setup record is marked COMPLETED only after
// the administrator, warehouse and defaults are all persisted, so
// a partially-failed setup never looks "done".
//
// Business rules:
//   - No demo users. No seeded administrator.
//   - The first user is always ADMINISTRATOR / ACTIVE.
//   - Single warehouse only.
//   - Default locations + reason codes are created once, never duplicated.
//   - Company configuration is stored in the SystemConfig table.
//
// IMPORTANT (Neon Serverless):
//   Interactive transactions (prisma.$transaction(async (tx) => ...)) are
//   unreliable behind the Neon/Vercel connection pool and throw
//   "Transaction not found". All writes here therefore use the shared
//   Prisma client directly. The old single-commit rollback is emulated by
//   releasing the "setup" claim on failure.
// ============================================================

export const MIN_PASSWORD_LENGTH = 8

export const SETUP_CONFIG_KEY = 'setup'
export const COMPANY_CONFIG_KEY = 'company'

// Default reason codes (idempotent — created only if the code does not exist).
// ReasonType has no RETURN value, so RETURN maps to MOVEMENT (a stock return is
// recorded as an inbound movement back into inventory).
export const DEFAULT_REASON_CODES = [
  { code: 'RECEIVING', type: 'RECEIVING', description: 'Goods receiving' },
  { code: 'ADJUSTMENT', type: 'ADJUSTMENT', description: 'Stock adjustment' },
  { code: 'OPNAME', type: 'OPNAME', description: 'Stock opname variance' },
  { code: 'MOVEMENT', type: 'MOVEMENT', description: 'Stock movement / transfer' },
  { code: 'RETURN', type: 'MOVEMENT', description: 'Return to / from inventory' },
]

// Default locations (LocationType has no RETURN/SCRAP values, so RETURN maps to
// RECEIVING and SCRAP to DAMAGED).
export const DEFAULT_LOCATIONS = [
  { code: 'STAGING', type: 'STAGING', name: 'Staging Area' },
  { code: 'RECEIVING', type: 'RECEIVING', name: 'Receiving Dock' },
  { code: 'RETURN', type: 'RECEIVING', name: 'Return Area' },
  { code: 'SCRAP', type: 'DAMAGED', name: 'Scrap / Damaged' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WAREHOUSE_CODE_RE = /^[A-Z0-9-]{2,12}$/

function normalizeWarehouseCode(code) {
  return String(code || '').trim().toUpperCase()
}

// Pure validation — exported for direct unit testing.
export function validateSetupPayload({ admin, company, warehouse } = {}) {
  if (!admin || typeof admin !== 'object') throw new Error('Administrator details are required')
  const fullName = String(admin.fullName || '').trim()
  if (!fullName) throw new Error('Full name is required')
  const email = String(admin.email || '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) throw new Error('A valid email address is required')
  const password = String(admin.password || '')
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  if (admin.confirmPassword != null && String(admin.confirmPassword) !== password) {
    throw new Error('Passwords do not match')
  }

  if (!company || typeof company !== 'object') throw new Error('Company information is required')
  const companyName = String(company.companyName || '').trim()
  if (!companyName) throw new Error('Company name is required')

  if (!warehouse || typeof warehouse !== 'object') throw new Error('Warehouse information is required')
  const warehouseName = String(warehouse.name || '').trim()
  if (!warehouseName) throw new Error('Warehouse name is required')
  const code = normalizeWarehouseCode(warehouse.code)
  if (!code || !WAREHOUSE_CODE_RE.test(code)) {
    throw new Error('Warehouse code must be 2-12 characters (letters, numbers, or dashes)')
  }

  return {
    admin: { fullName, email, password },
    company: {
      companyName,
      address: company.address != null ? String(company.address).trim() : '',
      phone: company.phone != null ? String(company.phone).trim() : '',
      logo: company.logo != null ? String(company.logo).trim() : '',
    },
    warehouse: {
      name: warehouseName,
      code,
      address: warehouse.address != null ? String(warehouse.address).trim() : '',
    },
  }
}

// System status for the /setup page and middleware.
export async function getSystemStatus() {
  const [userCount, setupRow] = await Promise.all([
    prisma.user.count(),
    prisma.systemConfig.findUnique({ where: { key: SETUP_CONFIG_KEY } }),
  ])
  return {
    initialized: userCount > 0,
    setupCompleted: setupRow?.value?.status === 'COMPLETED',
    userCount,
  }
}

// Company configuration (SystemConfig key "company").
export async function getCompanyConfig() {
  const row = await prisma.systemConfig.findUnique({ where: { key: COMPANY_CONFIG_KEY } })
  return row?.value || null
}

// ==================== INITIALIZE ====================
// Creates: administrator, company config, warehouse, default locations, and
// default reason codes. All writes use the shared Prisma client (no interactive
// transaction — they are unreliable on Neon Serverless).
//
// Concurrency-safe: the unique "setup" key is claimed at the start. A second
// concurrent setup fails here (P2002) regardless of any other state. If any
// later step fails, the claim is released so a retry is not permanently blocked.
export async function initializeSystem({ body } = {}) {
  if (await isInitialized()) throw new Error('Setup is already complete')

  const payload = validateSetupPayload(body || {})

  // Atomic claim — only one setup can ever run. This unique-key claim is the
  // authoritative concurrency guard: a second concurrent setup fails here
  // (P2002) regardless of any other state.
  try {
    await prisma.systemConfig.create({
      data: { key: SETUP_CONFIG_KEY, value: { status: 'IN_PROGRESS', startedAt: new Date().toISOString() } },
    })
  } catch (e) {
    if (e?.code === 'P2002') throw new Error('Setup is already complete')
    throw e
  }

  try {
    // 1. Administrator (ADMINISTRATOR / ACTIVE)
    const existingUser = await prisma.user.findUnique({ where: { email: payload.admin.email } })
    if (existingUser) throw new Error('A user with this email already exists')

    const user = await prisma.user.create({
      data: {
        email: payload.admin.email,
        passwordHash: hashPassword(payload.admin.password),
        name: payload.admin.fullName,
        role: 'ADMINISTRATOR',
        isActive: true,
      },
    })

    // 2. Company configuration (create or replace)
    await prisma.systemConfig.upsert({
      where: { key: COMPANY_CONFIG_KEY },
      update: { value: payload.company },
      create: { key: COMPANY_CONFIG_KEY, value: payload.company },
    })

    // 3. Single warehouse + one default zone (locations belong to a zone)
    const warehouseExists = await prisma.warehouse.findUnique({ where: { code: payload.warehouse.code } })
    if (warehouseExists) throw new Error('Warehouse code already exists')
    const warehouse = await prisma.warehouse.create({
      data: {
        code: payload.warehouse.code,
        name: payload.warehouse.name,
        address: payload.warehouse.address || null,
      },
    })
    const zone = await prisma.zone.create({
      data: { warehouseId: warehouse.id, code: 'MAIN', name: 'Main Zone' },
    })

    // 4. Default locations (never duplicated by code).
    // createMany with skipDuplicates is the idempotent bulk insert; the lookup
    // below only exists so the response reports exactly which codes were created.
    const existingLocationCodes = new Set(
      (
        await prisma.location.findMany({
          where: { code: { in: DEFAULT_LOCATIONS.map((loc) => loc.code) } },
          select: { code: true },
        })
      ).map((loc) => loc.code)
    )
    const locationsToCreate = DEFAULT_LOCATIONS.filter((loc) => !existingLocationCodes.has(loc.code))
    const createdLocations = []
    if (locationsToCreate.length > 0) {
      await prisma.location.createMany({
        data: locationsToCreate.map((loc) => ({
          zoneId: zone.id,
          code: loc.code,
          name: loc.name,
          type: loc.type,
          isActive: true,
        })),
        skipDuplicates: true,
      })
      createdLocations.push(...locationsToCreate.map((loc) => loc.code))
    }

    // 5. Default reason codes (never duplicated by code).
    const existingReasonCodes = new Set(
      (
        await prisma.reasonCode.findMany({
          where: { code: { in: DEFAULT_REASON_CODES.map((rc) => rc.code) } },
          select: { code: true },
        })
      ).map((rc) => rc.code)
    )
    const reasonCodesToCreate = DEFAULT_REASON_CODES.filter((rc) => !existingReasonCodes.has(rc.code))
    const createdReasonCodes = []
    if (reasonCodesToCreate.length > 0) {
      await prisma.reasonCode.createMany({
        data: reasonCodesToCreate.map((rc) => ({
          code: rc.code,
          type: rc.type,
          description: rc.description,
          isActive: true,
        })),
        skipDuplicates: true,
      })
      createdReasonCodes.push(...reasonCodesToCreate.map((rc) => rc.code))
    }

    // Mark the setup record as completed (durable audit marker).
    await prisma.systemConfig.update({
      where: { key: SETUP_CONFIG_KEY },
      data: { value: { status: 'COMPLETED', completedAt: new Date().toISOString(), warehouseId: warehouse.id, zoneId: zone.id, userId: user.id } },
    })

    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role }

    // Audit after all database writes succeed (logAudit uses the shared client).
    await logAudit({
      user: safeUser,
      action: 'SETUP',
      module: 'SYSTEM',
      entityType: 'User',
      entityId: safeUser.id,
      description: `System initialized — first administrator ${safeUser.name} created`,
      after: { warehouse: warehouse.code, locations: createdLocations, reasonCodes: createdReasonCodes },
    })

    // Auto-login token so the wizard can hand off straight into the dashboard.
    const token = createAccessToken(user)

    return {
      user: safeUser,
      token,
      warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
      createdLocations,
      createdReasonCodes,
    }
  } catch (e) {
    // Emulates the rollback of the removed transaction: if any step above fails,
    // release the "setup" claim (unless already COMPLETED) so a failed attempt
    // never permanently bricks the system. The original error is rethrown as-is.
    try {
      const claim = await prisma.systemConfig.findUnique({ where: { key: SETUP_CONFIG_KEY } })
      if (claim && claim.value?.status !== 'COMPLETED') {
        await prisma.systemConfig.delete({ where: { key: SETUP_CONFIG_KEY } })
      }
    } catch {
      // Cleanup is best-effort — never mask the original error.
    }
    throw e
  }
}
