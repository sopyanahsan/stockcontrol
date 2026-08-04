// Putaway contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'putaway',
  title: 'Putaway',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 4,
  updatedAt: '2026-08-03',
  description:
    'Putaway digunakan untuk memindahkan barang yang telah diterima dari area Receiving menuju lokasi penyimpanan permanen di gudang. Proses ini memastikan setiap barang tersimpan pada lokasi yang benar sehingga mudah ditemukan pada proses berikutnya.',
  relatedPages: ['receiving', 'movement', 'picking', 'reports'],
  prerequisites: ['Receiving sudah berstatus Posted.'],
  usedBy: ['Inventory', 'Picking', 'Reports', 'Audit Trail'],
  workflow: [
    'Receiving Posted',
    'Create Putaway',
    'Scan / Pilih Item',
    'Pilih Lokasi Tujuan',
    'Konfirmasi Quantity',
    'Post Putaway',
    'Stock berada di lokasi penyimpanan',
  ],
  documentStatus: [
    { label: 'Draft', description: 'Dokumen masih dapat diubah (prioritas, operator, lokasi tujuan).' },
    { label: 'Released', description: 'Dokumen dikunci dan siap diproses. Eksekusi menyusul.' },
    { label: 'In Progress', description: 'Proses pemindahan barang sedang berlangsung.' },
    { label: 'Completed', description: 'Barang telah berada pada lokasi tujuan.' },
    { label: 'Cancelled', description: 'Dokumen dibatalkan. GRN dapat membuat putaway baru.' },
  ],
  bestPractices: [
    'Pastikan lokasi tujuan benar.',
    'Gunakan barcode lokasi jika tersedia.',
    'Cocokkan quantity sebelum Post.',
    'Hindari melakukan Putaway ke lokasi yang salah.',
  ],
  commonMistakes: [
    'Salah memilih lokasi.',
    'Quantity tidak sesuai.',
    'Barang belum selesai diterima tetapi sudah dipindahkan.',
    'Melakukan Post tanpa verifikasi.',
  ],
  tips: [
    'Gunakan lokasi yang telah ditentukan sistem.',
    'Lakukan Putaway segera setelah Receiving selesai.',
    'Hindari menyimpan barang di area staging terlalu lama.',
  ],
  futureLink: '#',
}
