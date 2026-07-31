import prisma from '@/lib/prisma'

// ============================================================
// Barcode Service (backend)
// ------------------------------------------------------------
// Hardware-independent lookup / validation for scanned codes.
// Used by Receiving (line lookup), Putaway (destination + item),
// and Stock Movement.
// ============================================================

export async function lookupByBarcode(code) {
  if (!code) return null
  const value = String(code).trim()
  if (!value) return null

  // 1) Try Item barcode / sku
  const item = await prisma.item.findFirst({
    where: {
      isActive: true,
      OR: [{ barcode: value }, { sku: value }],
    },
    include: { uom: { select: { code: true } }, category: { select: { name: true } } },
  })
  if (item) {
    return {
      type: 'ITEM',
      item: {
        id: item.id,
        sku: item.sku,
        name: item.name,
        barcode: item.barcode,
        uom: item.uom?.code,
        category: item.category?.name,
        unitCost: item.unitCost,
        serialTracked: item.serialTracked,
      },
    }
  }

  // 2) Try Location code
  const loc = await prisma.location.findUnique({
    where: { code: value },
    include: { zone: { include: { warehouse: { select: { code: true, name: true } } } } },
  })
  if (loc) {
    return {
      type: 'LOCATION',
      location: {
        id: loc.id,
        code: loc.code,
        locationType: loc.type,
        isActive: loc.isActive,
        zone: loc.zone?.code,
        warehouse: loc.zone?.warehouse?.code,
      },
    }
  }

  // 3) Try Serial number
  const serial = await prisma.serialNumber.findUnique({
    where: { serialNo: value },
    include: { item: { select: { sku: true, name: true } }, currentLocation: { select: { code: true } } },
  })
  if (serial) {
    return {
      type: 'SERIAL',
      serial: {
        id: serial.id,
        serialNo: serial.serialNo,
        status: serial.status,
        item: serial.item,
        currentLocation: serial.currentLocation?.code || null,
      },
    }
  }

  return { type: 'UNKNOWN', value }
}
