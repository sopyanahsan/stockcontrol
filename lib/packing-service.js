import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextPackingNumber, nextPackageNumber } from '@/lib/doc-numbering'

// ============================================================
// Packing Service
// ------------------------------------------------------------
// Packing organizes already-picked inventory into packages.
// - Does NOT consume FIFO layers
// - Does NOT write to Stock Ledger
// - Does NOT change SerialNumber status
// - Reuses PickingTaskSerial (adds packageId when packed)
// - Volume (L×W×H) is calculated on the backend
// ============================================================

// ---------- RBAC ----------
const canCreate = (role) => ['STOCK_CONTROL', 'SUPERVISOR', 'ADMINISTRATOR'].includes(role)

// ---------- INCLUDE shapes ----------
export const PACKING_INCLUDE = {
  pickingOrder: {
    select: {
      id: true,
      pickingNumber: true,
      status: true,
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
          tasks: {
            include: {
              location: { select: { id: true, code: true, name: true } },
              serials: { select: { id: true, serialNo: true, pickedAt: true } },
            },
          },
        },
      },
    },
  },
  packages: {
    include: {
      items: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
        },
      },
      serials: { select: { id: true, serialNo: true, pickedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
}

export const PACKING_LIST_INCLUDE = {
  pickingOrder: {
    select: { id: true, pickingNumber: true },
  },
  packages: {
    select: {
      id: true,
      packageNumber: true,
      status: true,
      _count: { select: { items: true } },
    },
  },
}

// ---------- GET PACKING QUEUE ----------
// Returns completed PickingOrders that do NOT yet have a PackingOrder.
export async function getPackingQueue() {
  return prisma.pickingOrder.findMany({
    where: { status: 'COMPLETED' },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
          tasks: {
            include: {
              serials: { select: { id: true, serialNo: true, pickedAt: true } },
            },
          },
        },
      },
    },
    orderBy: { completedAt: 'asc' },
  })
}

// ---------- LIST ----------
export async function listPackingOrders({ status, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status

  return prisma.packingOrder.findMany({
    where,
    include: {
      ...PACKING_LIST_INCLUDE,
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 500),
  })
}

// ---------- GET ----------
export async function getPackingOrder(id) {
  return prisma.packingOrder.findUnique({
    where: { id },
    include: PACKING_INCLUDE,
  })
}

// ---------- GET BY NUMBER ----------
export async function getPackingOrderByNumber(packingNumber) {
  return prisma.packingOrder.findUnique({
    where: { packingNumber },
    include: PACKING_INCLUDE,
  })
}

// ---------- CREATE PACKING ORDER ----------
// Creates a PackingOrder from a completed PickingOrder.
// No PackingOrderLine — Package → PickingOrderLine directly.
// No Stock Ledger, no FIFO touch.
export async function createPackingOrder({ user, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions to create packing orders')

  const { pickingOrderId, warehouseId } = body

  if (!pickingOrderId) throw new Error('pickingOrderId is required')

  // Load the picking order — must be COMPLETED
  const picking = await prisma.pickingOrder.findUnique({
    where: { id: pickingOrderId },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true } },
          tasks: {
            include: {
              serials: { select: { id: true, serialNo: true } },
            },
          },
        },
      },
    },
  })

  if (!picking) throw new Error('Picking order not found')
  if (picking.status !== 'COMPLETED') {
    throw new Error('Picking order must be COMPLETED to create a packing order (current: ' + picking.status + ')')
  }

  // Prevent duplicate packing order for same picking order
  const existing = await prisma.packingOrder.findFirst({
    where: { pickingOrderId },
  })
  if (existing) throw new Error('A packing order already exists for this picking order')

  // Resolve warehouse for doc numbering
  let whCode = 'WH00'
  if (warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } })
    if (!wh) throw new Error('Warehouse not found')
    whCode = wh.code
  } else if (picking.warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: picking.warehouseId } })
    if (wh) whCode = wh.code
  }

  return prisma.$transaction(async (tx) => {
    const packingNumber = await nextPackingNumber(whCode, tx)

    const order = await tx.packingOrder.create({
      data: {
        packingNumber,
        status: 'QUEUE',
        pickingOrderId,
        warehouseId: picking.warehouseId || warehouseId || null,
        createdById: user.id,
      },
      include: PACKING_INCLUDE,
    })

    // Compute summary for audit
    const totalLines = picking.lines.length
    const totalQty = picking.lines.reduce((s, l) => {
      const picked = l.tasks.reduce((ts, t) => ts + Number(t.qtyPicked || 0), 0)
      return s + picked
    }, 0)
    const totalSerials = picking.lines.reduce((s, l) => {
      return s + l.tasks.reduce((ts, t) => ts + t.serials.length, 0)
    }, 0)

    await logAudit({
      user,
      action: 'CREATE',
      module: 'PACKING',
      entityType: 'PackingOrder',
      entityId: order.id,
      description: `Created packing order ${packingNumber} from picking ${picking.pickingNumber} — ${totalLines} line(s), ${totalQty} unit(s), ${totalSerials} serial(s)`,
      after: { packingNumber, pickingNumber: picking.pickingNumber, totalLines, totalQty, totalSerials },
    })

    return order
  })
}

