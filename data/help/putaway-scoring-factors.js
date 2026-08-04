// Putaway Scoring Factors guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-scoring-factors',
  title: 'Putaway — Scoring Factors',
  category: 'Warehouse Operation',
  difficulty: 'Advanced',
  estimatedRead: 3,
  updatedAt: '2026-08-04',
  description:
    'Skor rekomendasi dihitung dari enam faktor berbobot: Same SKU (30), Same Batch (20), Capacity (20), FIFO/FEFO (15), Distance (10), dan Zone Preference (5) — total 100.',
  relatedPages: ['putaway', 'putaway-recommendation-score'],
  prerequisites: [],
  usedBy: ['Supervisor', 'Administrator'],
  workflow: [
    'Same SKU — lokasi sudah berisi SKU yang sama',
    'Same Batch — lokasi berisi batch yang sama',
    'Capacity — proporsi kapasitas tersisa',
    'FIFO/FEFO — lokasi dengan layer tertua',
    'Distance — kedekatan dengan stok yang sama',
    'Zone Preference — zona sudah menyimpan item',
  ],
  documentStatus: [],
  bestPractices: [
    'Faktor bobot disimpan sebagai konstanta reusable di recommendation-engine.',
  ],
  commonMistakes: [],
  tips: [
    'Total skor tidak pernah melebihi 100.',
  ],
  futureLink: '#',
}
