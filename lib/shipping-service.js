import prisma from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextShipmentNumber } from '@/lib/doc-numbering'
import { consumeFifoLayers } from '@/lib/fifo-service'

// ============================================================
// Shipping Service
// ------------------------------------------------------------
// Shipping finalizes outbound warehouse operations:
// - Consumes FIFO layers (the ONLY module that reduces inventory)
// - Creates SHIP_OUT Stock Ledger entries
// - Locks packages permanently after completion
// - Handles package verification and serial validation
// ============================================================

// ---------- RBAC ----------
const canCreate = (role) => ['STOCK_CONTROL', 'SUPERVISOR', 'ADMINISTRATOR'].includes(role)

// ---------- INCLUDE shapes ----------
export const SHIPPING_INCLUDE = {
  packingOrder: {
    select: {
      id: true,
      packingNumber: true,
      status: true,
      pickingOrder: {
        select: {
          id: true,
          pickingNumber: true,
        },
      },
    },
  },
  packages: {
    include: {
      verifiedBy: { select: { id: true, name: true } },
    },
    orderBy: { scannedAt: 'asc' },
  },
}

export const SHIPPING_LIST_INCLUDE = {
  packingOrder: {
    select: { id: true, packingNumber: true },
  },
  packages: {
    select: {
      id: true,
      status: true,
      scannedAt: true,
    },
  },
}

// ---------- GET SHIPPING QUEUE ----------
// Returns COMPLETED packing orders that do NOT yet have a Shipment.
export async function getShippingQueue() {
  return prisma.packingOrder.findMany({
    where: {
      status: 'COMPLETED',
      shipments: { none: {} },
    },
    include: {
      packages: {
        include: {
          items: {
            include: {
              item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
            },
          },
          serials: { select: { id: true, serialNo: true, pickedAt: true } },
        },
      },
    },
    orderBy: { completedAt: 'asc' },
  })
}

// ---------- LIST ----------
export async function listShipments({ status, take = 100 } = {}) {
  const where = {}
  if (status) where.status = status

  const [data, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        ...SHIPPING_LIST_INCLUDE,
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 500),
    }),
    prisma.shipment.count({ where }),
  ])

  return { data, total }
}