// ---------- ASSIGN PACKER ----------
export async function assignPacker({ user, id, assignedToId }) {
  const order = await prisma.packingOrder.findUnique({ where: { id } })
  if (!order) throw new Error('Packing order not found')
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    throw new Error('Cannot assign packer to a completed or cancelled order (current: ' + order.status + ')')
  }

  const updated = await prisma.packingOrder.update({
    where: { id },
    data: { assignedToId: assignedToId || null },
    include: PACKING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PACKING',
    entityType: 'PackingOrder',
    entityId: id,
    description: `Assigned packer to packing order ${updated.packingNumber}`,
    after: { packingNumber: updated.packingNumber, assignedToId },
  })

  return updated
}

// ---------- START PACKING ----------
export async function startPackingOrder({ user, id }) {
  const order = await prisma.packingOrder.findUnique({ where: { id } })
  if (!order) throw new Error('Packing order not found')
  if (order.status !== 'QUEUE') {
    throw new Error('Only QUEUE orders can be started (current: ' + order.status + ')')
  }

  const updated = await prisma.packingOrder.update({
    where: { id },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
    include: PACKING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PACKING',
    entityType: 'PackingOrder',
    entityId: id,
    description: `Started packing order ${updated.packingNumber} (QUEUE → IN_PROGRESS)`,
    after: { packingNumber: updated.packingNumber },
  })

  return updated
}

// ---------- CREATE PACKAGE ----------
export async function createPackage({ user, id }) {
  const order = await prisma.packingOrder.findUnique({
    where: { id },
    include: PACKING_INCLUDE,
  })
  if (!order) throw new Error('Packing order not found')
  // Re-fetch for fresh status
  const fresh = await prisma.packingOrder.findUnique({ where: { id } })
  if (!fresh) throw new Error('Packing order not found')
  if (fresh.status !== 'IN_PROGRESS') {
    throw new Error('Packing order must be IN_PROGRESS to create packages (current: ' + fresh.status + ')')
  }

  // Resolve warehouse
  let whCode = 'WH00'
  if (order.warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: order.warehouseId } })
    if (wh) whCode = wh.code
  }

  return prisma.$transaction(async (tx) => {
    const packageNumber = await nextPackageNumber(whCode, tx)

    const pkg = await tx.package.create({
      data: {
        packageNumber,
        packingOrderId: id,
        status: 'OPEN',
      },
      include: {
        items: {
          include: {
            item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
          },
        },
        serials: { select: { id: true, serialNo: true, pickedAt: true } },
      },
    })

    await logAudit({
      user,
      action: 'CREATE',
      module: 'PACKING',
      entityType: 'Package',
      entityId: pkg.id,
      description: `Created package ${packageNumber} for packing order ${order.packingNumber}`,
      after: { packageNumber, packingNumber: order.packingNumber },
    })

    return pkg
  })
}

