import prisma from '@/lib/prisma'
import { allocateFifo, consumeFifoLayers, createFifoLayer, getAvailableQty } from '@/lib/fifo-service'
import { validateItem, validateLocation } from '@/lib/stock-validation'
import { nextAdjustmentNumber } from '@/lib/doc-numbering'
import { logAudit } from '@/lib/audit'

// ---------- RBAC helpers ----------
const canCreate = (role) => ['STOCK_CONTROL', 'SUPERVISOR', 'ADMINISTRATOR'].includes(role)
const canCancel = (role) => ['SUPERVISOR', 'ADMINISTRATOR'].includes(role)

// ---------- Resolve unit cost for ADJUSTMENT_IN ----------
// Fallback order: inputCost → item.defaultCost → 0
async function resolveUnitCost(itemId, inputCost) {
  if (inputCost != null && inputCost !== '') return Number(inputCost)
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { unitCost: true } })
  return Number(item?.unitCost || 0)
}

// ---------- Derive warehouse code from a location ----------
async function getWarehouseCode(locationId) {
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    include: { zone: { include: { warehouse: true } } },
  })
  return loc?.zone?.warehouse?.code || 'WH00'
}

// ==================== LIST ====================
export async function listAdjustments({ status, warehouseId, take = 100 } = {}) {
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
    prisma.stockAdjustment.findMany({
      where,
      include: {
        lines: {
          include: { item: { select: { sku: true, name: true } }, location: { select: { code: true } } },
        },
        createdBy: { select: { id: true, name: true } },
        reasonCode: { select: { id: true, code: true, description: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.stockAdjustment.count({ where }),
  ])

  return { data, total }
}

// ==================== GET SINGLE ====================
export async function getAdjustment(id) {
  return prisma.stockAdjustment.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
          location: { select: { id: true, code: true, name: true } },
          reasonCode: { select: { code: true, description: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
      reasonCode: { select: { id: true, code: true, description: true } },
    },
  })
}

// ==================== CREATE DRAFT ====================
export async function createAdjustment({ user, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions')

  const { lines = [], reasonCodeId, remarks, unitCosts = {} } = body
  // reasonCodeId is mandatory
  if (!reasonCodeId) throw new Error('Reason code is required')

  const reasonCode = await prisma.reasonCode.findUnique({ where: { id: reasonCodeId } })
  if (!reasonCode) throw new Error('Reason code not found')
  if (!reasonCode.isActive) throw new Error('Reason code is inactive: ' + reasonCode.code)
  // OPNAME-type reason codes are used internally by approveStockOpname.
  if (reasonCode.type !== 'ADJUSTMENT' && reasonCode.type !== 'OPNAME')
    throw new Error('Reason code type must be ADJUSTMENT')

  if (!Array.isArray(lines) || lines.length === 0) throw new Error('At least one line is required')

  const adjId = lines[0]?.adjustmentId
  const locationId = lines[0]?.locationId
  if (!locationId) throw new Error('Location is required on all lines')
  const whCode = await getWarehouseCode(locationId)

  return prisma.$transaction(async (tx) => {
    const adjustmentNumber = await nextAdjustmentNumber(whCode, tx)

    const adjustment = await tx.stockAdjustment.create({
      data: {
        adjustmentNumber,
        status: 'DRAFT',
        reasonCodeId,
        remarks: remarks || null,
        createdById: user.id,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            locationId: l.locationId,
            qty: Number(l.qty),
            systemQty: Number(l.systemQty) || 0,
            countedQty: Number(l.countedQty) || 0,
            diffQty: Number(l.diffQty) || 0,
            reasonCodeId: l.reasonCodeId || reasonCodeId,
            remarks: l.remarks || null,
          })),
        },
      },
      include: {
        lines: { include: { item: { select: { sku: true, name: true } }, location: { select: { code: true } } } },
        createdBy: { select: { name: true } },
        reasonCode: { select: { code: true } },
      },
    })

    logAudit({
      user,
      action: 'CREATE',
      module: 'ADJUSTMENT',
      entityType: 'StockAdjustment',
      entityId: adjustment.id,
      description: `Created adjustment ${adjustmentNumber}`,
      after: adjustment,
    })

    return adjustment
  })
}

