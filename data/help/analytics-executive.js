// Executive Dashboard contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'analytics-executive',
  title: 'Executive Dashboard',
  category: 'Analytics',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-03',
  description:
    'Executive Dashboard menampilkan ringkasan kinerja gudang secara menyeluruh untuk pengambilan keputusan tingkat manajemen. Modul ini merangkum seluruh KPI inventory, warehouse, outbound, dan supplier dalam satu tampilan.',
  relatedPages: ['dashboard', 'analytics-inventory', 'analytics-warehouse', 'analytics-suppliers', 'analytics-trends', 'reports'],
  prerequisites: ['KPI Engine telah tersedia.'],
  usedBy: ['Supervisor', 'Administrator', 'Manager'],
  workflow: ['Login', 'Executive Dashboard', 'Review KPI', 'Operational Menu'],
  bestPractices: [
    'Review Executive Dashboard setiap memulai shift.',
    'Gunakan sebagai sumber monitoring utama.',
    'Bandingkan dengan laporan detail apabila diperlukan.',
  ],
  tips: ['Perhatikan indikator yang memerlukan tindakan segera.'],
  futureLink: '#',
}