// ---------- GET PACKAGE ----------
export async function getPackage(id) {
  return prisma.package.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
        },
      },
      serials: { select: { id: true, serialNo: true, pickedAt: true } },
      packingOrder: {
        select: {
          id: true,
          packingNumber: true,
          pickingOrder: {
            select: {
              lines: {
                include: {
                  item: { select: { id: true, sku: true, name: true, serialTracked: true } },
                  tasks: {
                    include: {
                      serials: { select: { id: true, serialNo: true, pickedAt: true, packageId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
}

// ---------- GET PACKAGE BY NUMBER ----------
export async function getPackageByNumber(packageNumber) {
  return prisma.package.findUnique({
    where: { packageNumber },
    include: {
      items: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
        },
      },
      serials: { select: { id: true, serialNo: true, pickedAt: true } },
    },
  })
}

// ---------- SCAN ITEM TO PACKAGE ----------
// Barcode flow: Package → Item → Serial → Qty → Confirm
// body: { packageId, scannedItemCode, serials?: [], qty?: number }
export async function scanItemToPackage({ user, id, body }) {
  const { packageId, scannedItemCode, serials = [], qty } = body

  if (!packageId) throw new Error('packageId is required')

  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: { packingOrder: { select: { id: true, status: true, pickingOrderId: true } } },
  })
  if (!pkg) throw new Error('Package not found')
  if (pkg.packingOrderId !== id) throw new Error('Package does not belong to this packing order')
  // Re-fetch to ensure fresh status (covers race between startPackingOrder and this call)
  const freshOrder = await prisma.packingOrder.findUnique({ where: { id } })
  if (!freshOrder) throw new Error('Packing order not found')
  if (freshOrder.status !== 'IN_PROGRESS') {
    throw new Error('Packing order must be IN_PROGRESS to scan items (current: ' + freshOrder.status + ')')
  }
  if (pkg.status === 'CLOSED') throw new Error('Package is CLOSED — reopen it first')

  // Load picking order to get available items and picked serials
  const picking = await prisma.pickingOrder.findUnique({
    where: { id: pkg.packingOrder.pickingOrderId },
    include: {
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true } },
          tasks: {
            include: {
              serials: { select: { id: true, serialNo: true, pickedAt: true, packageId: true } },
            },
          },
        },
      },
    },
  })
  if (!picking) throw new Error('Source picking order not found')

  // --- STEP 1: Validate Item ---
  if (!scannedItemCode) throw new Error('Scanned item code is required')
  const item = await prisma.item.findFirst({
    where: { OR: [{ id: scannedItemCode }, { barcode: scannedItemCode }, { sku: scannedItemCode }] },
  })
  if (!item) throw new Error('Item not found: ' + scannedItemCode)

  // Check item exists in picking order
  const pickingLine = picking.lines.find((l) => l.itemId === item.id)
  if (!pickingLine) throw new Error('Item ' + item.sku + ' is not part of this packing order')

  // --- STEP 2: Compute remaining qty for this item ---
  const serialTracked = !!item.serialTracked

  // Count already-packed qty from existing packages (excluding current package)
  const packedQty = await prisma.packageItem.aggregate({
    where: {
      itemId: item.id,
      package: {
        packingOrderId: id,
        id: { not: packageId },
      },
    },
    _sum: { qty: true },
  })
  const alreadyPacked = packedQty._sum.qty || 0

  // Total picked from tasks
  const totalPicked = pickingLine.tasks.reduce((s, t) => s + Number(t.qtyPicked || 0), 0)
  const remaining = totalPicked - alreadyPacked

  if (remaining <= 0) throw new Error('All units of ' + item.sku + ' are already packed')

  const qtyToPack = qty !== undefined ? Number(qty) : remaining
  if (qtyToPack <= 0) throw new Error('Quantity must be greater than zero')
  if (qtyToPack > remaining) throw new Error('Quantity exceeds remaining (' + remaining + ')')

  // --- STEP 3: Validate Serials (if tracked) ---
  const scannedSerials = Array.isArray(serials)
    ? serials.map((s) => String(s).trim()).filter(Boolean)
    : []

  // All picked serials for this item across tasks
  const allPickedSerials = pickingLine.tasks.flatMap((t) => t.serials)
  const pickedSerialNos = new Set(allPickedSerials.map((s) => s.serialNo))

  // Already packed serials in other packages
  const packedSerials = await prisma.pickingTaskSerial.findMany({
    where: {
      serialNo: { in: Array.from(pickedSerialNos) },
      packageId: { not: null, not: packageId },
    },
    select: { serialNo: true },
  })
  const packedSerialSet = new Set(packedSerials.map((s) => s.serialNo))

  if (serialTracked) {
    if (scannedSerials.length !== qtyToPack) {
      throw new Error(
        'Serial-tracked item requires exactly ' + qtyToPack + ' serial(s) (provided: ' + scannedSerials.length + ')'
      )
    }

    const existingPkgSerials = new Set(
      (await prisma.pickingTaskSerial.findMany({
        where: { packageId },
        select: { serialNo: true },
      })).map((s) => s.serialNo)
    )

    const seenInRequest = new Set()
    for (const sn of scannedSerials) {
      if (seenInRequest.has(sn)) throw new Error('Duplicate serial in request: ' + sn)
      seenInRequest.add(sn)

      if (existingPkgSerials.has(sn)) throw new Error('Serial "' + sn + '" is already in this package')
      if (packedSerialSet.has(sn)) throw new Error('Serial "' + sn + '" is already in another package')
      if (!pickedSerialNos.has(sn)) throw new Error('Serial "' + sn + '" was not picked for this order')
    }
  } else if (scannedSerials.length > 0) {
    throw new Error('This item is not serial-tracked — serials should not be provided')
  }

  // --- STEP 4: Upsert PackageItem + assign serials ---
  return prisma.$transaction(async (tx) => {
    // Upsert PackageItem
    const pkgItem = await tx.packageItem.upsert({
      where: { packageId_itemId: { packageId, itemId: item.id } },
      create: { packageId, itemId: item.id, qty: qtyToPack },
      update: { qty: { increment: qtyToPack } },
      include: {
        item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
      },
    })

    // Assign serials: update PickingTaskSerial.packageId
    // Persist Picking execution — never recalculate allocation.
    const taskQtyMap = {}
    for (const sn of scannedSerials) {
      const pts = await tx.pickingTaskSerial.findFirst({
        where: { serialNo: sn, pickingTask: { pickingLine: { itemId: item.id } } },
        include: { pickingTask: { include: { pickingLine: { include: { item: true } } } } },
      })
      if (pts) {
        await tx.pickingTaskSerial.update({
          where: { id: pts.id },
          data: { packageId },
        })
        // Persist Picking execution
        taskQtyMap[pts.pickingTaskId] = (taskQtyMap[pts.pickingTaskId] || 0) + 1
      }
    }

    // Persist Picking execution for non-serial items:
    // Each item has one PickingTask, so use it directly.
    if (!serialTracked && qtyToPack > 0) {
      const task = pickingLine.tasks.find((t) => Number(t.qtyPicked) > 0)
      if (task) {
        taskQtyMap[task.id] = qtyToPack
      }
    }

    // Create PackageAllocation rows: one row per pickingTask
    for (const [pickingTaskId, qtyPacked] of Object.entries(taskQtyMap)) {
      await tx.packageAllocation.upsert({
        where: { packageItemId_pickingTaskId: { packageItemId: pkgItem.id, pickingTaskId } },
        create: { packageItemId: pkgItem.id, pickingTaskId, qtyPacked },
        update: { qtyPacked }, // serial counts are exact — no increment
      })
    }

    const finalPkg = await tx.package.findUnique({
      where: { id: packageId },
      include: {
        items: {
          include: {
            item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
          },
        },
        serials: { select: { id: true, serialNo: true, pickedAt: true } },
      },
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'PACKING',
      entityType: 'Package',
      entityId: packageId,
      description:
        'Scanned ' +
        qtyToPack +
        ' × ' +
        item.sku +
        ' into package ' +
        pkg.packageNumber +
        (scannedSerials.length ? ' (serials: ' + scannedSerials.join(', ') + ')' : ''),
      after: {
        packageId,
        packageNumber: pkg.packageNumber,
        itemSku: item.sku,
        qty: qtyToPack,
        serials: scannedSerials,
      },
    })

    return finalPkg
  })
}

// ---------- UPDATE PACKAGE (weight/dimensions) ----------
export async function updatePackage({ user, id, body }) {
  const pkg = await prisma.package.findUnique({ where: { id } })
  if (!pkg) throw new Error('Package not found')
  if (pkg.status === 'CLOSED') throw new Error('Package is CLOSED — reopen it first')

  const { weight, length, width, height } = body

  const updateData = {}
  if (weight !== undefined) updateData.weight = Number(weight)
  if (length !== undefined) updateData.length = Number(length)
  if (width !== undefined) updateData.width = Number(width)
  if (height !== undefined) updateData.height = Number(height)

  // Calculate volume: L × W × H (backend only)
  if (length !== undefined && width !== undefined && height !== undefined) {
    updateData.volume = Number(length) * Number(width) * Number(height)
  }

  const updated = await prisma.package.update({
    where: { id },
    data: updateData,
    include: {
      items: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
        },
      },
      serials: { select: { id: true, serialNo: true, pickedAt: true } },
    },
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PACKING',
    entityType: 'Package',
    entityId: id,
    description: `Updated package ${pkg.packageNumber}`,
    after: { packageNumber: pkg.packageNumber, ...updateData },
  })

  return updated
}

