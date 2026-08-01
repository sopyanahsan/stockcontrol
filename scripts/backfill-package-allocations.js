/**
 * scripts/backfill-package-allocations.js
 *
 * ONE-TIME BACKFILL ONLY.
 *
 * Populates PackageAllocation rows for all PackageItem records created before
 * the PackageAllocation feature was introduced.
 *
 * After this script runs, every PackageItem with qty > 0 will have at least
 * one PackageAllocation row linking it back to the PickingTask(s) that
 * supplied the inventory.
 *
 * Run: node scripts/backfill-package-allocations.js
 *
 * This script is idempotent — it uses upserts and skips rows that already
 * have PackageAllocation records.
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function backfill() {
  console.log('Starting PackageAllocation backfill...\n')

  const packageItems = await prisma.packageItem.findMany({
    where: {
      allocations: { none: {} }, // only items without PackageAllocation
    },
    include: {
      package: {
        include: {
          packingOrder: {
            include: {
              pickingOrder: {
                include: {
                  lines: {
                    include: {
                      tasks: {
                        where: { status: 'COMPLETED' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      item: { select: { id: true, serialTracked: true } },
    },
  })

  console.log(`Found ${packageItems.length} PackageItem rows needing backfill.\n`)

  let created = 0
  let skipped = 0

  for (const pi of packageItems) {
    const { package: pkg, item } = pi

    if (!pkg?.packingOrder?.pickingOrder) {
      console.log(`  SKIP  PackageItem ${pi.id}: no packing order or picking order`)
      skipped++
      continue
    }

    const pickingOrder = pkg.packingOrder.pickingOrder
    const pickingLine = pickingOrder.lines.find((l) => l.itemId === item.id)

    if (!pickingLine) {
      console.log(`  SKIP  PackageItem ${pi.id}: no picking line for item ${item.id}`)
      skipped++
      continue
    }

    const tasks = pickingLine.tasks
    if (tasks.length === 0) {
      console.log(`  SKIP  PackageItem ${pi.id}: no completed picking tasks`)
      skipped++
      continue
    }

    if (item.serialTracked) {
      // Serial-tracked: one PackageAllocation per PickingTask, qtyPacked = count of serials
      const pts = await prisma.pickingTaskSerial.findMany({
        where: {
          pickingTaskId: { in: tasks.map((t) => t.id) },
          packageId: pkg.id,
        },
        select: { pickingTaskId: true, serialNo: true },
      })

      // Group by pickingTaskId
      const taskCounts = {}
      for (const p of pts) {
        taskCounts[p.pickingTaskId] = (taskCounts[p.pickingTaskId] || 0) + 1
      }

      for (const [pickingTaskId, qtyPacked] of Object.entries(taskCounts)) {
        await prisma.packageAllocation.upsert({
          where: { packageItemId_pickingTaskId: { packageItemId: pi.id, pickingTaskId } },
          create: { packageItemId: pi.id, pickingTaskId, qtyPacked },
          update: {}, // already exists, no-op
        })
        created++
      }
    } else {
      // Non-serial: one PackageAllocation per PickingTask, qtyPacked = qty from that task
      for (const task of tasks) {
        await prisma.packageAllocation.upsert({
          where: { packageItemId_pickingTaskId: { packageItemId: pi.id, pickingTaskId: task.id } },
          create: { packageItemId: pi.id, pickingTaskId: task.id, qtyPacked: Number(task.qtyPicked) },
          update: {}, // already exists, no-op
        })
        created++
      }
    }

    console.log(`  OK    PackageItem ${pi.id}: created ${created > 0 ? 'allocations' : 'no allocations'}`)
  }

  console.log(`\nBackfill complete.`)
  console.log(`  Created: ${created} PackageAllocation rows`)
  console.log(`  Skipped: ${skipped} PackageItem rows (no picking order link)\n`)
}

backfill()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
