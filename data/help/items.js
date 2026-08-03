// Items contextual help guide — consumed through the registry (lib/help/registry.js).
// All user-facing content lives here; components stay generic and reusable.

export default {
  id: 'items',
  title: 'Items Guide',
  category: 'Master Data',
  difficulty: 'Mudah',
  estimatedRead: 2,
  updatedAt: '2026-08-03',
  description:
    'Halaman Item digunakan untuk mengelola seluruh master barang yang akan digunakan pada proses Receiving, Putaway, Picking, Packing, dan Shipping.',
  relatedPages: ['categories', 'uoms', 'receiving'],
  prerequisites: ['Category sudah dibuat', 'UOM sudah tersedia'],
  usedBy: ['Receiving', 'Putaway', 'Picking', 'Packing', 'Shipping'],
  workflow: ['Category', 'UOM', 'Create Item', 'Receiving', 'Inventory'],
  bestPractices: [
    'Pastikan Category sudah dibuat.',
    'Pastikan UOM sudah tersedia.',
    'SKU harus unik.',
    'Jangan menghapus Item yang sudah memiliki transaksi.',
  ],
  tips: ['Gunakan nama Item yang mudah dikenali.'],
  futureLink: '#',
}
