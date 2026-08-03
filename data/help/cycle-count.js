// Cycle Count contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'cycle-count',
  title: 'Cycle Count',
  category: 'Warehouse Operation',
  difficulty: 'Intermediate',
  estimatedRead: 5,
  updatedAt: '2026-08-03',
  description:
    'Cycle Count digunakan untuk melakukan pemeriksaan stok secara berkala tanpa harus menghentikan seluruh operasional gudang. Petugas membandingkan jumlah stok fisik dengan jumlah stok di sistem untuk memastikan akurasi inventory. Apabila ditemukan selisih, hasil Cycle Count dapat menjadi dasar dilakukannya Stock Adjustment sesuai prosedur perusahaan.',
  relatedPages: ['adjustment', 'reports', 'audit'],
  prerequisites: ['Item tersedia.', 'Lokasi tersedia.', 'Stok telah tercatat di sistem.'],
  usedBy: ['Adjustment', 'Inventory', 'Audit Trail', 'Reports'],
  workflow: [
    'Buat Cycle Count',
    'Pilih Lokasi',
    'Hitung Stok Fisik',
    'Input Hasil Perhitungan',
    'Bandingkan dengan Sistem',
    'Review Selisih',
    'Post Cycle Count',
    'Lakukan Adjustment jika diperlukan',
  ],
  documentStatus: [
    { label: 'Draft', description: 'Dokumen masih dapat diubah.' },
    { label: 'Started', description: 'Proses perhitungan stok sedang berlangsung.' },
    { label: 'Posted', description: 'Cycle Count selesai. Hasil menjadi dasar evaluasi dan Adjustment.' },
  ],
  bestPractices: [
    'Lakukan perhitungan dengan teliti.',
    'Hitung langsung dari stok fisik.',
    'Gunakan scanner apabila tersedia.',
    'Dokumentasikan setiap selisih yang ditemukan.',
  ],
  commonMistakes: [
    'Salah menghitung stok fisik.',
    'Menghitung lokasi yang salah.',
    'Tidak melakukan review sebelum Post.',
    'Tidak menindaklanjuti selisih stok.',
  ],
  tips: [
    'Lakukan Cycle Count secara berkala.',
    'Fokus pada lokasi dengan pergerakan stok tinggi.',
    'Gunakan hasil Cycle Count sebagai dasar evaluasi operasional.',
  ],
  futureLink: '#',
}
