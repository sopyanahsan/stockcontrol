import { api } from '@/lib/api-client'

// ============================================================
// ANALYTICS CLIENT — Phase B.1
// ------------------------------------------------------------
// Reusable frontend SDK for the Analytics API. Every page that
// needs KPI data must consume this client instead of calling
// fetch()/api() directly. The API payload is returned untouched.
// ============================================================

/**
 * request (private)
 * Purpose: Single shared helper for every Analytics endpoint.
 * Input:   path (String) — API path below /api/analytics.
 * Output:  the parsed API payload ({ success, generatedAt, data }).
 *          Reuses api() so error handling and credentials are never
 *          duplicated.
 */
async function request(path) {
  return api(`/analytics${path}`)
}

/**
 * dashboard
 * Purpose: Fetch the Dashboard KPI set.
 * Consumer: Dashboard page, future Executive Dashboard.
 * Future Usage: Any headline inventory + supplier metrics surface.
 */
export async function dashboard() {
  return request('/dashboard')
}

/**
 * inventory
 * Purpose: Fetch inventory-wide KPIs (summary, health, breakdowns).
 * Consumer: Stock page, Inventory reports, future Analytics UI.
 * Future Usage: Inventory health panels.
 */
export async function inventory() {
  return request('/inventory')
}

/**
 * warehouse
 * Purpose: Fetch all warehouse-operation KPI families.
 * Consumer: Warehouse Dashboard, Warehouse reports.
 * Future Usage: Executive Dashboard warehouse operations panel.
 */
export async function warehouse() {
  return request('/warehouse')
}

/**
 * outbound
 * Purpose: Fetch all outbound KPI families (picking, packing, shipping).
 * Consumer: Outbound reports, Picking/Packing/Shipping analytics.
 * Future Usage: Executive Dashboard outbound panel.
 */
export async function outbound() {
  return request('/outbound')
}

/**
 * suppliers
 * Purpose: Fetch supplier KPIs (summary, performance, ranking).
 * Consumer: Supplier reports, purchasing analytics.
 * Future Usage: Executive Dashboard supplier panel.
 */
export async function suppliers() {
  return request('/suppliers')
}