// ---------- CLOSE PACKAGE ----------
export async function closePackage({ user, id }) {
  const pkg = await prisma.package.findUnique({
    where: { id },
    include: { packingOrder: { select: { id: true, packingNumber: true } } },
  })
  if (!pkg) throw new Error('Package not found')
  if (pkg.status === 'CLOSED') throw new Error('Package is already CLOSED')
  // Re-fetch order for fresh status
  const freshOrder = await prisma.packingOrder.findUnique({ where: { id: pkg.packingOrderId } })
  if (!freshOrder) throw new Error('Packing order not found')
  if (freshOrder.status !== 'IN_PROGRESS') {
    throw new Error('Packing order must be IN_PROGRESS to close packages (current: ' + freshOrder.status + ')')
  }

  // Must have at least 1 item
  const itemCount = await prisma.packageItem.count({ where: { packageId: id } })
  if (itemCount === 0) throw new Error('Package must contain at least 1 item before closing')

  const updated = await prisma.package.update({
    where: { id },
    data: { status: 'CLOSED', closedAt: new Date() },
    include: {
      items: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
        },
      },
      serials: { select: { id: true, serialNo: true, pickedAt: true } },
    },
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'PACKING',
    entityType: 'Package',
    entityId: id,
    description: `Closed package ${pkg.packageNumber}`,
    after: { packageNumber: pkg.packageNumber, packingNumber: pkg.packingOrder.packingNumber },
  })

  return updated
}

