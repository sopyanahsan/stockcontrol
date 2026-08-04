import prisma from '@/lib/prisma'

// ============================================================
// Continuous Scan — auto-advance helpers so the operator never
// manually selects the next line. No inventory writes.
// ============================================================

// Next WAITING line in execution order.
export function nextPendingLine(lines) {
  return lines
    .filter((l) => l.status === 'WAITING')
    .sort((a, b) => a.lineNo - b.lineNo)[0] || null
}

// Clear the session's transient scan state (keeps the current line).
export async function resetSessionLine({ sessionId }) {
  return prisma.putawayScanSession.update({
    where: { id: sessionId },
    data: { lastScan: null, lastScanType: null, lastScanStatus: null },
  })
}

// Move the session to the next WAITING line. Returns { nextLine, ready }.
// ready = true when no WAITING line remains.
export async function autoAdvance({ sessionId, lines }) {
  const next = nextPendingLine(lines)
  if (!next) return { nextLine: null, ready: true }
  await prisma.putawayScanSession.update({
    where: { id: sessionId },
    data: { lineId: next.id, targetLocationId: null, lastScan: null, lastScanType: null, lastScanStatus: null, locationValidated: false },
  })
  return { nextLine: next, ready: false }
}
