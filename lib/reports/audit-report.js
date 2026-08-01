import prisma from '@/lib/prisma'

// ============================================================
// Audit Report Service
// ------------------------------------------------------------
// READ ONLY — never modifies audit logs.
// Single public function: getAuditReport(reportType, filters)
// All helpers are private (not exported).
// getAuditFilterOptions() stays exported — UI needs it for dropdowns.
// ============================================================

const VALID_TYPES = ['audit-trail', 'user-activity', 'inventory-history']

// ---------- Private helpers ----------

function dateRange(fromDate, toDate) {
  const range = {}
  if (fromDate) {
    const d = new Date(fromDate)
    if (!isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); range.gte = d }
  }
  if (toDate) {
    const d = new Date(toDate)
    if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); range.lte = d }
  }
  return Object.keys(range).length ? range : undefined
}

// ----- Audit Trail -----
async function queryAuditTrail({ fromDate, toDate, module, action, entityType, entityId, userId, userName, limit, offset }) {
  const where = {}
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range
  if (module) where.module = module
  if (action) where.action = action
  if (entityType) where.entityType = entityType
  if (entityId) where.entityId = entityId
  if (userId) where.userId = userId
  if (userName) where.userName = { contains: userName, mode: 'insensitive' }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ])

  const rows = data.map((log) => ({
    id: log.id,
    timestamp: log.createdAt,
    userId: log.userId,
    userName: log.userName,
    userEmail: log.user?.email || '—',
    userRole: log.user?.role || '—',
    action: log.action,
    module: log.module,
    entityType: log.entityType,
    entityId: log.entityId || '—',
    description: log.description,
    before: log.before,
    after: log.after,
  }))

  return { data: rows, total }
}

// ----- User Activity -----
async function queryUserActivity({ fromDate, toDate, userId, limit, offset }) {
  const where = {}
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range
  if (userId) where.userId = userId

  const logs = await prisma.auditLog.findMany({
    where,
    select: { userId: true, userName: true, action: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const byUser = {}
  for (const log of logs) {
    const day = new Date(log.createdAt).toISOString().slice(0, 10)
    const key = log.userId || 'unknown'
    if (!byUser[key]) byUser[key] = { userId: key, userName: log.userName, days: {} }
    if (!byUser[key].days[day]) byUser[key].days[day] = { date: day, actions: 0, byAction: {} }
    byUser[key].days[day].actions++
    byUser[key].days[day].byAction[log.action] = (byUser[key].days[day].byAction[log.action] || 0) + 1
  }

  const rows = []
  for (const [, userData] of Object.entries(byUser)) {
    for (const [, dayData] of Object.entries(userData.days)) {
      rows.push({
        userId: userData.userId,
        userName: userData.userName,
        date: dayData.date,
        totalActions: dayData.actions,
        byAction: dayData.byAction,
      })
    }
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || b.totalActions - a.totalActions)
  const total = rows.length
  return { data: rows.slice(offset, offset + limit), total }
}

// ----- Inventory History — server-side running balance (ASC order) -----
async function queryInventoryHistory({ itemId, locationId, fromDate, toDate, txnType, refNumber, limit, offset }) {
  const where = {}
  if (itemId) where.itemId = itemId
  if (locationId) where.locationId = locationId
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range
  if (txnType) where.txnType = txnType
  if (refNumber) where.refNumber = { contains: refNumber, mode: 'insensitive' }

  const [data, total] = await Promise.all([
    prisma.stockLedger.findMany({
      where,
      include: {
        item: { select: { sku: true, name: true, category: { select: { name: true } } } },
        location: { select: { code: true, zone: { include: { warehouse: { select: { code: true } } } } } },
        user: { select: { name: true } },
        reasonCode: { select: { code: true, type: true, description: true } },
      },
      orderBy: { createdAt: 'asc' },  // ASC for correct cumulative running balance
      take: limit,
      skip: offset,
    }),
    prisma.stockLedger.count({ where }),
  ])

  // Server-side running balance
  let balance = 0
  const rows = data.map((l) => {
    balance += l.qty
    return {
      id: l.id,
      timestamp: l.createdAt,
      itemSku: l.item?.sku || '—',
      itemName: l.item?.name || '—',
      category: l.item?.category?.name || '—',
      locationCode: l.location?.code || '—',
      warehouse: l.location?.zone?.warehouse?.code || '—',
      txnType: l.txnType,
      qty: Math.round(l.qty * 100) / 100,
      runningBalance: Math.round(balance * 100) / 100,
      unitCost: l.unitCost,
      refType: l.refType || '—',
      refId: l.refId || '—',
      refNumber: l.refNumber || '—',
      reasonCode: l.reasonCode?.code || '—',
      reasonType: l.reasonCode?.type || '—',
      reasonDescription: l.reasonCode?.description || '—',
      remarks: l.remarks || '—',
      user: l.user?.name || '—',
    }
  })

  return { data: rows, total }
}

// ============================================================
// PUBLIC API — ONE function only
// ============================================================

/**
 * getAuditReport
 *
 * @param {'audit-trail'|'user-activity'|'inventory-history'} reportType
 * @param {object} filters
 * @param {string} [filters.fromDate]
 * @param {string} [filters.toDate]
 * @param {string} [filters.module]
 * @param {string} [filters.action]
 * @param {string} [filters.entityType]
 * @param {string} [filters.entityId]
 * @param {string} [filters.userId]
 * @param {string} [filters.userName]
 * @param {string} [filters.itemId]
 * @param {string} [filters.locationId]
 * @param {string} [filters.txnType]
 * @param {string} [filters.refNumber]
 * @param {number} [filters.limit=500]
 * @param {number} [filters.offset=0]
 * @returns {Promise<{data, total}>}
 */
export async function getAuditReport(reportType, filters = {}) {
  if (!VALID_TYPES.includes(reportType)) {
    throw new Error(`Invalid reportType. Must be one of: ${VALID_TYPES.join(', ')}`)
  }

  const limit = Math.min(Number(filters.limit) || 500, 1000)
  const offset = Number(filters.offset) || 0
  const f = { ...filters, limit, offset }

  switch (reportType) {
    case 'audit-trail':
      return queryAuditTrail(f)
    case 'user-activity':
      return queryUserActivity(f)
    case 'inventory-history':
      return queryInventoryHistory(f)
    default:
      throw new Error(`Unhandled reportType: ${reportType}`)
  }
}

/**
 * getAuditFilterOptions
 *
 * Returns available values for audit report dropdowns.
 * Exported — UI components need this for filter options.
 *
 * @returns {Promise<{ modules, actions, entityTypes, users }>}
 */
export async function getAuditFilterOptions() {
  const [modules, actions, entityTypes, users] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['module'], _count: true, orderBy: { _count: { module: 'desc' } }, take: 50 }),
    prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } } }),
    prisma.auditLog.groupBy({ by: ['entityType'], _count: true, orderBy: { _count: { entityType: 'desc' } }, take: 50 }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
  ])

  return {
    modules: modules.map((m) => ({ value: m.module, count: m._count })),
    actions: actions.map((a) => ({ value: a.action, count: a._count })),
    entityTypes: entityTypes.map((e) => ({ value: e.entityType, count: e._count })),
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
  }
}
