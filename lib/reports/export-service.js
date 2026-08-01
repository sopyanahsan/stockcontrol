// ============================================================
// Export Service
// ------------------------------------------------------------
// Client-side export utilities — runs in the browser only.
// Completely generic: receives only rows, columns, filename, format.
// Knows nothing about warehouse modules or business data.
// ============================================================

// ---------- CSV Export ----------
function doCSV(rows, columns) {
  const headers = columns.map((c) => c.label || c.header || c.accessorKey || '')
  const csvRows = rows.map((row) =>
    columns.map((col) => {
      let val = resolveVal(row, col)
      if (val === null || val === undefined) return ''
      if (val instanceof Date) return val.toISOString().slice(0, 19).replace('T', ' ')
      if (typeof val === 'object') return JSON.stringify(val)
      return String(val)
    })
  )
  return [headers, ...csvRows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

// ---------- Excel Export (xlsx) ----------
async function doXLSX(rows, columns, sheetName) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet([])
  const headers = columns.map((c) => c.label || c.header || c.accessorKey || '')
  XLSX.utils.sheet_add_aoa(ws, [headers])
  const dataRows = rows.map((row) =>
    columns.map((col) => {
      let val = resolveVal(row, col)
      if (val === null || val === undefined) return ''
      if (val instanceof Date) return val.toISOString().slice(0, 19).replace('T', ' ')
      if (typeof val === 'object') return JSON.stringify(val)
      return val
    })
  )
  XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: 'A2' })
  const colWidths = headers.map((h, i) => ({
    wch: Math.max(h.length, ...dataRows.map((r) => String(r[i] || '').length)),
  }))
  ws['!cols'] = colWidths
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Report')
  XLSX.writeFile(wb, '')
}

// ---------- Print View (with full table rendering) ----------
function doPrint(rows, columns, options = {}) {
  const { title = 'Report', filters = null, date = null } = options
  const printDate = date || new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const headers = columns.map((c) => c.label || c.header || c.accessorKey || '')
  const headerHtml = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
  const bodyHtml = rows.map((row) => {
    const cells = columns.map((col) => {
      const val = resolveVal(row, col)
      const displayVal = formatCellValue(val)
      return `<td>${displayVal}</td>`
    })
    return `<tr>${cells.join('')}</tr>`
  }).join('')

  const filtersHtml = filters
    ? `<div class="filters"><strong>Applied Filters:</strong> ${escapeHtml(filters)}</div>`
    : ''

  const html = `
    <div class="ph">
      <div>
        <div class="pt">${escapeHtml(title)}</div>
        ${filtersHtml}
      </div>
      <div class="pm">
        <div>Printed: ${printDate}</div>
        <div>${rows.length} record(s)</div>
      </div>
    </div>
    <table>${headerHtml}<tbody>${bodyHtml}</tbody></table>
    <div class="pf">
      <span>StockControl WMS — Confidential</span>
      <span>Page 1 of 1</span>
    </div>
  `

  const fullHtml = `<!DOCTYPE html><html><head><title>${title || 'Report'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#111;padding:16px}
    .ph{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #000;padding-bottom:10px}
    .pt{font-size:18px;font-weight:700}
    .ps{margin-top:4px;font-size:11px;color:#666}
    .pm{text-align:right;font-size:11px;color:#666}
    .filters{margin-top:6px;font-size:10px;color:#666}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    thead th{background:#f4f4f4;border:1px solid #ddd;padding:5px 7px;text-align:left;font-size:10px;font-weight:600;white-space:nowrap}
    tbody td{border:1px solid #eee;padding:4px 7px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
    tbody tr:nth-child(even){background:#fafafa}
    .pf{margin-top:16px;padding-top:10px;border-top:1px solid #ddd;font-size:9px;color:#999;display:flex;justify-content:space-between}
    @page{size:landscape;margin:10mm}
    @media print{body{padding:10px}}
  </style></head><body>${html}</body></html>`

  const w = window.open('', '_blank', 'width=1200,height=800')
  if (!w) return
  w.document.write(fullHtml)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

// ---------- Shared cell value resolver ----------
function resolveVal(row, col) {
  const key = col.accessorKey
  if (!key) return ''
  if (key.includes('.')) {
    return key.split('.').reduce((o, k) => o?.[k], row)
  }
  return row[key]
}

function formatCellValue(val) {
  if (val === null || val === undefined) return ''
  if (val instanceof Date) return val.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------- Internal download helper ----------
function download(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================================
// PUBLIC API — ONE function only
// ============================================================

/**
 * exportReport
 *
 * Completely generic export. Knows nothing about warehouse data.
 *
 * @param {Array<Object>}  rows     — report data rows
 * @param {Array<Object>}  columns  — DataTable-style columns [{accessorKey, label?}]
 * @param {string}         filename — download filename (no extension)
 * @param {'csv'|'xlsx'|'print'} format
 * @param {object}         [options]
 * @param {string}         [options.title]    — report title for print
 * @param {string}         [options.filters]   — applied filters string for print
 * @param {string}         [options.date]      — print date override
 */
export async function exportReport(rows, columns, filename, format, options = {}) {
  if (!rows || !rows.length) return false

  const sheetName = options.title || filename || 'Report'

  switch (format) {
    case 'csv':
      download(doCSV(rows, columns), filename + '.csv', 'text/csv;charset=utf-8;')
      return true

    case 'xlsx':
      await doXLSX(rows, columns, sheetName)
      return true

    case 'print':
      doPrint(rows, columns, { title: options.title || filename, filters: options.filters, date: options.date })
      return true

    default:
      return false
  }
}
