import prisma from '@/lib/prisma'

// ============================================================
// Stock Validation Service
// ------------------------------------------------------------
// Reusable validation layer for all stock-affecting operations.
// Each function throws with a descriptive message on failure.
// ============================================================

// ---------- Item ----------
export async function validateItem(itemId, tx = prisma) {
  const item = await (tx || prisma).item.findUnique({ where: { id: itemId } })
  if (!item) throw new Error('Item not found')
  if (!item.isActive) throw new Error('Item is inactive: ' + item.sku)
  return item
}

// ---------- Location ----------
export async function validateLocation(codeOrId, { type = null, activeOnly = true, tx = prisma } = {}) {
  const where = codeOrId.includes('-') && !codeOrId.includes(' ')
    ? { id: codeOrId }
    : { code: codeOrId }

  const loc = await (tx || prisma).location.findUnique({ where })
  if (!loc) throw new Error('Location not found: ' + codeOrId)
  if (activeOnly && !loc.isActive) throw new Error('Location is inactive: ' + (loc.code || codeOrId))
  if (type && loc.type !== type) throw new Error('Location "' + (loc.code || codeOrId) + '" is ' + loc.type + ' (expected ' + type + ')')
  return loc
}

// ---------- Stock (FIFO availability) ----------
// Returns total available qty at location for an item, or throws if insufficient.
export async function validateStock(itemId, locationId, qtyNeeded, tx = prisma) {
  const agg = await (tx || prisma).fifoLayer.aggregate({
    where: { itemId, locationId, qtyRemaining: { gt: 0 } },
    _sum: { qtyRemaining: true },
  })
  const available = agg._sum.qtyRemaining || 0
  if (available < qtyNeeded) {
    throw new Error(
      'Insufficient stock at location. Available: ' + available + ', Requested: ' + qtyNeeded
    )
  }
  return available
}

// ---------- Transfer-specific validation ----------
export async function validateTransfer({ fromLocationId, toLocationId, lines }) {
  if (!fromLocationId) throw new Error('Source location is required')
  if (!toLocationId) throw new Error('Destination location is required')
  if (fromLocationId === toLocationId) {
    throw new Error('Source and destination locations cannot be the same')
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('At least one line item is required')
  }
  for (const line of lines) {
    if (!line.itemId) throw new Error('Item is required on all lines')
    if (!line.qty || Number(line.qty) <= 0) throw new Error('Quantity must be greater than zero on all lines')
    if (!line.fromLocationId) throw new Error('Source location is required on all lines')
    if (!line.toLocationId) throw new Error('Destination location is required on all lines')
    if (line.fromLocationId === line.toLocationId) {
      throw new Error('Source and destination cannot be the same on any line')
    }
  }
}

// ---------- Serial Number ----------
export async function validateSerial(serialNo, itemId, locationId, tx = prisma) {
  const serial = await (tx || prisma).serialNumber.findUnique({
    where: { serialNo: String(serialNo).trim() },
  })
  if (!serial) throw new Error('Serial number not found: ' + serialNo)
  if (serial.itemId !== itemId) {
    throw new Error('Serial "' + serialNo + '" belongs to a different item')
  }
  if (locationId && serial.currentLocationId !== locationId) {
    throw new Error('Serial "' + serialNo + '" is not at the expected location')
  }
  if (serial.status === 'DAMAGED') throw new Error('Serial "' + serialNo + '" is marked as damaged')
  return serial
}
