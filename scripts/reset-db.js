// Reset script — deletes ALL application data from the database.
//
// Usage: npm run reset-db
//
// - Uses Prisma Client
// - Runs inside ONE prisma.$transaction()
// - Dynamically detects tables (incl. optional tables such as SystemConfig,
//   CycleCount, Warehouse, ...) so it never crashes if a model is missing
// - Never modifies the schema, never runs migrate, never runs seed

const { PrismaClient } = require('@prisma/client');

// Prisma-internal metadata tables are NOT application data.
const SKIP_TABLES = new Set(['_prisma_migrations']);

const prisma = new PrismaClient();

async function main() {
    const tables = await listTables();
    if (tables.length === 0) {
        console.log('No application tables found. Nothing to reset.');
        console.log('Database successfully reset.');
        await prisma.$disconnect();
        return;
    }

    const order = await deletionOrder(tables);

    console.log('Resetting database...');
    console.log(`Discovered ${order.length} table(s): ${order.join(', ')}`);

    const queries = order.map(
        (table) => prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
    );

    const results = await prisma.$transaction(queries);

    order.forEach((table, index) => {
        console.log(`  deleted ${results[index]} row(s) from ${table}`);
    });

    console.log('Database successfully reset.');
}

async function listTables() {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    `);
    return rows
        .map((row) => row.table_name)
        .filter((table) => !SKIP_TABLES.has(table));
}

// Order tables so children are deleted before their parents (FK-safe).
// Edges are built from pg_constraint so only tables that actually exist are
// considered — missing/optional models are simply ignored.
async function deletionOrder(tables) {
    const tableSet = new Set(tables);

    const fkRows = await prisma.$queryRawUnsafe(`
        SELECT
            child_rel.relname AS child,
            parent_rel.relname AS parent
        FROM pg_constraint
        JOIN pg_class AS child_rel ON child_rel.oid = pg_constraint.conrelid
        JOIN pg_class AS parent_rel ON parent_rel.oid = pg_constraint.confrelid
        JOIN pg_namespace AS n ON n.oid = child_rel.relnamespace
        WHERE pg_constraint.contype = 'f'
          AND n.nspname = 'public'
    `);

    // Edge child -> parent means "child must be deleted before parent".
    const incoming = new Map();
    tables.forEach((table) => incoming.set(table, 0));

    const children = new Map();
    tables.forEach((table) => children.set(table, []));

    fkRows.forEach(({ child, parent }) => {
        if (child === parent) {
            return;
        }
        if (!tableSet.has(child) || !tableSet.has(parent)) {
            return;
        }
        children.get(child).push(parent);
        incoming.set(parent, incoming.get(parent) + 1);
    });

    const queue = tables.filter((table) => incoming.get(table) === 0);
    const order = [];

    while (queue.length > 0) {
        const table = queue.shift();
        order.push(table);
        children.get(table).forEach((parent) => {
            incoming.set(parent, incoming.get(parent) - 1);
            if (incoming.get(parent) === 0) {
                queue.push(parent);
            }
        });
    }

    // Any leftover tables form a dependency cycle (e.g. self-referencing FK).
    // Append them in a deterministic order; row-level FK checks still apply.
    tables.forEach((table) => {
        if (!order.includes(table)) {
            order.push(table);
        }
    });

    return order;
}

main()
    .catch((error) => {
        console.error('Reset failed:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
