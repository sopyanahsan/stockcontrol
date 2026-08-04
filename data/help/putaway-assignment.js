// Putaway Assignment guide — consumed through lib/help/registry.js.

export default {
  id: 'putaway-assignment',
  title: 'Putaway — Assignment',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 2,
  updatedAt: '2026-08-04',
  description:
    'Setelah dokumen Putaway di-Release, dokumen harus di-Assign ke operator sebelum dapat dieksekusi. Assignment mencatat operator, prioritas, estimasi durasi, dan catatan — tanpa memindahkan inventori.',
  relatedPages: ['putaway', 'putaway-queue', 'putaway-execution'],
  prerequisites: ['Putaway berstatus Released.'],
  usedBy: ['Supervisor', 'Warehouse Operator'],
  workflow: [
    'Release Putaway',
    'Klik Assign Operator',
    'Pilih Operator',
    'Atur Prioritas & Estimasi Durasi',
    'Simpan (status menjadi Assigned)',
    'Dokumen siap masuk Work Queue',
  ],
  documentStatus: [
    { label: 'Released', description: 'Dapat di-assign.' },
    { label: 'Assigned', description: 'Operator sudah ditentukan, siap dieksekusi.' },
  ],
  bestPractices: [
    'Pilih operator yang berada di warehouse tujuan.',
    'Estimasi durasi realistis berdasarkan jumlah garis dan qty.',
    'Cek Work Queue setelah assignment untuk konfirmasi.',
  ],
  commonMistakes: [
    'Meng-assign dokumen yang belum di-Release.',
    'Menetapkan prioritas tidak sesuai kebutuhan.',
  ],
  tips: [
    'Prioritas URGENT tampil menonjol di Work Queue.',
  ],
  futureLink: '#',
}