// ---------- GET ----------
export async function getShipment(id) {
  return prisma.shipment.findUnique({
    where: { id },
    include: {
      ...SHIPPING_INCLUDE,
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

// ---------- GET BY NUMBER ----------
export async function getShipmentByNumber(shipmentNumber) {
  return prisma.shipment.findUnique({
    where: { shipmentNumber },
    include: {
      ...SHIPPING_INCLUDE,
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

// ---------- CREATE SHIPMENT ----------
// Creates a Shipment from a COMPLETED PackingOrder.
// One shipment per packing order (enforced by unique constraint).
export async function createShipment({ user, body }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions to create shipments')

  const { packingOrderId, warehouseId } = body

  if (!packingOrderId) throw new Error('packingOrderId is required')

  // Load the packing order — must be COMPLETED
  const packing = await prisma.packingOrder.findUnique({
    where: { id: packingOrderId },
    include: {
      packages: {
        include: {
          items: {
            include: {
              item: { select: { id: true, sku: true, name: true, serialTracked: true } },
            },
          },
          serials: { select: { id: true, serialNo: true } },
        },
      },
    },
  })

  if (!packing) throw new Error('Packing order not found')
  if (packing.status !== 'COMPLETED') {
    throw new Error('Packing order must be COMPLETED to create a shipment (current: ' + packing.status + ')')
  }

  // Prevent duplicate shipment for same packing order
  const existing = await prisma.shipment.findFirst({ where: { packingOrderId } })
  if (existing) throw new Error('A shipment already exists for this packing order')

  // Resolve warehouse for doc numbering
  let whCode = 'WH00'
  if (warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } })
    if (wh) whCode = wh.code
  } else if (packing.warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: packing.warehouseId } })
    if (wh) whCode = wh.code
  }

  return prisma.$transaction(async (tx) => {
    const shipmentNumber = await nextShipmentNumber(whCode, tx)

    const shipment = await tx.shipment.create({
      data: {
        shipmentNumber,
        status: 'QUEUE',
        packingOrderId,
        warehouseId: packing.warehouseId || warehouseId || null,
        createdById: user.id,
      },
      include: SHIPPING_INCLUDE,
    })

    const totalPackages = packing.packages.length
    const totalItems = packing.packages.reduce((s, p) => s + p.items.length, 0)
    const totalSerials = packing.packages.reduce((s, p) => s + p.serials.length, 0)

    await logAudit({
      user,
      action: 'CREATE',
      module: 'SHIPPING',
      entityType: 'Shipment',
      entityId: shipment.id,
      description:
        `Created shipment ${shipmentNumber} from packing ${packing.packingNumber}` +
        ` — ${totalPackages} package(s), ${totalItems} item(s), ${totalSerials} serial(s)`,
      after: { shipmentNumber, packingNumber: packing.packingNumber, totalPackages, totalItems, totalSerials },
    })

    return shipment
  })
}

// ---------- ASSIGN SHIPPER ----------
export async function assignShipper({ user, id, assignedToId }) {
  const shipment = await prisma.shipment.findUnique({ where: { id } })
  if (!shipment) throw new Error('Shipment not found')
  if (shipment.status === 'COMPLETED' || shipment.status === 'CANCELLED' || shipment.status === 'FAILED') {
    throw new Error('Cannot assign shipper to a ' + shipment.status.toLowerCase() + ' shipment')
  }

  const updated = await prisma.shipment.update({
    where: { id },
    data: { assignedToId: assignedToId || null },
    include: SHIPPING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'SHIPPING',
    entityType: 'Shipment',
    entityId: id,
    description: `Assigned shipper to shipment ${updated.shipmentNumber}`,
    after: { shipmentNumber: updated.shipmentNumber, assignedToId },
  })

  return updated
}

// ---------- START SHIPMENT ----------
export async function startShipment({ user, id }) {
  const shipment = await prisma.shipment.findUnique({ where: { id } })
  if (!shipment) throw new Error('Shipment not found')
  if (shipment.status !== 'QUEUE') {
    throw new Error('Only QUEUE shipments can be started (current: ' + shipment.status + ')')
  }

  const updated = await prisma.shipment.update({
    where: { id },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
    include: SHIPPING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'SHIPPING',
    entityType: 'Shipment',
    entityId: id,
    description: `Started shipment ${updated.shipmentNumber} (QUEUE → IN_PROGRESS)`,
    after: { shipmentNumber: updated.shipmentNumber },
  })

  return updated
}

// ---------- INTERNAL: Check if a package has already been shipped ----------
// Checks the @@unique([packageId]) constraint by querying completed shipments.
async function isPackageAlreadyShipped(packageId, excludeShipmentId = null) {
  const existing = await prisma.shipmentPackage.findFirst({
    where: {
      packageId,
      shipment: {
        status: { in: ['COMPLETED', 'READY', 'IN_PROGRESS'] },
        ...(excludeShipmentId ? { id: { not: excludeShipmentId } } : {}),
      },
    },
  })
  return !!existing
}

// ---------- SCAN PACKAGE INTO SHIPMENT ----------
// Validates package through the 6-step validation flow, then adds it as PENDING.
export async function scanPackage({ user, id, body }) {
  const { packageNumber } = body

  if (!packageNumber) throw new Error('packageNumber is required')

  // Load shipment
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      packingOrder: {
        include: {
          packages: { select: { id: true } },
        },
      },
    },
  })
  if (!shipment) throw new Error('Shipment not found')
  if (shipment.status !== 'IN_PROGRESS') {
    throw new Error('Shipment must be IN_PROGRESS to scan packages (current: ' + shipment.status + ')')
  }

  // Step 1: Package Exists
  const pkg = await prisma.package.findUnique({
    where: { packageNumber: String(packageNumber).trim() },
    include: {
      packingOrder: {
        include: {
          pickingOrder: { select: { id: true, pickingNumber: true } },
        },
      },
      items: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
        },
      },
      serials: { select: { id: true, serialNo: true, pickedAt: true } },
    },
  })
  if (!pkg) throw new Error('Package not found: ' + packageNumber)

  // Step 2: Package CLOSED
  if (pkg.status !== 'CLOSED') {
    throw new Error('Package must be CLOSED before shipping (current: ' + pkg.status + ')')
  }

  // Step 3: Warehouse Match
  if (shipment.warehouseId && pkg.packingOrder?.warehouseId &&
      shipment.warehouseId !== pkg.packingOrder.warehouseId) {
    throw new Error('Package belongs to a different warehouse')
  }

  // Step 4: Not Already Shipped
  const alreadyShipped = await isPackageAlreadyShipped(pkg.id, id)
  if (alreadyShipped) throw new Error('Package has already been shipped')

  // Step 5: Belongs to Source Packing Order
  if (shipment.packingOrderId && pkg.packingOrderId !== shipment.packingOrderId) {
    throw new Error('Package does not belong to this shipment\'s source packing order')
  }

  // Step 6: Add to shipment as PENDING
  // Check for duplicate scan within this shipment
  const existingSp = await prisma.shipmentPackage.findFirst({
    where: { shipmentId: id, packageId: pkg.id },
  })
  if (existingSp) throw new Error('Package ' + packageNumber + ' has already been scanned into this shipment')

  return prisma.$transaction(async (tx) => {
    const sp = await tx.shipmentPackage.create({
      data: {
        shipmentId: id,
        packageId: pkg.id,
        status: 'PENDING',
      },
      include: {
        shipment: { select: { id: true, shipmentNumber: true } },
      },
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'SHIPPING',
      entityType: 'ShipmentPackage',
      entityId: sp.id,
      description: 'Scanned package ' + pkg.packageNumber + ' into shipment ' + shipment.shipmentNumber,
      after: { shipmentNumber: shipment.shipmentNumber, packageNumber: pkg.packageNumber },
    })

    // Refresh and return full shipment
    return tx.shipment.findUnique({
      where: { id },
      include: SHIPPING_INCLUDE,
    })
  })
}

