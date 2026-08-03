// Picking contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'picking',
  title: 'Picking',
  category: 'Outbound Operation',
  difficulty: 'Advanced',
  estimatedRead: 6,
  updatedAt: '2026-08-03',
  description:
    'Picking adalah proses pengambilan barang dari lokasi penyimpanan berdasarkan permintaan pengiriman. Operator mengambil Item sesuai lokasi, quantity, dan urutan yang ditentukan sistem. Picking merupakan tahap pertama dalam proses Outbound sebelum Packing dan Shipping.',
  relatedPages: ['putaway', 'packing', 'shipping', 'reports'],
  prerequisites: ['Stock tersedia.', 'Lokasi penyimpanan tersedia.', 'Item telah selesai Putaway.'],
  usedBy: ['Packing', 'Shipping', 'Reports', 'Audit Trail'],
  workflow: [
    'Create Picking',
    'Generate Picking List',
    'Scan / Ambil Item',
    'Verifikasi Quantity',
    'Review',
    'Post Picking',
    'Packing',
  ],
  documentStatus: [
    { label: 'Draft', description: 'Dokumen masih dapat diubah.' },
    { label: 'Started', description: 'Proses pengambilan barang sedang berlangsung.' },
    { label: 'Posted', description: 'Picking selesai. Barang siap dipacking.' },
  ],
  validationChecklist: [
    'Item benar',
    'Lokasi benar',
    'Quantity benar',
    'Barcode sesuai',
    'Semua Item telah diambil',
  ],
  whenToUse: [
    'Gunakan Picking untuk proses pengambilan barang sebelum Packing.',
    'Jangan gunakan Movement apabila tujuan hanya mengambil barang untuk dikirim.',
    'Jangan gunakan Adjustment untuk mengurangi stok pengiriman.',
  ],
  bestPractices: [
    'Ikuti urutan Picking List.',
    'Scan barcode bila tersedia.',
    'Verifikasi setiap Item.',
    'Jangan melewati lokasi yang ditentukan.',
  ],
  commonMistakes: [
    'Salah mengambil lokasi.',
    'Salah Item.',
    'Quantity tidak sesuai.',
    'Barang belum selesai Putaway.',
  ],
  tips: [
    'Gunakan scanner untuk mengurangi kesalahan.',
    'Lakukan pengecekan ulang sebelum Post.',
    'Ikuti rute Picking yang paling efisien.',
  ],
  futureLink: '#',
}
