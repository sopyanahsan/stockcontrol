// Suppliers contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'suppliers',
  title: 'Suppliers',
  category: 'Master Data',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-03',
  description:
    'Supplier adalah perusahaan atau pihak yang memasok barang ke gudang. Data Supplier digunakan pada proses Receiving untuk mencatat asal barang yang diterima. Supplier yang lengkap dan konsisten akan membantu proses pelacakan transaksi serta laporan pembelian.',
  relatedPages: ['items', 'receiving', 'reports'],
  prerequisites: [],
  usedBy: ['Receiving', 'Reports', 'Audit Trail'],
  workflow: ['Create Supplier', 'Create Receiving', 'Receive Item', 'Inventory', 'Reports'],
  bestPractices: [
    'Gunakan nama resmi perusahaan.',
    'Hindari membuat Supplier ganda.',
    'Lengkapi informasi kontak jika tersedia.',
    'Nonaktifkan Supplier yang sudah tidak digunakan daripada menghapusnya.',
  ],
  tips: [
    'Gunakan penamaan yang konsisten.',
    'Periksa kembali data Supplier sebelum digunakan pada Receiving.',
    'Lakukan review berkala terhadap Supplier aktif.',
  ],
  futureLink: '#',
}
