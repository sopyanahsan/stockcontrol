import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getDashboardMetrics } from '@/lib/analytics/kpi-engine'

// ============================================================
// GET /api/analytics/dashboard
// ------------------------------------------------------------
// Purpose: Expose the Dashboard KPI set from the KPI Engine —
//          the single source of truth (no Prisma here).
// Consumer: Dashboard page and future Executive Dashboard.
// Future Usage: Any analytics surface needing headline
//               inventory + supplier metrics.
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
  return NextResponse.json(await getDashboardMetrics())
}
