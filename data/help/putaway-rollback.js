// Putaway Rollback guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-rollback',
  title: 'Putaway — Rollback',
  category: 'Warehouse Operation',
  difficulty: 'Advanced',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Seluruh operasi posting berjalan dalam satu transaksi Prisma. Bila salah satu langkah gagal, transaksi dibatalkan sepenuhnya — tidak ada update parsial pada Stock Ledger, Stock Card, Stock On Hand, atau bin occupancy.',
  relatedPages: ['putaway', 'putaway-inventory-posting'],
  prerequisites: [],
  usedBy: ['Administrator'],
  workflow: [
    'Posting dimulai dalam satu transaksi',
    'Kegagalan di langkah mana pun → rollback total',
    'Status dokumen tetap seperti sebelum posting',
  ],
  documentStatus: [],
  bestPractices: [
    'Periksa log kegagalan untuk akar masalah.',
  ],
  commonMistakes: [
    'Berasumsi posting sebagian tersimpan — tidak pernah terjadi.',
  ],
  tips: [
    'Rollback bukan operasi terpisah — transaksi itu sendiri yang menjaminnya.',
  ],
  futureLink: '#',
}