// ---------- VERIFY PACKAGE ----------
// Marks a scanned package as VERIFIED (after serial confirmation).
export async function verifyPackage({ user, id, body }) {
  const { packageId } = body

  if (!packageId) throw new Error('packageId is required')

  const shipment = await prisma.shipment.findUnique({ where: { id } })
  if (!shipment) throw new Error('Shipment not found')

  const sp = await prisma.shipmentPackage.findFirst({
    where: { shipmentId: id, packageId },
  })
  if (!sp) throw new Error('Package is not part of this shipment')
  if (sp.status !== 'PENDING') {
    throw new Error('Package is already VERIFIED or CONFIRMED (current: ' + sp.status + ')')
  }
  if (shipment.status !== 'IN_PROGRESS') {
    throw new Error('Shipment must be IN_PROGRESS to verify packages (current: ' + shipment.status + ')')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.shipmentPackage.update({
      where: { id: sp.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedById: user.id,
      },
    })

    // Log serial verification
    await logAudit({
      user,
      action: 'UPDATE',
      module: 'SHIPPING',
      entityType: 'ShipmentPackage',
      entityId: sp.id,
      description: 'Verified package ' + sp.packageId + ' in shipment ' + shipment.shipmentNumber,
      after: { packageId, shipmentNumber: shipment.shipmentNumber },
    })

    return u
  })

  // After verifying, check if ALL packages are VERIFIED → transition to READY
  const shipmentUpdated = await prisma.shipment.findUnique({
    where: { id },
    include: { packages: true },
  })

  const allVerified = shipmentUpdated.packages.length > 0 &&
    shipmentUpdated.packages.every((p) => p.status === 'VERIFIED' || p.status === 'CONFIRMED')

  if (allVerified && shipmentUpdated.status !== 'READY') {
    const readyShipment = await prisma.shipment.update({
      where: { id },
      data: { status: 'READY' },
      include: SHIPPING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'SHIPPING',
      entityType: 'Shipment',
      entityId: id,
      description: `Shipment ${shipment.shipmentNumber} is READY — all packages verified`,
      after: { shipmentNumber: shipment.shipmentNumber, status: 'READY' },
    })

    return readyShipment
  }

  return prisma.shipment.findUnique({
    where: { id },
    include: SHIPPING_INCLUDE,
  })
}

