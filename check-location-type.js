const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  try {
    // Check if loc1_TEST_SUITE_SEED exists by code
    const byCode = await p.location.findUnique({ where: { code: 'L01TESTSUI' } })
    console.log('byCode:', JSON.stringify(byCode))

    // Check if loc1_TEST_SUITE_SEED exists by id
    const byId = await p.location.findUnique({ where: { id: 'loc1_TEST_SUITE_SEED' } })
    console.log('byId:', JSON.stringify(byId))

    // List all locations with 'TESTSUI' in code
    const all = await p.location.findMany({ where: { code: { contains: 'TESTSUI' } } })
    console.log('all test locs:', JSON.stringify(all.map(l => ({ id: l.id, code: l.code }))))
  } catch(e) {
    console.error('Error:', e.message)
  }
  await p.$disconnect()
}
main()
