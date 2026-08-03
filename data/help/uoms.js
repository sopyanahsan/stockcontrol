// Unit of Measure (UOM) contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'uoms',
  title: 'Unit of Measure (UOM)',
  category: 'Master Data',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-03',
  description:
    'Unit of Measure (UOM) digunakan untuk menentukan satuan dasar setiap Item. Contoh: PCS, BOX, SET, ROLL, KG, METER. UOM digunakan pada seluruh transaksi inventory sehingga harus dibuat sebelum membuat Item.',
  relatedPages: ['categories', 'items', 'receiving'],
  prerequisites: [],
  usedBy: [
    'Items',
    'Receiving',
    'Movement',
    'Adjustment',
    'Cycle Count',
    'Picking',
    'Packing',
    'Shipping',
    'Reports',
  ],
  workflow: ['Create UOM', 'Create Item', 'Receiving', 'Inventory', 'Picking', 'Shipping'],
  bestPractices: [
    'Gunakan singkatan standar (PCS, BOX, KG, METER).',
    'Hindari membuat UOM yang memiliki arti sama.',
    'Gunakan satu UOM utama untuk setiap Item.',
    'Jangan menghapus UOM yang sudah digunakan oleh transaksi.',
  ],
  tips: [
    'Gunakan nama yang mudah dipahami seluruh operator.',
    'Tetapkan standar penamaan UOM sejak awal implementasi sistem.',
    'Lakukan review apabila ada UOM baru yang akan ditambahkan.',
  ],
  futureLink: '#',
}
