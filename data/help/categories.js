// Categories contextual help guide — consumed through the registry (lib/help/registry.js).
// All user-facing content lives here; components stay generic and reusable.

export default {
  id: 'categories',
  title: 'Categories',
  category: 'Master Data',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-03',
  description:
    'Kategori digunakan untuk mengklasifikasikan Item agar lebih mudah diorganisir, dicari, difilter, dan dilaporkan.',
  relatedPages: ['uoms', 'items', 'receiving'],
  prerequisites: [],
  usedBy: ['Items', 'Receiving', 'Reports'],
  workflow: ['Create Category', 'Create Item', 'Receiving', 'Inventory'],
  bestPractices: [
    'Gunakan nama kategori yang konsisten.',
    'Hindari membuat kategori yang duplikat.',
    'Jangan menghapus kategori yang sudah digunakan oleh Item.',
  ],
  tips: [
    'Kelompokkan barang berdasarkan jenis.',
    'Gunakan nama yang mudah dipahami seluruh operator.',
  ],
  futureLink: '#',
}