// ---------- REOPEN PACKAGE ----------
export async function reopenPackage({ user, id }) {
  const pkg = await prisma.package.findUnique({
    where: { id },
    include: { packingOrder: { select: { id: true, packingNumber: true, status: true } } },
  })
  if (!pkg) throw new Error('Package not found')
  if (pkg.status !== 'CLOSED') throw new Error('Only CLOSED packages can be reopened')
  // Re-fetch order for fresh status
  const freshOrder = await prisma.packingOrder.findUnique({ where: { id: pkg.packingOrderId } })
  if (!freshOrder) throw new Error('Packing order not found')
  if (freshOrder.status !== 'IN_PROGRESS') {
    throw new Error('Packing order must be IN_PROGRESS to reopen packages (current: ' + freshOrder.status + ')')
  }

  return prisma.$transaction(async (tx) => {
    // Delete Picking execution records — they will be recreated on re-scan
    await tx.packageAllocation.deleteMany({
      where: { packageItem: { packageId: id } },
    })

    // Unassign serials from this package
    await tx.pickingTaskSerial.updateMany({
      where: { packageId: id },
      data: { packageId: null },
    })

    const updated = await tx.package.update({
      where: { id },
      data: { status: 'OPEN', closedAt: null },
      include: {
        items: {
          include: {
            item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
          },
        },
        serials: { select: { id: true, serialNo: true, pickedAt: true } },
      },
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'PACKING',
      entityType: 'Package',
      entityId: id,
      description: `Reopened package ${pkg.packageNumber}`,
      after: { packageNumber: pkg.packageNumber, packingNumber: pkg.packingOrder.packingNumber },
    })

    return updated
  })
}

