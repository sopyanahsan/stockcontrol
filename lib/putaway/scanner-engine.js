import { resolveScan } from './barcode-utils'
import { validateLocation, validateItem } from './validation-engine'

// ============================================================
// Scanner Engine — resolves a scanned code and validates it.
// Agnostic to input device (USB scanner / keyboard / paste /
// future camera) — everything arrives as a plain code string.
// No inventory writes.
// ============================================================

// Scan a location code against a line's expected target.
export async function scanLocation({ code, line, warehouseId, expectedId, expectedCode }) {
  const resolved = await resolveScan(code)
  if (resolved.type !== 'LOCATION') {
    return {
      status: 'ERROR',
      message: resolved.type === 'ITEM' ? 'Scanned an item, expected a location' : 'Unknown barcode',
      expected: expectedCode || expectedId || '?',
      actual: resolved.code,
      code: resolved.code,
    }
  }
  return validateLocation({ location: resolved.location, line, warehouseId, expectedId, expectedCode })
}

// Scan an item code (barcode / SKU / id) against a line's item.
export async function scanItem({ code, line, session }) {
  const resolved = await resolveScan(code)
  if (resolved.type !== 'ITEM') {
    return {
      status: 'ERROR',
      message: resolved.type === 'LOCATION' ? 'Scanned a location, expected an item' : 'Unknown barcode',
      expected: line.sku,
      actual: resolved.code,
      code: resolved.code,
    }
  }
  return validateItem({ item: { ...resolved.item, code: resolved.code }, line, session })
}
