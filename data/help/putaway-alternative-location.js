// Putaway Alternative Location guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-alternative-location',
  title: 'Putaway — Alternative Location',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Bila lokasi yang disarankan tidak dapat digunakan, engine menyediakan hingga tiga alternatif. Setiap alternatif menampilkan lokasi, alasan, dan kapasitasnya.',
  relatedPages: ['putaway', 'putaway-location-suggestion', 'putaway-capacity-validation'],
  prerequisites: ['Ada lebih dari satu lokasi penyimpanan aktif di warehouse.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Lihat saran lokasi',
    'Periksa daftar Alternatif',
    'Pilih lokasi alternatif atau buka dialog Override',
  ],
  documentStatus: [
    { label: 'Alternative', description: 'Lokasi cadangan dengan alasan dan kapasitas.' },
  ],
  bestPractices: [
    'Pilih alternatif dengan kapasitas tersisa terbesar.',
  ],
  commonMistakes: [
    'Memilih alternatif yang sama dengan saran utama.',
  ],
  tips: [
    'Alternatif diurutkan sesuai prioritas engine.',
  ],
  futureLink: '#',
}
