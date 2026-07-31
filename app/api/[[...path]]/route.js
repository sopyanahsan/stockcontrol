import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthUser, verifyPassword, createAccessToken, accessCookie, clearCookie, canManageMaster } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getStockOnHand } from '@/lib/stock'

const json = (data, status = 200) => NextResponse.json(data, { status })
const err = (message, status = 400) => NextResponse.json({ error: message }, { status })

async function parseBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

// ==================== AUTH ====================
async function handleLogin(request) {
  const { email, password } = await parseBody(request)
  if (!email || !password) return err('Email and password are required')
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } })
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    return err('Invalid email or password', 401)
  }
  const token = createAccessToken(user)
  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role }
  const res = json({ user: safeUser })
  res.cookies.set(accessCookie(token))
  await logAudit({ user: safeUser, action: 'LOGIN', module: 'AUTH', entityType: 'User', entityId: user.id, description: `${user.name} logged in` })
  return res
}

async function handleLogout(user) {
  const res = json({ success: true })
  res.cookies.set(clearCookie())
  if (user) await logAudit({ user, action: 'LOGOUT', module: 'AUTH', entityType: 'User', entityId: user.id, description: `${user.name} logged out` })
  return res
}

// ==================== DASHBOARD ====================
async function handleDashboard() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const [totalItems, totalLocations, stockRows, todayMovements, recentLedger, recentAudit] = await Promise.all([
    prisma.item.count({ where: { isActive: true } }),
    prisma.location.count({ where: { isActive: true } }),
    getStockOnHand(),
    prisma.stockLedger.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.stockLedger.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { qty: true, createdAt: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
  ])

  const totalUnits = stockRows.reduce((s, r) => s + r.qty, 0)
  const totalValue = stockRows.reduce((s, r) => s + r.qty * (r.item?.unitCost || 0), 0)

  // Low stock: total per item vs reorder point
  const perItem = {}
  for (const r of stockRows) {
    if (!perItem[r.itemId]) perItem[r.itemId] = { qty: 0, item: r.item }
    perItem[r.itemId].qty += r.qty
  }
  const lowStock = Object.entries(perItem)
    .filter(([, v]) => v.item && v.qty <= (v.item.reorderPoint || 0))
    .map(([itemId, v]) => ({ itemId, sku: v.item.sku, name: v.item.name, qty: v.qty, reorderPoint: v.item.reorderPoint, minStock: v.item.minStock, uom: v.item.uom }))
    .sort((a, b) => a.qty - b.qty)

  // Stock by category
  const byCategory = {}
  for (const r of stockRows) {
    const cat = r.item?.category || 'Uncategorized'
    byCategory[cat] = (byCategory[cat] || 0) + r.qty
  }
  const stockByCategory = Object.entries(byCategory).map(([name, qty]) => ({ name, qty }))

  // Movement trend last 7 days
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en', { weekday: 'short' }), inbound: 0, outbound: 0 })
  }
  const dayMap = Object.fromEntries(days.map((d) => [d.key, d]))
  for (const l of recentLedger) {
    const key = new Date(l.createdAt).toISOString().slice(0, 10)
    if (dayMap[key]) {
      if (l.qty >= 0) dayMap[key].inbound += l.qty
      else dayMap[key].outbound += Math.abs(l.qty)
    }
  }

  return json({
    stats: { totalItems, totalLocations, totalUnits, totalValue, lowStockCount: lowStock.length, todayMovements },
    lowStock: lowStock.slice(0, 8),
    stockByCategory,
    movementTrend: days,
    recentActivity: recentAudit,
  })
}

// ==================== ITEMS ====================
async function listItems() {
  const [items, sums] = await Promise.all([
    prisma.item.findMany({ include: { category: true, uom: true }, orderBy: { sku: 'asc' } }),
    prisma.stockLedger.groupBy({ by: ['itemId'], _sum: { qty: true } }),
  ])
  const stockMap = Object.fromEntries(sums.map((s) => [s.itemId, s._sum.qty || 0]))
  return json(items.map((i) => ({ ...i, onHand: stockMap[i.id] || 0 })))
}

async function createItem(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const b = await parseBody(request)
  if (!b.sku || !b.name || !b.categoryId || !b.uomId) return err('SKU, name, category and UOM are required')
  const exists = await prisma.item.findUnique({ where: { sku: b.sku } })
  if (exists) return err('SKU already exists', 409)
  const item = await prisma.item.create({
    data: {
      sku: b.sku.trim(),
      name: b.name.trim(),
      description: b.description || null,
      barcode: b.barcode || b.sku.trim(),
      categoryId: b.categoryId,
      uomId: b.uomId,
      minStock: Number(b.minStock) || 0,
      maxStock: Number(b.maxStock) || 0,
      reorderPoint: Number(b.reorderPoint) || 0,
      unitCost: Number(b.unitCost) || 0,
    },
  })
  await logAudit({ user, action: 'CREATE', module: 'MASTER_ITEM', entityType: 'Item', entityId: item.id, description: `Created item ${item.sku} - ${item.name}`, after: item })
  return json(item, 201)
}

