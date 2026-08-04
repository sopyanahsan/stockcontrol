// Putaway Item Scan guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-item-scan',
  title: 'Putaway — Item Scan',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Scan item memvalidasi barcode / SKU / ID item yang dipindai terhadap item pada garis Putaway. Item salah, item nonaktif, barcode tidak dikenal, dan scan ganda terdeteksi.',
  relatedPages: ['putaway', 'putaway-barcode-execution'],
  prerequisites: ['Lokasi sudah divalidasi (SUCCESS).'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Lihat Expected SKU pada kartu',
    'Scan barcode / SKU item',
    'Sistem membandingkan dengan item garis',
    'SUCCESS / WARNING / ERROR',
  ],
  documentStatus: [
    { label: 'SUCCESS', description: 'Item sesuai garis.' },
    { label: 'WARNING', description: 'Scan ganda terdeteksi.' },
    { label: 'ERROR', description: 'Item salah / nonaktif / barcode tidak dikenal.' },
  ],
  bestPractices: [
    'Scan barcode fisik pada kemasan.',
  ],
  commonMistakes: [
    'Scan ulang item yang sama — dianggap duplicate.',
  ],
  tips: [
    'SKU dan ID item juga diterima selain barcode.',
  ],
  futureLink: '#',
}
