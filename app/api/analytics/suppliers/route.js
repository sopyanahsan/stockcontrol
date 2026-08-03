import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getSupplierMetrics } from '@/lib/analytics/kpi-engine'

// ============================================================
// GET /api/analytics/suppliers
// ------------------------------------------------------------
// Purpose: Expose supplier KPIs (summary, performance, ranking)
//          from the KPI Engine — the single source of truth.
// Consumer: Supplier reports, purchasing analytics, future UI.
// Future Usage: Executive Dashboard supplier panel.
// Response: { success, generatedAt, data }
// ============================================================

export async function GET(request) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, generatedAt: new Date(), error: 'Not authenticated', data: null },
      { status: 401 }
    )
  }
  return NextResponse.json(await getSupplierMetrics())
}
