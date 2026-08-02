const { spawn } = require('child_process')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), override: true })

console.log('Resetting TEST database:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0])
const child = spawn(process.execPath, [path.join(__dirname, 'reset-db.js')], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code))
