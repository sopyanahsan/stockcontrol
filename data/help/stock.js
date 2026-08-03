// Stock On Hand contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'stock',
  title: 'Stock On Hand',
  category: 'Inventory',
  difficulty: 'Intermediate',
  estimatedRead: 4,
  updatedAt: '2026-08-03',
  description:
    'Halaman Stock On Hand digunakan untuk melihat jumlah stok yang tersedia di setiap lokasi gudang secara realtime. Informasi yang ditampilkan mencakup Item, lokasi penyimpanan, quantity tersedia, dan kondisi stok saat ini. Halaman ini bersifat informatif dan tidak mengubah data stok.',
  relatedPages: ['receiving', 'movement', 'adjustment', 'cycle-count', 'picking', 'reports'],
  prerequisites: ['Receiving telah diposting.', 'Stock sudah tersedia di sistem.'],
  usedBy: ['Receiving', 'Picking', 'Movement', 'Adjustment', 'Cycle Count', 'Reports'],
  workflow: ['Receiving', 'Putaway', 'Inventory', 'Stock On Hand', 'Picking'],
  stockTabs: [
    {
      name: 'Stock On Hand',
      description: 'Menampilkan posisi stok aktual pada setiap Location.',
      source: 'Computed from Stock Ledger.',
    },
    {
      name: 'Stock Ledger',
      description: 'Menampilkan seluruh histori transaksi inventory.',
      source: 'Stock Ledger.',
    },
    {
      name: 'Stock Card',
      description: 'Menampilkan histori transaksi untuk satu Item tertentu.',
      source: 'Stock Ledger.',
    },
  ],
  stockFilters: [
    { name: 'Search', description: 'Mencari berdasarkan SKU, Nama Item, atau Location.' },
    { name: 'Warehouse', description: 'Menampilkan stok berdasarkan Warehouse.' },
    { name: 'Location', description: 'Menampilkan stok berdasarkan Location.' },
  ],
  stockColumns: [
    { name: 'SKU', description: 'Kode unik Item.' },
    { name: 'Item Name', description: 'Nama Item.' },
    { name: 'Category', description: 'Kategori Item.' },
    { name: 'Location', description: 'Lokasi penyimpanan.' },
    { name: 'Zone', description: 'Zona penyimpanan.' },
    { name: 'Qty On Hand', description: 'Jumlah stok yang tersedia.', formula: 'SUM(Stock Ledger)' },
    { name: 'Value', description: 'Nilai inventory.', formula: 'Qty × Standard Cost' },
  ],
  stockLedgerColumns: [
    { name: 'Timestamp', description: 'Waktu transaksi.' },
    { name: 'Transaction', description: 'Jenis transaksi.' },
    { name: 'Reference', description: 'Nomor dokumen.' },
    { name: 'Reason', description: 'Alasan transaksi.' },
    { name: 'Qty', description: 'Perubahan quantity.' },
    { name: 'User', description: 'Pengguna yang melakukan transaksi.' },
  ],
  stockActions: [
    { name: 'Export', description: 'Mengunduh data ke Excel/CSV.' },
    { name: 'Columns', description: 'Menampilkan atau menyembunyikan kolom tabel.' },
  ],
  bestPractices: [
    'Selalu gunakan data terbaru.',
    'Gunakan filter lokasi.',
    'Lakukan pengecekan berkala.',
    'Bandingkan dengan stok fisik apabila diperlukan.',
  ],
  commonMistakes: [
    'Menganggap stok sistem selalu sama dengan stok fisik.',
    'Tidak memperhatikan lokasi penyimpanan.',
    'Menggunakan data lama tanpa refresh.',
  ],
  tips: [
    'Gunakan pencarian SKU.',
    'Gunakan filter Warehouse.',
    'Gunakan filter Location.',
  ],
  futureLink: '#',
}
