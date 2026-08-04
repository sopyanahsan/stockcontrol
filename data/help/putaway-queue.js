// Putaway Work Queue guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-queue',
  title: 'Putaway — Work Queue',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Work Queue menampilkan dokumen Putaway yang telah di-assign dan siap dieksekusi. Gunakan filter untuk mencari dokumen berdasarkan warehouse, operator, prioritas, dan status.',
  relatedPages: ['putaway', 'putaway-assignment', 'putaway-execution'],
  prerequisites: ['Putaway berstatus Released lalu di-Assign.'],
  usedBy: ['Supervisor', 'Warehouse Operator'],
  workflow: [
    'Buka halaman Putaway → Queue',
    'Filter berdasarkan operator / warehouse / prioritas',
    'Buka dokumen yang akan dieksekusi',
    'Mulai (Start) setelah operator siap',
  ],
  documentStatus: [
    { label: 'Released', description: 'Belum di-assign.' },
    { label: 'Assigned', description: 'Siap dieksekusi oleh operator.' },
    { label: 'In Progress', description: 'Sedang dieksekusi.' },
  ],
  bestPractices: [
    'Kerjakan dokumen prioritas URGENT terlebih dahulu.',
    'Saring berdasarkan operator agar setiap operator tahu tugasnya.',
  ],
  commonMistakes: [
    'Lupa menutup / start dokumen sehingga tetap tertahan di queue.',
  ],
  tips: [
    'Gunakan kolom Estimated Time untuk merencanakan beban kerja.',
  ],
  futureLink: '#',
}