// ==================== UPDATE DRAFT ====================
export async function updateAdjustment({ user, id, body }) {
  const existing = await prisma.stockAdjustment.findUnique({ where: { id } })
  if (!existing) throw new Error('Adjustment not found')
  if (existing.status !== 'DRAFT') throw new Error('Only draft adjustments can be updated')

  const { reasonCodeId, remarks, lines = [] } = body

  return prisma.$transaction(async (tx) => {
    // Update header
    const updated = await tx.stockAdjustment.update({
      where: { id },
      data: {
        reasonCodeId: reasonCodeId ?? existing.reasonCodeId,
        remarks: remarks ?? existing.remarks,
      },
    })

    // Replace lines
    if (lines.length > 0) {
      await tx.stockAdjustmentLine.deleteMany({ where: { adjustmentId: id } })
      await tx.stockAdjustmentLine.createMany({
        data: lines.map((l) => ({
          adjustmentId: id,
          itemId: l.itemId,
          locationId: l.locationId,
          qty: Number(l.qty),
          systemQty: Number(l.systemQty) || 0,
          countedQty: Number(l.countedQty) || 0,
          diffQty: Number(l.diffQty) || 0,
          reasonCodeId: l.reasonCodeId || reasonCodeId || existing.reasonCodeId,
          remarks: l.remarks || null,
        })),
      })
    }

    const result = await getAdjustment(id)

    logAudit({
      user,
      action: 'UPDATE',
      module: 'ADJUSTMENT',
      entityType: 'StockAdjustment',
      entityId: id,
      description: `Updated adjustment ${existing.adjustmentNumber}`,
      after: result,
    })

    return result
  })
}

// ==================== PREVIEW ====================
// Runs allocation logic WITHOUT writing to the database.
export async function previewAdjustment({ lines = [], reasonCodeId }) {
  if (!Array.isArray(lines) || lines.length === 0) return { allocations: [], ledgerEntries: [] }

  if (!reasonCodeId) throw new Error('Reason code is required for preview')

  const allocations = []
  const ledgerEntries = []

  for (const line of lines) {
    const qty = Number(line.qty)
    if (!qty || qty === 0) continue

    // Read-only function — skip validation (no DB writes to protect). Caller is
    // responsible for ensuring itemId/locationId are valid.
    if (qty > 0) {
      // ADJUSTMENT IN
      const unitCost = await resolveUnitCost(line.itemId, line.unitCost)
      const unitCostStr = unitCost != null && unitCost !== '' ? Number(unitCost) : 0

      allocations.push({
        lineId: line.id || line.lineId,
        itemId: line.itemId,
        itemSku: line.itemSku || line.itemId,
        itemName: line.itemName || '',
        locationId: line.locationId,
        locationCode: line.locationCode || line.locationId,
        direction: 'IN',
        qty,
        unitCost: unitCostStr,
        newFifoLayer: {
          itemId: line.itemId,
          locationId: line.locationId,
          locationCode: line.locationCode || line.locationId,
          qty,
          unitCost: unitCostStr,
          receivedAt: new Date().toISOString(),
          refNumber: null,
        },
      })

      ledgerEntries.push({
        txnType: 'ADJUSTMENT_IN',
        itemId: line.itemId,
        itemSku: line.itemSku || line.itemId,
        locationId: line.locationId,
        locationCode: line.locationCode || line.locationId,
        qty,
        unitCost: unitCostStr,
        refNumber: null,
      })
    } else {
      // ADJUSTMENT OUT — allocate FIFO
      let fifoAlloc = []
      try {
        fifoAlloc = await allocateFifo({
          itemId: line.itemId,
          locationId: line.locationId,
          qtyNeeded: Math.abs(qty),
        })
      } catch {
        fifoAlloc = []
      }

      const totalConsumed = fifoAlloc.reduce((sum, a) => sum + a.qtyToConsume, 0)
      const avgCost =
        totalConsumed > 0
          ? fifoAlloc.reduce((sum, a) => sum + Number(a.fifoLayer.unitCost || 0) * a.qtyToConsume, 0) / totalConsumed
          : 0

      allocations.push({
        lineId: line.id || line.lineId,
        itemId: line.itemId,
        itemSku: line.itemSku || line.itemId,
        itemName: line.itemName || '',
        locationId: line.locationId,
        locationCode: line.locationCode || line.locationId,
        direction: 'OUT',
        qty: Math.abs(qty),
        fifoLayers: fifoAlloc.map((a) => ({
          layerId: a.fifoLayer.id,
          refNumber: a.fifoLayer.refNumber,
          receivedAt: a.fifoLayer.receivedAt,
          unitCost: a.fifoLayer.unitCost,
          available: Number(a.fifoLayer.qtyRemaining),
          qtyToConsume: a.qtyToConsume,
        })),
        avgUnitCost: avgCost,
      })

      ledgerEntries.push({
        txnType: 'ADJUSTMENT_OUT',
        itemId: line.itemId,
        itemSku: line.itemSku || line.itemId,
        locationId: line.locationId,
        locationCode: line.locationCode || line.locationId,
        qty: -Math.abs(qty),
        unitCost: avgCost,
        refNumber: null,
      })
    }
  }

  return { allocations, ledgerEntries }
}

