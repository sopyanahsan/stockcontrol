// Putaway Skipped Line guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-skipped-line',
  title: 'Putaway — Skipped Line',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Garis yang tidak dapat dikerjakan saat ini dapat di-Skip. Baris yang di-skip tetap terhitung dalam eksekusi dan dapat di-Resume kemudian. Line yang COMPLETED tidak dapat di-skip.',
  relatedPages: ['putaway', 'putaway-execution-engine', 'putaway-resume-line'],
  prerequisites: ['Putaway berstatus In Progress.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Buka baris berstatus IN_PROGRESS / WAITING',
    'Klik Skip',
    'Isi alasan (remark)',
    'Baris berubah menjadi SKIPPED',
  ],
  documentStatus: [
    { label: 'SKIPPED', description: 'Baris dilewati; dapat di-resume.' },
  ],
  bestPractices: [
    'Selalu isi alasan saat men-skip untuk keperluan audit.',
  ],
  commonMistakes: [
    'Men-skip baris tanpa koordinasi dengan supervisor.',
  ],
  tips: [
    'Baris yang di-skip tidak menambah progress qty.',
  ],
  futureLink: '#',
}
