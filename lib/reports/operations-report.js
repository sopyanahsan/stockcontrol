import prisma from '@/lib/prisma'

// ============================================================
// Operations Report Service
// ------------------------------------------------------------
// READ ONLY — never modifies inventory, FIFO, or Ledger.
// Single public function: getOperationsReport(reportType, filters)
// All helpers are private (not exported).
// Pure aggregate queries only — no business logic.
// ============================================================

const VALID_TYPES = ['receiving', 'putaway', 'movement', 'adjustment', 'cycle-count', 'picking', 'packing', 'shipping']

// ---------- Private helpers ----------

function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function dateRange(fromDate, toDate) {
  const range = {}
  if (fromDate) {
    const d = parseDate(fromDate)
    if (d) { d.setHours(0, 0, 0, 0); range.gte = d }
  }
  if (toDate) {
    const d = parseDate(toDate)
    if (d) { d.setHours(23, 59, 59, 999); range.lte = d }
  }
  return Object.keys(range).length ? range : undefined
}

async function resolveLocationIds(warehouseId) {
  if (!warehouseId) return null
  const locs = await prisma.location.findMany({
    where: { zone: { warehouseId } },
    select: { id: true },
  })
  return locs.map((l) => l.id)
}

// ----- Receiving -----
async function queryReceiving({ warehouseId, fromDate, toDate, status, supplier, documentNumber, limit, offset }) {
  const where = {}
  if (warehouseId) where.warehouseId = warehouseId
  if (status) where.status = status
  if (supplier) where.supplier = { contains: supplier, mode: 'insensitive' }
  if (documentNumber) where.grnNumber = { contains: documentNumber, mode: 'insensitive' }
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range

  const [rows, total] = await Promise.all([
    prisma.receiving.findMany({
      where,
      include: {
        warehouse: { select: { code: true, name: true } },
        stagingLocation: { select: { code: true } },
        createdBy: { select: { name: true } },
        lines: { include: { item: { select: { sku: true, name: true, uom: { select: { code: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.receiving.count({ where }),
  ])

  const data = rows.map((r) => ({
    id: r.id,
    grnNumber: r.grnNumber,
    status: r.status,
    supplier: r.supplier || '—',
    refDocument: r.refDocument || '—',
    warehouse: r.warehouse?.code || '—',
    stagingLocation: r.stagingLocation?.code || '—',
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    createdBy: r.createdBy?.name || '—',
    totalLines: r.lines.length,
    totalExpectedQty: r.lines.reduce((s, l) => s + l.expectedQty, 0),
    totalReceivedQty: r.lines.reduce((s, l) => s + l.receivedQty, 0),
    lines: r.lines.map((l) => ({
      itemSku: l.item?.sku || '—',
      itemName: l.item?.name || '—',
      uom: l.item?.uom?.code || '—',
      expectedQty: l.expectedQty,
      receivedQty: l.receivedQty,
      unitCost: l.unitCost,
    })),
  }))

  return { data, total }
}

// ----- Putaway -----
async function queryPutaway({ warehouseId, fromDate, toDate, status, itemId, documentNumber, limit, offset }) {
  const locIds = await resolveLocationIds(warehouseId)
  const where = {}
  if (status) where.status = status
  if (itemId) where.itemId = itemId
  if (documentNumber) where.taskNumber = { contains: documentNumber, mode: 'insensitive' }
  if (locIds) {
    where.OR = [{ fromLocationId: { in: locIds } }, { toLocationId: { in: locIds } }]
  }
  const dateField = status === 'COMPLETED' ? 'completedAt' : 'createdAt'
  const range = dateRange(fromDate, toDate)
  if (range) where[dateField] = range

  const [rows, total] = await Promise.all([
    prisma.putawayTask.findMany({
      where,
      include: {
        item: { select: { sku: true, name: true, uom: { select: { code: true } } } },
        fromLocation: { select: { code: true, type: true } },
        toLocation: { select: { code: true, type: true } },
        createdBy: { select: { name: true } },
        completedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.putawayTask.count({ where }),
  ])

  const data = rows.map((t) => ({
    id: t.id,
    taskNumber: t.taskNumber,
    status: t.status,
    itemSku: t.item?.sku || '—',
    itemName: t.item?.name || '—',
    uom: t.item?.uom?.code || '—',
    qty: t.qty,
    fromLocation: t.fromLocation?.code || '—',
    fromType: t.fromLocation?.type || '—',
    toLocation: t.toLocation?.code || '—',
    toType: t.toLocation?.type || '—',
    createdAt: t.createdAt,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    createdBy: t.createdBy?.name || '—',
    completedBy: t.completedBy?.name || '—',
    durationMinutes: t.startedAt && t.completedAt
      ? Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000)
      : null,
  }))

  return { data, total }
}

// ----- Movement -----
async function queryMovement({ warehouseId, fromDate, toDate, status, itemId, documentNumber, limit, offset }) {
  const locIds = await resolveLocationIds(warehouseId)
  const where = {}
  if (status) where.status = status
  if (documentNumber) where.transferNumber = { contains: documentNumber, mode: 'insensitive' }
  if (locIds) {
    where.lines = { some: { OR: [{ fromLocationId: { in: locIds } }, { toLocationId: { in: locIds } }] } }
  }
  const range = dateRange(fromDate, toDate)

  const [transfers, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      include: {
        lines: {
          include: {
            item: { select: { sku: true, name: true, uom: { select: { code: true } } } },
            fromLocation: { select: { code: true, zone: { include: { warehouse: { select: { code: true } } } } } },
            toLocation: { select: { code: true, zone: { include: { warehouse: { select: { code: true } } } } } },
          },
        },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.stockTransfer.count({ where }),
  ])

  const data = []
  for (const t of transfers) {
    for (const l of t.lines) {
      const tDate = new Date(t.createdAt)
      if (range?.gte && tDate < range.gte) continue
      if (range?.lte && tDate > range.lte) continue
      if (itemId && l.itemId !== itemId) continue

      data.push({
        transferId: t.id,
        transferNumber: t.transferNumber,
        status: t.status,
        itemSku: l.item?.sku || '—',
        itemName: l.item?.name || '—',
        uom: l.item?.uom?.code || '—',
        qty: l.qty,
        fromLocation: l.fromLocation?.code || '—',
        fromWarehouse: l.fromLocation?.zone?.warehouse?.code || '—',
        toLocation: l.toLocation?.code || '—',
        toWarehouse: l.toLocation?.zone?.warehouse?.code || '—',
        createdAt: t.createdAt,
        postedAt: t.postedAt,
        createdBy: t.createdBy?.name || '—',
      })
    }
  }

  return { data: data.slice(0, limit), total }
}

// ----- Adjustment -----
async function queryAdjustment({ warehouseId, fromDate, toDate, status, itemId, documentNumber, limit, offset }) {
  const locIds = await resolveLocationIds(warehouseId)
  const where = {}
  if (status) where.status = status
  if (documentNumber) where.adjustmentNumber = { contains: documentNumber, mode: 'insensitive' }
  if (locIds) where.lines = { some: { locationId: { in: locIds } } }
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range

  const [rows, total] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where,
      include: {
        lines: {
          include: {
            item: { select: { sku: true, name: true, uom: { select: { code: true } } } },
            location: { select: { code: true } },
            reasonCode: { select: { code: true, description: true } },
          },
        },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.stockAdjustment.count({ where }),
  ])

  const data = []
  for (const a of rows) {
    for (const l of a.lines) {
      if (itemId && l.itemId !== itemId) continue
      data.push({
        adjustmentId: a.id,
        adjustmentNumber: a.adjustmentNumber,
        status: a.status,
        itemSku: l.item?.sku || '—',
        itemName: l.item?.name || '—',
        uom: l.item?.uom?.code || '—',
        locationCode: l.location?.code || '—',
        systemQty: l.systemQty,
        countedQty: l.countedQty,
        diffQty: Math.round(l.diffQty * 100) / 100,
        reasonCode: l.reasonCode?.code || '—',
        reasonDescription: l.reasonCode?.description || '—',
        remarks: l.remarks || '—',
        createdAt: a.createdAt,
        postedAt: a.postedAt,
        createdBy: a.createdBy?.name || '—',
        approvedBy: a.approvedBy?.name || '—',
      })
    }
  }

  return { data: data.slice(0, limit), total }
}

// ----- Cycle Count -----
async function queryCycleCount({ warehouseId, fromDate, toDate, status, locationId, documentNumber, limit, offset }) {
  const where = {}
  if (status) where.status = status
  if (documentNumber) where.countNumber = { contains: documentNumber, mode: 'insensitive' }
  if (locationId) where.locationId = locationId
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range

  const [rows, total] = await Promise.all([
    prisma.cycleCount.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        approvedBy: { select: { name: true } },
        lines: {
          include: {
            item: { select: { sku: true, name: true } },
            location: { select: { code: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.cycleCount.count({ where }),
  ])

  const data = rows.map((c) => {
    const totalSystem = c.lines.reduce((s, l) => s + l.systemQty, 0)
    const totalCounted = c.lines.reduce((s, l) => s + l.countedQty, 0)
    return {
      id: c.id,
      countNumber: c.countNumber,
      status: c.status,
      locationCode: c.lines[0]?.location?.code || '—',
      totalLines: c.lines.length,
      totalSystemQty: totalSystem,
      totalCountedQty: totalCounted,
      totalVariance: Math.round((totalCounted - totalSystem) * 100) / 100,
      createdAt: c.createdAt,
      postedAt: c.postedAt,
      createdBy: c.createdBy?.name || '—',
      assignedTo: c.assignedTo?.name || '—',
      approvedBy: c.approvedBy?.name || '—',
    }
  })

  return { data, total }
}

// ----- Picking -----
async function queryPicking({ warehouseId, fromDate, toDate, status, assignedToId, documentNumber, limit, offset }) {
  const where = {}
  if (status) where.status = status
  if (assignedToId) where.assignedToId = assignedToId
  if (documentNumber) where.pickingNumber = { contains: documentNumber, mode: 'insensitive' }
  if (warehouseId) where.warehouseId = warehouseId
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range

  const [rows, total] = await Promise.all([
    prisma.pickingOrder.findMany({
      where,
      include: {
        lines: { include: { item: { select: { sku: true, name: true } } } },
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.pickingOrder.count({ where }),
  ])

  const data = rows.map((o) => {
    const totalOrdered = o.lines.reduce((s, l) => s + l.qtyOrdered, 0)
    const totalPicked = o.lines.reduce((s, l) => s + l.qtyPicked, 0)
    return {
      id: o.id,
      pickingNumber: o.pickingNumber,
      status: o.status,
      priority: o.pickingPriority || 'NORMAL',
      totalLines: o.lines.length,
      totalOrderedQty: totalOrdered,
      totalPickedQty: totalPicked,
      fillRate: totalOrdered > 0 ? Math.round((totalPicked / totalOrdered) * 100) : 0,
      assignedTo: o.assignedTo?.name || '—',
      createdBy: o.createdBy?.name || '—',
      createdAt: o.createdAt,
      startedAt: o.startedAt,
      completedAt: o.completedAt,
      durationMinutes: o.startedAt && o.completedAt
        ? Math.round((new Date(o.completedAt) - new Date(o.startedAt)) / 60000)
        : null,
    }
  })

  return { data, total }
}

// ----- Packing -----
async function queryPacking({ warehouseId, fromDate, toDate, status, assignedToId, documentNumber, limit, offset }) {
  const where = {}
  if (status) where.status = status
  if (assignedToId) where.assignedToId = assignedToId
  if (documentNumber) where.packingNumber = { contains: documentNumber, mode: 'insensitive' }
  if (warehouseId) where.warehouseId = warehouseId
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range

  const [rows, total] = await Promise.all([
    prisma.packingOrder.findMany({
      where,
      include: {
        packages: { include: { items: { include: { item: { select: { sku: true, name: true } } } } } },
        pickingOrder: { select: { pickingNumber: true } },
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.packingOrder.count({ where }),
  ])

  const data = rows.map((o) => {
    const totalPackages = o.packages.length
    const closedPackages = o.packages.filter((p) => p.status === 'CLOSED').length
    const totalItems = o.packages.reduce((s, p) => s + p.items.reduce((ps, i) => ps + i.qty, 0), 0)
    return {
      id: o.id,
      packingNumber: o.packingNumber,
      pickingNumber: o.pickingOrder?.pickingNumber || '—',
      status: o.status,
      totalPackages,
      closedPackages,
      openPackages: totalPackages - closedPackages,
      totalItemsPacked: totalItems,
      assignedTo: o.assignedTo?.name || '—',
      createdBy: o.createdBy?.name || '—',
      createdAt: o.createdAt,
      completedAt: o.completedAt,
      durationMinutes: o.startedAt && o.completedAt
        ? Math.round((new Date(o.completedAt) - new Date(o.startedAt)) / 60000)
        : null,
    }
  })

  return { data, total }
}

// ----- Shipping -----
async function queryShipping({ warehouseId, fromDate, toDate, status, assignedToId, documentNumber, limit, offset }) {
  const where = {}
  if (status) where.status = status
  if (assignedToId) where.assignedToId = assignedToId
  if (documentNumber) where.shipmentNumber = { contains: documentNumber, mode: 'insensitive' }
  if (warehouseId) where.warehouseId = warehouseId
  const range = dateRange(fromDate, toDate)
  if (range) where.createdAt = range

  const [rows, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        packages: true,
        packingOrder: { select: { packingNumber: true, pickingOrder: { select: { pickingNumber: true } } } },
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.shipment.count({ where }),
  ])

  const data = rows.map((s) => ({
    id: s.id,
    shipmentNumber: s.shipmentNumber,
    packingNumber: s.packingOrder?.packingNumber || '—',
    pickingNumber: s.packingOrder?.pickingOrder?.pickingNumber || '—',
    status: s.status,
    totalPackages: s.packages.length,
    verifiedPackages: s.packages.filter((p) => p.status === 'CONFIRMED' || p.status === 'VERIFIED').length,
    assignedTo: s.assignedTo?.name || '—',
    createdBy: s.createdBy?.name || '—',
    createdAt: s.createdAt,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    shippedAt: s.shippedAt,
    durationMinutes: s.startedAt && s.completedAt
      ? Math.round((new Date(s.completedAt) - new Date(s.startedAt)) / 60000)
      : null,
  }))

  return { data, total }
}

// ============================================================
// PUBLIC API — ONE function only
// ============================================================

/**
 * getOperationsReport
 *
 * @param {'receiving'|'putaway'|'movement'|'adjustment'|'cycle-count'|'picking'|'packing'|'shipping'} reportType
 * @param {object} filters
 * @param {string} [filters.warehouseId]
 * @param {string} [filters.fromDate]
 * @param {string} [filters.toDate]
 * @param {string} [filters.status]
 * @param {string} [filters.itemId]
 * @param {string} [filters.locationId]
 * @param {string} [filters.assignedToId]
 * @param {string} [filters.supplier]
 * @param {string} [filters.documentNumber]
 * @param {number} [filters.limit=500]
 * @param {number} [filters.offset=0]
 * @returns {Promise<{data, total}>}
 */
export async function getOperationsReport(reportType, filters = {}) {
  if (!VALID_TYPES.includes(reportType)) {
    throw new Error(`Invalid reportType. Must be one of: ${VALID_TYPES.join(', ')}`)
  }

  const limit = Math.min(Number(filters.limit) || 500, 1000)
  const offset = Number(filters.offset) || 0
  const f = { ...filters, limit, offset }

  switch (reportType) {
    case 'receiving':     return queryReceiving(f)
    case 'putaway':      return queryPutaway(f)
    case 'movement':      return queryMovement(f)
    case 'adjustment':   return queryAdjustment(f)
    case 'cycle-count':   return queryCycleCount(f)
    case 'picking':       return queryPicking(f)
    case 'packing':       return queryPacking(f)
    case 'shipping':       return queryShipping(f)
    default:
      throw new Error(`Unhandled reportType: ${reportType}`)
  }
}
