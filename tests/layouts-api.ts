// Village layout + a changed resident through the real server: save -> server re-simulates -> share -> stranger replays -> identical. Plus hostile input and old runs.
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { createState, intervene, stepWorld } from '../src/engine/world'
import { buildCfg } from '../src/engine/templates'
const BASE = process.argv[2].replace(/\/$/, ''); const acct = privateKeyToAccount(generatePrivateKey())
const H = (c?: string) => ({ 'content-type': 'application/json', origin: BASE, ...(c ? { cookie: c } : {}) })
const call = async (p: string, m: string, b?: unknown, c?: string) => { const r = await fetch(BASE + p, { method: m, headers: H(c), body: b === undefined ? undefined : JSON.stringify(b) }); return { s: r.status, d: (await r.json().catch(() => ({}))) as any, sc: r.headers.get('set-cookie') ?? '' } }
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }
const ch = (await call('/api/auth/challenge', 'POST', { address: acct.address, chainId: 1 })).d
const v = await call('/api/auth/verify', 'POST', { id: ch.id, address: acct.address, signature: await acct.signMessage({ message: ch.message }) }); const cookie = v.sc.split(';')[0]

const cfg = buildCfg('rumor', { seed: 2718, population: 14, layout: 'mainstreet', residents: { '8': { social: 0.4 }, '1': { trust: -0.3 } }, town: { trust: -0.25, social: 0, bias: 0 } })
const ivs = [{ tick: 40, iv: { type: 'announce' as const, text: 'There are no such plans.', stance: -0.6 } }]
const local = createState(cfg), lm = []; for (let t = 0; t < 120; t++) { if (t === 40) intervene(local, ivs[0].iv); lm.push(stepWorld(local).metric) }
const save = await call('/api/runs', 'POST', { cfg, ticks: 120, interventions: ivs }, cookie)
ok('server accepts a main-street town with two changed residents', save.s === 201 && !!save.d.id, `${save.s}`)
const id = save.d.id as string, mine = await call(`/api/runs/${id}`, 'GET', undefined, cookie)
ok('the stored config keeps the layout and both resident tweaks', mine.d.cfg?.layout === 'mainstreet' && mine.d.cfg?.residents?.['8']?.social === 0.4 && mine.d.cfg?.residents?.['1']?.trust === -0.3, JSON.stringify({ l: mine.d.cfg?.layout, r: mine.d.cfg?.residents }))
const list = await call('/api/runs', 'GET', undefined, cookie), row = (list.d.runs ?? list.d).find?.((r: any) => r.id === id)
ok('the server\'s own re-simulation equals the browser\'s', !!row && Math.abs(row.final_mean - lm.at(-1)!.mean) < 1e-9 && Math.abs(row.final_informed - lm.at(-1)!.informed) < 1e-9, `server ${row?.final_mean?.toFixed(4)} vs local ${lm.at(-1)!.mean.toFixed(4)}`)
await call(`/api/runs/${id}`, 'PATCH', { shared: true }, cookie)
const stranger = await call(`/api/runs/${id}`, 'GET')
const rep = createState(stranger.d.cfg), rm = []; let j = 0
for (let t = 0; t < stranger.d.ticks; t++) { while (j < stranger.d.interventions.length && stranger.d.interventions[j].tick <= rep.tick) intervene(rep, stranger.d.interventions[j++].iv); rm.push(stepWorld(rep).metric) }
ok('a stranger replays the shared run IDENTICALLY, metric for metric', stranger.s === 200 && JSON.stringify(rm) === JSON.stringify(lm))

const evil = await call('/api/runs', 'POST', { cfg: { ...cfg, layout: 'atlantis', residents: { '8': { social: 99 }, '99': { trust: 0.3 }, '-3': { trust: 0.3 }, 'abc': { trust: 0.3 }, '1': { trust: 0.123456 } } }, ticks: 60, interventions: [] }, cookie)
const evilBack = await call(`/api/runs/${evil.d.id}`, 'GET', undefined, cookie)
ok('an unknown layout is dropped (falls back to the classic town)', evilBack.d.cfg?.layout === undefined)
ok('resident tweaks are clamped, rounded, and out-of-range residents dropped', JSON.stringify(evilBack.d.cfg?.residents) === JSON.stringify({ '1': { trust: 0.12 }, '8': { social: 0.5 } }), JSON.stringify(evilBack.d.cfg?.residents))
const flood = await call('/api/runs', 'POST', { cfg: { ...cfg, residents: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [String(i), { trust: 0.2 }])) }, ticks: 30, interventions: [] }, cookie)
const floodBack = flood.d.id ? await call(`/api/runs/${flood.d.id}`, 'GET', undefined, cookie) : { d: { cfg: { residents: {} } } }
ok('500 resident entries cannot bloat a run (at most the real residents survive)', Object.keys(floodBack.d.cfg?.residents ?? {}).length <= 14, String(Object.keys(floodBack.d.cfg?.residents ?? {}).length))
const old = await call('/api/runs', 'POST', { cfg: { ...buildCfg('water', { seed: 7, population: 12 }) }, ticks: 60, interventions: [] }, cookie)
ok('a run in the original format (no layout, no tweaks) is still accepted', old.s === 201)
for (const r of [id, evil.d.id, flood.d.id, old.d.id]) if (r) await call(`/api/runs/${r}`, 'DELETE', undefined, cookie)
await call('/api/auth/me', 'DELETE', undefined, cookie)
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
