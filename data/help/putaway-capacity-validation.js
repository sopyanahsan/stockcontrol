// Putaway Capacity Validation guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-capacity-validation',
  title: 'Putaway — Capacity Validation',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Setiap lokasi memiliki kapasitas maksimum. Capacity Engine membandingkan kuantitas putaway terhadap kapasitas tersisa dan menolak saran bila lokasi penuh, overflow, tidak aktif, atau bukan bin penyimpanan.',
  relatedPages: ['putaway', 'putaway-location-suggestion'],
  prerequisites: ['Lokasi memiliki maxCapacity (0 = tanpa batas).'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Engine membaca maxCapacity lokasi',
    'Hitung kapasitas tersisa = maxCapacity - qty terisi',
    'Bandingkan dengan qty putaway',
    'Allow / Reject beserta alasan',
  ],
  documentStatus: [
    { label: 'Available', description: 'Cukup kapasitas.' },
    { label: 'Full', description: 'Kapasitas penuh.' },
    { label: 'Overflow', description: 'Qty melebihi kapasitas tersisa.' },
    { label: 'Inactive', description: 'Lokasi nonaktif.' },
  ],
  bestPractices: [
    'Tetapkan maxCapacity pada lokasi penyimpanan.',
  ],
  commonMistakes: [
    'Mengabaikan peringatan overflow saat override.',
  ],
  tips: [
    'Qty terisi dihitung dari Stock Ledger, bukan disimpan.',
  ],
  futureLink: '#',
}
