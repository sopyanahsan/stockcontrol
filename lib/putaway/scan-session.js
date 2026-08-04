import prisma from '@/lib/prisma'

// ============================================================
// Scan Session — server-persisted execution session (validation only).
// Survives serverless cold starts: state lives in PutawayScanSession.
// No inventory writes anywhere in this module.
// ============================================================

export async function getActiveSession(putawayId) {
  return prisma.putawayScanSession.findFirst({
    where: { putawayId, finishedAt: null },
    orderBy: { startedAt: 'desc' },
  })
}

export async function getSession(putawayId) {
  return prisma.putawayScanSession.findFirst({
    where: { putawayId },
    orderBy: { startedAt: 'desc' },
  })
}

export async function createSession({ putawayId }) {
  return prisma.putawayScanSession.create({ data: { putawayId } })
}

export async function recordScan({ sessionId, lineId, targetLocationId, scan, scanType, status, locationValidated }) {
  return prisma.putawayScanSession.update({
    where: { id: sessionId },
    data: {
      lineId: lineId ?? undefined,
      targetLocationId: targetLocationId ?? undefined,
      lastScan: scan || null,
      lastScanType: scanType || null,
      lastScanStatus: status || null,
      locationValidated: locationValidated !== undefined ? locationValidated : undefined,
      scanCount: { increment: 1 },
    },
  })
}

export async function finishSession({ sessionId }) {
  return prisma.putawayScanSession.update({
    where: { id: sessionId },
    data: { finishedAt: new Date() },
  })
}

// Active session as a plain object (no DB state, safe for clients).
export function sessionView(session) {
  if (!session) return null
  return {
    id: session.id,
    putawayId: session.putawayId,
    lineId: session.lineId,
    targetLocationId: session.targetLocationId,
    lastScan: session.lastScan,
    lastScanType: session.lastScanType,
    lastScanStatus: session.lastScanStatus,
    locationValidated: session.locationValidated,
    scanCount: session.scanCount,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
  }
}
