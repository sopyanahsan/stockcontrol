import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const items = await p.item.findMany({ take: 3 })
console.log('items:', JSON.stringify(items.map(i => ({ id: i.id, sku: i.sku, isActive: i.isActive }))))
const locs = await p.location.findMany({ take: 3 })
console.log('locs:', JSON.stringify(locs.map(l => ({ id: l.id, code: l.code, isActive: l.isActive }))))
const reasons = await p.reasonCode.findMany({ where: { type: 'ADJUSTMENT' }, take: 3 })
console.log('reasons:', JSON.stringify(reasons.map(r => ({ id: r.id, code: r.code, isActive: r.isActive }))))
await p.$disconnect()
