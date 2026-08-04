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
  'putaway-assignment': () => import('@/data/help/putaway-assignment'),
  'putaway-queue': () => import('@/data/help/putaway-queue'),
  'putaway-execution': () => import('@/data/help/putaway-execution'),
  'putaway-execution-engine': () => import('@/data/help/putaway-execution-engine'),
  'putaway-execution-progress': () => import('@/data/help/putaway-execution-progress'),
  'putaway-timeline': () => import('@/data/help/putaway-timeline'),
  'putaway-skipped-line': () => import('@/data/help/putaway-skipped-line'),
  'putaway-skipped-line': () => import('@/data/help/putaway-skipped-line'),
  'putaway-resume-line': () => import('@/data/help/putaway-resume-line'),
  'putaway-location-suggestion': () => import('@/data/help/putaway-location-suggestion'),
  'putaway-capacity-validation': () => import('@/data/help/putaway-capacity-validation'),
  'putaway-fifo': () => import('@/data/help/putaway-fifo'),
  'putaway-fefo': () => import('@/data/help/putaway-fefo'),
  'putaway-alternative-location': () => import('@/data/help/putaway-alternative-location'),
  'putaway-recommendation-score': () => import('@/data/help/putaway-recommendation-score'),
  'putaway-scoring-factors': () => import('@/data/help/putaway-scoring-factors'),
  'putaway-override-reason': () => import('@/data/help/putaway-override-reason'),
  'putaway-barcode-execution': () => import('@/data/help/putaway-barcode-execution'),
  'putaway-location-scan': () => import('@/data/help/putaway-location-scan'),
  'putaway-item-scan': () => import('@/data/help/putaway-item-scan'),
  'putaway-validation-result': () => import('@/data/help/putaway-validation-result'),
  'putaway-continuous-scan': () => import('@/data/help/putaway-continuous-scan'),
  'putaway-execution-completion': () => import('@/data/help/putaway-execution-completion'),
  'putaway-scan-history': () => import('@/data/help/putaway-scan-history'),
  'putaway-inventory-posting': () => import('@/data/help/putaway-inventory-posting'),
  'putaway-evidence': () => import('@/data/help/putaway-evidence'),
  'putaway-posting-validation': () => import('@/data/help/putaway-posting-validation'),
  'putaway-rollback': () => import('@/data/help/putaway-rollback'),
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
  'putaway-assignment',
  'putaway-queue',
  'putaway-execution',
  'putaway-execution-engine',
  'putaway-execution-progress',
  'putaway-timeline',
  'putaway-skipped-line',
  'putaway-resume-line',
  'putaway-location-suggestion',
  'putaway-capacity-validation',
  'putaway-fifo',
  'putaway-fefo',
  'putaway-alternative-location',
  'putaway-recommendation-score',
  'putaway-scoring-factors',
  'putaway-override-reason',
  'putaway-barcode-execution',
  'putaway-location-scan',
  'putaway-item-scan',
  'putaway-validation-result',
  'putaway-continuous-scan',
  'putaway-execution-completion',
  'putaway-scan-history',
  'putaway-inventory-posting',
  'putaway-evidence',
  'putaway-posting-validation',
  'putaway-rollback',
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
  'putaway-assignment': 'Putaway — Assignment',
  'putaway-queue': 'Putaway — Work Queue',
  'putaway-execution': 'Putaway — Execution',
  'putaway-execution-engine': 'Putaway — Execution Engine',
  'putaway-execution-progress': 'Putaway — Execution Progress',
  'putaway-timeline': 'Putaway — Timeline',
  'putaway-skipped-line': 'Putaway — Skipped Line',
  'putaway-resume-line': 'Putaway — Resume Line',
  'putaway-location-suggestion': 'Putaway — Location Suggestion',
  'putaway-capacity-validation': 'Putaway — Capacity Validation',
  'putaway-fifo': 'Putaway — FIFO',
  'putaway-fefo': 'Putaway — FEFO',
  'putaway-alternative-location': 'Putaway — Alternative Location',
  'putaway-recommendation-score': 'Putaway — Recommendation Score',
  'putaway-scoring-factors': 'Putaway — Scoring Factors',
  'putaway-override-reason': 'Putaway — Override Reason',
  'putaway-barcode-execution': 'Putaway — Barcode Execution',
  'putaway-location-scan': 'Putaway — Location Scan',
  'putaway-item-scan': 'Putaway — Item Scan',
  'putaway-validation-result': 'Putaway — Validation Result',
  'putaway-continuous-scan': 'Putaway — Continuous Scan',
  'putaway-execution-completion': 'Putaway — Execution Completion',
  'putaway-scan-history': 'Putaway — Scan History',
  'putaway-inventory-posting': 'Putaway — Inventory Posting',
  'putaway-evidence': 'Putaway — Evidence',
  'putaway-posting-validation': 'Putaway — Posting Validation',
  'putaway-rollback': 'Putaway — Rollback',
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
