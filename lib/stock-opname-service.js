import prisma from '@/lib/prisma'
import { nextStockOpnameNumber } from '@/lib/doc-numbering'
import { validateLocation } from '@/lib/stock-validation'
import { lookupByBarcode } from '@/lib/barcode-service'
import { createAdjustment, postAdjustment } from '@/lib/adjustment-service'
import { logAudit } from '@/lib/audit'

// ============================================================
// Stock Opname Service
// ------------------------------------------------------------
// Phase 9.2 — Milestone 9
//
// Business Rules:
//   - Stock Opname NEVER modifies inventory directly.
//   - systemQty is captured at DRAFT → IN_PROGRESS transition.
//   - systemQty snapshot is IMMUTABLE after capture.
//   - After APPROVED → COMPLETED: calls adjustment-service.js.
//   - Adjustment Service handles: Inventory, FIFO, Audit Trail, Stock Ledger.
// ============================================================

// ---------- RBAC helpers ----------
const canCancel = (role) => ['SUPERVISOR', 'ADMINISTRATOR'].includes(role)

// ---------- Derive warehouse code from a location ----------
async function getWarehouseCode(locationId, tx = prisma) {
  const loc = await tx.location.findUnique({
    where: { id: locationId },
    include: { zone: { include: { warehouse: true } } },
  })
  if (!loc?.zone?.warehouse?.code) throw new Error('Cannot resolve warehouse code: location has no warehouse assignment')
  return loc.zone.warehouse.code
}

// ---------- Get warehouse code from an opname's lines ----------
async function getOpnameWarehouseCode(opnameId, tx = prisma) {
  const line = await tx.stockOpnameLine.findFirst({
    where: { stockOpnameId: opnameId },
    include: { location: { include: { zone: { include: { warehouse: true } } } } },
  })
  if (!line?.location?.zone?.warehouse?.code) throw new Error('Cannot resolve warehouse code: stock opname has no lines with warehouse assignment')
  return line.location.zone.warehouse.code
}

// ---------- Variance summary calculator ----------
function calculateVarianceSummary(lines) {
  const total = lines.length
  const counted = lines.filter((l) => l.countedQty != null && l.countedQty !== 0).length
  const matched = lines.filter((l) => l.diffQty === 0).length
  const missing = lines.filter((l) => l.diffQty < 0).length
  const over = lines.filter((l) => l.diffQty > 0).length
  const variance = lines.filter((l) => l.diffQty !== 0).length
  const accuracy = total > 0 ? (matched / total) * 100 : 0

  return { total, counted, matched, missing, over, variance, accuracy }
}

// ==================== CREATE DRAFT ====================
export async function createStockOpname({ user, body }) {
  if (!user) throw new Error('User is required')

  const { remarks } = body || {}

  return prisma.$transaction(async (tx) => {
    const firstLocation = await tx.location.findFirst({ where: { isActive: true } })
    if (!firstLocation) throw new Error('No active location found — cannot generate stock opname number')

    const whCode = await getWarehouseCode(firstLocation.id, tx)
    const opnameNumber = await nextStockOpnameNumber(whCode, tx)

    const opname = await tx.stockOpname.create({
      data: {
        opnameNumber,
        status: 'DRAFT',
        remarks: remarks || null,
        createdById: user.id,
      },
    })

    logAudit({
      user,
      action: 'CREATE',
      module: 'STOCK_OPNAME',
      entityType: 'StockOpname',
      entityId: opname.id,
      description: `Created stock opname ${opnameNumber}`,
      after: opname,
    })

    return opname
  })
}

