// Stock Adjustment contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'adjustment',
  title: 'Stock Adjustment',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 4,
  updatedAt: '2026-08-03',
  description:
    'Stock Adjustment digunakan untuk mengoreksi jumlah stok di sistem agar sesuai dengan kondisi fisik di gudang. Adjustment dapat berupa penambahan maupun pengurangan stok karena barang rusak, hilang, salah pencatatan, atau hasil investigasi operasional.',
  relatedPages: ['movement', 'cycle-count', 'reports', 'audit'],
  prerequisites: ['Item sudah tersedia.', 'Location tersedia.', 'Reason Code tersedia.'],
  usedBy: ['Inventory', 'Stock Ledger', 'Audit Trail', 'Reports'],
  workflow: [
    'Pilih Item',
    'Pilih Location',
    'Pilih Reason Code',
    'Masukkan Quantity',
    'Review',
    'Post Adjustment',
    'Stock diperbarui',
  ],
  documentStatus: [
    { label: 'Draft', description: 'Dokumen masih dapat diubah.' },
    { label: 'Started', description: 'Proses penyesuaian stok sedang berlangsung.' },
    { label: 'Posted', description: 'Adjustment selesai. Jumlah stok telah diperbarui.' },
  ],
  bestPractices: [
    'Gunakan Reason Code yang sesuai.',
    'Pastikan jumlah fisik telah diverifikasi.',
    'Tambahkan catatan bila diperlukan.',
    'Lakukan approval sesuai prosedur perusahaan.',
  ],
  commonMistakes: [
    'Salah memilih Item.',
    'Salah memasukkan Quantity.',
    'Menggunakan Reason Code yang tidak sesuai.',
    'Melakukan Post tanpa verifikasi fisik.',
  ],
  tips: [
    'Gunakan Adjustment hanya untuk koreksi stok.',
    'Jangan gunakan Adjustment untuk perpindahan lokasi.',
    'Simpan bukti atau dokumentasi jika diperlukan.',
  ],
  futureLink: '#',
}