// ---------- COMPLETE PACKING ORDER ----------
export async function completePackingOrder({ user, id }) {
  const order = await prisma.packingOrder.findUnique({
    where: { id },
    include: {
      pickingOrder: {
        include: {
          lines: {
            include: {
              item: { select: { id: true, sku: true } },
              tasks: { include: { serials: { select: { id: true } } } },
            },
          },
        },
      },
      packages: {
        include: {
          items: { include: { item: { select: { id: true } } } },
        },
      },
    },
  })

  if (!order) throw new Error('Packing order not found')
  if (order.status === 'COMPLETED') throw new Error('Packing order is already COMPLETED')
  if (order.status !== 'IN_PROGRESS') {
    throw new Error('Only IN_PROGRESS orders can be completed (current: ' + order.status + ')')
  }

  // Verify every line is fully packed
  const picking = order.pickingOrder
  for (const line of picking.lines) {
    const totalPicked = line.tasks.reduce((s, t) => s + Number(t.qtyPicked || 0), 0)
    const totalPacked = order.packages.reduce((s, pkg) => {
      return s + pkg.items
        .filter((i) => i.item.id === line.itemId)
        .reduce((is, i) => is + Number(i.qty), 0)
    }, 0)

    if (totalPacked < totalPicked) {
      throw new Error(
        'Item ' + line.item.sku + ' — packed ' + totalPacked + ' of ' + totalPicked + ' picked. All items must be packed before completing.'
      )
    }
  }

  const updated = await prisma.packingOrder.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: PACKING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'POST',
    module: 'PACKING',
    entityType: 'PackingOrder',
    entityId: id,
    description: `Completed packing order ${updated.packingNumber}`,
    after: {
      packingNumber: updated.packingNumber,
      pickingNumber: picking.pickingNumber,
      packageCount: order.packages.length,
    },
  })

  return updated
}

// ---------- CANCEL ----------
export async function cancelPackingOrder({ user, id, reason }) {
  const order = await prisma.packingOrder.findUnique({ where: { id } })
  if (!order) throw new Error('Packing order not found')
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    throw new Error('Cannot cancel order with status: ' + order.status)
  }

  return prisma.$transaction(async (tx) => {
    // Unassign all serials from packages
    await tx.pickingTaskSerial.updateMany({
      where: {
        package: { packingOrderId: id },
      },
      data: { packageId: null },
    })

    const updated = await tx.packingOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: PACKING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'PACKING',
      entityType: 'PackingOrder',
      entityId: id,
      description:
        'Cancelled packing order ' + updated.packingNumber + (reason ? ': ' + reason : ''),
      before: { status: order.status },
      after: { status: 'CANCELLED' },
    })

    return updated
  })
}

// ---------- GET PACKING KPIs (for dashboard) ----------
export async function getPackingKPIs() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const [
    queueCount,
    openPkgCount,
    closedTodayCount,
    completedOrders,
    allPackages,
  ] = await Promise.all([
    // Queue: COMPLETED picking orders without packing orders
    prisma.pickingOrder.count({
      where: { status: 'COMPLETED', packingOrder: null },
    }),
    // Open packages across IN_PROGRESS orders
    prisma.package.count({
      where: {
        status: 'OPEN',
        packingOrder: { status: 'IN_PROGRESS' },
      },
    }),
    // Packages closed today
    prisma.package.count({
      where: {
        status: 'CLOSED',
        closedAt: { gte: startOfDay },
      },
    }),
    // Completed orders in last 30 days for avg time
    prisma.packingOrder.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: thirtyDaysAgo },
        startedAt: { not: null },
      },
      select: { startedAt: true, completedAt: true },
    }),
    // All packages in last 30 days for accuracy
    prisma.package.findMany({
      where: {
        closedAt: { gte: thirtyDaysAgo },
        packingOrder: { status: 'COMPLETED' },
      },
      select: {
        id: true,
        items: { select: { id: true } },
        serials: { select: { id: true } },
      },
    }),
  ])

  const totalOrders = completedOrders.length
  const avgPackingTimeMinutes =
    totalOrders > 0
      ? Math.round(
          completedOrders.reduce((s, o) => {
            if (!o.startedAt || !o.completedAt) return s
            return s + (new Date(o.completedAt) - new Date(o.startedAt)) / 60000
          }, 0) / totalOrders
        )
      : 0

  // Accuracy: packages with items / total closed packages
  const totalClosed = allPackages.length
  const packagesWithItems = allPackages.filter((p) => p.items.length > 0).length
  const packingAccuracy = totalClosed > 0 ? Math.round((packagesWithItems / totalClosed) * 100) : 100

  return {
    packingQueue: queueCount,
    openPackages: openPkgCount,
    packagesClosedToday: closedTodayCount,
    avgPackingTimeMinutes,
    packingAccuracy,
  }
}