// ==================== POST (EXECUTE) ====================
export async function postAdjustment({ user, id, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions')

  const existing = await prisma.stockAdjustment.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!existing) throw new Error('Adjustment not found')
  if (existing.status !== 'DRAFT') throw new Error('Only draft adjustments can be posted')
  if (!existing.reasonCodeId) throw new Error('Reason code is required')

  const { reasonCodeId } = body || {}
  const effectiveReasonCodeId = reasonCodeId || existing.reasonCodeId

  return prisma.$transaction(async (tx) => {
    const ledgerOps = []
    const fifoOps = []

    for (const line of existing.lines) {
      const qty = Number(line.qty)
      if (qty === 0) continue

      // Resolve unit cost for IN
      const unitCost = qty > 0 ? await resolveUnitCost(line.itemId, line.unitCost) : 0

      if (qty > 0) {
        // ADJUSTMENT IN: create FIFO layer
        const layer = await createFifoLayer({
          itemId: line.itemId,
          locationId: line.locationId,
          qty: Math.abs(qty),
          refNumber: existing.adjustmentNumber,
          unitCost,
          receivedAt: new Date(),
          tx,
        })

        ledgerOps.push(
          tx.stockLedger.create({
            data: {
              itemId: line.itemId,
              locationId: line.locationId,
              txnType: 'ADJUSTMENT_IN',
              qty: Math.abs(qty),
              unitCost,
              refType: 'ADJUSTMENT',
              refId: existing.id,
              refNumber: existing.adjustmentNumber,
              reasonCodeId: line.reasonCodeId || effectiveReasonCodeId,
              remarks: line.remarks || existing.remarks || null,
              userId: user.id,
            },
          })
        )
      } else {
        // ADJUSTMENT OUT: consume FIFO
        const absQty = Math.abs(qty)
        const allocations = await allocateFifo({
          itemId: line.itemId,
          locationId: line.locationId,
          qtyNeeded: absQty,
          tx,
        })

        await consumeFifoLayers({ allocations, tx })

        // Weighted average: total cost of consumed units / total qty consumed
        const totalConsumed = allocations.reduce((sum, a) => sum + a.qtyToConsume, 0)
        const avgCost =
          totalConsumed > 0
            ? allocations.reduce((sum, a) => sum + Number(a.fifoLayer.unitCost || 0) * a.qtyToConsume, 0) / totalConsumed
            : 0

        ledgerOps.push(
          tx.stockLedger.create({
            data: {
              itemId: line.itemId,
              locationId: line.locationId,
              txnType: 'ADJUSTMENT_OUT',
              qty: -absQty,
              unitCost: avgCost,
              refType: 'ADJUSTMENT',
              refId: existing.id,
              refNumber: existing.adjustmentNumber,
              reasonCodeId: line.reasonCodeId || effectiveReasonCodeId,
              remarks: line.remarks || existing.remarks || null,
              userId: user.id,
            },
          })
        )
      }
    }

    await Promise.all(ledgerOps)

    const updated = await tx.stockAdjustment.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        postedAt: new Date(),
        reasonCodeId: effectiveReasonCodeId,
      },
      include: {
        lines: {
          include: {
            item: { select: { sku: true, name: true } },
            location: { select: { code: true } },
          },
        },
        reasonCode: { select: { code: true } },
      },
    })

    logAudit({
      user,
      action: 'POST',
      module: 'ADJUSTMENT',
      entityType: 'StockAdjustment',
      entityId: id,
      description: `Posted adjustment ${existing.adjustmentNumber}`,
      after: updated,
    })

    return updated
  })
}

// ==================== CANCEL ====================
export async function cancelAdjustment({ user, id, reason }) {
  if (!canCancel(user.role)) throw new Error('Only Supervisor or Administrator can cancel')

  const existing = await prisma.stockAdjustment.findUnique({ where: { id } })
  if (!existing) throw new Error('Adjustment not found')
  if (existing.status === 'COMPLETED') throw new Error('Completed adjustments cannot be cancelled')
  if (existing.status === 'CANCELLED') throw new Error('Adjustment is already cancelled')

  const updated = await prisma.stockAdjustment.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { lines: { include: { item: { select: { sku: true } } } } },
  })

  logAudit({
    user,
    action: 'CANCEL',
    module: 'ADJUSTMENT',
    entityType: 'StockAdjustment',
    entityId: id,
    description: `Cancelled adjustment ${existing.adjustmentNumber}${reason ? ': ' + reason : ''}`,
    before: existing,
    after: updated,
  })

  return updated
}
