import fs from 'node:fs'

const adapter = fs.readFileSync(new URL('./greennodeAdapter.js', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../../../server/server.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../../../vite.config.js', import.meta.url), 'utf8')
const rootPkg = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))

const checks = [
  ['frontend uses same-origin AI API', adapter.includes("'/api/ai/query-plan'") && !adapter.includes('localhost:3001/api/ai/query-plan')],
  ['server uses runtime PORT', server.includes('process.env.PORT || 8080')],
  ['server binds 0.0.0.0 by default', server.includes("process.env.HOST || '0.0.0.0'")],
  ['server serves Vite dist', server.includes('express.static(DIST_DIR)')],
  ['health endpoint exists', server.includes("app.get('/health'" )],
  ['GreenNode timeout exists', server.includes('GREENNODE_TIMEOUT_MS') && server.includes('AbortController')],
  ['GreenNode API key stays server-side', server.includes('process.env.GREENNODE_API_KEY') && !adapter.includes('GREENNODE_API_KEY')],
  ['Vite dev proxy routes API', vite.includes("'/api': 'http://127.0.0.1:8080'")],
  ['production start script exists', rootPkg.scripts?.start === 'node server/server.js'],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`)
  if (!ok) failed += 1
}
console.log(`PRODUCTION PREFLIGHT: ${checks.length - failed}/${checks.length} passed.`)
if (failed) process.exitCode = 1
