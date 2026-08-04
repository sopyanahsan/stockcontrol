// Putaway Override Reason guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-override-reason',
  title: 'Putaway — Override Reason',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Operator dapat mengabaikan rekomendasi dan memilih lokasi lain. Override dicatat di Audit Trail sebagai Recommendation Ignored + Recommendation Overridden agar keputusan selalu dapat ditelusuri.',
  relatedPages: ['putaway', 'putaway-recommendation-score'],
  prerequisites: ['Rekomendasi tersedia untuk garis.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Klik Override pada kartu rekomendasi',
    'Cari / pilih lokasi penyimpanan lain',
    'Konfirmasi',
    'Target lokasi garis diperbarui',
  ],
  documentStatus: [
    { label: 'Ignored', description: 'Rekomendasi utama tidak dipakai.' },
    { label: 'Overridden', description: 'Lokasi berbeda dipilih.' },
  ],
  bestPractices: [
    'Override hanya saat ada alasan operasional yang jelas.',
  ],
  commonMistakes: [
    'Override ke lokasi penuh / nonaktif — ditolak sistem.',
  ],
  tips: [
    'Semua override tercatat dengan user dan waktu.',
  ],
  futureLink: '#',
}
