/**
 * setup-acceptance.test.js
 *
 * Acceptance tests for Phase 10.1 — First Time System Setup.
 *
 * Covers:
 *   - Pure payload validation (validateSetupPayload)
 *   - Default locations / reason codes integrity (unique, valid enum types)
 *   - Locked-after-initialization security rule (POST /api/setup -> 403,
 *     nothing created; GET status reports initialized)
 *   - Middleware redirect/lock behavior once initialized
 *   - Full atomic initialization via initializeSystem (mocked isInitialized):
 *     admin + company config + warehouse + default locations + reason codes,
 *     auto-login token, audit trail, and refusal to run twice.
 *
 * Notes:
 *   - The shared test DB always contains users (setup.js::beforeAll), so the
 *     count==0 happy path is exercised by mocking lib/init::isInitialized.
 *     The REAL isInitialized logic is asserted directly.
 *   - All records created by the happy-path test are removed in afterEach.
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals')
const { prisma } = require('../lib/prisma')
const {
  initializeSystem,
  validateSetupPayload,
  getSystemStatus,
  DEFAULT_REASON_CODES,
  DEFAULT_LOCATIONS,
} = require('../lib/setup-service')
const { getAuthUser } = require('../lib/auth')

// ----------------------------------------------------------------
// Mock lib/init so we can exercise BOTH branches:
//   isInitialized -> true  (initialized system: /setup locked)
//   isInitialized -> false (fresh system: wizard allowed)
// ----------------------------------------------------------------
jest.mock('../lib/init', () => ({
  isInitialized: jest.fn(),
}))

const { isInitialized } = require('../lib/init')
const { isInitialized: realIsInitialized } = jest.requireActual('../lib/init')
const { middleware } = require('../middleware')

const validPayload = {
  admin: {
    fullName: 'Setup Admin',
    email: 'setupadmin_test_suite_seed@test.internal',
    password: 'StrongPass123!',
    confirmPassword: 'StrongPass123!',
  },
  company: { companyName: 'Test Company Setup', address: 'Jl. Test No. 1', phone: '021-000-0000' },
  warehouse: { name: 'Setup Test Warehouse', code: 'WHSETUPTEST' },
}

const WIZARD_EMAIL = validPayload.admin.email.toLowerCase()

const state = {
  wizardUserId: null,
  warehouseId: null,
  createdReasonCodes: [],
  setupConfigId: null,
  companyConfigId: null,
}

afterEach(async () => {
  if (state.wizardUserId) {
    await prisma.auditLog.deleteMany({ where: { userId: state.wizardUserId } })
    await prisma.user.deleteMany({ where: { id: state.wizardUserId } })
  }
  if (state.warehouseId) {
    await prisma.location.deleteMany({ where: { zone: { warehouseId: state.warehouseId } } })
    await prisma.zone.deleteMany({ where: { warehouseId: state.warehouseId } })
    await prisma.warehouse.deleteMany({ where: { id: state.warehouseId } })
  }
  if (state.createdReasonCodes.length > 0) {
    await prisma.reasonCode.deleteMany({ where: { code: { in: state.createdReasonCodes } } })
  }
  if (state.setupConfigId) await prisma.systemConfig.deleteMany({ where: { id: state.setupConfigId } })
  if (state.companyConfigId) await prisma.systemConfig.deleteMany({ where: { id: state.companyConfigId } })
  state.wizardUserId = null
  state.warehouseId = null
  state.createdReasonCodes = []
  state.setupConfigId = null
  state.companyConfigId = null
})

// ---------------------------------------------------------------------------
// Payload validation (pure, no DB)
// ---------------------------------------------------------------------------

describe('setup: payload validation', () => {
  test('accepts a valid payload and normalizes inputs', () => {
    const p = validateSetupPayload({
      admin: { fullName: '  Setup Admin  ', email: 'Admin@Test.INTERNAL', password: 'StrongPass123!', confirmPassword: 'StrongPass123!' },
      company: { companyName: '  Test Company Setup  ' },
      warehouse: { name: '  Setup Test Warehouse  ', code: 'whsetuptest' },
    })
    expect(p.admin.fullName).toBe('Setup Admin')
    expect(p.admin.email).toBe('admin@test.internal')
    expect(p.admin.password).toBe('StrongPass123!')
    expect(p.company.companyName).toBe('Test Company Setup')
    expect(p.warehouse.name).toBe('Setup Test Warehouse')
    expect(p.warehouse.code).toBe('WHSETUPTEST')
  })

  test('rejects missing administrator', () => {
    expect(() => validateSetupPayload({ company: validPayload.company, warehouse: validPayload.warehouse })).toThrow('Administrator details are required')
  })

  test('rejects empty full name', () => {
    expect(() => validateSetupPayload({ admin: { ...validPayload.admin, fullName: ' ' }, company: validPayload.company, warehouse: validPayload.warehouse })).toThrow('Full name is required')
  })

  test('rejects an invalid email', () => {
    expect(() => validateSetupPayload({ admin: { ...validPayload.admin, email: 'not-an-email' }, company: validPayload.company, warehouse: validPayload.warehouse })).toThrow('A valid email address is required')
  })

  test('rejects a short password', () => {
    expect(() => validateSetupPayload({ admin: { ...validPayload.admin, password: 'short', confirmPassword: 'short' }, company: validPayload.company, warehouse: validPayload.warehouse })).toThrow('Password must be at least 8 characters')
  })

  test('rejects mismatched confirm password', () => {
    expect(() => validateSetupPayload({ admin: { ...validPayload.admin, confirmPassword: 'different' }, company: validPayload.company, warehouse: validPayload.warehouse })).toThrow('Passwords do not match')
  })

  test('rejects missing company information', () => {
    expect(() => validateSetupPayload({ admin: validPayload.admin, warehouse: validPayload.warehouse })).toThrow('Company information is required')
  })

  test('rejects empty company name', () => {
    expect(() => validateSetupPayload({ admin: validPayload.admin, company: { companyName: ' ' }, warehouse: validPayload.warehouse })).toThrow('Company name is required')
  })

  test('rejects missing warehouse information', () => {
    expect(() => validateSetupPayload({ admin: validPayload.admin, company: validPayload.company })).toThrow('Warehouse information is required')
  })

  test('rejects empty warehouse name', () => {
    expect(() => validateSetupPayload({ admin: validPayload.admin, company: validPayload.company, warehouse: { name: ' ', code: 'WH01' } })).toThrow('Warehouse name is required')
  })

  test('rejects an invalid warehouse code', () => {
    expect(() => validateSetupPayload({ admin: validPayload.admin, company: validPayload.company, warehouse: { name: 'WH', code: 'W' } })).toThrow('Warehouse code must be 2-12 characters')
    expect(() => validateSetupPayload({ admin: validPayload.admin, company: validPayload.company, warehouse: { name: 'WH', code: 'WH 01' } })).toThrow('Warehouse code must be 2-12 characters')
    expect(() => validateSetupPayload({ admin: validPayload.admin, company: validPayload.company, warehouse: { name: 'WH', code: 'X'.repeat(13) } })).toThrow('Warehouse code must be 2-12 characters')
  })
})

// ---------------------------------------------------------------------------
// Default integrity (pure)
// ---------------------------------------------------------------------------

describe('setup: default data integrity', () => {
  const REASON_TYPES = ['RECEIVING', 'PUTAWAY', 'MOVEMENT', 'ADJUSTMENT', 'CYCLE_COUNT', 'OPNAME']
  const LOCATION_TYPES = ['RECEIVING', 'STORAGE', 'PICKING', 'STAGING', 'DAMAGED']

  test('default reason codes are unique and use valid types', () => {
    const codes = DEFAULT_REASON_CODES.map((r) => r.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const rc of DEFAULT_REASON_CODES) {
      expect(REASON_TYPES).toContain(rc.type)
      expect(rc.code).toBeTruthy()
      expect(rc.description).toBeTruthy()
    }
  })

  test('default locations are unique and use valid types', () => {
    const codes = DEFAULT_LOCATIONS.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const loc of DEFAULT_LOCATIONS) {
      expect(LOCATION_TYPES).toContain(loc.type)
      expect(loc.code).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Real lib/init + getSystemStatus against the shared DB (initialized state)
// ---------------------------------------------------------------------------

describe('setup: system status', () => {
  test('real isInitialized returns true because users exist', async () => {
    expect(await realIsInitialized()).toBe(true)
  })

  test('getSystemStatus reports initialized with user count', async () => {
    const status = await getSystemStatus()
    expect(status.initialized).toBe(true)
    expect(status.userCount).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Locked-after-initialization security rule (route handlers)
// ---------------------------------------------------------------------------

describe('setup: locked after initialization (route handlers)', () => {
  const { POST, GET } = require('../app/api/setup/route')

  beforeEach(() => {
    isInitialized.mockResolvedValue(true)
  })

  test('GET /api/setup reports initialized when users exist', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.initialized).toBe(true)
    expect(body.userCount).toBeGreaterThan(0)
  })

  test('POST /api/setup is rejected with 403 and creates nothing', async () => {
    const res = await POST(
      new Request('http://localhost/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validPayload),
      })
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toBe('Setup is already complete')

    const user = await prisma.user.findUnique({ where: { email: WIZARD_EMAIL } })
    expect(user).toBeNull()
  })

  test('POST /api/setup is rejected even with a malformed payload', async () => {
    const res = await POST(
      new Request('http://localhost/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    )
    expect(res.status).toBe(403)
  })

  test('POST /api/setup stays locked on repeated calls', async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await POST(
        new Request('http://localhost/api/setup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validPayload),
        })
      )
      expect(res.status).toBe(403)
    }
  })
})

// ---------------------------------------------------------------------------
// Middleware redirect / lock (initialized = true branch)
// ---------------------------------------------------------------------------

describe('setup: middleware behavior once initialized', () => {
  beforeEach(() => {
    isInitialized.mockResolvedValue(true)
  })

  const makeReq = (path) => {
    const r = new Request(`http://localhost${path}`)
    r.nextUrl = new URL(r.url)
    return r
  }

  test('/api/setup is blocked with 403 JSON', async () => {
    const res = await middleware(makeReq('/api/setup'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toBe('Setup is already complete')
  })

  test('/setup page redirects to the dashboard', async () => {
    const res = await middleware(makeReq('/setup'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  test('dashboard, login and auth API pass through', async () => {
    for (const path of ['/', '/login', '/api/auth/login', '/api/items']) {
      const res = await middleware(makeReq(path))
      expect(res.status).toBe(200)
    }
  })
})

// ---------------------------------------------------------------------------
// Full atomic initialization (happy path)
// ---------------------------------------------------------------------------

describe('setup: initializeSystem happy path', () => {
  beforeEach(() => {
    isInitialized.mockResolvedValue(false)
  })

  const cookieRequest = (token) => ({
    cookies: { get: (name) => (name === 'access_token' ? { value: token } : undefined) },
    headers: { get: () => null },
  })

  test('creates admin, company config, warehouse, defaults, and refuses to run twice', async () => {
    const result = await initializeSystem({ body: validPayload })

    // Result shape
    expect(result.user.role).toBe('ADMINISTRATOR')
    expect(result.user.email).toBe(WIZARD_EMAIL)
    expect(result.token).toBeTruthy()
    expect(result.warehouse.code).toBe('WHSETUPTEST')
    expect(result.createdLocations).toHaveLength(DEFAULT_LOCATIONS.length)
    expect(result.createdReasonCodes).toHaveLength(DEFAULT_REASON_CODES.length)

    // Persisted rows
    const dbUser = await prisma.user.findUnique({ where: { email: WIZARD_EMAIL } })
    expect(dbUser).not.toBeNull()
    expect(dbUser.isActive).toBe(true)
    state.wizardUserId = dbUser.id

    const company = await prisma.systemConfig.findUnique({ where: { key: 'company' } })
    expect(company.value.companyName).toBe(validPayload.company.companyName)
    state.companyConfigId = company.id

    const marker = await prisma.systemConfig.findUnique({ where: { key: 'setup' } })
    expect(marker.value.status).toBe('COMPLETED')
    state.setupConfigId = marker.id

    const warehouse = await prisma.warehouse.findUnique({ where: { code: 'WHSETUPTEST' } })
    expect(warehouse).not.toBeNull()
    state.warehouseId = warehouse.id

    for (const loc of DEFAULT_LOCATIONS) {
      const row = await prisma.location.findUnique({ where: { code: loc.code } })
      expect(row).not.toBeNull()
    }
    for (const rc of DEFAULT_REASON_CODES) {
      const row = await prisma.reasonCode.findUnique({ where: { code: rc.code } })
      expect(row).not.toBeNull()
    }
    state.createdReasonCodes = [...result.createdReasonCodes]

    // Audit trail
    const audit = await prisma.auditLog.findFirst({ where: { userId: dbUser.id, action: 'SETUP' } })
    expect(audit).not.toBeNull()
    expect(audit.module).toBe('SYSTEM')

    // Auto-login token resolves to the created administrator
    const authed = await getAuthUser(cookieRequest(result.token))
    expect(authed).not.toBeNull()
    expect(authed.id).toBe(dbUser.id)
    expect(authed.role).toBe('ADMINISTRATOR')

    // Second run is rejected (claim already exists)
    await expect(initializeSystem({ body: validPayload })).rejects.toThrow('Setup is already complete')
  })
})
