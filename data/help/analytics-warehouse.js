// Warehouse Analytics contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'analytics-warehouse',
  title: 'Warehouse Analytics',
  category: 'Analytics',
  difficulty: 'Advanced',
  estimatedRead: 4,
  updatedAt: '2026-08-03',
  description:
    'Warehouse Analytics menampilkan performa operasional gudang — KPI Receiving, Putaway, Movement, Adjustment, dan Cycle Count untuk mengevaluasi efisiensi proses.',
  relatedPages: ['receiving', 'putaway', 'movement', 'adjustment', 'cycle-count', 'analytics-executive'],
  prerequisites: ['Transaksi operasional telah tercatat.'],
  usedBy: ['Supervisor', 'Administrator', 'Manager'],
  workflow: ['Login', 'Warehouse Analytics', 'Review Modul Operasional', 'Evaluasi Backlog'],
  bestPractices: [
    'Pantau backlog Receiving dan Putaway secara rutin.',
    'Evaluasi pergerakan stok untuk efisiensi.',
    'Tindak lanjuti selisih Adjustment dan Cycle Count.',
  ],
  tips: ['Gunakan data per modul untuk menemukan bottleneck operasional.'],
  futureLink: '#',
}
