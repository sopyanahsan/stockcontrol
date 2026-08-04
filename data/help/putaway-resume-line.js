// Putaway Resume Line guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-resume-line',
  title: 'Putaway — Resume Line',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Baris yang sebelumnya di-Skip dapat dilanjutkan (Resume). Resume mengubah status baris kembali menjadi IN_PROGRESS sehingga dapat di-Completed.',
  relatedPages: ['putaway', 'putaway-execution-engine', 'putaway-skipped-line'],
  prerequisites: ['Baris berstatus SKIPPED pada Putaway In Progress.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Buka baris berstatus SKIPPED',
    'Klik Resume',
    'Baris berubah menjadi IN_PROGRESS',
    'Kerjakan lalu Complete',
  ],
  documentStatus: [
    { label: 'SKIPPED', description: 'Dapat di-resume.' },
    { label: 'IN_PROGRESS', description: 'Sedang dikerjakan setelah resume.' },
  ],
  bestPractices: [
    'Pastikan alasan skip sudah teratasi sebelum resume.',
  ],
  commonMistakes: [
    'Me-resume baris yang sudah COMPLETED — tidak diizinkan oleh sistem.',
  ],
  tips: [
    'Resume tidak mengubah qty; tetap sesuai garis.',
  ],
  futureLink: '#',
}
