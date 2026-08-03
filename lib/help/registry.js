// Central registry for every contextual help guide in the system.
//
// HelpButton / HelpDrawer only ever deal with a page id — all guide data is
// resolved through this module. Adding a new guide is a two-step process:
//   1. Create data/help/<pageId>.js (default export matching the guide schema).
//   2. Register its lazy loader in `guideLoaders` below.
//
// GUIDE_IDS / GUIDE_LABELS describe the full help catalog (used later by the
// Help Center navigation); guides without a registered loader are not live yet.

const guideLoaders = {
  adjustment: () => import('@/data/help/adjustment'),
  'analytics-executive': () => import('@/data/help/analytics-executive'),
  'analytics-inventory': () => import('@/data/help/analytics-inventory'),
  'analytics-suppliers': () => import('@/data/help/analytics-suppliers'),
  'analytics-trends': () => import('@/data/help/analytics-trends'),
  'analytics-warehouse': () => import('@/data/help/analytics-warehouse'),
  audit: () => import('@/data/help/audit'),
  categories: () => import('@/data/help/categories'),
  'cycle-count': () => import('@/data/help/cycle-count'),
  dashboard: () => import('@/data/help/dashboard'),
  items: () => import('@/data/help/items'),
  movement: () => import('@/data/help/movement'),
  packing: () => import('@/data/help/packing'),
  picking: () => import('@/data/help/picking'),
  putaway: () => import('@/data/help/putaway'),
  receiving: () => import('@/data/help/receiving'),
  reports: () => import('@/data/help/reports'),
  shipping: () => import('@/data/help/shipping'),
  stock: () => import('@/data/help/stock'),
  suppliers: () => import('@/data/help/suppliers'),
  uoms: () => import('@/data/help/uoms'),
}

// Full catalog of contextual help pages (planned and live).
export const GUIDE_IDS = [
  'dashboard',
  'categories',
  'uoms',
  'suppliers',
  'items',
  'receiving',
  'putaway',
  'movement',
  'adjustment',
  'cycle-count',
  'picking',
  'packing',
  'shipping',
  'stock',
  'reports',
  'audit',
  'analytics-executive',
  'analytics-inventory',
  'analytics-warehouse',
  'analytics-suppliers',
  'analytics-trends',
]

export const GUIDE_LABELS = {
  dashboard: 'Dashboard',
  categories: 'Master Category',
  uoms: 'Master UOM',
  suppliers: 'Supplier',
  items: 'Master Item',
  receiving: 'Receiving',
  putaway: 'Putaway',
  movement: 'Stock Movement',
  adjustment: 'Stock Adjustment',
  'cycle-count': 'Cycle Count',
  picking: 'Picking',
  packing: 'Packing',
  shipping: 'Shipping',
  stock: 'Stock on Hand',
  reports: 'Reports',
  audit: 'Audit Trail',
  'analytics-executive': 'Executive Dashboard',
  'analytics-inventory': 'Inventory Analytics',
  'analytics-warehouse': 'Warehouse Analytics',
  'analytics-suppliers': 'Supplier Analytics',
  'analytics-trends': 'Trend Analytics',
}

export function isGuideRegistered(pageId) {
  return Object.prototype.hasOwnProperty.call(guideLoaders, pageId)
}

// Async load of a single guide. Returns null when the page is not registered
// or its data file fails to load, so callers can render a graceful fallback.
export async function getGuide(pageId) {
  const loader = guideLoaders[pageId]
  if (!loader) return null
  try {
    const mod = await loader()
    return mod?.default ?? null
  } catch (e) {
    console.error(`[help] Guide not found for "${pageId}"`, e)
    return null
  }
}

export function getGuideLabel(pageId) {
  return GUIDE_LABELS[pageId] || pageId
}
