import prisma from '@/lib/prisma'

// ============================================================
// Execution Engine — completion of lines and the document.
// Updates execution status ONLY. Inventory, Stock Ledger and
// Stock On Hand are never touched.
// ============================================================

// A document may complete when every line is COMPLETED or SKIPPED.
export function isReadyForCompletion(lines) {
  return Array.isArray(lines) && lines.length > 0 && lines.every((l) => l.status === 'COMPLETED' || l.status === 'SKIPPED')
}

// Mark a single line executed.
export async function completeLineExecution({ user, line }) {
  return prisma.putawayLine.update({
    where: { id: line.id },
    data: {
      status: 'COMPLETED',
      qtyCompleted: line.qty,
      completedAt: new Date(),
      executedBy: user.id,
      executedByName: user.name,
    },
  })
}

// Complete the putaway document (status transition only).
export async function completePutaway({ id }) {
  return prisma.putaway.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
}