// ---------- VERIFY SERIALS IN PACKAGE ----------
// Validates serials for a specific item within a package, then calls verifyPackage.
export async function verifySerials({ user, id, body }) {
  const { packageId, itemId, serials = [] } = body

  if (!packageId) throw new Error('packageId is required')
  if (!itemId) throw new Error('itemId is required')

  const shipment = await prisma.shipment.findUnique({ where: { id } })
  if (!shipment) throw new Error('Shipment not found')
  if (shipment.status !== 'IN_PROGRESS') {
    throw new Error('Shipment must be IN_PROGRESS to verify serials (current: ' + shipment.status + ')')
  }

  const sp = await prisma.shipmentPackage.findFirst({
    where: { shipmentId: id, packageId },
    include: {
      shipment: true,
      verifiedBy: true,
    },
  })
  if (!sp) throw new Error('Package is not part of this shipment')

  // Load package items and serials
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: {
      items: {
        include: {
          item: { select: { id: true, sku: true, name: true, serialTracked: true } },
        },
      },
      serials: { select: { id: true, serialNo: true } },
    },
  })
  if (!pkg) throw new Error('Package not found')

  // Validate item
  const pkgItem = pkg.items.find((i) => i.itemId === itemId)
  if (!pkgItem) throw new Error('Item is not in this package')

  const item = pkgItem.item
  const serialTracked = !!item.serialTracked

  // Parse and validate serials
  const scannedSerials = Array.isArray(serials)
    ? serials.map((s) => String(s).trim()).filter(Boolean)
    : []

  const pkgSerialNos = new Set(pkg.serials.map((s) => s.serialNo))

  if (serialTracked) {
    if (scannedSerials.length === 0) throw new Error('Serial numbers are required for item ' + item.sku)

    const seenInRequest = new Set()
    for (const sn of scannedSerials) {
      if (seenInRequest.has(sn)) throw new Error('Duplicate serial in request: ' + sn)
      seenInRequest.add(sn)

      if (!pkgSerialNos.has(sn)) throw new Error('Serial "' + sn + '" is not in this package')
    }
  }

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'SHIPPING',
    entityType: 'ShipmentPackage',
    entityId: sp.id,
    description: 'Verified serials for item ' + item.sku + ' in package ' + pkg.packageNumber +
      (serialTracked ? ' (serials: ' + scannedSerials.join(', ') + ')' : ''),
    after: {
      packageId,
      itemId,
      itemSku: item.sku,
      serialTracked,
      serials: serialTracked ? scannedSerials : [],
    },
  })

  // Mark package as VERIFIED
  return verifyPackage({ user, id, body: { packageId } })
}

