import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthUser, verifyPassword, createAccessToken, accessCookie, clearCookie, canManageMaster } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getStockOnHand } from '@/lib/stock'
import { getDashboardMetrics } from '@/lib/analytics/kpi-engine'
import {
  createAttachment,
  listAttachments,
  getAttachment,
  deleteAttachment,
  readAttachmentFile,
} from '@/lib/attachments/attachment-service'
import {
  createReceivingDraft,
  updateReceivingDraft,
  startReceiving,
  postReceiving,
  cancelReceiving,
  listReceivings,
  getReceiving,
  receiveOutstanding,
} from '@/lib/receiving-service'
import {
  listPutawayTasks,
  getPutawayTask,
  startPutawayTask,
  completePutawayTask,
  cancelPutawayTask,
} from '@/lib/putaway-service'
import {
  listMovements,
  getMovement,
  createMovement,
  postMovement,
  cancelMovement,
  getStockCard,
  previewMovement,
} from '@/lib/movement-service'
import {
  listAdjustments,
  getAdjustment,
  createAdjustment,
  updateAdjustment,
  postAdjustment,
  cancelAdjustment,
  previewAdjustment,
} from '@/lib/adjustment-service'
import {
  listCycleCounts,
  getCycleCount,
  createCycleCount,
  assignCycleCount,
  startCycleCount,
  submitCycleCount,
  approveCycleCount,
  cancelCycleCount,
  getItemsAtLocation,
} from '@/lib/cycle-count-service'
import {
  listPickingOrders,
  getPickingOrder,
  createPickingOrder,
  updatePickingOrder,
  generateFifoSuggestions,
  assignPicker,
  startPickingOrder,
  executePickTask,
  skipPickTask,
  completePickingOrder,
  cancelPickingOrder,
  previewFifoSuggestions,
} from '@/lib/picking-service'
import {
  getPackingQueue,
  listPackingOrders,
  getPackingOrder,
  getPackingOrderByNumber,
  createPackingOrder,
  assignPacker,
  startPackingOrder,
  createPackage,
  getPackage,
  getPackageByNumber,
  scanItemToPackage,
  updatePackage,
  closePackage,
  reopenPackage,
  completePackingOrder,
  cancelPackingOrder,
  getPackingKPIs,
} from '@/lib/packing-service'
import {
  getShippingQueue,
  listShipments,
  getShipment,
  getShipmentByNumber,
  createShipment,
  assignShipper,
  startShipment,
  scanPackage,
  verifyPackage,
  verifySerials,
  previewShipment,
  confirmShipment,
  retryShipment,
  cancelShipment,
  getShippingKPIs,
} from '@/lib/shipping-service'
import { lookupByBarcode } from '@/lib/barcode-service'
import { parseItemWorkbook, dryRunItemImport, importItems, ItemImportError, IMPORT_MAX_ROWS } from '@/lib/item-import-service'
import { exportItemsToWorkbook } from '@/lib/item-export-service'
import { buildItemTemplateWorkbook } from '@/lib/item-template-service'

// ---------- Supplier Service ----------
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  setSupplierActive,
  deleteSupplier,
  getSupplierReport,
} from '@/lib/supplier-service'
import {
  parseSupplierWorkbook,
  dryRunSupplierImport,
  importSuppliers,
  SupplierImportError,
  SUPPLIER_IMPORT_MAX_ROWS,
} from '@/lib/supplier-import-service'
import { exportSuppliersToWorkbook } from '@/lib/supplier-export-service'
import { buildSupplierTemplateWorkbook } from '@/lib/supplier-template-service'

// ---------- Stock Opname Service ----------
import {
  listStockOpnames,
  getStockOpname,
  createStockOpname,
  startStockOpname,
  scanLocation,
  scanItem,
  updateCountedQty,
  submitStockOpname,
  rejectStockOpname,
  approveStockOpname,
  cancelStockOpname,
  getVarianceSummary,
} from '@/lib/stock-opname-service'

// ---------- Report Services ----------
import { getDashboardReport } from '@/lib/reports/dashboard-report'
import { getInventoryReport } from '@/lib/reports/inventory-report'
import { getOperationsReport } from '@/lib/reports/operations-report'
import { getAuditReport, getAuditFilterOptions } from '@/lib/reports/audit-report'

// ---------- Report Type Constants ----------
const InventoryReportType = {
  STOCK_ON_HAND: 'stock-on-hand',
  STOCK_CARD: 'stock-card',
  INVENTORY_AGING: 'inventory-aging',
  FIFO_AGING: 'fifo-aging',
  DEAD_STOCK: 'dead-stock',
}

const OperationsReportType = {
  RECEIVING: 'receiving',
  PUTAWAY: 'putaway',
  MOVEMENT: 'movement',
  ADJUSTMENT: 'adjustment',
  CYCLE_COUNT: 'cycle-count',
  PICKING: 'picking',
  PACKING: 'packing',
  SHIPPING: 'shipping',
}

const AuditReportType = {
  AUDIT_TRAIL: 'audit-trail',
  USER_ACTIVITY: 'user-activity',
  INVENTORY_HISTORY: 'inventory-history',
}

// ---------- Standard Report Response ----------
function reportResponse(report, result, filters, options = {}) {
  return json({
    success: true,
    report,
    filters,
    summary: result.summary || null,
    pagination: {
      total: result.total || result.data?.length || 0,
      limit: Number(filters.limit) || 500,
      offset: Number(filters.offset) || 0,
    },
    data: result.data || result,
    ...options,
  })
}

class ApiRequestError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

// ---------- RBAC for Reports ----------
const canViewReports = (role) =>
  role === 'ADMINISTRATOR' || role === 'SUPERVISOR' || role === 'STOCK_CONTROL'

// ---------- RBAC for Stock Opname ----------
const canManageStockOpname = (role) =>
  role === 'ADMINISTRATOR' || role === 'SUPERVISOR' || role === 'STOCK_CONTROL'

