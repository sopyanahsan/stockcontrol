// Trend Analytics contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'analytics-trends',
  title: 'Trend Analytics',
  category: 'Analytics',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-03',
  description:
    'Trend Analytics menampilkan pola pergerakan operasional dari waktu ke waktu — tren inbound, outbound, dan pergerakan stok untuk mendukung perencanaan.',
  relatedPages: ['analytics-executive', 'analytics-inventory', 'reports'],
  prerequisites: ['Riwayat transaksi telah tercatat.'],
  usedBy: ['Supervisor', 'Administrator', 'Manager'],
  workflow: ['Login', 'Trend Analytics', 'Pilih Rentang Waktu', 'Analisis Pola'],
  bestPractices: [
    'Gunakan rentang waktu yang relevan untuk analisis.',
    'Amati tren musiman aktivitas gudang.',
    'Dukung keputusan perencanaan dengan data tren.',
  ],
  tips: ['Perhatikan lonjakan aktivitas untuk perencanaan kapasitas.'],
  futureLink: '#',
}
