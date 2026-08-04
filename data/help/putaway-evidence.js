// Putaway Evidence guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-evidence',
  title: 'Putaway — Evidence',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Bukti foto / dokumen dapat dilampirkan pada dokumen Putaway menggunakan modul Evidence yang sudah ada. Unggahan file atau pengambilan gambar (camera) tersimpan lewat Attachment Service — tidak ada API upload baru.',
  relatedPages: ['putaway', 'putaway-inventory-posting'],
  prerequisites: ['Dokumen Putaway dibuat.'],
  usedBy: ['Warehouse Operator', 'Supervisor'],
  workflow: [
    'Buka kartu Evidence pada detail Putaway',
    'Unggah file / ambil foto / lihat galeri',
    'Bukti tersimpan pada dokumen',
  ],
  documentStatus: [],
  bestPractices: [
    'Lampirkan bukti kondisi barang sebelum posting.',
  ],
  commonMistakes: [
    'Melampirkan bukti pada dokumen yang salah.',
  ],
  tips: [
    'Semua upload terekam di Audit Trail.',
  ],
  futureLink: '#',
}
