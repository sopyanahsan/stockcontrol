// Putaway Validation Result guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-validation-result',
  title: 'Putaway — Validation Result',
  category: 'Warehouse Operation',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Setiap scan menghasilkan hasil validasi: SUCCESS, WARNING, atau ERROR. Hasil menampilkan pesan, nilai yang diharapkan (expected), nilai yang dipindai (actual), dan kode scan.',
  relatedPages: ['putaway', 'putaway-location-scan', 'putaway-item-scan'],
  prerequisites: [],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Lakukan scan',
    'Baca hasil: status + pesan',
    'Bandingkan Expected vs Scanned',
    'Lanjutkan bila SUCCESS',
  ],
  documentStatus: [
    { label: 'SUCCESS', description: 'Scan sesuai — lanjutkan ke tahap berikutnya.' },
    { label: 'WARNING', description: 'Scan valid tetapi tidak sesuai (wrong location / duplicate).' },
    { label: 'ERROR', description: 'Scan gagal — periksa kembali.' },
  ],
  bestPractices: [
    'Selalu baca pesan dan bandingkan expected vs actual.',
  ],
  commonMistakes: [
    'Mengabaikan WARNING dan melanjutkan eksekusi.',
  ],
  tips: [
    'Semua kegagalan terekam di Audit Trail.',
  ],
  futureLink: '#',
}
