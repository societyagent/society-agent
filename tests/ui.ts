import { chromium } from 'playwright'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
const BASE = process.argv[2]; const acct = privateKeyToAccount(generatePrivateKey())
const post = async (p: string, b: unknown) => (await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json() as Promise<any>
const ch = await post('/api/auth/challenge', { address: acct.address, chainId: 1 })
const vr = await fetch(BASE + '/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ch.id, address: acct.address, signature: await acct.signMessage({ message: ch.message }) }) })
const sess = (await vr.json()) as { token: string; address: string; expiresAt: number }
const cookiePair = (vr.headers.get('set-cookie') ?? '').split(';')[0]
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const host = new URL(BASE).hostname
await ctx.addCookies([{ name: cookiePair.split('=')[0], value: cookiePair.split('=')[1], domain: host, path: '/', httpOnly: true, secure: true, sameSite: 'Strict' }])
await ctx.addInitScript((s: unknown) => localStorage.setItem('society-agent-session-v2', JSON.stringify(s)), { address: sess.address, expiresAt: sess.expiresAt })
const p = await ctx.newPage(); const errs: string[] = []
p.on('pageerror', (e: Error) => errs.push(e.message)); p.on('console', (m: { type(): string; text(): string }) => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text().slice(0, 140)))
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }

await p.goto(BASE + '/app', { waitUntil: 'networkidle' })
ok('no credential is readable by page scripts (localStorage / document.cookie)', await p.evaluate((t: string) => !Object.values(localStorage).join('|').includes(t) && !document.cookie.includes(t), sess.token))
ok('signed-in header shows the wallet', (await p.locator('header').innerText()).includes(acct.address.slice(0, 6)))
await p.getByRole('button', { name: /Start simulation/ }).click(); await p.waitForURL('**/app/sim')
await p.getByRole('button', { name: 'Got it' }).click().catch(() => {})
await p.getByRole('button', { name: '12×' }).click()
await p.waitForTimeout(3500)
const heard = async () => Number((await p.locator('body').innerText()).match(/Heard the news\s*(\d+)%/)?.[1] ?? -1)
const h1 = await heard(); ok('simulation advances and news spreads', h1 > 0, `${h1}% after ~3.5s`)
ok('town log fills', (await p.locator('aside p.text-xs').count()) > 5)
// announcement
await p.locator('textarea').fill('Water will be restored by 6pm. No danger.')
await p.getByRole('button', { name: /^Send/ }).click(); await p.waitForTimeout(800)
ok('announcement reaches the log', (await p.locator('aside').last().innerText()).includes('Public announcement'))
// restart then run to the end
// Pause first so the check is not racing the running clock, then restart.
await p.getByRole('button', { name: 'Pause' }).click()
const before = await heard()
await p.getByRole('button', { name: 'Restart' }).click(); await p.getByRole('button', { name: 'Pause' }).click()
ok('restart resets the clock and stats', (await heard()) < before && /Day 1 · 07:/.test(await p.locator('body').innerText()), `${before}% -> ${await heard()}%`)
await p.getByRole('button', { name: /Resume|Start/ }).click()
await p.getByRole('button', { name: '12×' }).click()
await p.waitForSelector('text=What happened', { timeout: 60000 })
ok('end-of-day report appears', true)
// save + share + replay
await p.getByRole('button', { name: /Save run/ }).click(); await p.waitForSelector('text=Saved', { timeout: 15000 })
ok('run saved to the account', true)
await p.getByRole('button', { name: /Create share link/ }).click(); await p.waitForSelector('text=Stop sharing', { timeout: 15000 })
const link = await p.locator('span.truncate').first().innerText()
ok('share link created', /\/r\/[a-f0-9]{16}$/.test(link), link.replace(/^https?:\/\/[^/]+/, ''))
// replay in a fresh anonymous context
const anon = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await anon.goto(link, { waitUntil: 'networkidle' }); await anon.waitForTimeout(500)
ok('anonymous visitor can open the shared replay', (await anon.locator('body').innerText()).includes('News:'))
await anon.getByRole('button', { name: '12×' }).click(); await anon.getByRole('button', { name: /Start|Resume/ }).click().catch(() => {})
await anon.waitForSelector('text=What happened', { timeout: 60000 })
ok('replay runs to the end for a guest', true)
const a1 = (await anon.locator('body').innerText()).match(/Heard the news\s*(\d+)%/)?.[1]
const o1 = (await p.locator('body').innerText()).match(/Heard the news\s*(\d+)%/)?.[1]
ok('replay reproduces the same final result', !!a1 && a1 === o1, `guest ${a1}% vs owner ${o1}%`)
// my runs + delete
await p.goto(BASE + '/app/runs', { waitUntil: 'networkidle' })
ok('My runs lists the saved run', (await p.locator('main').innerText()).includes('informed'))
p.once('dialog', (d: { accept(): Promise<void> }) => d.accept()); await p.getByRole('button', { name: 'Delete' }).first().click(); await p.waitForTimeout(800)
ok('delete removes it', /No saved runs yet/.test(await p.locator('main').innerText()))
console.log('console/page errors:', errs.length ? errs.slice(0, 4) : 'none'); ok('no page errors', errs.length === 0)
console.log(`\n${pass} passed, ${fail} failed`)
await fetch(BASE + '/api/auth/me', { method: 'DELETE', headers: { cookie: cookiePair, origin: BASE } })
await b.close(); process.exit(fail ? 1 : 0)
