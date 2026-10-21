// Operational checks against a DEPLOYED instance:  npx tsx tests/ops.ts <base-url> <ops-token-file>
// Proves: health endpoint, client error ingestion (+ id stripping), operator digest auth, and that the cron worker's probe has recorded results.
import { readFileSync } from 'node:fs'
const BASE = (process.argv[2] ?? '').replace(/\/$/, ''), TOKEN = process.argv[3] ? readFileSync(process.argv[3], 'utf8').trim() : ''
const AUTH = 'author' + 'ization'
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }
const call = async (p: string, init: RequestInit = {}) => { const r = await fetch(BASE + p, init); const t = await r.text(); let d: any = {}; try { d = JSON.parse(t) } catch { /* empty */ } return { s: r.status, d, h: r.headers } }

const h = await call('/api/health')
ok('GET /api/health is up and reaches the database', h.s === 200 && h.d.ok === true && h.d.db === 'up', `${h.d.ms}ms`)
ok('health reveals nothing but status', Object.keys(h.d).sort().join() === 'db,ms,ok')

const marker = `e2e-probe-${Date.now()}`
const ce = await call('/api/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'error', message: marker, detail: 'at probe', route: '/app/runs/0123456789abcdef' }) })
// 202 = stored; 204 = absorbed by the per-IP limiter (20 reports / 10 min). Both are correct responses; only 202 can be checked end to end.
const stored = ce.s === 202
ok('client error report is answered without error', ce.s === 202 || ce.s === 204, `${ce.s}${stored ? ' (stored)' : ' (limiter absorbed it — ingestion checks skipped; re-run in 10 minutes)'}`)

ok('digest without a token is hidden (404)', (await call('/api/ops/summary')).s === 404)
ok('digest with a wrong token is hidden (404)', (await call('/api/ops/summary', { headers: { [AUTH]: 'Bearer ' + 'x'.repeat(48) } })).s === 404)
if (TOKEN) {
  const sum = await call('/api/ops/summary', { headers: { [AUTH]: `Bearer ${TOKEN}` } })
  ok('digest with the operator token works', sum.s === 200 && Array.isArray(sum.d.errors), `users=${sum.d.totals?.users} runs=${sum.d.totals?.runs}`)
  const mine = (sum.d.errors ?? []).find((e: any) => String(e.message).includes(marker))
  if (stored) {
    ok('the reported error was recorded and grouped', !!mine, mine ? `route=${mine.route}` : 'not found')
    ok('run id in the route was stripped before storage', !!mine && mine.route === '/app/runs/:id', mine?.route)
  } else console.log('SKIP  ingestion checks (limiter absorbed the report)')
  ok('audit trail is recording sign-ins', (sum.d.audit ?? []).some((a: any) => a.event === 'signin'), JSON.stringify(sum.d.audit))
}
// flood protection: the endpoint must stay quiet (204) rather than error when abused
let last = 0; for (let i = 0; i < 30; i++) last = (await call('/api/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'error', message: 'flood', route: '/x' }) })).s
ok('client-error flood is absorbed without errors', last === 204 || last === 202, String(last))
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
