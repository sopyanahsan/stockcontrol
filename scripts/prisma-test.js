const { spawn } = require('child_process')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') })
const args = process.argv.slice(2)
const child = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js'), ...args], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code))
