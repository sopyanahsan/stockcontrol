// Putaway Execution Progress guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-execution-progress',
  title: 'Putaway — Execution Progress',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Progress eksekusi dihitung secara dinamis oleh Progress Engine dan tidak pernah disimpan manual. Menampilkan persentase, garis selesai, sisa, dilewati, qty, dan estimasi sisa waktu.',
  relatedPages: ['putaway', 'putaway-execution-engine'],
  prerequisites: ['Putaway sudah di-Start.'],
  usedBy: ['Supervisor', 'Warehouse Operator'],
  workflow: [
    'Buka detail Putaway',
    'Lihat kartu Execution Progress',
    'Progress berubah otomatis saat baris di-complete / di-skip',
  ],
  documentStatus: [
    { label: 'Completed Lines', description: 'Jumlah garis berstatus COMPLETED.' },
    { label: 'Remaining Lines', description: 'Jumlah garis yang belum selesai (tidak termasuk skipped).' },
    { label: 'Skipped Lines', description: 'Jumlah garis berstatus SKIPPED.' },
  ],
  bestPractices: [
    'Pantau estimasi sisa waktu untuk mengatur beban kerja.',
  ],
  commonMistakes: [
    'Mencatat progress secara manual — hindari, sistem menghitungnya.',
  ],
  tips: [
    'Progress % dihitung berdasarkan qty, bukan jumlah garis.',
  ],
  futureLink: '#',
}
