// Factory Reset — wipes ALL application data using PostgreSQL TRUNCATE.
//
// - Reads information_schema.tables to discover every user table.
// - Executes a single TRUNCATE TABLE ... RESTART IDENTITY CASCADE inside
//   a prisma.$transaction so any failure rolls back.
// - Verifies key tables reach 0; throws otherwise.
// - Never drops the database, recreates schema, db push, migrate or seed.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const VERIFY_TABLES = [
  'User',
  'Item',
  'PickingOrder',
  'PackingOrder',
  'Shipment',
  'StockTransfer',
  'StockAdjustment',
  'CycleCount',
  'StockOpname',
  'AuditLog',
];

async function getTableNames() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '_prisma_%' ORDER BY table_name"
  );
  return rows.map((r) => r.table_name);
}

function check(label, value) {
  if (value !== 0) {
    throw new Error(
      `Factory Reset verification failed: ${label} = ${value} (expected 0)`
    );
  }
  console.log(`\u2713 ${label} = ${value}`);
}

async function main() {
  console.log('====================================');
  console.log('StockControl WMS');
  console.log('Factory Reset');
  console.log('====================================');

  const tableNames = await getTableNames();

  if (tableNames.length === 0) {
    throw new Error('No tables found in public schema.');
  }

  const quoted = tableNames.map((t) => `"${t}"`).join(', ');
  const sql = `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`;

  console.log('');
  console.log(`TRUNCATE ${tableNames.length} tables ...`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(sql);
  });

  console.log('');
  console.log('------------------------------------');
  console.log('Verification');

  await prisma.$transaction(async (tx) => {
    check('User', await tx.user.count());
    check('Item', await tx.item.count());
    check('PickingOrder', await tx.pickingOrder.count());
    check('PackingOrder', await tx.packingOrder.count());
    check('Shipment', await tx.shipment.count());
    check('StockTransfer', await tx.stockTransfer.count());
    check('StockAdjustment', await tx.stockAdjustment.count());
    check('CycleCount', await tx.cycleCount.count());
    check('StockOpname', await tx.stockOpname.count());
    check('AuditLog', await tx.auditLog.count());
  });

  console.log('------------------------------------');
  console.log('Factory Reset completed.');
  console.log('====================================');
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
