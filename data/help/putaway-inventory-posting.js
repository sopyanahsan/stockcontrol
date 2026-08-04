// Putaway Inventory Posting guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-inventory-posting',
  title: 'Putaway — Inventory Posting',
  category: 'Warehouse Operation',
  difficulty: 'Advanced',
  estimatedRead: 3,
  updatedAt: '2026-08-04',
  description:
    'Saat dokumen Putaway berstatus COMPLETED, inventori secara resmi dipindahkan dari STAGING ke lokasi penyimpanan. Seluruh operasi — Stock Ledger, Stock Card, Stock On Hand, dan bin occupancy — berjalan dalam satu transaksi atomik.',
  relatedPages: ['putaway', 'putaway-execution-completion', 'putaway-posting-validation', 'putaway-rollback'],
  prerequisites: ['Putaway berstatus COMPLETED dan belum di-post.'],
  usedBy: ['Supervisor', 'Administrator'],
  workflow: [
    'Selesaikan semua garis Putaway',
    'Complete Putaway (status COMPLETED)',
    'Klik Post Inventory',
    'Sistem memindahkan stok STAGING → target',
    'Ledger, Stock Card, Stock On Hand & occupancy diperbarui',
  ],
  documentStatus: [
    { label: 'Completed', description: 'Siap di-post.' },
    { label: 'Posted', description: 'Inventori sudah dipindahkan; tidak dapat di-post ulang.' },
  ],
  bestPractices: [
    'Periksa target location dan kapasitas sebelum posting.',
  ],
  commonMistakes: [
    'Mencoba posting sebelum dokumen COMPLETED — ditolak sistem.',
  ],
  tips: [
    'Satu kegagalan = rollback total. Tidak ada update parsial.',
  ],
  futureLink: '#',
}
