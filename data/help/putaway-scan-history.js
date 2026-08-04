// Putaway Scan History guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-scan-history',
  title: 'Putaway — Scan History',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Setiap scan — sukses, peringatan, maupun error — tercatat dalam Execution History dengan waktu, tipe scan (LOCATION/ITEM), nilai diharapkan, nilai terpindai, dan status validasi.',
  relatedPages: ['putaway', 'putaway-continuous-scan', 'putaway-validation-result'],
  prerequisites: ['Sesion scan pernah berjalan.'],
  usedBy: ['Supervisor', 'Administrator'],
  workflow: [
    'Lakukan scan pada panel eksekusi',
    'Setiap scan tersimpan otomatis',
    'Lihat tabel Execution History',
  ],
  documentStatus: [
    { label: 'LOCATION', description: 'Scan lokasi.' },
    { label: 'ITEM', description: 'Scan item.' },
    { label: 'SUCCESS / WARNING / ERROR', description: 'Hasil validasi scan.' },
  ],
  bestPractices: [
    'Gunakan history untuk audit dan pelatihan operator.',
  ],
  commonMistakes: [],
  tips: [
    'History mencatat seluruh scan tanpa terkecuali.',
  ],
  futureLink: '#',
}
