// Stock Movement contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'movement',
  title: 'Stock Movement',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 4,
  updatedAt: '2026-08-03',
  description:
    'Stock Movement digunakan untuk memindahkan stok dari satu lokasi ke lokasi lain di dalam gudang tanpa mengubah jumlah stok. Movement biasanya dilakukan karena perubahan layout gudang, penataan ulang rak, atau kebutuhan operasional.',
  relatedPages: ['putaway', 'adjustment', 'picking', 'reports'],
  prerequisites: ['Item sudah memiliki stok.', 'Lokasi asal tersedia.', 'Lokasi tujuan tersedia.'],
  usedBy: ['Inventory', 'Picking', 'Audit Trail', 'Reports'],
  workflow: [
    'Pilih Item',
    'Pilih Lokasi Asal',
    'Pilih Lokasi Tujuan',
    'Masukkan Quantity',
    'Review',
    'Post Movement',
    'Lokasi stok diperbarui',
  ],
  documentStatus: [
    { label: 'Draft', description: 'Dokumen masih dapat diubah.' },
    { label: 'Started', description: 'Proses perpindahan sedang berlangsung.' },
    { label: 'Posted', description: 'Perpindahan selesai. Lokasi stok telah diperbarui.' },
  ],
  bestPractices: [
    'Pastikan lokasi asal benar.',
    'Verifikasi lokasi tujuan.',
    'Pastikan quantity sesuai.',
    'Gunakan barcode lokasi bila tersedia.',
  ],
  commonMistakes: [
    'Salah memilih lokasi asal.',
    'Salah memilih lokasi tujuan.',
    'Quantity tidak sesuai.',
    'Melakukan Post sebelum perpindahan selesai.',
  ],
  tips: [
    'Gunakan Movement untuk perpindahan internal.',
    'Jangan gunakan Adjustment jika hanya berpindah lokasi.',
    'Selalu lakukan verifikasi fisik setelah perpindahan.',
  ],
  futureLink: '#',
}