// ---------- PREVIEW SHIPMENT ----------
// Shows all packages, items, FIFO allocation impact, and Stock Ledger preview.
// Does NOT write to the database.
export async function previewShipment({ id }) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      ...SHIPPING_INCLUDE,
    },
  })
  if (!shipment) throw new Error('Shipment not found')

  const wh = shipment.warehouseId
    ? await prisma.warehouse.findUnique({ where: { id: shipment.warehouseId }, select: { id: true, code: true, name: true } })
    : null

  const fifoAllocations = []
  const ledgerPreview = []
  const packageSummaries = []

  for (const sp of shipment.packages) {
    const pkg = await prisma.package.findUnique({
      where: { id: sp.packageId },
      include: {
        items: {
          include: {
            item: { select: { id: true, sku: true, name: true, serialTracked: true, uom: { select: { code: true } } } },
          },
        },
        serials: { select: { id: true, serialNo: true } },
      },
    })
    if (!pkg) continue

    const items = []
    for (const pi of pkg.items) {
      const item = pi.item
      const qty = Number(pi.qty)

      const allocations = await prisma.packageAllocation.findMany({
        where: { packageItemId: pi.id },
        include: { pickingTask: { select: { fifoLayerId: true } } },
      })

      const fifoLayerIds = allocations.map((a) => a.pickingTask.fifoLayerId).filter(Boolean)
      const fifoLayersRaw = fifoLayerIds.length > 0
        ? await prisma.fifoLayer.findMany({
            where: { id: { in: fifoLayerIds } },
            include: { location: { select: { code: true } } },
          })
        : []

      const fifoLayers = allocations.map((a) => {
        const layer = fifoLayersRaw.find((l) => l.id === a.pickingTask.fifoLayerId)
        return layer
          ? {
              layerId: layer.id,
              locationId: layer.locationId,
              locationCode: layer.location?.code,
              refNumber: layer.refNumber,
              receivedAt: layer.receivedAt,
              available: Number(layer.qtyRemaining),
              qtyToConsume: Number(a.qtyPacked),
              unitCost: layer.unitCost,
            }
          : null
      }).filter(Boolean)

      const avgUnitCost = fifoLayers.length > 0
        ? fifoLayers.reduce((s, l) => s + Number(l.unitCost || 0), 0) / fifoLayers.length
        : 0

      items.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        serialTracked: item.serialTracked,
        qty,
        fifoLayers,
        avgUnitCost,
      })

      // Ledger preview
      ledgerPreview.push({
        itemId: item.id,
        sku: item.sku,
        qty: -qty,
        unitCost: avgUnitCost,
        txnType: 'SHIP_OUT',
      })
    }

    packageSummaries.push({
      shipmentPackageId: sp.id,
      packageId: pkg.id,
      packageNumber: pkg.packageNumber,
      status: sp.status,
      items,
    })
  }

  await logAudit({
    user: { id: 'system', name: 'System' },
    action: 'UPDATE',
    module: 'SHIPPING',
    entityType: 'Shipment',
    entityId: id,
    description: 'Previewed shipment ' + shipment.shipmentNumber,
    after: { shipmentNumber: shipment.shipmentNumber, packageCount: packageSummaries.length },
  })

  return {
    shipment: {
      id: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      status: shipment.status,
      warehouse: wh,
    },
    packages: packageSummaries,
    ledgerPreview,
  }
}