// ==================== START (DRAFT → IN_PROGRESS) ====================
export async function startStockOpname({ user, id, body }) {
  const existing = await prisma.stockOpname.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status !== 'DRAFT') throw new Error('Only DRAFT stock opnames can be started')

  const { locationId, itemIds } = body || {}

  return prisma.$transaction(async (tx) => {
    // Build snapshot: current Stock On Hand filtered by location and/or items
    const snapshotWhere = {}
    if (locationId) {
      const locIds = locationId
        ? [locationId]
        : (
            await tx.location.findMany({
              where: { isActive: true, type: 'STORAGE' },
              select: { id: true },
            })
          ).map((l) => l.id)
      snapshotWhere.locationId = { in: locIds }
    }
    if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      snapshotWhere.itemId = { in: itemIds }
    }

    // Capture current Stock On Hand from ledger (immutable snapshot)
    const grouped = await tx.stockLedger.groupBy({
      by: ['itemId', 'locationId'],
      where: snapshotWhere,
      _sum: { qty: true },
    })

    const snapshotRows = grouped.filter((g) => (g._sum.qty || 0) !== 0)

    // Get item/location metadata
    const snapshotItemIds = [...new Set(snapshotRows.map((r) => r.itemId))]
    const locationIds = [...new Set(snapshotRows.map((r) => r.locationId))]
    const [items, locations] = await Promise.all([
      tx.item.findMany({ where: { id: { in: snapshotItemIds } }, select: { id: true, sku: true, name: true } }),
      tx.location.findMany({
        where: { id: { in: locationIds } },
        include: { zone: { include: { warehouse: true } } },
      }),
    ])
    const itemMap = Object.fromEntries(items.map((i) => [i.id, i]))
    const locMap = Object.fromEntries(locations.map((l) => [l.id, l]))

    // Delete existing lines (start over fresh) and create snapshot lines
    await tx.stockOpnameLine.deleteMany({ where: { stockOpnameId: id } })

    const linesToCreate = snapshotRows.map((r) => ({
      stockOpnameId: id,
      itemId: r.itemId,
      locationId: r.locationId,
      systemQty: r._sum.qty || 0,
      countedQty: 0,
      diffQty: 0,
    }))

    if (linesToCreate.length > 0) {
      await tx.stockOpnameLine.createMany({ data: linesToCreate })
    }

    const updated = await tx.stockOpname.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
      include: {
        lines: {
          include: {
            item: { select: { id: true, sku: true, name: true } },
            location: { select: { id: true, code: true, name: true } },
          },
        },
      },
    })

    logAudit({
      user,
      action: 'START',
      module: 'STOCK_OPNAME',
      entityType: 'StockOpname',
      entityId: id,
      description: `Started stock opname ${existing.opnameNumber} — snapshot captured with ${linesToCreate.length} line(s)`,
      after: updated,
    })

    return updated
  })
}

// ==================== SCAN LOCATION ====================
export async function scanLocation({ user, id, body }) {
  const existing = await prisma.stockOpname.findUnique({ where: { id } })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status !== 'IN_PROGRESS') throw new Error('Stock opname must be IN_PROGRESS to scan locations')

  const { locationCode } = body || {}
  if (!locationCode) throw new Error('Location code is required')

  // Validate location exists and is active
  const location = await validateLocation(locationCode, { activeOnly: true })

  // Return location info with line counts at this location
  const linesAtLocation = await prisma.stockOpnameLine.count({
    where: { stockOpnameId: id, locationId: location.id },
  })

  return {
    location: {
      id: location.id,
      code: location.code,
      name: location.name,
      type: location.type,
      isActive: location.isActive,
    },
    linesAtLocation,
  }
}

// ==================== SCAN ITEM ====================
export async function scanItem({ user, id, body }) {
  const existing = await prisma.stockOpname.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status !== 'IN_PROGRESS') throw new Error('Stock opname must be IN_PROGRESS to scan items')

  const { barcode, locationId } = body || {}
  if (!barcode) throw new Error('Barcode is required')

  // Resolve barcode → item
  const lookup = await lookupByBarcode(barcode)
  if (lookup.type !== 'ITEM') throw new Error('Barcode does not match any item: ' + barcode)

  const { item } = lookup

  // Validate item belongs to snapshot
  const line = existing.lines.find((l) => l.itemId === item.id)
  if (!line) throw new Error('Item is not in this stock opname snapshot: ' + item.sku)

  // Validate item belongs to selected location
  if (locationId) {
    if (line.locationId !== locationId) throw new Error('Item is not at the specified location')
  }

  return {
    line: {
      id: line.id,
      itemId: line.itemId,
      locationId: line.locationId,
      systemQty: line.systemQty,
      countedQty: line.countedQty,
      diffQty: line.diffQty,
    },
    item: {
      id: item.id,
      sku: item.sku,
      name: item.name,
      barcode: item.barcode,
      uom: item.uom,
    },
    location: {
      id: line.locationId,
    },
  }
}