// ---------- Shared Filter Extractor ----------
function extractFilters(searchParams) {
  const limit = readIntParam(searchParams, 'limit', 500, 1000)
  const offset = readIntParam(searchParams, 'offset', 0, 100000)
  const bucketsParam = searchParams.get('buckets')
  let buckets
  if (bucketsParam) {
    try { buckets = JSON.parse(bucketsParam) } catch { buckets = undefined }
  }
  return {
    warehouseId: searchParams.get('warehouseId') || undefined,
    locationId: searchParams.get('locationId') || undefined,
    itemId: searchParams.get('itemId') || undefined,
    categoryId: searchParams.get('categoryId') || undefined,
    fromDate: searchParams.get('fromDate') || undefined,
    toDate: searchParams.get('toDate') || undefined,
    status: searchParams.get('status') || undefined,
    operatorId: searchParams.get('operatorId') || undefined,
    documentNumber: searchParams.get('documentNumber') || undefined,
    assignedToId: searchParams.get('assignedToId') || undefined,
    supplier: searchParams.get('supplier') || undefined,
    txnType: searchParams.get('txnType') || undefined,
    refNumber: searchParams.get('refNumber') || undefined,
    days: searchParams.get('days') ? Number(searchParams.get('days')) : undefined,
    buckets,
    limit,
    offset,
  }
}

const json = (data, status = 200) => NextResponse.json(data, { status })