// ---------- CONFIRM SHIPMENT ----------
// Executes the full shipping transaction:
// 1. Validate READY status
// 2. Validate all packages VERIFIED
// 3. Validate FIFO allocation == package qty
// 4. Consume ALL FIFO layers
// 5. Create ALL SHIP_OUT Stock Ledger entries
// 6. Update SerialNumber status → ISSUED
// 7. Lock packages (CONFIRMED)
// 8. Complete shipment
// 9. Audit trail
export async function confirmShipment({ user, id }) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      packages: {
        include: {
          shipment: { select: { id: true, shipmentNumber: true } },
        },
      },
    },
  })
  if (!shipment) throw new Error('Shipment not found')

  // Duplicate submit protection
  if (shipment.status === 'COMPLETED') throw new Error('Shipment is already COMPLETED')
  if (shipment.status === 'FAILED') throw new Error('Shipment is FAILED — use retry first')

  // Validate READY status
  if (shipment.status !== 'READY') {
    throw new Error('Shipment must be READY to confirm (current: ' + shipment.status + ')')
  }

  // Validate all packages VERIFIED
  const notVerified = shipment.packages.filter((p) => p.status !== 'VERIFIED')
  if (notVerified.length > 0) {
    throw new Error(
      notVerified.length + ' package(s) are not VERIFIED. All packages must be verified before confirming.'
    )
  }

  // Build package detail map for FIFO allocation
  const pkgDetails = {}
  for (const sp of shipment.packages) {
    const pkg = await prisma.package.findUnique({
      where: { id: sp.packageId },
      include: {
        items: {
          include: {
            item: { select: { id: true, sku: true, name: true, serialTracked: true } },
          },
        },
        serials: { select: { id: true, serialNo: true } },
      },
    })
    if (pkg) {
      const serialNos = pkg.serials.map((s) => s.serialNo)
      const serialMap = serialNos.length > 0
        ? await prisma.serialNumber.findMany({
            where: { serialNo: { in: serialNos } },
            select: { serialNo: true, itemId: true },
          })
        : []
      pkg._serialMap = Object.fromEntries(serialMap.map((s) => [s.serialNo, s.itemId]))
      pkgDetails[sp.id] = pkg
    }
  }

  return prisma.$transaction(async (tx) => {
    const ledgerEntries = []
    const serialUpdates = []
    const fifoOps = []

    // Pre-flight: resolve committed FIFO layers through PackageAllocation chain.
    // No allocateFifo call — Packaging recorded Picking execution; Shipping consumes it.
    for (const sp of shipment.packages) {
      const pkg = pkgDetails[sp.id]
      if (!pkg) throw new Error('Package detail not found for ' + sp.packageId)

      for (const pi of pkg.items) {
        const itemId = pi.itemId
        const qtyNeeded = Number(pi.qty)

        const allocations = await tx.packageAllocation.findMany({
          where: { packageItemId: pi.id },
          include: { pickingTask: { select: { fifoLayerId: true } } },
        })

        const fifoLayerIds = allocations.map((a) => a.pickingTask.fifoLayerId).filter(Boolean)
        const fifoLayers = fifoLayerIds.length > 0
          ? await tx.fifoLayer.findMany({ where: { id: { in: fifoLayerIds } } })
          : []

        const totalAvailable = allocations.reduce((s, a) => {
          const layer = fifoLayers.find((l) => l.id === a.pickingTask.fifoLayerId)
          return s + Number(layer?.qtyRemaining || 0)
        }, 0)
        if (totalAvailable < qtyNeeded) {
          throw new Error(
            'FIFO allocation mismatch for ' + pi.item.sku +
            '. Available: ' + totalAvailable + ', Required: ' + qtyNeeded +
            '. Transaction rolled back.'
          )
        }

        fifoOps.push({
          itemId,
          itemSku: pi.item.sku,
          allocations: allocations.map((a) => {
            const layer = fifoLayers.find((l) => l.id === a.pickingTask.fifoLayerId)
            return layer ? { fifoLayer: layer, qtyToConsume: Number(a.qtyPacked) } : null
          }).filter(Boolean),
          qtyNeeded,
        })

        // Collect serials for this item
        if (pi.item.serialTracked) {
          const itemSerials = pkg.serials
            .filter((s) => pkg._serialMap[s.serialNo] === itemId)
          serialUpdates.push(...itemSerials.map((s) => s.serialNo))
        }
      }
    }

    // Step 1: Consume ALL FIFO layers
    await logAudit({
      user,
      action: 'POST',
      module: 'SHIPPING',
      entityType: 'Shipment',
      entityId: id,
      description: 'FIFO Consumed for shipment ' + shipment.shipmentNumber,
      after: {
        shipmentNumber: shipment.shipmentNumber,
        packagesConsumed: shipment.packages.length,
      },
    })

    for (const op of fifoOps) {
      await consumeFifoLayers({ allocations: op.allocations, tx })
    }

    // Step 2: Create ALL SHIP_OUT Stock Ledger entries
    for (const op of fifoOps) {
      const avgCost = op.allocations.length > 0
        ? op.allocations.reduce((s, a) => s + Number(a.fifoLayer.unitCost || 0), 0) / op.allocations.length
        : 0

      // Determine location from first FIFO layer
      const firstLayer = op.allocations[0]?.fifoLayer
      const locationId = firstLayer?.locationId || null

      ledgerEntries.push(
        tx.stockLedger.create({
          data: {
            itemId: op.itemId,
            locationId,
            txnType: 'SHIP_OUT',
            qty: -op.qtyNeeded,
            unitCost: avgCost,
            refType: 'SHIPMENT',
            refId: shipment.id,
            refNumber: shipment.shipmentNumber,
            userId: user.id,
          },
        })
      )
    }

    await Promise.all(ledgerEntries)

    await logAudit({
      user,
      action: 'POST',
      module: 'SHIPPING',
      entityType: 'Shipment',
      entityId: id,
      description: 'Ledger Posted for shipment ' + shipment.shipmentNumber,
      after: {
        shipmentNumber: shipment.shipmentNumber,
        ledgerCount: ledgerEntries.length,
      },
    })

    // Step 3: Update SerialNumber status → ISSUED
    if (serialUpdates.length > 0) {
      const uniqueSerials = [...new Set(serialUpdates)]
      await tx.serialNumber.updateMany({
        where: { serialNo: { in: uniqueSerials } },
        data: { status: 'ISSUED' },
      })
    }

    // Step 4: Lock packages — CONFIRMED + audit
    for (const sp of shipment.packages) {
      await tx.shipmentPackage.update({
        where: { id: sp.id },
        data: { status: 'CONFIRMED' },
      })

      await logAudit({
        user,
        action: 'POST',
        module: 'SHIPPING',
        entityType: 'ShipmentPackage',
        entityId: sp.id,
        description: 'Package Locked: ' + sp.packageId + ' in shipment ' + shipment.shipmentNumber,
        after: { shipmentNumber: shipment.shipmentNumber, packageId: sp.packageId, status: 'CONFIRMED' },
      })
    }

    // Step 5: Complete shipment
    const updated = await tx.shipment.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        shippedAt: new Date(),
      },
      include: SHIPPING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'POST',
      module: 'SHIPPING',
      entityType: 'Shipment',
      entityId: id,
      description: 'Shipment Confirmed: ' + updated.shipmentNumber +
        ' — ' + updated.packages.length + ' package(s), ' + ledgerEntries.length + ' ledger entry(ies)',
      after: {
        shipmentNumber: updated.shipmentNumber,
        status: 'COMPLETED',
        packagesConfirmed: updated.packages.length,
        ledgerEntries: ledgerEntries.length,
      },
    })

    return updated
  })
}

