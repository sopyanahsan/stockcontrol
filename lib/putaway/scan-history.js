import prisma from '@/lib/prisma'

// ============================================================
// Scan History — records every scan (success, warning, error).
// Read-only history; no inventory writes.
// ============================================================

export async function recordScanHistory({
  sessionId,
  putawayId,
  lineId = null,
  scanType,
  scannedValue,
  validationCode = null,
  validationStatus,
  expectedValue = null,
  actualValue = null,
  device = 'KEYBOARD',
}) {
  return prisma.putawayScanHistory.create({
    data: {
      sessionId,
      putawayId,
      lineId,
      scanType,
      scannedValue,
      validationCode,
      validationStatus,
      expectedValue,
      actualValue,
      device,
    },
  })
}

export async function listScanHistory({ putawayId, limit = 200 }) {
  return prisma.putawayScanHistory.findMany({
    where: { putawayId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 500),
  })
}