function safeErrorMessage(message, status) {
  const text = typeof message === 'string' && message.trim() ? message.trim() : 'Request failed'
  if (status >= 500) return 'Internal server error'
  if (/^\s*Invalid `prisma\./i.test(text) || /PrismaClient/i.test(text) || /\n/.test(text)) {
    return status === 409 ? 'Conflict' : 'Invalid request'
  }
  return text
}

const err = (message, status = 400) => {
  const safeMessage = safeErrorMessage(message, status)
  return NextResponse.json({ success: false, message: safeMessage, error: safeMessage, errors: [{ message: safeMessage }] }, { status })
}

const xlsxResponse = (buffer, filename) =>
  new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })

function readIntParam(searchParams, name, fallback, max) {
  const raw = searchParams.get(name)
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new ApiRequestError(`${name} must be a non-negative integer`, 400)
  return Math.min(value, max)
}

const getLimit = (searchParams, fallback = 100, max = 500) => readIntParam(searchParams, 'limit', fallback, max)

const canOperate = (role) => canManageMaster(role) || role === 'STOCK_CONTROL'

async function parseBody(request) {
  const text = await request.text()
  if (!text.trim()) return {}
  try { return JSON.parse(text) }
  catch { throw new ApiRequestError('Request body must be valid JSON', 400) }
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

  // KPI metrics come ONLY from the KPI Engine (single source of truth).
  // If the engine fails, the dashboard degrades to zeros instead of crashing.
  const engine = await getDashboardMetrics()
  const metrics = engine.success
    ? engine.data
    : {
        activeSku: 0,
        stockOnHand: 0,
        inventoryValue: 0,
        lowStock: 0,
        outOfStock: 0,
        suppliers: { total: 0, active: 0, inactive: 0, added30Days: 0 },
      }

  const [totalLocations, stockRows, todayMovements, recentLedger, recentAudit, pickingStats, shipping] = await Promise.all([
    prisma.location.count({ where: { isActive: true } }),
    getStockOnHand(),
    prisma.stockLedger.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.stockLedger.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { qty: true, createdAt: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    // Picking KPIs
    Promise.all([
      prisma.pickingOrder.count({ where: { status: { in: ['DRAFT', 'ASSIGNED'] } } }),
      prisma.pickingOrder.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.pickingOrder.count({ where: { status: 'COMPLETED', completedAt: { gte: startOfDay } } }),
    ]),
    getShippingKPIs(),
  ])

  const [pendingPicking, pickingInProgress, pickingCompletedToday] = pickingStats

  // Picking KPIs: average pick time and accuracy
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const completedOrders = await prisma.pickingOrder.findMany({
    where: { status: 'COMPLETED', completedAt: { gte: thirtyDaysAgo }, startedAt: { not: null } },
    select: { startedAt: true, completedAt: true },
  })
  const totalOrders = completedOrders.length
  const avgPickTimeMinutes = totalOrders > 0
    ? Math.round(completedOrders.reduce((s, o) => {
        if (!o.startedAt || !o.completedAt) return s
        return s + (new Date(o.completedAt) - new Date(o.startedAt)) / 60000
      }, 0) / totalOrders)
    : 0

  // Picking accuracy: completed orders / total non-cancelled orders in period
  const totalNonCancelled = await prisma.pickingOrder.count({
    where: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'CANCELLED' } },
  })
  const pickingAccuracy = totalNonCancelled > 0
    ? Math.round((totalOrders / totalNonCancelled) * 100)
    : 100

  // Chart/list datasets (low-stock list, stock by category) are not yet exposed
  // by the KPI Engine, so they are derived here from the shared stock source.
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
    metrics,
    stats: { totalLocations, todayMovements },
    picking: {
      pendingPicking,
      pickingInProgress,
      pickingCompletedToday,
      avgPickTimeMinutes,
      pickingAccuracy,
    },
    shipping,
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
      serialTracked: Boolean(b.serialTracked) || false,
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
      serialTracked: b.serialTracked !== undefined ? Boolean(b.serialTracked) : before.serialTracked,
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

// ==================== ITEM BULK IMPORT / EXPORT / TEMPLATE ====================
async function handleItemImport(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const form = await request.formData().catch(() => null)
  if (!form) return err('Expected multipart form data', 400)
  const file = form.get('file')
  if (!file || typeof file === 'string') return err('No file uploaded', 400)
  const fileName = file.name || 'upload.xlsx'
  const mode = form.get('mode') === 'partial' ? 'partial' : 'strict'
  const dryRun = form.get('dryRun') === 'true'

  let rows
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    rows = parseItemWorkbook(buffer)
  } catch (e) {
    return err(e.message, 400)
  }
  if (rows.length > IMPORT_MAX_ROWS) return err(`File exceeds the ${IMPORT_MAX_ROWS.toLocaleString()} row limit`, 400)

  // Validation-only pass — returns the summary, imports nothing.
  if (dryRun) {
    try {
      const summary = await dryRunItemImport(rows)
      return json({ dryRun: true, ...summary })
    } catch (e) {
      return err(e.message, 400)
    }
  }

  // Real import — stream NDJSON progress (10/20/.../100) so the UI never freezes.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')) } catch { /* stream closed */ }
      }
      try {
        const result = await importItems({
          user,
          fileName,
          rows,
          mode,
          onProgress: (pct) => emit({ progress: pct }),
        })
        emit({ progress: 100, result })
      } catch (e) {
        emit({ error: e.message, errors: e instanceof ItemImportError ? e.errors : undefined })
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  })
}

async function handleItemTemplate(user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  try {
    const { buffer, filename } = await buildItemTemplateWorkbook()
    return xlsxResponse(buffer, filename)
  } catch (e) {
    return err(e.message, 400)
  }
}

async function handleItemExport(request, user) {
  if (!canViewReports(user.role)) return err('Insufficient permissions', 403)
  const idsParam = request.nextUrl.searchParams.get('ids')
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  try {
    const { buffer } = await exportItemsToWorkbook({ ids })
    return xlsxResponse(buffer, `master-items-${new Date().toISOString().slice(0, 10)}.xlsx`)
  } catch (e) {
    return err(e.message, 400)
  }
}

// ==================== SUPPLIERS ====================
async function handleSupplierList(searchParams) {
  const suppliers = await listSuppliers({
    search: searchParams.get('search') || undefined,
    status: searchParams.get('status') || undefined,
    city: searchParams.get('city') || undefined,
    leadTime: searchParams.get('leadTime') || undefined,
    sortBy: searchParams.get('sortBy') || undefined,
    sortOrder: searchParams.get('sortOrder') || undefined,
    limit: getLimit(searchParams, 100, 1000),
    offset: readIntParam(searchParams, 'offset', 0, 100000),
  })
  return json(suppliers)
}

async function handleSupplierGet(id) {
  const supplier = await getSupplier(id)
  if (!supplier) return err('Supplier not found', 404)
  return json(supplier)
}

async function handleSupplierCreate(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const body = await parseBody(request)
  try {
    const supplier = await createSupplier({ user, body })
    return json(supplier, 201)
  } catch (e) {
    return err(e.message, e.status || 400)
  }
}

async function handleSupplierUpdate(request, user, id) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const body = await parseBody(request)
  try {
    const supplier = await updateSupplier({ user, id, body })
    return json(supplier)
  } catch (e) {
    return err(e.message, e.status || 400)
  }
}

async function handleSupplierDelete(user, id) {
  if (user.role !== 'ADMINISTRATOR') return err('Only Administrator can delete suppliers', 403)
  try {
    return json(await deleteSupplier({ user, id }))
  } catch (e) {
    return err(e.message, e.status || 400)
  }
}

async function handleSupplierImport(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const form = await request.formData().catch(() => null)
  if (!form) return err('Expected multipart form data', 400)
  const file = form.get('file')
  if (!file || typeof file === 'string') return err('No file uploaded', 400)
  const fileName = file.name || 'upload.xlsx'
  const mode = form.get('mode') === 'partial' ? 'partial' : 'strict'
  const dryRun = form.get('dryRun') === 'true'

  let rows
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    rows = parseSupplierWorkbook(buffer)
  } catch (e) {
    return err(e.message, 400)
  }
  if (rows.length > SUPPLIER_IMPORT_MAX_ROWS) {
    return err(`File exceeds the ${SUPPLIER_IMPORT_MAX_ROWS.toLocaleString()} row limit`, 400)
  }

  if (dryRun) {
    try {
      const summary = await dryRunSupplierImport(rows)
      return json({ dryRun: true, ...summary })
    } catch (e) {
      return err(e.message, 400)
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')) } catch { /* stream closed */ }
      }
      try {
        const result = await importSuppliers({
          user,
          fileName,
          rows,
          mode,
          onProgress: (pct) => emit({ progress: pct }),
        })
        emit({ progress: 100, result })
      } catch (e) {
        emit({ error: e.message, errors: e instanceof SupplierImportError ? e.errors : undefined })
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  })
}

async function handleSupplierTemplate(user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  try {
    const { buffer, filename } = await buildSupplierTemplateWorkbook(user)
    return xlsxResponse(buffer, filename)
  } catch (e) {
    return err(e.message, 400)
  }
}

async function handleSupplierExport(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const idsParam = request.nextUrl.searchParams.get('ids')
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  try {
    const { buffer } = await exportSuppliersToWorkbook({ ids }, user)
    return xlsxResponse(buffer, `suppliers-${new Date().toISOString().slice(0, 10)}.xlsx`)
  } catch (e) {
    return err(e.message, 400)
  }
}

async function handleSupplierReport(searchParams) {
  const result = await getSupplierReport({
    fromDate: searchParams.get('fromDate') || undefined,
    toDate: searchParams.get('toDate') || undefined,
    status: searchParams.get('status') || undefined,
    city: searchParams.get('city') || undefined,
    limit: getLimit(searchParams, 500, 1000),
    offset: readIntParam(searchParams, 'offset', 0, 100000),
  })
  return reportResponse('supplier', result, Object.fromEntries(searchParams))
}

// ==================== CATEGORIES ====================
async function listCategories(searchParams) {
  const search = searchParams.get('search')
  const active = searchParams.get('active')
  const where = {}
  if (search) where.name = { contains: search, mode: 'insensitive' }
  if (active === 'true') where.isActive = true
  else if (active === 'false') where.isActive = false
  const [rows, counts, total] = await Promise.all([
    prisma.category.findMany({ where, orderBy: { name: 'asc' }, take: getLimit(searchParams, 200, 500), skip: readIntParam(searchParams, 'offset', 0, 100000) }),
    prisma.item.groupBy({ by: ['categoryId'], _count: true }),
    prisma.category.count({ where }),
  ])
  const countMap = Object.fromEntries(counts.map((c) => [c.categoryId, c._count]))
  const data = rows.map((c) => ({ ...c, itemCount: countMap[c.id] || 0 }))
  return json({ data, total })
}

async function createCategory(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const b = await parseBody(request)
  const name = String(b.name || '').trim()
  if (!name) return err('Category name is required')
  const exists = await prisma.category.findUnique({ where: { name } })
  if (exists) return err('Category name already exists', 409)
  const category = await prisma.category.create({ data: { name, description: b.description || null } })
  await logAudit({ user, action: 'CREATE', module: 'MASTER_CATEGORY', entityType: 'Category', entityId: category.id, description: `Created category ${category.name}`, after: category })
  return json(category, 201)
}

async function updateCategory(request, user, id) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const before = await prisma.category.findUnique({ where: { id } })
  if (!before) return err('Category not found', 404)
  const b = await parseBody(request)
  const name = b.name !== undefined ? String(b.name).trim() : before.name
  if (!name) return err('Category name is required')
  const dup = await prisma.category.findFirst({ where: { name, id: { not: id } } })
  if (dup) return err('Category name already exists', 409)
  const category = await prisma.category.update({
    where: { id },
    data: {
      name,
      description: b.description !== undefined ? b.description : before.description,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : before.isActive,
    },
  })
  await logAudit({ user, action: 'UPDATE', module: 'MASTER_CATEGORY', entityType: 'Category', entityId: id, description: `Updated category ${category.name}`, before, after: category })
  return json(category)
}

async function deleteCategory(user, id) {
  if (user.role !== 'ADMINISTRATOR') return err('Only Administrator can delete categories', 403)
  const before = await prisma.category.findUnique({ where: { id } })
  if (!before) return err('Category not found', 404)
  const itemCount = await prisma.item.count({ where: { categoryId: id } })
  if (itemCount > 0) return err(`Cannot delete category "${before.name}" — it is used by ${itemCount} item(s). Deactivate it instead.`, 409)
  await prisma.category.delete({ where: { id } })
  await logAudit({ user, action: 'DELETE', module: 'MASTER_CATEGORY', entityType: 'Category', entityId: id, description: `Deleted category ${before.name}`, before })
  return json({ deleted: true })
}

// ==================== UOMS ====================
async function listUoms(searchParams) {
  const search = searchParams.get('search')
  const active = searchParams.get('active')
  const where = {}
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (active === 'true') where.isActive = true
  else if (active === 'false') where.isActive = false
  const [rows, counts, total] = await Promise.all([
    prisma.uom.findMany({ where, orderBy: { code: 'asc' }, take: getLimit(searchParams, 200, 500), skip: readIntParam(searchParams, 'offset', 0, 100000) }),
    prisma.item.groupBy({ by: ['uomId'], _count: true }),
    prisma.uom.count({ where }),
  ])
  const countMap = Object.fromEntries(counts.map((c) => [c.uomId, c._count]))
  const data = rows.map((u) => ({ ...u, itemCount: countMap[u.id] || 0 }))
  return json({ data, total })
}

async function createUom(request, user) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const b = await parseBody(request)
  const code = String(b.code || '').trim().toUpperCase()
  const name = String(b.name || '').trim()
  if (!code || !name) return err('Code and name are required')
  const exists = await prisma.uom.findUnique({ where: { code } })
  if (exists) return err('UOM code already exists', 409)
  const uom = await prisma.uom.create({ data: { code, name } })
  await logAudit({ user, action: 'CREATE', module: 'MASTER_UOM', entityType: 'Uom', entityId: uom.id, description: `Created UOM ${uom.code} - ${uom.name}`, after: uom })
  return json(uom, 201)
}

async function updateUom(request, user, id) {
  if (!canManageMaster(user.role)) return err('Insufficient permissions', 403)
  const before = await prisma.uom.findUnique({ where: { id } })
  if (!before) return err('UOM not found', 404)
  const b = await parseBody(request)
  const code = b.code !== undefined ? String(b.code).trim().toUpperCase() : before.code
  const name = b.name !== undefined ? String(b.name).trim() : before.name
  if (!code || !name) return err('Code and name are required')
  const dup = await prisma.uom.findFirst({ where: { code, id: { not: id } } })
  if (dup) return err('UOM code already exists', 409)
  const uom = await prisma.uom.update({
    where: { id },
    data: { code, name, isActive: b.isActive !== undefined ? Boolean(b.isActive) : before.isActive },
  })
  await logAudit({ user, action: 'UPDATE', module: 'MASTER_UOM', entityType: 'Uom', entityId: id, description: `Updated UOM ${uom.code} - ${uom.name}`, before, after: uom })
  return json(uom)
}

async function deleteUom(user, id) {
  if (user.role !== 'ADMINISTRATOR') return err('Only Administrator can delete UOMs', 403)
  const before = await prisma.uom.findUnique({ where: { id } })
  if (!before) return err('UOM not found', 404)
  const itemCount = await prisma.item.count({ where: { uomId: id } })
  if (itemCount > 0) return err(`Cannot delete UOM "${before.code}" — it is used by ${itemCount} item(s). Deactivate it instead.`, 409)
  await prisma.uom.delete({ where: { id } })
  await logAudit({ user, action: 'DELETE', module: 'MASTER_UOM', entityType: 'Uom', entityId: id, description: `Deleted UOM ${before.code} - ${before.name}`, before })
  return json({ deleted: true })
}

// ==================== LOCATIONS ====================
async function listWarehouses() {
  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true }, include: { zones: { include: { locations: true }, orderBy: { code: 'asc' } } }, orderBy: { code: 'asc' } })
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
  const take = getLimit(searchParams, 100, 500)
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
  const take = getLimit(searchParams, 200, 1000)
  const where = {}
  if (searchParams.get('module')) where.module = searchParams.get('module')
  if (searchParams.get('action')) where.action = searchParams.get('action')
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take })
  return json(logs)
}

// ==================== META ====================
async function getMeta() {
  const [categories, uoms, warehouses, reasonCodes, suppliers, items, users] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.uom.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      include: {
        zones: {
          include: {
            locations: {
              where: { isActive: true },
              orderBy: { code: 'asc' },
            },
          },
          orderBy: { code: 'asc' },
        },
      },
    }),
    prisma.reasonCode.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    prisma.item.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, barcode: true, serialTracked: true, unitCost: true, uom: { select: { code: true } } }, orderBy: { sku: 'asc' } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } }),
  ])
  return json({ categories, uoms, warehouses, reasonCodes, suppliers, items, users })
}

// ==================== ATTACHMENTS (RCV-3.0) ====================
async function handleAttachmentUpload(request, user) {
  const form = await request.formData().catch(() => null)
  if (!form) return err('Expected multipart form data', 400)
  const module = form.get('module')
  const referenceId = form.get('referenceId')
  const referenceLineId = form.get('referenceLineId') || null
  const description = form.get('description') || null
  const file = form.get('file')
  try {
    const attachment = await createAttachment({ user, module, referenceId, referenceLineId, description, file })
    return json(attachment, 201)
  } catch (e) { return err(e.message, 400) }
}

async function handleAttachmentList(searchParams) {
  const module = searchParams.get('module')
  const referenceId = searchParams.get('referenceId')
  if (!module || !referenceId) return err('module and referenceId are required', 400)
  const list = await listAttachments({
    module,
    referenceId,
    referenceLineId: searchParams.get('referenceLineId') || null,
  })
  return json(list)
}

async function handleAttachmentFile(id) {
  const att = await getAttachment(id)
  if (!att || !att.isActive) return err('Attachment not found', 404)
  try {
    const { buffer, contentType, originalName } = await readAttachmentFile(att)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`,
      },
    })
  } catch (e) { return err('Attachment file unavailable', 404) }
}

