// Putaway Location Suggestion guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-location-suggestion',
  title: 'Putaway — Location Suggestion',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-04',
  description:
    'Smart Location Engine otomatis menyarankan lokasi penyimpanan terbaik untuk setiap garis Putaway berdasarkan stok SKU yang sama, batch, FIFO/FEFO, dan kapasitas. Saran hanya rekomendasi — tidak memindahkan inventori.',
  relatedPages: ['putaway', 'putaway-capacity-validation', 'putaway-fifo', 'putaway-fefo', 'putaway-alternative-location'],
  prerequisites: ['Putaway berstatus Released / Assigned / In Progress.'],
  usedBy: ['Warehouse Operator', 'Supervisor'],
  workflow: [
    'Buka detail Putaway',
    'Lihat kartu Smart Location Suggestions',
    'Terima (Accept) atau pilih lokasi lain (Override)',
    'Lokasi terpilih tercatat pada garis',
  ],
  documentStatus: [
    { label: 'Suggested', description: 'Lokasi rekomendasi dari engine.' },
    { label: 'Accepted', description: 'Operator menyetujui saran.' },
    { label: 'Overridden', description: 'Operator memilih lokasi lain.' },
  ],
  bestPractices: [
    'Terima saran bila kapasitas dan FIFO/FEFO sesuai.',
    'Override hanya saat ada alasan operasional.',
  ],
  commonMistakes: [
    'Menempatkan barang di lokasi dengan kapasitas penuh.',
  ],
  tips: [
    'Lihat alasan (reasons) untuk memahami keputusan engine.',
  ],
  futureLink: '#',
}
