// Shipping contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'shipping',
  title: 'Shipping',
  category: 'Outbound Operation',
  difficulty: 'Advanced',
  estimatedRead: 5,
  updatedAt: '2026-08-03',
  description:
    'Shipping adalah proses akhir pengeluaran barang dari gudang. Shipping mengurangi stok dan menyelesaikan proses outbound.',
  relatedPages: ['packing', 'reports', 'audit'],
  prerequisites: ['Packing sudah selesai.'],
  usedBy: ['Reports', 'Audit Trail', 'Inventory'],
  workflow: [
    'Packing',
    'Shipping',
    'Verifikasi',
    'Post Shipping',
    'Barang Keluar Gudang',
  ],
  documentStatus: [
    { label: 'Draft', description: 'Dokumen masih dapat diubah.' },
    { label: 'Started', description: 'Proses pengiriman sedang berlangsung.' },
    { label: 'Posted', description: 'Shipping selesai. Barang telah keluar gudang.' },
  ],
  validationChecklist: [
    'Paket benar',
    'Quantity benar',
    'Dokumen lengkap',
    'Tujuan benar',
  ],
  whenToUse: ['Gunakan setelah Packing selesai.'],
  bestPractices: [
    'Verifikasi sebelum pengiriman.',
    'Pastikan dokumen lengkap.',
  ],
  commonMistakes: [
    'Salah tujuan.',
    'Barang tertinggal.',
    'Quantity salah.',
  ],
  tips: ['Lakukan final checking.'],
  futureLink: '#',
}
