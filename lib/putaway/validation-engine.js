import { resolveScan, normalizeCode } from './barcode-utils'

// ============================================================
// Validation Engine — location and item scan rules.
// Pure decision helpers; scan-session + service wire them up.
// No inventory writes.
// ============================================================

function result(status, message, expected, actual, code) {
  return { status, message, expected, actual, code }
}

// Location validation against the line's expected target.
// expectedId/expectedCode = selected override target, or recommendation primary.
export function validateLocation({ location, line, warehouseId, expectedId, expectedCode }) {
  const expected = expectedCode || expectedId || '?'
  if (!location) return result('ERROR', 'Unknown location', expected, null, normalizeCode(line.sku))
  const code = location.code
  if (!location.isActive) return result('ERROR', 'Inactive location', expected, code, code)
  if (location.type !== 'STORAGE') return result('ERROR', `Not a storage bin (${location.type})`, expected, code, code)
  if (location.zone?.warehouseId && location.zone.warehouseId !== warehouseId) {
    return result('ERROR', 'Wrong warehouse', expected, code, code)
  }
  if (expectedId && location.id !== expectedId) return result('WARNING', 'Wrong location', expected, code, code)
  return result('SUCCESS', 'Correct location', expected, code, code)
}

// Item validation against the line's item.
export function validateItem({ item, line, session }) {
  const expected = line.sku
  const code = item?.code || normalizeCode(session?.lastScan)
  if (!item) return result('ERROR', 'Unknown barcode', expected, null, normalizeCode(session?.lastScan))
  if (!item.isActive) return result('ERROR', 'Inactive item', expected, item.sku, item.sku)
  if (item.id !== line.itemId) return result('ERROR', 'Wrong item', expected, item.sku, item.sku)
  if (session?.lastScan && session.lastScanType === 'ITEM' && session.lastScan === item.sku) {
    return result('WARNING', 'Duplicate scan', expected, item.sku, item.sku)
  }
  return result('SUCCESS', 'Correct item', expected, item.sku, item.sku)
}
