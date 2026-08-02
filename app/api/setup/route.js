import { NextResponse } from 'next/server'
import { createAccessToken, accessCookie } from '@/lib/auth'
import { getSystemStatus, initializeSystem } from '@/lib/setup-service'
import { logAudit } from '@/lib/audit'

const json = (data, status = 200) => NextResponse.json(data, { status })

const err = (message, status = 400) => {
  const safeMessage = typeof message === 'string' && message.trim() ? message.trim() : 'Request failed'
  return NextResponse.json(
    { success: false, message: safeMessage, error: safeMessage, errors: [{ message: safeMessage }] },
    { status }
  )
}

async function parseBody(request) {
  const text = await request.text()
  if (!text.trim()) return {}
  try { return JSON.parse(text) }
  catch { throw new Error('Request body must be valid JSON') }
}

// GET /api/setup — status used by the wizard and login gate.
export async function GET() {
  try {
    const status = await getSystemStatus()
    return json({ success: true, ...status })
  } catch (e) {
    return err(e.message, 500)
  }
}

// POST /api/setup — runs the atomic first-time initialization.
// Locked (403) permanently once the system is initialized.
export async function POST(request) {
  try {
    const body = await parseBody(request)
    const result = await initializeSystem({ body })

    const res = json({
      success: true,
      message: 'System initialized successfully',
      user: result.user,
      warehouse: result.warehouse,
      createdLocations: result.createdLocations,
      createdReasonCodes: result.createdReasonCodes,
    })
    res.cookies.set(accessCookie(result.token))
    return res
  } catch (e) {
    if (e?.message === 'Setup is already complete') return err(e.message, 403)
    return err(e.message, 400)
  }
}
