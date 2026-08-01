import prisma from '@/lib/prisma'
import { allocateFifo, consumeFifoLayers, createFifoLayer } from '@/lib/fifo-service'
import { validateItem, validateLocation } from '@/lib/stock-validation'
import { nextCycleCountNumber, nextAdjustmentNumber } from '@/lib/doc-numbering'
import { logAudit } from '@/lib/audit'

// ---------- RBAC helpers ----------
const canCreate = (role) => ['STOCK_CONTROL', 'SUPERVISOR', 'ADMINISTRATOR'].includes(role)
const canApprove = (role) => ['SUPERVISOR', 'ADMINISTRATOR'].includes(role)

// ---------- Derive warehouse code from a location ----------
async function getWarehouseCode(locationId) {
  if (!locationId) return 'WH00'
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    include: { zone: { include: { warehouse: true } } },
  })
  return loc?.zone?.warehouse?.code || 'WH00'
}

// ---------- Resolve unit cost for adjustments ----------
async function resolveUnitCost(itemId) {
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { unitCost: true } })
  return Number(item?.unitCost || 0)
}

// ==================== LIST ====================
export async function listCycleCounts({ status, warehouseId, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status
  if (warehouseId) {
    const locIds = (
      await prisma.location.findMany({
        where: { zone: { warehouseId } },
        select: { id: true },
      })
    ).map((l) => l.id)
    where.lines = { some: { locationId: { in: locIds } } }
  }

  const [data, total] = await Promise.all([
    prisma.cycleCount.findMany({
      where,
      include: {
        lines: {
          include: { item: { select: { sku: true, name: true } }, location: { select: { code: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.cycleCount.count({ where }),
  ])

  return { data, total }
}

// ==================== GET SINGLE ====================
export async function getCycleCount(id) {
  return prisma.cycleCount.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
          location: { select: { id: true, code: true, name: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

// ==================== CREATE DRAFT ====================
export async function createCycleCount({ user, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions')

  const { lines = [], remarks, assignedToId } = body

  // Collect location IDs from lines to derive warehouse for numbering
  const locationIds = [...new Set(lines.map((l) => l.locationId).filter(Boolean))]
  const firstLocationId = locationIds[0]
  const whCode = await getWarehouseCode(firstLocationId)

  return prisma.$transaction(async (tx) => {
    const countNumber = await nextCycleCountNumber(whCode, tx)

    const count = await tx.cycleCount.create({
      data: {
        countNumber,
        status: assignedToId ? 'ASSIGNED' : 'DRAFT',
        assignedToId: assignedToId || null,
        remarks: remarks || null,
        createdById: user.id,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            locationId: l.locationId,
            systemQty: Number(l.systemQty) || 0,
            countedQty: Number(l.countedQty) || 0,
            diffQty: Number(l.diffQty) || 0,
          })),
        },
      },
      include: {
        lines: {
          include: {
            item: { select: { sku: true, name: true } },
            location: { select: { code: true } },
          },
        },
        createdBy: { select: { name: true } },
      },
    })

    logAudit({
      user,
      action: 'CREATE',
      module: 'CYCLE_COUNT',
      entityType: 'CycleCount',
      entityId: count.id,
      description: `Created cycle count ${countNumber}`,
      after: count,
    })

    return count
  })
}

// ==================== ASSIGN COUNTER ====================
export async function assignCycleCount({ user, id, assignedToId }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions')

  const existing = await prisma.cycleCount.findUnique({ where: { id } })
  if (!existing) throw new Error('Cycle count not found')
  if (!['DRAFT', 'ASSIGNED'].includes(existing.status)) {
    throw new Error('Can only assign draft or reassigned counts')
  }

  const assignedUser = await prisma.user.findUnique({ where: { id: assignedToId } })
  if (!assignedUser) throw new Error('Assigned user not found')
  if (!assignedUser.isActive) throw new Error('Assigned user is inactive')

  const updated = await prisma.cycleCount.update({
    where: { id },
    data: { status: 'ASSIGNED', assignedToId },
    include: {
      lines: { include: { item: { select: { sku: true } }, location: { select: { code: true } } } },
    },
  })

  logAudit({
    user,
    action: 'ASSIGN',
    module: 'CYCLE_COUNT',
    entityType: 'CycleCount',
    entityId: id,
    description: `Assigned cycle count ${existing.countNumber} to ${assignedUser.name}`,
    after: updated,
  })

  return updated
}

// ==================== START COUNTING ====================
export async function startCycleCount({ user, id }) {
  const existing = await prisma.cycleCount.findUnique({ where: { id } })
  if (!existing) throw new Error('Cycle count not found')
  if (existing.status !== 'ASSIGNED') throw new Error('Cycle count must be ASSIGNED before starting')
  if (existing.assignedToId && existing.assignedToId !== user.id) {
    throw new Error('This count is assigned to another user')
  }

  const updated = await prisma.cycleCount.update({
    where: { id },
    data: { status: 'IN_PROGRESS' },
    include: {
      lines: { include: { item: { select: { sku: true } }, location: { select: { code: true } } } },
    },
  })

  logAudit({
    user,
    action: 'START',
    module: 'CYCLE_COUNT',
    entityType: 'CycleCount',
    entityId: id,
    description: `Started cycle count ${existing.countNumber}`,
    after: updated,
  })

  return updated
}

// ==================== SUBMIT COUNT ====================
export async function submitCycleCount({ user, id, body }) {
  const existing = await prisma.cycleCount.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Cycle count not found')
  if (existing.status !== 'IN_PROGRESS') throw new Error('Cycle count must be IN_PROGRESS to submit')

  const { lines = [] } = body

  // Build a quick lookup from body lines
  const bodyLineMap = {}
  for (const l of lines) bodyLineMap[l.id] = l

  // Validate all lines have countedQty
  for (const line of existing.lines) {
    const submitted = bodyLineMap[line.id]
    if (submitted && (submitted.countedQty == null || submitted.countedQty === '')) {
      throw new Error(`Line ${line.id}: countedQty is required`)
    }
  }

  return prisma.$transaction(async (tx) => {
    // Update each line with countedQty and auto-calculate diffQty
    for (const line of existing.lines) {
      const submitted = bodyLineMap[line.id]
      const countedQty = submitted ? Number(submitted.countedQty) : Number(line.countedQty)
      const diffQty = countedQty - Number(line.systemQty)

      await tx.cycleCountLine.update({
        where: { id: line.id },
        data: { countedQty, diffQty },
      })
    }

    const updated = await tx.cycleCount.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        lines: {
          include: { item: { select: { sku: true, name: true } }, location: { select: { code: true } } },
        },
      },
    })

    logAudit({
      user,
      action: 'SUBMIT',
      module: 'CYCLE_COUNT',
      entityType: 'CycleCount',
      entityId: id,
      description: `Submitted cycle count ${existing.countNumber}`,
      after: updated,
    })

    return updated
  })
}

// ==================== APPROVE (auto-creates & posts adjustments) ====================
export async function approveCycleCount({ user, id }) {
  if (!canApprove(user.role)) throw new Error('Only Supervisor or Administrator can approve')

  const existing = await prisma.cycleCount.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Cycle count not found')
  if (existing.status !== 'SUBMITTED') throw new Error('Only SUBMITTED cycle counts can be approved')

  // Find a reason code of type CYCLE_COUNT
  const reasonCode = await prisma.reasonCode.findFirst({
    where: { type: 'CYCLE_COUNT', isActive: true },
  })
  if (!reasonCode) throw new Error('No active reason code of type CYCLE_COUNT found — please create one')

  const firstLocationId = existing.lines[0]?.locationId
  const whCode = await getWarehouseCode(firstLocationId)

  const adjustmentResults = []

  return prisma.$transaction(async (tx) => {
    // Collect variance lines (diffQty !== 0)
    const varianceLines = existing.lines.filter((l) => Number(l.diffQty) !== 0)

    if (varianceLines.length > 0) {
      // Create one adjustment for all variance lines
      const adjustmentNumber = await nextAdjustmentNumber(whCode, tx)

      const adjustment = await tx.stockAdjustment.create({
        data: {
          adjustmentNumber,
          status: 'COMPLETED',
          postedAt: new Date(),
          reasonCodeId: reasonCode.id,
          remarks: `Auto-created from cycle count ${existing.countNumber}`,
          createdById: user.id,
          approvedById: user.id,
          approvedAt: new Date(),
          lines: {
            create: varianceLines.map((l) => ({
              itemId: l.itemId,
              locationId: l.locationId,
              qty: Number(l.diffQty),
              systemQty: Number(l.systemQty),
              countedQty: Number(l.countedQty),
              diffQty: Number(l.diffQty),
              reasonCodeId: reasonCode.id,
              remarks: `Cycle count ${existing.countNumber}`,
            })),
          },
        },
      })

      // Post each variance line to the ledger and FIFO
      for (const l of varianceLines) {
        const diffQty = Number(l.diffQty)

        if (diffQty > 0) {
          // ADJUSTMENT IN
          const unitCost = await resolveUnitCost(l.itemId)
          await createFifoLayer({
            itemId: l.itemId,
            locationId: l.locationId,
            qty: Math.abs(diffQty),
            refNumber: existing.countNumber,
            unitCost,
            receivedAt: new Date(),
            tx,
          })

          await tx.stockLedger.create({
            data: {
              itemId: l.itemId,
              locationId: l.locationId,
              txnType: 'ADJUSTMENT_IN',
              qty: Math.abs(diffQty),
              unitCost,
              refType: 'CYCLE_COUNT',
              refId: existing.id,
              refNumber: existing.countNumber,
              reasonCodeId: reasonCode.id,
              remarks: `Auto-adjustment from cycle count ${existing.countNumber}`,
              userId: user.id,
            },
          })
        } else {
          // ADJUSTMENT OUT
          const absQty = Math.abs(diffQty)
          const allocations = await allocateFifo({
            itemId: l.itemId,
            locationId: l.locationId,
            qtyNeeded: absQty,
            tx,
          })

          await consumeFifoLayers({ allocations, tx })

          const avgCost =
            allocations.length > 0
              ? allocations.reduce((sum, a) => sum + Number(a.fifoLayer.unitCost || 0), 0) / allocations.length
              : 0

          await tx.stockLedger.create({
            data: {
              itemId: l.itemId,
              locationId: l.locationId,
              txnType: 'ADJUSTMENT_OUT',
              qty: -absQty,
              unitCost: avgCost,
              refType: 'CYCLE_COUNT',
              refId: existing.id,
              refNumber: existing.countNumber,
              reasonCodeId: reasonCode.id,
              remarks: `Auto-adjustment from cycle count ${existing.countNumber}`,
              userId: user.id,
            },
          })
        }
      }

      adjustmentResults.push(adjustment)
    }

    // Mark cycle count as APPROVED
    const updated = await tx.cycleCount.update({
      where: { id },
      data: {
        status: 'APPROVED',
        postedAt: new Date(),
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: {
        lines: {
          include: { item: { select: { sku: true, name: true } }, location: { select: { code: true } } },
        },
      },
    })

    logAudit({
      user,
      action: 'APPROVE',
      module: 'CYCLE_COUNT',
      entityType: 'CycleCount',
      entityId: id,
      description: `Approved cycle count ${existing.countNumber}${adjustmentResults.length > 0 ? ' — auto-created adjustment ' + adjustmentResults[0].adjustmentNumber : ' (no variances)'}`,
      after: updated,
    })

    return { cycleCount: updated, adjustments: adjustmentResults }
  })
}

// ==================== CANCEL ====================
export async function cancelCycleCount({ user, id, reason }) {
  if (!canApprove(user.role)) throw new Error('Only Supervisor or Administrator can cancel')

  const existing = await prisma.cycleCount.findUnique({ where: { id } })
  if (!existing) throw new Error('Cycle count not found')
  if (existing.status === 'APPROVED' || existing.status === 'COMPLETED') {
    throw new Error('Approved or completed cycle counts cannot be cancelled')
  }

  const updated = await prisma.cycleCount.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { lines: { include: { item: { select: { sku: true } } } } },
  })

  logAudit({
    user,
    action: 'CANCEL',
    module: 'CYCLE_COUNT',
    entityType: 'CycleCount',
    entityId: id,
    description: `Cancelled cycle count ${existing.countNumber}${reason ? ': ' + reason : ''}`,
    before: existing,
    after: updated,
  })

  return updated
}

// ==================== AUTO-POPULATE LINES FROM FIFO ====================
// Returns items + systemQty at a given location for use in the create dialog.
export async function getItemsAtLocation(locationId) {
  const layers = await prisma.fifoLayer.groupBy({
    by: ['itemId'],
    where: { locationId, qtyRemaining: { gt: 0 } },
    _sum: { qtyRemaining: true },
  })

  if (layers.length === 0) return []

  const itemIds = layers.map((l) => l.itemId)
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, name: true, uom: { select: { code: true } } },
  })

  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]))

  return layers.map((l) => ({
    itemId: l.itemId,
    systemQty: Number(l._sum.qtyRemaining) || 0,
    item: itemMap[l.itemId],
  }))
}
