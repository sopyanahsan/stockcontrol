// Putaway FEFO guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-fefo',
  title: 'Putaway — FEFO',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'FEFO (First-Expired First-Out) diprioritaskan saat item memiliki tanggal kedaluwarsa: lokasi dengan stok paling dekat kedaluwarsa direkomendasikan lebih dulu. Evaluasi hanya rekomendasi.',
  relatedPages: ['putaway', 'putaway-fifo', 'putaway-location-suggestion'],
  prerequisites: ['Garis Putaway memiliki tanggal kedaluwarsa.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Engine mendeteksi tanggal kedaluwarsa pada garis',
    'Urutkan stok berdasarkan kedekatan kedaluwarsa',
    'Rekomendasikan lokasi terbaik',
  ],
  documentStatus: [
    { label: 'FEFO', description: 'Dipilih saat tanggal kedaluwarsa ada.' },
  ],
  bestPractices: [
    'Gunakan FEFO untuk item mudah rusak / kadaluwarsa.',
  ],
  commonMistakes: [
    'Menggunakan FEFO untuk item tanpa kedaluwarsa.',
  ],
  tips: [
    'Perkiraan FEFO menggunakan layer tertua saat expiry belum tercatat per layer.',
  ],
  futureLink: '#',
}
