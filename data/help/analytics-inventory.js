// Inventory Analytics contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'analytics-inventory',
  title: 'Inventory Analytics',
  category: 'Analytics',
  difficulty: 'Intermediate',
  estimatedRead: 4,
  updatedAt: '2026-08-03',
  description:
    'Inventory Analytics menyajikan analisis mendalam mengenai stok — ringkasan inventory, klasifikasi kesehatan stok, serta distribusi berdasarkan kategori, gudang, dan lokasi.',
  relatedPages: ['stock', 'analytics-executive', 'reports'],
  prerequisites: ['Stok telah tercatat di sistem.'],
  usedBy: ['Supervisor', 'Administrator', 'Stock Control'],
  workflow: ['Login', 'Inventory Analytics', 'Review Summary', 'Review Kesehatan Stok', 'Analisis Breakdown'],
  bestPractices: [
    'Gunakan data terbaru sebelum mengambil keputusan.',
    'Perhatikan indikator Low Stock dan Out of Stock.',
    'Analisis distribusi berdasarkan kategori dan lokasi.',
  ],
  tips: ['Bandingkan hasil analisis dengan stok fisik secara berkala.'],
  futureLink: '#',
}