async function handleAttachmentDelete(user, id) {
  try { return json(await deleteAttachment({ user, id })) }
  catch (e) { return err(e.message, 400) }
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
      if (path[1] === 'import' && method === 'POST') return await handleItemImport(request, user)
      if (path[1] === 'template' && method === 'GET') return await handleItemTemplate(user)
      if (path[1] === 'export' && method === 'GET') return await handleItemExport(request, user)
      if (!path[1]) {
        if (method === 'GET') return await listItems()
        if (method === 'POST') return await createItem(request, user)
      } else {
        if (method === 'PUT') return await updateItem(request, user, path[1])
        if (method === 'DELETE') return await deleteItem(user, path[1])
      }
    }

    if (seg === 'categories') {
      if (!path[1]) {
        if (method === 'GET') return await listCategories(searchParams)
        if (method === 'POST') return await createCategory(request, user)
      } else {
        if (method === 'PUT') return await updateCategory(request, user, path[1])
        if (method === 'DELETE') return await deleteCategory(user, path[1])
      }
    }

    if (seg === 'uoms') {
      if (!path[1]) {
        if (method === 'GET') return await listUoms(searchParams)
        if (method === 'POST') return await createUom(request, user)
      } else {
        if (method === 'PUT') return await updateUom(request, user, path[1])
        if (method === 'DELETE') return await deleteUom(user, path[1])
      }
    }

    if (seg === 'suppliers') {
      if (path[1] === 'import' && method === 'POST') return await handleSupplierImport(request, user)
      if (path[1] === 'template' && method === 'GET') return await handleSupplierTemplate(user)
      if (path[1] === 'export' && method === 'GET') return await handleSupplierExport(request, user)
      if (path[1] === 'report' && method === 'GET') return await handleSupplierReport(searchParams)
      if (!path[1]) {
        if (method === 'GET') return await handleSupplierList(searchParams)
        if (method === 'POST') return await handleSupplierCreate(request, user)
      } else {
        const id = path[1]
        if (method === 'GET') return await handleSupplierGet(id)
        if (method === 'PUT' || method === 'PATCH') return await handleSupplierUpdate(request, user, id)
        if (method === 'DELETE') return await handleSupplierDelete(user, id)
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

    // ==================== ATTACHMENTS (RCV-3.0) ====================
    if (seg === 'attachments') {
      if (!path[1]) {
        if (method === 'POST') return await handleAttachmentUpload(request, user)
        if (method === 'GET') return await handleAttachmentList(searchParams)
      } else {
        if (path[2] === 'file' && method === 'GET') return await handleAttachmentFile(path[1])
        if (method === 'DELETE') return await handleAttachmentDelete(user, path[1])
      }
    }

    // ==================== BARCODE LOOKUP ====================
    if (seg === 'barcode' && method === 'GET') {
      const code = searchParams.get('code')
      if (!code) return err('code is required')
      const result = await lookupByBarcode(code)
      return json(result)
    }

    // ==================== RECEIVING ====================
    if (seg === 'receiving') {
      if (!path[1]) {
        if (method === 'GET') {
          const rs = await listReceivings({
            status: searchParams.get('status'),
            warehouseId: searchParams.get('warehouseId'),
            take: getLimit(searchParams),
          })
          return json(rs)
        }
        if (method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try {
            const r = await createReceivingDraft({ user, body })
            return json(r, 201)
          } catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]
        if (!sub) {
          if (method === 'GET') {
            const r = await getReceiving(id)
            if (!r) return err('Receiving not found', 404)
            return json(r)
          }
          if (method === 'PUT') {
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            const body = await parseBody(request)
            try {
              const r = await updateReceivingDraft({ user, id, body })
              return json(r)
            } catch (e) { return err(e.message, 400) }
          }
        } else if (sub === 'start' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await startReceiving({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'post' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await postReceiving({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Administrator or Supervisor can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelReceiving({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'outstanding' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await receiveOutstanding({ user, id, lines: body?.lines })) }
          catch (e) { return err(e.message, 400) }
        }
      }
    }

    // ==================== PUTAWAY ====================
    if (seg === 'putaway') {
      if (!path[1]) {
        if (method === 'GET') {
          const tasks = await listPutawayTasks({
            status: searchParams.get('status') || undefined,
            warehouseId: searchParams.get('warehouseId') || undefined,
            take: getLimit(searchParams),
          })
          return json(tasks)
        }
      } else {
        const id = path[1]
        const sub = path[2]
        if (!sub) {
          if (method === 'GET') {
            const task = await getPutawayTask(id)
            if (!task) return err('Putaway task not found', 404)
            return json(task)
          }
        } else if (sub === 'start' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await startPutawayTask({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'complete' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await completePutawayTask({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Administrator or Supervisor can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelPutawayTask({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        }
      }
    }

    // ==================== STOCK CARD ====================
    if (seg === 'stock-card' && method === 'GET') {
      const itemId = searchParams.get('itemId')
      if (!itemId) return err('itemId is required')
      try {
        const card = await getStockCard({
          itemId,
          locationId: searchParams.get('locationId') || undefined,
          limit: getLimit(searchParams, 200, 500),
        })
        return json(card)
      } catch (e) { return err(e.message, 400) }
    }

    // ==================== STOCK CARD (with filters) ====================
    if (seg === 'stock-card-entries' && method === 'GET') {
      try {
        const { getStockCardEntries } = await import('@/lib/movement-service')
        const card = await getStockCardEntries({
          itemId: searchParams.get('itemId') || undefined,
          locationId: searchParams.get('locationId') || undefined,
          txnType: searchParams.get('txnType') || undefined,
          fromDate: searchParams.get('fromDate') || undefined,
          toDate: searchParams.get('toDate') || undefined,
          limit: getLimit(searchParams, 200, 500),
        })
        return json(card)
      } catch (e) { return err(e.message, 400) }
    }

    // ==================== ADJUSTMENT ====================
    if (seg === 'adjustments') {
      if (!path[1]) {
        if (method === 'GET') {
          const result = await listAdjustments({
            status: searchParams.get('status') || undefined,
            warehouseId: searchParams.get('warehouseId') || undefined,
            take: getLimit(searchParams),
          })
          return json(result)
        }
        if (method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await createAdjustment({ user, body }), 201) }
          catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]
        if (!sub) {
          if (method === 'GET') {
            const a = await getAdjustment(id)
            if (!a) return err('Adjustment not found', 404)
            return json(a)
          }
          if (method === 'PUT') {
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            const body = await parseBody(request)
            try { return json(await updateAdjustment({ user, id, body })) }
            catch (e) { return err(e.message, 400) }
          }
        } else if (sub === 'preview' && method === 'POST') {
          const body = await parseBody(request)
          try { return json(await previewAdjustment({ lines: body?.lines || [], reasonCodeId: body?.reasonCodeId })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'post' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await postAdjustment({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Supervisor or Administrator can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelAdjustment({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        }
      }
    }

    // ==================== CYCLE COUNT ====================
    if (seg === 'cycle-count') {
      if (!path[1]) {
        if (method === 'GET') {
          const result = await listCycleCounts({
            status: searchParams.get('status') || undefined,
            warehouseId: searchParams.get('warehouseId') || undefined,
            take: getLimit(searchParams),
          })
          return json(result)
        }
        if (method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await createCycleCount({ user, body }), 201) }
          catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]
        if (sub === 'items') {
          const locationId = searchParams.get('locationId')
          if (!locationId) return err('locationId is required')
          try { return json(await getItemsAtLocation(locationId)) }
          catch (e) { return err(e.message, 400) }
        } else if (!sub) {
          if (method === 'GET') {
            const cc = await getCycleCount(id)
            if (!cc) return err('Cycle count not found', 404)
            return json(cc)
          }
        } else if (sub === 'assign' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await assignCycleCount({ user, id, assignedToId: body?.assignedToId })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'start' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await startCycleCount({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'submit' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await submitCycleCount({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'approve' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Supervisor or Administrator can approve', 403)
          try { return json(await approveCycleCount({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Supervisor or Administrator can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelCycleCount({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        }
      }
    }

    // ==================== MOVEMENT ====================
    if (seg === 'movements') {
      if (!path[1]) {
        if (method === 'GET') {
          const result = await listMovements({
            status: searchParams.get('status') || undefined,
            warehouseId: searchParams.get('warehouseId') || undefined,
            take: getLimit(searchParams),
          })
          return json(result)
        }
        if (method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await createMovement({ user, body }), 201) }
          catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]
        if (!sub) {
          if (method === 'GET') {
            const m = await getMovement(id)
            if (!m) return err('Movement not found', 404)
            return json(m)
          }
        } else if (sub === 'execute' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await postMovement({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Supervisor or Administrator can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelMovement({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'preview' && method === 'POST') {
          const body = await parseBody(request)
          try { return json(await previewMovement({ lines: body?.lines || [] })) }
          catch (e) { return err(e.message, 400) }
        }
      }
    }

    // ==================== PICKING ====================
    if (seg === 'picking') {
      if (!path[1]) {
        if (method === 'GET') {
          const result = await listPickingOrders({
            status: searchParams.get('status') || undefined,
            warehouseId: searchParams.get('warehouseId') || undefined,
            take: getLimit(searchParams),
          })
          return json(result)
        }
        if (method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await createPickingOrder({ user, body }), 201) }
          catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]
        const taskId = path[3]

        if (!sub) {
          if (method === 'GET') {
            const o = await getPickingOrder(id)
            if (!o) return err('Picking order not found', 404)
            return json(o)
          }
          if (method === 'PUT') {
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            const body = await parseBody(request)
            try { return json(await updatePickingOrder({ user, id, body })) }
            catch (e) { return err(e.message, 400) }
          }
        } else if (sub === 'suggest' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await generateFifoSuggestions({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'assign' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await assignPicker({ user, id, assignedToId: body?.assignedToId })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'start' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await startPickingOrder({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'pick-task' && taskId && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await executePickTask({ user, id, body: { taskId, ...body } })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'skip-task' && taskId && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await skipPickTask({ user, id, taskId, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'complete' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await completePickingOrder({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Supervisor or Administrator can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelPickingOrder({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'preview-fifo' && method === 'GET') {
          const itemId = searchParams.get('itemId')
          const qty = searchParams.get('qty')
          if (!itemId || !qty) return err('itemId and qty are required')
          try { return json(await previewFifoSuggestions({ itemId, qty, warehouseId: searchParams.get('warehouseId') || undefined })) }
          catch (e) { return err(e.message, 400) }
        }
      }
    }

    // ==================== PACKING ====================
    // GET /api/packing/queue — queue of completed picks without packing orders
    if (seg === 'packing' && path[1] === 'queue' && method === 'GET') {
      try { return json(await getPackingQueue()) }
      catch (e) { return err(e.message, 400) }
    }

    // GET /api/packing/kpis — dashboard KPIs
    if (seg === 'packing' && path[1] === 'kpis' && method === 'GET') {
      try { return json(await getPackingKPIs()) }
      catch (e) { return err(e.message, 400) }
    }

    if (seg === 'packing') {
      if (!path[1]) {
        // GET /api/packing
        if (method === 'GET') {
          const result = await listPackingOrders({
            status: searchParams.get('status') || undefined,
            take: getLimit(searchParams),
          })
          return json(result)
        }
        // POST /api/packing
        if (method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await createPackingOrder({ user, body }), 201) }
          catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]
        const pkgId = path[3]

        // GET /api/packing/:id or /api/packing/:packingNumber
        if (!sub) {
          if (method === 'GET') {
            // Try by id first, then by number
            let o = await getPackingOrder(id)
            if (!o) o = await getPackingOrderByNumber(id)
            if (!o) return err('Packing order not found', 404)
            return json(o)
          }
          if (method === 'PUT') {
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            const body = await parseBody(request)
            try { return json(await assignPacker({ user, id, assignedToId: body?.assignedToId })) }
            catch (e) { return err(e.message, 400) }
          }
        } else if (sub === 'start' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await startPackingOrder({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'complete' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await completePackingOrder({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Supervisor or Administrator can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelPackingOrder({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        }
        // Package sub-routes
        else if (sub === 'packages') {
          if (!pkgId) {
            // POST /api/packing/:id/packages — create package
            if (method === 'POST') {
              if (!canOperate(user.role)) return err('Insufficient permissions', 403)
              try { return json(await createPackage({ user, id }), 201) }
              catch (e) { return err(e.message, 400) }
            }
          } else {
            // /api/packing/:id/packages/:pkgId/...
            if (!path[4]) {
              // GET /api/packing/:id/packages/:pkgId
              if (method === 'GET') {
                let pkg = await getPackage(pkgId)
                if (!pkg) pkg = await getPackageByNumber(pkgId)
                if (!pkg) return err('Package not found', 404)
                return json(pkg)
              }
              // PUT /api/packing/:id/packages/:pkgId — update weight/dims
              if (method === 'PUT') {
                if (!canOperate(user.role)) return err('Insufficient permissions', 403)
                const body = await parseBody(request)
                try { return json(await updatePackage({ user, id: pkgId, body })) }
                catch (e) { return err(e.message, 400) }
              }
            } else {
              const action = path[4]
              if (action === 'scan' && method === 'POST') {
                // POST /api/packing/:id/packages/:pkgId/scan
                if (!canOperate(user.role)) return err('Insufficient permissions', 403)
                const body = await parseBody(request)
                try { return json(await scanItemToPackage({ user, id, body: { packageId: pkgId, ...body } })) }
                catch (e) { return err(e.message, 400) }
              } else if (action === 'close' && method === 'POST') {
                // POST /api/packing/:id/packages/:pkgId/close
                if (!canOperate(user.role)) return err('Insufficient permissions', 403)
                try { return json(await closePackage({ user, id: pkgId })) }
                catch (e) { return err(e.message, 400) }
              } else if (action === 'reopen' && method === 'POST') {
                // POST /api/packing/:id/packages/:pkgId/reopen
                if (!canOperate(user.role)) return err('Insufficient permissions', 403)
                try { return json(await reopenPackage({ user, id: pkgId })) }
                catch (e) { return err(e.message, 400) }
              }
            }
          }
        }
      }
    }

    // ==================== SHIPPING ====================
    // GET /api/shipping/queue — completed packing orders without shipment
    if (seg === 'shipping' && path[1] === 'queue' && method === 'GET') {
      try { return json(await getShippingQueue()) }
      catch (e) { return err(e.message, 400) }
    }

    // GET /api/shipping/kpis — dashboard KPIs
    if (seg === 'shipping' && path[1] === 'kpis' && method === 'GET') {
      try { return json(await getShippingKPIs()) }
      catch (e) { return err(e.message, 400) }
    }

    if (seg === 'shipping') {
      if (!path[1]) {
        // GET /api/shipping — list shipments
        if (method === 'GET') {
          const result = await listShipments({
            status: searchParams.get('status') || undefined,
            take: getLimit(searchParams),
          })
          return json(result)
        }
        // POST /api/shipping — create shipment from packing order
        if (method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await createShipment({ user, body }), 201) }
          catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]
        const pkgId = path[3]

        // GET /api/shipping/:id or /api/shipping/:shipmentNumber
        if (!sub) {
          if (method === 'GET') {
            let s = await getShipment(id)
            if (!s) s = await getShipmentByNumber(id)
            if (!s) return err('Shipment not found', 404)
            return json(s)
          }
          if (method === 'PUT') {
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            const body = await parseBody(request)
            try { return json(await assignShipper({ user, id, assignedToId: body?.assignedToId })) }
            catch (e) { return err(e.message, 400) }
          }
        } else if (sub === 'start' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await startShipment({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'preview' && method === 'POST') {
          try { return json(await previewShipment({ id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'confirm' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await confirmShipment({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'retry' && method === 'POST') {
          if (!canOperate(user.role)) return err('Insufficient permissions', 403)
          try { return json(await retryShipment({ user, id })) }
          catch (e) { return err(e.message, 400) }
        } else if (sub === 'cancel' && method === 'POST') {
          if (!canManageMaster(user.role)) return err('Only Supervisor or Administrator can cancel', 403)
          const body = await parseBody(request)
          try { return json(await cancelShipment({ user, id, reason: body?.reason })) }
          catch (e) { return err(e.message, 400) }
        }
        // Package sub-routes: /api/shipping/:id/packages/:pkgId/...
        else if (sub === 'packages') {
          if (!pkgId) return err('package id is required', 400)
          if (method !== 'POST') return err('Method not allowed', 405)
          const action = path[4]
          const body = await parseBody(request)
          if (action === 'scan') {
            // POST /api/shipping/:id/packages/:pkgId/scan — validate + add package
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            try { return json(await scanPackage({ user, id, body: { packageNumber: pkgId, ...body } })) }
            catch (e) { return err(e.message, 400) }
          } else if (action === 'verify') {
            // POST /api/shipping/:id/packages/:pkgId/verify — mark VERIFIED
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            try { return json(await verifyPackage({ user, id, body: { packageId: pkgId, ...body } })) }
            catch (e) { return err(e.message, 400) }
          } else if (action === 'serials') {
            // POST /api/shipping/:id/packages/:pkgId/serials — verify serials + mark VERIFIED
            if (!canOperate(user.role)) return err('Insufficient permissions', 403)
            try { return json(await verifySerials({ user, id, body: { packageId: pkgId, ...body } })) }
            catch (e) { return err(e.message, 400) }
          } else {
            return err('Unknown package action: ' + action, 400)
          }
        }
      }
    }

    // ==================== STOCK OPNAME ====================
    if (seg === 'stock-opname') {
      if (!path[1]) {
        // GET /api/stock-opname — list
        if (method === 'GET') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          try {
            const result = await listStockOpnames({
              status: searchParams.get('status') || undefined,
              take: getLimit(searchParams),
              skip: readIntParam(searchParams, 'offset', 0, 100000),
            })
            return json(result)
          } catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname — create draft
        if (method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await createStockOpname({ user, body }), 201) }
          catch (e) { return err(e.message, 400) }
        }
      } else {
        const id = path[1]
        const sub = path[2]

        // GET /api/stock-opname/:id
        if (!sub && method === 'GET') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          try {
            const so = await getStockOpname(id)
            if (!so) return err('Stock opname not found', 404)
            return json(so)
          } catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname/:id/start
        else if (sub === 'start' && method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          // Validate required payload
          if (body && body.itemIds != null && !Array.isArray(body.itemIds)) {
            return err('itemIds must be an array', 400)
          }
          try { return json(await startStockOpname({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname/:id/scan-location
        else if (sub === 'scan-location' && method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          if (!body?.locationCode) return err('locationCode is required', 400)
          try { return json(await scanLocation({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname/:id/scan-item
        else if (sub === 'scan-item' && method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          if (!body?.barcode) return err('barcode is required', 400)
          try { return json(await scanItem({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        }
        // PATCH /api/stock-opname/:id/count
        else if (sub === 'count' && method === 'PATCH') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          if (!body?.lineId) return err('lineId is required', 400)
          if (body.countedQty == null) return err('countedQty is required', 400)
          const qty = Number(body.countedQty)
          if (isNaN(qty) || qty < 0) return err('countedQty must be a non-negative number', 400)
          try { return json(await updateCountedQty({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname/:id/submit
        else if (sub === 'submit' && method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          try { return json(await submitStockOpname({ user, id })) }
          catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname/:id/reject
        else if (sub === 'reject' && method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await rejectStockOpname({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname/:id/approve
        else if (sub === 'approve' && method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await approveStockOpname({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        }
        // POST /api/stock-opname/:id/cancel
        else if (sub === 'cancel' && method === 'POST') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          const body = await parseBody(request)
          try { return json(await cancelStockOpname({ user, id, body })) }
          catch (e) { return err(e.message, 400) }
        }
        // GET /api/stock-opname/:id/summary
        else if (sub === 'summary' && method === 'GET') {
          if (!canManageStockOpname(user.role)) return err('Insufficient permissions', 403)
          try { return json(await getVarianceSummary(id)) }
          catch (e) { return err(e.message, 400) }
        }
      }
    }

    // ==================== REPORTS ====================
    // GET /api/reports — executive dashboard
    if (seg === 'reports' && !path[1] && method === 'GET') {
      if (!canViewReports(user.role)) return err('Insufficient permissions', 403)
      try {
        const filters = extractFilters(searchParams)
        const data = await getDashboardReport({ warehouseId: filters.warehouseId })
        return reportResponse('dashboard', { data }, filters)
      } catch (e) { return err(e.message, 400) }
    }

    // GET /api/reports/inventory/:type
    if (seg === 'reports' && path[1] === 'inventory' && path[2] && method === 'GET') {
      if (!canViewReports(user.role)) return err('Insufficient permissions', 403)
      const validTypes = Object.values(InventoryReportType)
      const reportType = path[2]
      if (!validTypes.includes(reportType)) return err('Invalid inventory report type', 400)
      try {
        const filters = extractFilters(searchParams)
        const result = await getInventoryReport(reportType, filters)
        return reportResponse(`inventory:${reportType}`, result, filters)
      } catch (e) { return err(e.message, 400) }
    }

    // GET /api/reports/warehouse/:type
    if (seg === 'reports' && path[1] === 'warehouse' && path[2] && method === 'GET') {
      if (!canViewReports(user.role)) return err('Insufficient permissions', 403)
      const validTypes = Object.values(OperationsReportType)
      const reportType = path[2]
      if (!validTypes.includes(reportType)) return err('Invalid warehouse report type', 400)
      try {
        const filters = extractFilters(searchParams)
        const result = await getOperationsReport(reportType, filters)
        return reportResponse(`warehouse:${reportType}`, result, filters)
      } catch (e) { return err(e.message, 400) }
    }

    // GET /api/reports/outbound/:type
    if (seg === 'reports' && path[1] === 'outbound' && path[2] && method === 'GET') {
      if (!canViewReports(user.role)) return err('Insufficient permissions', 403)
      const validTypes = ['picking', 'packing', 'shipping']
      const reportType = path[2]
      if (!validTypes.includes(reportType)) return err('Invalid outbound report type', 400)
      try {
        const filters = extractFilters(searchParams)
        const result = await getOperationsReport(reportType, filters)
        return reportResponse(`outbound:${reportType}`, result, filters)
      } catch (e) { return err(e.message, 400) }
    }

    // GET /api/reports/audit/:type
    if (seg === 'reports' && path[1] === 'audit' && path[2] && method === 'GET') {
      if (!canViewReports(user.role)) return err('Insufficient permissions', 403)
      const validTypes = Object.values(AuditReportType)
      const reportType = path[2]
      if (!validTypes.includes(reportType)) return err('Invalid audit report type', 400)
      try {
        const filters = extractFilters(searchParams)
        const result = await getAuditReport(reportType, filters)
        return reportResponse(`audit:${reportType}`, result, filters)
      } catch (e) { return err(e.message, 400) }
    }

    // GET /api/reports/audit-options — filter dropdown options for audit reports
    if (seg === 'reports' && path[1] === 'audit-options' && method === 'GET') {
      if (!canViewReports(user.role)) return err('Insufficient permissions', 403)
      try {
        const options = await getAuditFilterOptions()
        return json({ success: true, data: options })
      } catch (e) { return err(e.message, 400) }
    }

    return err('Not found', 404)
  } catch (e) {
    console.error('API error:', e)
    return err(e instanceof ApiRequestError ? e.message : 'Internal server error', e.status || 500)
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
export async function PATCH(request, ctx) {
  return route(request, ctx)
}
export async function DELETE(request, ctx) {
  return route(request, ctx)
}