// ==================== UPDATE COUNTED QTY ====================
export async function updateCountedQty({ user, id, body }) {
  const existing = await prisma.stockOpname.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status !== 'IN_PROGRESS') throw new Error('Stock opname must be IN_PROGRESS to update counts')

  const { lineId, countedQty } = body || {}
  if (!lineId) throw new Error('Line ID is required')
  if (countedQty == null) throw new Error('Counted quantity is required')

  const line = existing.lines.find((l) => l.id === lineId)
  if (!line) throw new Error('Stock opname line not found: ' + lineId)
  if (line.stockOpnameId !== id) throw new Error('Line does not belong to this stock opname')

  const qty = Number(countedQty)
  if (isNaN(qty) || qty < 0) throw new Error('Counted quantity must be a non-negative number')

  const diffQty = qty - line.systemQty

  const updated = await prisma.stockOpnameLine.update({
    where: { id: lineId },
    data: {
      countedQty: qty,
      diffQty,
      countedAt: new Date(),
    },
    include: {
      item: { select: { id: true, sku: true, name: true } },
      location: { select: { id: true, code: true } },
    },
  })

  return updated
}

// ==================== SUBMIT (IN_PROGRESS → SUBMITTED) ====================
export async function submitStockOpname({ user, id }) {
  const existing = await prisma.stockOpname.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status !== 'IN_PROGRESS') throw new Error('Only IN_PROGRESS stock opnames can be submitted')

  // Validate every required line has been counted
  const uncountedLines = existing.lines.filter((l) => l.countedQty == null || l.countedQty === 0)
  if (uncountedLines.length > 0) {
    const skuList = uncountedLines
      .map((l) => l.itemId)
      .join(', ')
    throw new Error(
      `All lines must be counted before submission. ${uncountedLines.length} line(s) have not been counted.`
    )
  }

  const updated = await prisma.stockOpname.update({
    where: { id },
    data: { status: 'SUBMITTED' },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true } },
          location: { select: { id: true, code: true } },
        },
      },
    },
  })

  logAudit({
    user,
    action: 'SUBMIT',
    module: 'STOCK_OPNAME',
    entityType: 'StockOpname',
    entityId: id,
    description: `Submitted stock opname ${existing.opnameNumber}`,
    after: updated,
  })

  return updated
}

// ==================== REJECT (SUBMITTED → IN_PROGRESS) ====================
export async function rejectStockOpname({ user, id, body }) {
  const existing = await prisma.stockOpname.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status !== 'SUBMITTED') throw new Error('Only SUBMITTED stock opnames can be rejected')

  const { reason } = body || {}

  const updated = await prisma.stockOpname.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      remarks: existing.remarks
        ? existing.remarks + '\n[REJECTED] ' + (reason || 'No reason provided')
        : '[REJECTED] ' + (reason || 'No reason provided'),
    },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true } },
          location: { select: { id: true, code: true } },
        },
      },
    },
  })

  logAudit({
    user,
    action: 'REJECT',
    module: 'STOCK_OPNAME',
    entityType: 'StockOpname',
    entityId: id,
    description: `Rejected stock opname ${existing.opnameNumber}${reason ? ': ' + reason : ''}`,
    before: existing,
    after: updated,
  })

  return updated
}