// ---------- RETRY FAILED SHIPMENT ----------
// Resets a FAILED shipment back to READY so confirm can be retried.
export async function retryShipment({ user, id }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions to retry shipments')

  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: { packages: true },
  })
  if (!shipment) throw new Error('Shipment not found')
  if (shipment.status !== 'FAILED') {
    throw new Error('Only FAILED shipments can be retried (current: ' + shipment.status + ')')
  }

  return prisma.$transaction(async (tx) => {
    // Reset package statuses back to VERIFIED
    await tx.shipmentPackage.updateMany({
      where: { shipmentId: id, status: { in: ['FAILED', 'CONFIRMED'] } },
      data: { status: 'VERIFIED' },
    })

    const updated = await tx.shipment.update({
      where: { id },
      data: { status: 'READY' },
      include: SHIPPING_INCLUDE,
    })

    await logAudit({
      user,
      action: 'UPDATE',
      module: 'SHIPPING',
      entityType: 'Shipment',
      entityId: id,
      description: 'Retried FAILED shipment ' + updated.shipmentNumber + ' — reset to READY',
      after: { shipmentNumber: updated.shipmentNumber, status: 'READY' },
    })

    return updated
  })
}

// ---------- CANCEL SHIPMENT ----------
export async function cancelShipment({ user, id, reason }) {
  if (!canCreate(user.role)) throw new Error('Insufficient permissions to cancel shipments')

  const shipment = await prisma.shipment.findUnique({ where: { id } })
  if (!shipment) throw new Error('Shipment not found')
  if (shipment.status === 'COMPLETED') throw new Error('Completed shipments cannot be cancelled')

  const updated = await prisma.shipment.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: SHIPPING_INCLUDE,
  })

  await logAudit({
    user,
    action: 'UPDATE',
    module: 'SHIPPING',
    entityType: 'Shipment',
    entityId: id,
    description: 'Cancelled shipment ' + updated.shipmentNumber + (reason ? ': ' + reason : ''),
    before: { status: shipment.status },
    after: { status: 'CANCELLED' },
  })

  return updated
}

