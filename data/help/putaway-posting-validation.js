// Putaway Posting Validation guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-posting-validation',
  title: 'Putaway — Posting Validation',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Sebelum inventori diposting, sistem memvalidasi: status dokumen COMPLETED, semua garis selesai, lokasi target ada dan aktif, lokasi berjenis STORAGE di warehouse yang sama, stok tersedia di staging, dan belum pernah di-post.',
  relatedPages: ['putaway', 'putaway-inventory-posting'],
  prerequisites: [],
  usedBy: ['Supervisor'],
  workflow: [
    'Sistem memeriksa validasi pra-posting',
    'Setiap kegagalan menghasilkan pesan spesifik',
    'Bila semua valid → posting berjalan atomik',
  ],
  documentStatus: [
    { label: 'Invalid', description: 'Ada kesalahan — pesan ditampilkan.' },
    { label: 'Valid', description: 'Siap diposting.' },
  ],
  bestPractices: [
    'Perbaiki pesan kesalahan satu per satu.',
  ],
  commonMistakes: [
    'Menetapkan target di lokasi nonaktif / salah warehouse.',
  ],
  tips: [
    'Stok tidak cukup di staging adalah kesalahan yang paling umum.',
  ],
  futureLink: '#',
}
