// Putaway Location Scan guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-location-scan',
  title: 'Putaway — Location Scan',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Scan lokasi memvalidasi kode bin yang dipindai terhadap lokasi tujuan yang diharapkan (target terpilih atau rekomendasi). Lokasi salah, nonaktif, bukan bin penyimpanan, atau di warehouse berbeda akan ditolak.',
  relatedPages: ['putaway', 'putaway-barcode-execution'],
  prerequisites: ['Scan session aktif.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Lihat Expected Location pada kartu',
    'Scan kode lokasi',
    'Sistem membandingkan dengan target',
    'SUCCESS / WARNING / ERROR',
  ],
  documentStatus: [
    { label: 'SUCCESS', description: 'Lokasi sesuai target.' },
    { label: 'WARNING', description: 'Bin valid tetapi bukan target (wrong location).' },
    { label: 'ERROR', description: 'Lokasi tidak dikenal / nonaktif / salah warehouse.' },
  ],
  bestPractices: [
    'Scan bin tepat di rak tujuan.',
  ],
  commonMistakes: [
    'Memindai staging location sebagai tujuan.',
  ],
  tips: [
    'Kode lokasi dinormalisasi (trim + uppercase) otomatis.',
  ],
  futureLink: '#',
}