// ==================== APPROVE → COMPLETED ====================
// IMPORTANT: Does NOT update stock directly.
// Calls adjustment-service.js which handles:
//   - Inventory (FIFO layers)
//   - Stock Ledger
//   - Audit Trail
export async function approveStockOpname({ user, id, body }) {
  if (!canCancel(user.role)) throw new Error('Only Supervisor or Administrator can approve')

  const existing = await prisma.stockOpname.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status !== 'SUBMITTED') throw new Error('Only SUBMITTED stock opnames can be approved')

  return prisma.$transaction(async (tx) => {
    // Build adjustment lines from variance lines (diffQty !== 0)
    const varianceLines = existing.lines.filter((l) => l.diffQty !== 0)

    if (varianceLines.length > 0) {
      const whCode = await getOpnameWarehouseCode(id, tx)

      const reasonCode = await tx.reasonCode.findFirst({
        where: { type: 'OPNAME', isActive: true },
      })
      if (!reasonCode) throw new Error('Active OPNAME reason code not found — please configure one in reason codes first')

      const adjustment = await createAdjustment({
        user,
        body: {
          reasonCodeId: reasonCode.id,
          remarks: `Stock Opname: ${existing.opnameNumber}`,
          lines: varianceLines.map((l) => ({
            itemId: l.itemId,
            locationId: l.locationId,
            qty: l.diffQty,
            systemQty: l.systemQty,
            countedQty: l.countedQty,
            diffQty: l.diffQty,
            remarks: l.varianceReason || null,
          })),
        },
      })

      await postAdjustment({ user, id: adjustment.id })
    }

    const updated = await tx.stockOpname.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        approvedById: user.id,
        approvedAt: new Date(),
        completedAt: new Date(),
      },
      include: {
        lines: {
          include: {
            item: { select: { id: true, sku: true, name: true } },
            location: { select: { id: true, code: true } },
          },
        },
        approvedBy: { select: { id: true, name: true } },
      },
    })

    logAudit({
      user,
      action: 'APPROVE',
      module: 'STOCK_OPNAME',
      entityType: 'StockOpname',
      entityId: id,
      description: `Approved and completed stock opname ${existing.opnameNumber}`,
      after: updated,
    })

    return updated
  })
}

// ==================== CANCEL ====================
export async function cancelStockOpname({ user, id, body }) {
  if (!canCancel(user.role)) throw new Error('Only Supervisor or Administrator can cancel')

  const existing = await prisma.stockOpname.findUnique({ where: { id } })
  if (!existing) throw new Error('Stock opname not found')
  if (existing.status === 'APPROVED') throw new Error('APPROVED stock opnames cannot be cancelled')
  if (existing.status === 'COMPLETED') throw new Error('COMPLETED stock opnames cannot be cancelled')

  const { reason } = body || {}

  const updated = await prisma.stockOpname.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      remarks: existing.remarks
        ? existing.remarks + '\n[CANCELLED] ' + (reason || 'No reason provided')
        : '[CANCELLED] ' + (reason || 'No reason provided'),
    },
  })

  logAudit({
    user,
    action: 'CANCEL',
    module: 'STOCK_OPNAME',
    entityType: 'StockOpname',
    entityId: id,
    description: `Cancelled stock opname ${existing.opnameNumber}${reason ? ': ' + reason : ''}`,
    before: existing,
    after: updated,
  })

  return updated
}

// ==================== GET SINGLE ====================
export async function getStockOpname(id) {
  return prisma.stockOpname.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
          location: { select: { id: true, code: true, name: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  })
}

// ==================== LIST ====================
export async function listStockOpnames({ status, take = 100, skip = 0 } = {}) {
  const where = {}
  if (status) where.status = status

  const [data, total] = await Promise.all([
    prisma.stockOpname.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.stockOpname.count({ where }),
  ])

  return { data, total }
}

// ==================== VARIANCE SUMMARY ====================
export async function getVarianceSummary(id) {
  const opname = await prisma.stockOpname.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!opname) throw new Error('Stock opname not found')

  const summary = calculateVarianceSummary(opname.lines)

  return {
    totalItems: summary.total,
    countedItems: summary.counted,
    matched: summary.matched,
    variance: summary.variance,
    missing: summary.missing,
    over: summary.over,
    accuracy: Math.round(summary.accuracy * 100) / 100,
  }
}
