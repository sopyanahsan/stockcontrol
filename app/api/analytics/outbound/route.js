import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  getPickingMetrics,
  getPackingMetrics,
  getShippingMetrics,
} from '@/lib/analytics/kpi-engine'

// ============================================================
// GET /api/analytics/outbound
// ------------------------------------------------------------
// Purpose: Aggregate every outbound KPI family (picking,
//          packing, shipping) into a single response. All three
//          are resolved by the KPI Engine in parallel
//          (Promise.all) — no Prisma calls, no duplication.
// Consumer: Outbound reports, Picking/Packing/Shipping analytics.
// Future Usage: Executive Dashboard outbound panel.
// Response: { success, generatedAt, data }
//   data: { picking, packing, shipping }
// ============================================================

export async function GET(request) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, generatedAt: new Date(), error: 'Not authenticated', data: null },
      { status: 401 }
    )
  }

  const [picking, packing, shipping] = await Promise.all([
    getPickingMetrics(),
    getPackingMetrics(),
    getShippingMetrics(),
  ])

  return NextResponse.json({
    success: true,
    generatedAt: new Date(),
    data: { picking, packing, shipping },
  })
}
