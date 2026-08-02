// Centralized IDR (Indonesian Rupiah) currency formatter.
//
// Presentation-layer only — database values and calculations are untouched.
// Reuse formatCurrency() everywhere a monetary value is displayed or exported.

const IDR_FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatCurrency(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return 'Rp 0'
  return IDR_FORMATTER.format(n)
}

export default formatCurrency