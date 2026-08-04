// Putaway Barcode Execution guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-barcode-execution',
  title: 'Putaway — Barcode Execution',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 3,
  updatedAt: '2026-08-04',
  description:
    'Eksekusi berbasis barcode memvalidasi setiap langkah pemindahan barang: scan lokasi tujuan, lalu scan item. Proses ini hanya memvalidasi — inventori belum dipindahkan pada sprint ini.',
  relatedPages: ['putaway', 'putaway-location-scan', 'putaway-item-scan', 'putaway-validation-result'],
  prerequisites: ['Putaway berstatus In Progress.'],
  usedBy: ['Warehouse Operator'],
  workflow: [
    'Pilih garis yang akan dieksekusi',
    'Start Scan Session',
    'Scan lokasi tujuan',
    'Validasi lokasi (sukses / salah / peringatan)',
    'Scan item',
    'Validasi item',
    'Ready To Complete (eksekusi inventori menyusul)',
  ],
  documentStatus: [
    { label: 'Ready', description: 'Belum ada sesi scan.' },
    { label: 'Scanning', description: 'Sesi aktif, sedang memindai.' },
    { label: 'Validated', description: 'Scan terakhir valid.' },
    { label: 'Error', description: 'Scan terakhir gagal validasi.' },
  ],
  bestPractices: [
    'Scan lokasi sebelum item, sesuai alur.',
    'Gunakan scanner USB atau ketik lalu tekan Enter.',
  ],
  commonMistakes: [
    'Scan item sebelum lokasi divalidasi.',
  ],
  tips: [
    'Scan session tersimpan di server, aman dari cold start.',
  ],
  futureLink: '#',
}
