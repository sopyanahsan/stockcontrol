// Putaway Execution Completion guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-execution-completion',
  title: 'Putaway — Execution Completion',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Dokumen Putaway dapat diselesaikan (COMPLETED) hanya bila seluruh garis berstatus COMPLETED atau SKIPPED. Penyelesaian hanya mengubah status eksekusi — inventori tidak dipindahkan pada sprint ini.',
  relatedPages: ['putaway', 'putaway-continuous-scan'],
  prerequisites: ['Semua garis COMPLETED atau SKIPPED.'],
  usedBy: ['Warehouse Operator', 'Supervisor'],
  workflow: [
    'Selesaikan semua garis',
    'Muncul banner Ready To Complete',
    'Klik Complete Putaway',
    'Status dokumen menjadi COMPLETED',
  ],
  documentStatus: [
    { label: 'In Progress', description: 'Masih ada garis yang belum selesai.' },
    { label: 'Completed', description: 'Semua garis selesai / di-skip; dokumen ditutup.' },
  ],
  bestPractices: [
    'Pastikan tidak ada garis yang terlupa.',
  ],
  commonMistakes: [
    'Menyelesaikan dokumen saat masih ada garis WAITING — ditolak sistem.',
  ],
  tips: [
    'Tombol Complete Putaway hanya aktif saat valid.',
  ],
  futureLink: '#',
}