async function updateItem(request, user, id) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const before = await prisma.item.findUnique({ where: { id } })
  if (!before) return err('Item not found', 404)
  const b = await parseBody(request)
  const item = await prisma.item.update({
    where: { id },
    data: {
      name: b.name ?? before.name,
      description: b.description ?? before.description,
      barcode: b.barcode ?? before.barcode,
      categoryId: b.categoryId ?? before.categoryId,
      uomId: b.uomId ?? before.uomId,
      minStock: b.minStock !== undefined ? Number(b.minStock) : before.minStock,
      maxStock: b.maxStock !== undefined ? Number(b.maxStock) : before.maxStock,
      reorderPoint: b.reorderPoint !== undefined ? Number(b.reorderPoint) : before.reorderPoint,
      unitCost: b.unitCost !== undefined ? Number(b.unitCost) : before.unitCost,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : before.isActive,
    },
  })
  await logAudit({ user, action: 'UPDATE', module: 'MASTER_ITEM', entityType: 'Item', entityId: id, description: `Updated item ${item.sku} - ${item.name}`, before, after: item })
  return json(item)
}

async function deleteItem(user, id) {
  if (user.role !== 'ADMINISTRATOR') return err('Only Administrator can delete items', 403)
  const before = await prisma.item.findUnique({ where: { id } })
  if (!before) return err('Item not found', 404)
  const ledgerCount = await prisma.stockLedger.count({ where: { itemId: id } })
  if (ledgerCount > 0) {
    const item = await prisma.item.update({ where: { id }, data: { isActive: false } })
    await logAudit({ user, action: 'UPDATE', module: 'MASTER_ITEM', entityType: 'Item', entityId: id, description: `Deactivated item ${before.sku} (has stock ledger history, cannot hard delete)`, before, after: item })
    return json({ deactivated: true, message: 'Item has transaction history and was deactivated instead of deleted' })
  }
  await prisma.item.delete({ where: { id } })
  await logAudit({ user, action: 'DELETE', module: 'MASTER_ITEM', entityType: 'Item', entityId: id, description: `Deleted item ${before.sku} - ${before.name}`, before })
  return json({ deleted: true })
}

// ==================== LOCATIONS ====================
async function listWarehouses() {
  const warehouses = await prisma.warehouse.findMany({ include: { zones: { include: { locations: true }, orderBy: { code: 'asc' } } }, orderBy: { code: 'asc' } })
  return json(warehouses)
}

async function listLocations() {
  const [locations, sums] = await Promise.all([
    prisma.location.findMany({ include: { zone: { include: { warehouse: true } } }, orderBy: { code: 'asc' } }),
    prisma.stockLedger.groupBy({ by: ['locationId'], _sum: { qty: true } }),
  ])
  const stockMap = Object.fromEntries(sums.map((s) => [s.locationId, s._sum.qty || 0]))
  return json(locations.map((l) => ({ ...l, onHand: stockMap[l.id] || 0 })))
}

async function createWarehouse(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const b = await parseBody(request)
  if (!b.code || !b.name) return err('Code and name are required')
  const exists = await prisma.warehouse.findUnique({ where: { code: b.code } })
  if (exists) return err('Warehouse code already exists', 409)
  const wh = await prisma.warehouse.create({ data: { code: b.code.trim(), name: b.name.trim(), address: b.address || null } })
  await logAudit({ user, action: 'CREATE', module: 'LOCATION', entityType: 'Warehouse', entityId: wh.id, description: `Created warehouse ${wh.code} - ${wh.name}`, after: wh })
  return json(wh, 201)
}

async function createZone(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const b = await parseBody(request)
  if (!b.warehouseId || !b.code || !b.name) return err('Warehouse, code and name are required')
  const exists = await prisma.zone.findFirst({ where: { warehouseId: b.warehouseId, code: b.code } })
  if (exists) return err('Zone code already exists in this warehouse', 409)
  const zone = await prisma.zone.create({ data: { warehouseId: b.warehouseId, code: b.code.trim(), name: b.name.trim() } })
  await logAudit({ user, action: 'CREATE', module: 'LOCATION', entityType: 'Zone', entityId: zone.id, description: `Created zone ${zone.code} - ${zone.name}`, after: zone })
  return json(zone, 201)
}

async function createLocation(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const b = await parseBody(request)
  if (!b.zoneId || !b.code) return err('Zone and code are required')
  const exists = await prisma.location.findUnique({ where: { code: b.code } })
  if (exists) return err('Location code already exists', 409)
  const loc = await prisma.location.create({ data: { zoneId: b.zoneId, code: b.code.trim(), type: b.type || 'STORAGE' } })
  await logAudit({ user, action: 'CREATE', module: 'LOCATION', entityType: 'Location', entityId: loc.id, description: `Created location ${loc.code} (${loc.type})`, after: loc })
  return json(loc, 201)
}

