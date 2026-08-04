// Putaway Execution guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-execution',
  title: 'Putaway — Execution',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Eksekusi Putaway adalah proses memindahkan barang dari STAGING ke lokasi penyimpanan. Pada sprint ini hanya persiapan: status In Progress dicatat saat dokumen di-Start. Pemindaian barcode dan perpindahan stock menyusul.',
  relatedPages: ['putaway', 'putaway-queue', 'receiving'],
  prerequisites: ['Putaway berstatus Assigned.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Buka dokumen dari Work Queue',
    'Klik Start (status menjadi In Progress)',
    'Lakukan eksekusi pemindahan barang',
    'Tandai Completed saat selesai (sprint berikutnya)',
  ],
  documentStatus: [
    { label: 'Assigned', description: 'Siap dieksekusi.' },
    { label: 'In Progress', description: 'Sedang dieksekusi.' },
    { label: 'Completed', description: 'Barang sudah berada di lokasi tujuan.' },
  ],
  bestPractices: [
    'Pastikan semua garis (lines) selesai sebelum menandai Completed.',
    'Periksa target location sebelum eksekusi.',
  ],
  commonMistakes: [
    'Menandai Completed sebelum seluruh qty dipindahkan.',
  ],
  tips: [
    'Persiapan dokumen yang rapi mempercepat eksekusi.',
  ],
  futureLink: '#',
}
