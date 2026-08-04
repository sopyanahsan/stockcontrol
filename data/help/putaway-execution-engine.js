// Putaway Execution Engine guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-execution-engine',
  title: 'Putaway — Execution Engine',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-04',
  description:
    'Execution Engine mengelola eksekusi per garis (line) pada dokumen Putaway berstatus In Progress. Sprint ini hanya menyiapkan eksekusi — inventori belum dipindahkan dan scanner belum digunakan.',
  relatedPages: ['putaway', 'putaway-execution-progress', 'putaway-timeline'],
  prerequisites: ['Putaway berstatus In Progress.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Start Putaway (In Progress)',
    'Start baris (WAITING → IN_PROGRESS)',
    'Complete baris (IN_PROGRESS → COMPLETED)',
    'Skip baris bila tidak dapat dikerjakan',
    'Resume baris yang di-skip',
    'Complete Document (sprint berikutnya)',
  ],
  documentStatus: [
    { label: 'WAITING', description: 'Baris menunggu dieksekusi.' },
    { label: 'IN_PROGRESS', description: 'Baris sedang dikerjakan.' },
    { label: 'COMPLETED', description: 'Baris selesai, tidak dapat dieksekusi lagi.' },
    { label: 'SKIPPED', description: 'Baris dilewati, dapat di-resume.' },
  ],
  bestPractices: [
    'Kerjakan satu baris secara berurutan.',
    'Gunakan remark saat men-skip baris agar jelas alasannya.',
  ],
  commonMistakes: [
    'Men-skip baris tanpa alasan.',
    'Menandai complete sebelum memeriksa target location.',
  ],
  tips: [
    'Progress dihitung otomatis dari qty — tidak perlu dicatat manual.',
  ],
  futureLink: '#',
}
