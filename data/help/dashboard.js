// Dashboard contextual help guide — consumed through the registry
// (lib/help/registry.js). All user-facing content lives here; components stay
// generic and reusable.

export default {
  id: 'dashboard',
  title: 'Dashboard',
  category: 'System',
  difficulty: 'Beginner',
  estimatedRead: 2,
  updatedAt: '2026-08-03',
  description:
    'Dashboard menampilkan ringkasan kondisi operasional gudang secara realtime. Dashboard membantu pengguna memonitor kondisi gudang tanpa membuka setiap modul.',
  relatedPages: ['reports', 'receiving', 'picking', 'shipping'],
  prerequisites: [],
  usedBy: ['Semua Role'],
  workflow: ['Login', 'Dashboard', 'Monitoring', 'Operational Menu'],
  dashboardMetrics: [
    {
      title: 'Active SKU',
      description: 'Jumlah seluruh Item Master yang masih aktif di sistem.',
      formula: 'COUNT(Item WHERE isActive = true)',
      affectedBy: ['Create Item', 'Activate Item', 'Deactivate Item'],
      notes: 'Receiving tidak mengubah angka ini.',
    },
    {
      title: 'Stock on Hand',
      description: 'Jumlah seluruh stok yang tersedia di seluruh lokasi gudang.',
      formula: 'SUM(Stock Ledger)',
      affectedBy: ['Receiving', 'Putaway', 'Movement', 'Adjustment', 'Picking', 'Packing', 'Shipping'],
      notes: 'Nilai tidak disimpan langsung pada tabel Item. Selalu dihitung dari Stock Ledger.',
    },
    {
      title: 'Inventory Value',
      description: 'Nilai total inventory berdasarkan Standard Cost.',
      formula: 'SUM(Qty × Unit Cost)',
      affectedBy: ['Receiving', 'Adjustment', 'Cost Update'],
      notes: 'Digunakan sebagai estimasi nilai inventory.',
    },
    {
      title: 'Low Stock Alerts',
      description: 'Jumlah item yang berada pada atau di bawah Reorder Point.',
      formula: 'Qty On Hand <= Reorder Point',
      affectedBy: ['Receiving', 'Picking', 'Adjustment'],
      notes: 'Digunakan sebagai indikator kebutuhan replenishment.',
    },
    {
      title: 'Total Suppliers',
      description: 'Jumlah seluruh supplier yang terdaftar.',
      formula: 'COUNT(Supplier)',
      affectedBy: ['Create Supplier', 'Delete Supplier'],
      notes: 'Tidak dipengaruhi transaksi warehouse.',
    },
    {
      title: 'Active Suppliers',
      description: 'Supplier aktif yang dapat digunakan pada Receiving.',
      formula: 'COUNT(Supplier WHERE Active)',
      affectedBy: ['Activate Supplier', 'Deactivate Supplier'],
    },
    {
      title: 'Inactive Suppliers',
      description: 'Supplier yang dinonaktifkan.',
      formula: 'COUNT(Supplier WHERE Active = false)',
      affectedBy: ['Activate Supplier', 'Deactivate Supplier'],
    },
    {
      title: 'Added (30 Days)',
      description: 'Jumlah supplier baru dalam 30 hari terakhir.',
      formula: 'COUNT(createdAt >= Today - 30)',
    },
    {
      title: 'Pending Picking',
      description: 'Picking yang belum dimulai.',
      formula: 'COUNT(Status = Draft)',
    },
    {
      title: 'Picking In Progress',
      description: 'Picking yang sedang berjalan.',
      formula: 'COUNT(Status = Started)',
    },
    {
      title: 'Completed Today',
      description: 'Picking yang selesai hari ini.',
      formula: 'COUNT(Status = Posted Today)',
    },
    {
      title: 'Average Pick Time',
      description: 'Rata-rata waktu penyelesaian Picking.',
      formula: 'Average(Posted - Started)',
    },
    {
      title: 'Picking Accuracy',
      description: 'Persentase Picking tanpa kesalahan.',
      formula: 'Correct Picks / Total Picks',
    },
    {
      title: 'Packing Queue',
      description: 'Packing yang menunggu diproses.',
      formula: 'COUNT(Draft)',
    },
    {
      title: 'Open Packages',
      description: 'Packing yang sedang dikerjakan.',
      formula: 'COUNT(Started)',
    },
    {
      title: 'Closed Today',
      description: 'Packing yang selesai hari ini.',
      formula: 'COUNT(Posted Today)',
    },
    {
      title: 'Average Packing Time',
      description: 'Rata-rata waktu Packing.',
      formula: 'Average(Posted - Started)',
    },
    {
      title: 'Package Accuracy',
      description: 'Persentase Packing tanpa kesalahan.',
      formula: 'Correct Packages / Total Packages',
    },
    {
      title: 'Movement Trend',
      description: 'Grafik jumlah transaksi Inbound dan Outbound selama 7 hari terakhir.',
      formula: 'Daily SUM(Inbound & Outbound)',
      notes: 'Grafik digunakan untuk melihat tren aktivitas gudang.',
    },
    {
      title: 'Stock by Category',
      description: 'Distribusi stok berdasarkan kategori item.',
      formula: 'SUM(Qty GROUP BY Category)',
    },
    {
      title: 'Low Stock List',
      description: 'Daftar item yang berada pada atau di bawah Reorder Point.',
      formula: 'Qty <= Reorder Point',
    },
    {
      title: 'Recent Activity',
      description: 'Menampilkan aktivitas terbaru seluruh pengguna.',
      formula: 'Audit Log terbaru',
      notes: 'Data berasal dari Audit Trail, bukan dari transaksi langsung.',
    },
  ],
  bestPractices: [
    'Review dashboard setiap memulai shift.',
    'Gunakan sebagai monitoring utama.',
  ],
  tips: ['Perhatikan indikator yang memerlukan tindakan segera.'],
  futureLink: '#',
}
