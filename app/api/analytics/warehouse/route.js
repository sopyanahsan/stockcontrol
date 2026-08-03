import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  getReceivingMetrics,
  getPutawayMetrics,
  getMovementMetrics,
  getAdjustmentMetrics,
  getCycleCountMetrics,
} from '@/lib/analytics/kpi-engine'

// ============================================================
// GET /api/analytics/warehouse
// ------------------------------------------------------------
// Purpose: Aggregate every warehouse-operation KPI family into
//          a single response. Each module is resolved by the
//          KPI Engine in parallel (Promise.all) — no Prisma
//          calls and no duplicated calculations here.
// Consumer: Warehouse Dashboard, Warehouse reports, Analytics UI.
// Future Usage: Executive Dashboard warehouse operations panel.
// Response: { success, generatedAt, data }
//   data: { receiving, putaway, movement, adjustment, cycleCount }
// ============================================================

export async function GET(request) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, generatedAt: new Date(), error: 'Not authenticated', data: null },
      { status: 401 }
    )
  }

  const [receiving, putaway, movement, adjustment, cycleCount] = await Promise.all([
    getReceivingMetrics(),
    getPutawayMetrics(),
    getMovementMetrics(),
    getAdjustmentMetrics(),
    getCycleCountMetrics(),
  ])

  return NextResponse.json({
    success: true,
    generatedAt: new Date(),
    data: { receiving, putaway, movement, adjustment, cycleCount },
  })
}
