// Putaway FIFO guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-fifo',
  title: 'Putaway — FIFO',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'FIFO (First-In First-Out) memprioritaskan lokasi yang menyimpan stok tertua (berdasarkan tanggal penerimaan) agar barang yang lebih lama keluar lebih dulu. Evaluasi FIFO hanya rekomendasi, tidak memindahkan stok.',
  relatedPages: ['putaway', 'putaway-fefo', 'putaway-location-suggestion'],
  prerequisites: ['Item memiliki stok pada lokasi penyimpanan.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Engine membaca layer FIFO untuk item',
    'Urutkan berdasarkan tanggal penerimaan tertua',
    'Rekomendasikan lokasi dengan stok tertua',
  ],
  documentStatus: [
    { label: 'FIFO', description: 'Dipilih saat tidak ada tanggal kedaluwarsa.' },
  ],
  bestPractices: [
    'Simpan barang baru di belakang barang lama.',
  ],
  commonMistakes: [],
  tips: [
    'Evaluasi dihitung dari FIFO layer yang masih memiliki qty.',
  ],
  futureLink: '#',
}
