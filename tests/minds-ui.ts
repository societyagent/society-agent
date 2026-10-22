// The decisive test: Agent Minds ON with the real model -> save -> share -> a stranger replays it -> identical result, and the server accepted it.
import { chromium } from 'playwright'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
const BASE = process.argv[2].replace(/\/$/, '')
const acct = privateKeyToAccount(generatePrivateKey())
const post = async (p: string, b: unknown) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return r }
const ch = await (await post('/api/auth/challenge', { address: acct.address, chainId: 1 })).json() as any
const vr = await post('/api/auth/verify', { id: ch.id, address: acct.address, signature: await acct.signMessage({ message: ch.message }) })
const sess = await vr.json() as any; const cookiePair = (vr.headers.get('set-cookie') ?? '').split(';')[0]
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addCookies([{ name: cookiePair.split('=')[0], value: cookiePair.split('=')[1], domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }])
await ctx.addInitScript((s: unknown) => localStorage.setItem('society-agent-session-v2', JSON.stringify(s)), { address: sess.address, expiresAt: sess.expiresAt })
const p = await ctx.newPage(); const errs: string[] = []
p.on('pageerror', (e: Error) => errs.push(e.message))
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }
const read = async (pg: typeof p) => { const t = await pg.locator('body').innerText(); return { heard: t.match(/Heard the news\s*(\d+)%/)?.[1], opinion: t.match(/Avg\. opinion\s*(-?\d\.\d+)/)?.[1], dis: t.match(/Disagreement\s*(\d\.\d+)/)?.[1], conv: t.match(/Conversations\s*(\d+)/)?.[1] } }

await p.goto(BASE + '/app', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: /Start simulation/ }).first().click(); await p.waitForURL('**/app/sim'); await p.getByRole('button', { name: 'Got it' }).click().catch(() => {}); await p.getByRole('button', { name: 'Begin the day' }).click()
await p.getByRole('button', { name: 'Got it' }).click().catch(() => {})
await p.getByRole('button', { name: /Agent minds off/ }).click()
ok('Agent minds toggles on', await p.getByRole('button', { name: /Agent minds on/ }).count() === 1)
await p.getByRole('button', { name: '4×' }).click()
// wait until residents have actually decided (log shows "chooses to ...")
await p.waitForSelector('text=/chooses to (warn|reassure|check|stay)/', { timeout: 90000 })
ok('a resident made a decision on their own', true)
const decisions = await p.locator('aside p', { hasText: /chooses to/ }).allInnerTexts()
console.log('   decisions in the log:'); decisions.slice(0, 4).forEach((d) => console.log('    •', d.replace(/\s+/g, ' ').slice(0, 170)))
await p.getByRole('button', { name: '12×' }).click()
await p.waitForSelector('text=What happened', { timeout: 150000 })
ok('run reaches the end of the day with minds on', true)
if (process.env.SHOT_DIR) await p.screenshot({ path: `${process.env.SHOT_DIR}/minds-end.png` })
const owner = await read(p); console.log('   owner result:', JSON.stringify(owner))

await p.getByRole('button', { name: /Save run/ }).click()
const saved = await p.waitForSelector('text=Saved', { timeout: 20000 }).then(() => true).catch(() => false)
ok('server ACCEPTED the saved run (it re-simulated the decisions and validated them)', saved)
const saveErr = await p.locator('text=/Could not|too many|invalid|Invalid/i').count()
ok('no save error shown', saveErr === 0)
await p.getByRole('button', { name: /Create share link/ }).click(); await p.waitForSelector('text=Stop sharing', { timeout: 15000 })
const link = await p.locator('span.truncate').first().innerText()

const anon = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await anon.goto(link, { waitUntil: 'networkidle' })
await anon.getByRole('button', { name: '12×' }).click(); await anon.getByRole('button', { name: /Start|Resume/ }).click().catch(() => {})
await anon.waitForSelector('text=What happened', { timeout: 150000 })
const guest = await read(anon); console.log('   guest replay :', JSON.stringify(guest))
ok('a stranger replaying the shared run gets the IDENTICAL result', JSON.stringify(guest) === JSON.stringify(owner))
const runId = link.split('/').pop()!
const rec = await (await anon.request.get(`${BASE}/api/runs/${runId}`)).json() as { interventions: { tick: number; iv: { type: string; agent?: number; action?: string } }[] }
const recorded = rec.interventions.filter((i) => i.iv.type === 'decide')
console.log('   recorded decisions served to the stranger:', JSON.stringify(recorded.map((r) => `${r.iv.agent}:${r.iv.action}@${r.tick}`)))
ok('the stranger receives the residents\' recorded decisions (served by the API, which the replay applies)', recorded.length >= Math.max(1, Math.min(decisions.length, 3)) && recorded.every((r) => ['warn', 'reassure', 'verify', 'stay_quiet'].includes(r.iv.action ?? '')), `${recorded.length} recorded vs ${decisions.length} the owner saw`)
ok('no page errors', errs.length === 0, errs[0] ?? '')
console.log(`\n${pass} passed, ${fail} failed`)
await fetch(BASE + '/api/auth/me', { method: 'DELETE', headers: { cookie: cookiePair, origin: BASE } })
await b.close(); process.exit(fail ? 1 : 0)
