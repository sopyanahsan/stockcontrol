// Putaway Continuous Scan guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-continuous-scan',
  title: 'Putaway — Continuous Scan',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-04',
  description:
    'Continuous scan memungkinkan operator menyelesaikan seluruh Putaway tanpa memilih garis secara manual. Setelah satu garis selesai, sistem otomatis berpindah ke garis berikutnya yang berstatus WAITING.',
  relatedPages: ['putaway', 'putaway-barcode-execution', 'putaway-execution-completion', 'putaway-scan-history'],
  prerequisites: ['Putaway berstatus In Progress.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Start Scan Session (garis pertama otomatis dipilih)',
    'Scan lokasi → validasi',
    'Scan item → validasi',
    'Complete Line & Auto-Advance',
    'Sistem pindah ke garis berikutnya',
    'Ulangi hingga semua garis selesai',
  ],
  documentStatus: [
    { label: 'Auto-Advanced', description: 'Sistem berpindah ke garis WAITING berikutnya.' },
    { label: 'Ready', description: 'Tidak ada lagi garis WAITING.' },
  ],
  bestPractices: [
    'Ikuti alur tanpa mengubah garis secara manual.',
  ],
  commonMistakes: [
    'Melompati garis tanpa menyelesaikannya.',
  ],
  tips: [
    'Sesi tersimpan di server — refresh halaman tidak menghentikan proses.',
  ],
  futureLink: '#',
}
