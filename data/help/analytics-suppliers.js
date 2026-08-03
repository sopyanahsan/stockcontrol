// Supplier Analytics contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'analytics-suppliers',
  title: 'Supplier Analytics',
  category: 'Analytics',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-03',
  description:
    'Supplier Analytics menampilkan ringkasan basis supplier dan performa inbound — total supplier, supplier aktif, volume penerimaan, serta ranking supplier berdasarkan quantity yang diterima.',
  relatedPages: ['suppliers', 'analytics-executive', 'reports'],
  prerequisites: ['Data supplier dan penerimaan telah tercatat.'],
  usedBy: ['Supervisor', 'Administrator', 'Manager'],
  workflow: ['Login', 'Supplier Analytics', 'Review Ringkasan', 'Review Ranking'],
  bestPractices: [
    'Gunakan ranking untuk mengevaluasi volume inbound.',
    'Perhatikan supplier aktif untuk proses Receiving.',
    'Lakukan review berkala terhadap performa supplier.',
  ],
  tips: ['Bandingkan ranking supplier dengan kualitas penerimaan.'],
  futureLink: '#',
}
