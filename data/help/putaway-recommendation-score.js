// Putaway Recommendation Score guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-recommendation-score',
  title: 'Putaway — Recommendation Score',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-04',
  description:
    'Setiap lokasi kandidat dinilai 0–100 oleh Recommendation Score Engine menggunakan aturan berbobot. Skor tinggi berarti lokasi sangat cocok; skor disertai alasan, peringatan, dan strategi yang menjelaskan keputusan.',
  relatedPages: ['putaway', 'putaway-scoring-factors', 'putaway-location-suggestion'],
  prerequisites: ['Putaway berstatus Released / Assigned / In Progress.'],
  usedBy: ['Warehouse Operator', 'Supervisor'],
  workflow: [
    'Buka detail Putaway',
    'Lihat kartu Location Recommendations per garis',
    'Periksa skor, alasan, dan peringatan',
    'Terima atau override lokasi',
  ],
  documentStatus: [
    { label: '80-100', description: 'Sangat direkomendasikan.' },
    { label: '50-79', description: 'Cukup baik.' },
    { label: '<50', description: 'Kurang cocok — periksa peringatan.' },
  ],
  bestPractices: [
    'Utamakan lokasi dengan skor tinggi dan tanpa peringatan.',
  ],
  commonMistakes: [
    'Mengabaikan peringatan kapasitas saat memilih lokasi.',
  ],
  tips: [
    'Skor dihitung ulang setiap kali halaman dimuat.',
  ],
  futureLink: '#',
}
