// Packing contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'packing',
  title: 'Packing',
  category: 'Outbound Operation',
  difficulty: 'Advanced',
  estimatedRead: 5,
  updatedAt: '2026-08-03',
  description:
    'Packing adalah proses pengemasan barang yang telah selesai dipicking sebelum dikirim kepada pelanggan. Packing memastikan barang siap dikirim dengan aman dan sesuai pesanan.',
  relatedPages: ['picking', 'shipping', 'reports'],
  prerequisites: ['Picking sudah selesai.'],
  usedBy: ['Shipping', 'Reports', 'Audit Trail'],
  workflow: [
    'Picking',
    'Packing',
    'Verifikasi Item',
    'Kemas Barang',
    'Label Paket',
    'Post Packing',
    'Shipping',
  ],
  documentStatus: [
    { label: 'Draft', description: 'Dokumen masih dapat diubah.' },
    { label: 'Started', description: 'Proses pengemasan barang sedang berlangsung.' },
    { label: 'Posted', description: 'Packing selesai. Barang siap dikirim.' },
  ],
  validationChecklist: [
    'Item sesuai',
    'Quantity sesuai',
    'Kemasan sesuai',
    'Label benar',
  ],
  whenToUse: ['Gunakan setelah Picking selesai.'],
  bestPractices: [
    'Pastikan barang lengkap.',
    'Gunakan kemasan sesuai.',
    'Tempel label dengan benar.',
  ],
  commonMistakes: [
    'Barang kurang.',
    'Label salah.',
    'Kemasan rusak.',
  ],
  tips: ['Periksa kembali isi paket.'],
  futureLink: '#',
}
