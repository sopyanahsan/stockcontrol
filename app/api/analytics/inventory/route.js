import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getInventoryMetrics } from '@/lib/analytics/kpi-engine'

// ============================================================
// GET /api/analytics/inventory
// ------------------------------------------------------------
// Purpose: Expose inventory-wide KPIs (summary, health,
//          category/warehouse/location breakdowns) from the
//          KPI Engine — the single source of truth.
// Consumer: Stock page, Inventory reports, future Analytics UI.
// Future Usage: Any surface needing inventory health metrics.
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
  return NextResponse.json(await getInventoryMetrics())
}
