const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
const lines = src.split(/\r?\n/)
const out = []
for (const line of lines) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (!m) {
    out.push(line)
    continue
  }
  const key = m[1]
  const val = m[2].trim()
  if (key === 'DATABASE_URL') {
    let raw = val.replace(/^"|"$/g, '').trim()
    const qIdx = raw.indexOf('?')
    const beforeQ = qIdx === -1 ? raw : raw.slice(0, qIdx)
    const afterQ = qIdx === -1 ? '' : raw.slice(qIdx)
    const lastSlash = beforeQ.lastIndexOf('/')
    const head = beforeQ.slice(0, lastSlash + 1)
    const db = beforeQ.slice(lastSlash + 1)
    const isQuoted = /^"/.test(val)
    raw = head + (db === 'neondb' ? 'neondb_test' : db) + afterQ
    out.push(`DATABASE_URL=${isQuoted ? '"' : ''}${raw}${isQuoted ? '"' : ''}`)
  } else if (key === 'NODE_ENV') {
    out.push(`NODE_ENV="test"`)
  } else {
    out.push(line)
  }
}
fs.writeFileSync(path.join(__dirname, '..', '.env.test'), out.join('\n'))
console.log('wrote .env.test')
