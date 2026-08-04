// Putaway Timeline guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-timeline',
  title: 'Putaway — Timeline',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Timeline menampilkan seluruh kejadian pada dokumen Putaway secara kronologis, diambil dari Audit Trail: Generated, Released, Assigned, Started, serta eksekusi per garis (Line Started / Completed / Skipped / Resumed).',
  relatedPages: ['putaway', 'putaway-execution-engine', 'audit'],
  prerequisites: ['Dokumen Putaway dibuat.'],
  usedBy: ['Supervisor', 'Administrator'],
  workflow: [
    'Buka detail Putaway',
    'Lihat kartu Execution Timeline',
    'Setiap kejadian mencatat user dan waktu',
  ],
  documentStatus: [
    { label: 'Generated', description: 'Dokumen dibuat.' },
    { label: 'Released', description: 'Dokumen di-release.' },
    { label: 'Assigned', description: 'Operator ditentukan.' },
    { label: 'Started', description: 'Eksekusi dimulai.' },
    { label: 'Line events', description: 'Start / Complete / Skip / Resume per garis.' },
  ],
  bestPractices: [
    'Gunakan timeline untuk rekonstruksi kejadian dan audit.',
  ],
  commonMistakes: [],
  tips: [
    'Timeline dan Audit Trail mencatat kejadian yang sama.',
  ],
  futureLink: '#',
}
