// Reports contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'reports',
  title: 'Reports',
  category: 'Reporting',
  difficulty: 'Beginner',
  estimatedRead: 3,
  updatedAt: '2026-08-03',
  description:
    'Halaman Reports digunakan untuk melihat seluruh laporan operasional gudang. Laporan membantu analisis operasional dan pengambilan keputusan.',
  relatedPages: ['audit', 'dashboard'],
  prerequisites: ['Transaksi inventory sudah tercatat.'],
  usedBy: ['Supervisor', 'Administrator', 'Manager'],
  workflow: ['Transaction', 'Inventory', 'Reports', 'Export'],
  reportTabs: [
    {
      name: 'Inventory Reports',
      description: 'Laporan kondisi inventory saat ini.',
      includes: ['Stock On Hand', 'Stock Card', 'Inventory Aging', 'FIFO Aging', 'Dead Stock'],
    },
    {
      name: 'Warehouse Reports',
      description: 'Laporan aktivitas operasional gudang.',
      includes: ['Receiving', 'Putaway', 'Movement', 'Adjustment', 'Cycle Count', 'Supplier'],
    },
    { name: 'Receiving', description: 'Menampilkan ringkasan aktivitas modul tersebut.', group: 'Warehouse Reports' },
    { name: 'Putaway', description: 'Menampilkan ringkasan aktivitas modul tersebut.', group: 'Warehouse Reports' },
    { name: 'Movement', description: 'Menampilkan ringkasan aktivitas modul tersebut.', group: 'Warehouse Reports' },
    { name: 'Adjustment', description: 'Menampilkan ringkasan aktivitas modul tersebut.', group: 'Warehouse Reports' },
    { name: 'Cycle Count', description: 'Menampilkan ringkasan aktivitas modul tersebut.', group: 'Warehouse Reports' },
    { name: 'Supplier', description: 'Menampilkan ringkasan aktivitas modul tersebut.', group: 'Warehouse Reports' },
  ],
  reportMetrics: [
    { title: 'Total SKU', description: 'Jumlah item yang memiliki stok.', formula: 'COUNT(Item with Qty > 0)' },
    { title: 'Total Qty', description: 'Total quantity inventory.', formula: 'SUM(Qty On Hand)' },
    { title: 'Total Value', description: 'Total nilai inventory.', formula: 'SUM(Qty × Standard Cost)' },
    { title: 'Below Reorder', description: 'Jumlah item di bawah Reorder Point.', formula: 'Qty <= Reorder Point' },
    { title: 'Total GRN', description: 'Jumlah dokumen Goods Receipt Note.', formula: 'COUNT(GRN)', group: 'Receiving' },
    { title: 'Qty Received', description: 'Total quantity barang yang diterima.', formula: 'SUM(Received Qty)', group: 'Receiving' },
    { title: 'Lines Received', description: 'Jumlah baris penerimaan.', formula: 'COUNT(Lines)', group: 'Receiving' },
    { title: 'Pending', description: 'Jumlah penerimaan yang belum selesai.', formula: 'COUNT(Status != Posted)', group: 'Receiving' },
    { title: 'Inbound', description: 'Total perpindahan masuk.', formula: 'SUM(Inbound)', group: 'Movement' },
    { title: 'Outbound', description: 'Total perpindahan keluar.', formula: 'SUM(Outbound)', group: 'Movement' },
    { title: 'Internal Transfer', description: 'Jumlah perpindahan internal.', formula: 'COUNT(Internal Transfer)', group: 'Movement' },
    { title: 'Increase', description: 'Total kenaikan stok.', formula: 'SUM(Positive Adjustment)', group: 'Adjustment' },
    { title: 'Decrease', description: 'Total penurunan stok.', formula: 'SUM(Negative Adjustment)', group: 'Adjustment' },
    { title: 'Variance', description: 'Selisih stok.', formula: 'Increase - Decrease', group: 'Adjustment' },
    { title: 'Scheduled', description: 'Jumlah Cycle Count terjadwal.', formula: 'COUNT(Scheduled)', group: 'Cycle Count' },
    { title: 'Completed', description: 'Jumlah Cycle Count selesai.', formula: 'COUNT(Completed)', group: 'Cycle Count' },
    { title: 'Variance', description: 'Selisih hasil perhitungan.', formula: 'System Qty - Counted Qty', group: 'Cycle Count' },
    { title: 'Total Supplier', description: 'Jumlah seluruh supplier.', formula: 'COUNT(Supplier)', group: 'Supplier' },
    { title: 'Receiving Count', description: 'Jumlah penerimaan per supplier.', formula: 'COUNT(Receiving per Supplier)', group: 'Supplier' },
    { title: 'Last Delivery', description: 'Tanggal pengiriman terakhir.', formula: 'MAX(Receiving Date)', group: 'Supplier' },
  ],
  reportCharts: [
    { name: 'Stock by Category', description: 'Distribusi stok berdasarkan kategori.' },
    { name: 'Stock by Zone', description: 'Distribusi stok berdasarkan zona gudang.' },
    { name: 'Inventory Aging', description: 'Umur inventory.' },
    { name: 'FIFO Aging', description: 'Urutan umur stok berdasarkan FIFO.' },
    { name: 'Dead Stock', description: 'Item yang tidak memiliki pergerakan.' },
  ],
  reportFilters: [
    { name: 'Period', description: 'Filter berdasarkan rentang waktu.' },
    { name: 'Search', description: 'Mencari dokumen tertentu.' },
  ],
  reportTables: [
    { name: 'Report Table', description: 'Menampilkan seluruh data hasil filter.' },
  ],
  reportActions: [
    { name: 'Export', description: 'Mengunduh laporan ke Excel/CSV.' },
    { name: 'Columns', description: 'Menampilkan atau menyembunyikan kolom.' },
  ],
  bestPractices: [
    'Gunakan filter.',
    'Export bila diperlukan.',
  ],
  tips: ['Review laporan secara berkala.'],
  futureLink: '#',
}