// ---------- GET SHIPPING KPIs (for dashboard) ----------
export async function getShippingKPIs() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const [
    pendingCount,
    inProgressCount,
    completedTodayCount,
    completedInPeriod,
    cancelledInPeriod,
    allCompletedPackages,
    allCompletedShipments,
  ] = await Promise.all([
    // Pending: QUEUE status
    prisma.shipment.count({ where: { status: 'QUEUE' } }),
    // In Progress: IN_PROGRESS status
    prisma.shipment.count({ where: { status: 'IN_PROGRESS' } }),
    // Completed today
    prisma.shipment.count({
      where: { status: 'COMPLETED', shippedAt: { gte: startOfDay } },
    }),
    // Completed in last 30 days
    prisma.shipment.findMany({
      where: { status: 'COMPLETED', shippedAt: { gte: thirtyDaysAgo } },
      select: { startedAt: true, shippedAt: true, packages: { select: { id: true } } },
    }),
    // Cancelled in last 30 days
    prisma.shipment.count({
      where: { createdAt: { gte: thirtyDaysAgo }, status: 'CANCELLED' },
    }),
    // All completed shipments in last 30 days (for avg packages)
    prisma.shipment.findMany({
      where: { status: 'COMPLETED', shippedAt: { gte: thirtyDaysAgo } },
      select: { packages: { select: { id: true } } },
    }),
    // All completed shipments in last 30 days (for avg packages)
    prisma.shipment.findMany({
      where: { status: 'COMPLETED', shippedAt: { gte: thirtyDaysAgo } },
      select: { id: true },
    }),
  ])

  const totalCompleted = completedInPeriod.length
  const totalCancelled = cancelledInPeriod
  const totalInPeriod = totalCompleted + totalCancelled

  // Average shipping time
  const avgShippingTimeMinutes =
    totalCompleted > 0
      ? Math.round(
          completedInPeriod.reduce((s, o) => {
            if (!o.startedAt || !o.shippedAt) return s
            return s + (new Date(o.shippedAt) - new Date(o.startedAt)) / 60000
          }, 0) / totalCompleted
        )
      : 0

  // Shipping accuracy: completed / (completed + cancelled)
  const shippingAccuracy =
    totalInPeriod > 0 ? Math.round((totalCompleted / totalInPeriod) * 100) : 100

  // Average packages per shipment
  const totalPackages = allCompletedShipments.reduce(
    (s, sh) => s + (sh.packages?.length || 0), 0
  )
  const avgPackagesPerShipment =
    allCompletedShipments.length > 0
      ? Math.round((totalPackages / allCompletedShipments.length) * 10) / 10
      : 0

  return {
    pendingShipment: pendingCount,
    shipmentInProgress: inProgressCount,
    completedToday: completedTodayCount,
    avgShippingTimeMinutes,
    shippingAccuracy,
    avgPackagesPerShipment,
  }
}
