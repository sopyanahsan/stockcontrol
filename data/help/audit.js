// Audit Trail contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'audit',
  title: 'Audit Trail',
  category: 'Reporting',
  difficulty: 'Intermediate',
  estimatedRead: 4,
  updatedAt: '2026-08-03',
  description:
    'Audit Trail mencatat seluruh aktivitas pengguna di dalam sistem. Audit membantu proses investigasi, keamanan, dan kepatuhan operasional.',
  relatedPages: ['reports', 'dashboard'],
  prerequisites: ['Pengguna telah melakukan aktivitas di dalam sistem.'],
  usedBy: ['Administrator', 'Supervisor', 'Manager'],
  workflow: ['User Action', 'System Log', 'Audit Trail', 'Investigation'],
  bestPractices: [
    'Jangan menghapus log.',
    'Review aktivitas berkala.',
  ],
  tips: ['Gunakan filter tanggal.'],
  futureLink: '#',
}