async function updateLocation(request, user, id) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const before = await prisma.location.findUnique({ where: { id } })
  if (!before) return err('Location not found', 404)
  const b = await parseBody(request)
  const loc = await prisma.location.update({
    where: { id },
    data: {
      code: b.code ?? before.code,
      type: b.type ?? before.type,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : before.isActive,
    },
  })
  await logAudit({ user, action: 'UPDATE', module: 'LOCATION', entityType: 'Location', entityId: id, description: `Updated location ${loc.code}`, before, after: loc })
  return json(loc)
}

async function deleteLocation(user, id) {
  if (user.role !== 'ADMINISTRATOR') return err('Only Administrator can delete locations', 403)
  const before = await prisma.location.findUnique({ where: { id } })
  if (!before) return err('Location not found', 404)
  const ledgerCount = await prisma.stockLedger.count({ where: { locationId: id } })
  if (ledgerCount > 0) {
    const loc = await prisma.location.update({ where: { id }, data: { isActive: false } })
    await logAudit({ user, action: 'UPDATE', module: 'LOCATION', entityType: 'Location', entityId: id, description: `Deactivated location ${before.code} (has ledger history)`, before, after: loc })
    return json({ deactivated: true, message: 'Location has transaction history and was deactivated instead of deleted' })
  }
  await prisma.location.delete({ where: { id } })
  await logAudit({ user, action: 'DELETE', module: 'LOCATION', entityType: 'Location', entityId: id, description: `Deleted location ${before.code}`, before })
  return json({ deleted: true })
}

// ==================== LEDGER & AUDIT ====================
async function listLedger(searchParams) {
  const take = Math.min(Number(searchParams.get('limit')) || 100, 500)
  const where = {}
  if (searchParams.get('itemId')) where.itemId = searchParams.get('itemId')
  if (searchParams.get('locationId')) where.locationId = searchParams.get('locationId')
  if (searchParams.get('txnType')) where.txnType = searchParams.get('txnType')
  const entries = await prisma.stockLedger.findMany({
    where,
    include: { item: { select: { sku: true, name: true } }, location: { select: { code: true } }, reasonCode: { select: { code: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return json(entries)
}

async function listAuditLogs(searchParams) {
  const take = Math.min(Number(searchParams.get('limit')) || 200, 1000)
  const where = {}
  if (searchParams.get('module')) where.module = searchParams.get('module')
  if (searchParams.get('action')) where.action = searchParams.get('action')
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take })
  return json(logs)
}

// ==================== META ====================
async function getMeta() {
  const [categories, uoms, warehouses, reasonCodes] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.uom.findMany({ orderBy: { code: 'asc' } }),
    prisma.warehouse.findMany({ include: { zones: { include: { locations: { where: { isActive: true } } }, orderBy: { code: 'asc' } } }, orderBy: { code: 'asc' } }),
    prisma.reasonCode.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
  ])
  return json({ categories, uoms, warehouses, reasonCodes })
}

// ==================== ROUTER ====================
async function route(request, ctx) {
  const { path = [] } = await ctx.params
  const method = request.method
  const seg = path[0] || ''
  const searchParams = request.nextUrl.searchParams

  try {
    // Public: login
    if (seg === 'auth' && path[1] === 'login' && method === 'POST') return await handleLogin(request)

    const user = await getAuthUser(request)

    if (seg === 'auth') {
      if (path[1] === 'me' && method === 'GET') {
        if (!user) return err('Not authenticated', 401)
        return json({ user })
      }
      if (path[1] === 'logout' && method === 'POST') return await handleLogout(user)
      return err('Not found', 404)
    }

    // Everything below requires authentication
    if (!user) return err('Not authenticated', 401)

    if (seg === 'dashboard' && method === 'GET') return await handleDashboard()
    if (seg === 'meta' && method === 'GET') return await getMeta()

    if (seg === 'items') {
      if (!path[1]) {
        if (method === 'GET') return await listItems()
        if (method === 'POST') return await createItem(request, user)
      } else {
        if (method === 'PUT') return await updateItem(request, user, path[1])
        if (method === 'DELETE') return await deleteItem(user, path[1])
      }
    }

    if (seg === 'warehouses') {
      if (method === 'GET') return await listWarehouses()
      if (method === 'POST') return await createWarehouse(request, user)
    }
    if (seg === 'zones' && method === 'POST') return await createZone(request, user)

    if (seg === 'locations') {
      if (!path[1]) {
        if (method === 'GET') return await listLocations()
        if (method === 'POST') return await createLocation(request, user)
      } else {
        if (method === 'PUT') return await updateLocation(request, user, path[1])
        if (method === 'DELETE') return await deleteLocation(user, path[1])
      }
    }

    if (seg === 'stock' && method === 'GET') return json(await getStockOnHand())
    if (seg === 'ledger' && method === 'GET') return await listLedger(searchParams)
    if (seg === 'audit-logs' && method === 'GET') return await listAuditLogs(searchParams)

    return err('Not found', 404)
  } catch (e) {
    console.error('API error:', e)
    return err('Internal server error: ' + e.message, 500)
  }
}

export async function GET(request, ctx) {
  return route(request, ctx)
}
export async function POST(request, ctx) {
  return route(request, ctx)
}
export async function PUT(request, ctx) {
  return route(request, ctx)
}
export async function DELETE(request, ctx) {
  return route(request, ctx)
}
