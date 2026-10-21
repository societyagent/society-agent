// A custom scenario in a non-default town: save -> server re-simulates -> share -> stranger replays -> identical. Also proves old saved runs still load.
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { createState, intervene, stepWorld } from '../src/engine/world'
import { buildCfg, townOf } from '../src/engine/templates'
const BASE = process.argv[2].replace(/\/$/, ''); const acct = privateKeyToAccount(generatePrivateKey())
const H = (c?: string) => ({ 'content-type': 'application/json', origin: BASE, ...(c ? { cookie: c } : {}) })
const call = async (p: string, m: string, b?: unknown, c?: string) => { const r = await fetch(BASE + p, { method: m, headers: H(c), body: b === undefined ? undefined : JSON.stringify(b) }); return { s: r.status, d: (await r.json().catch(() => ({}))) as any, sc: r.headers.get('set-cookie') ?? '' } }
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }
const ch = (await call('/api/auth/challenge', 'POST', { address: acct.address, chainId: 1 })).d
const v = await call('/api/auth/verify', 'POST', { id: ch.id, address: acct.address, signature: await acct.signMessage({ message: ch.message }) }); const cookie = v.sc.split(';')[0]

const cfg = buildCfg('custom', { seed: 4242, text: 'The harbour road will become pedestrian-only.', axis: ['Keep cars', 'Walk only'], stance: 0.5, town: townOf('suspicious'), seedRoles: ['shopkeeper', 'student'], population: 14 })
const ivs = [{ tick: 36, iv: { type: 'announce' as const, text: 'A trial period starts in spring.', stance: -0.2 } }, { tick: 50, iv: { type: 'whisper' as const, agent: 4, text: 'Parking will be kept for deliveries.', stance: -0.4 } }]
const local = createState(cfg), lm = []; let i = 0
for (let t = 0; t < 120; t++) { while (i < ivs.length && ivs[i].tick <= local.tick) intervene(local, ivs[i++].iv); lm.push(stepWorld(local).metric) }
const lastL = lm.at(-1)!

const save = await call('/api/runs', 'POST', { cfg, ticks: 120, interventions: ivs }, cookie)
ok('server accepts a custom scenario in a non-default town', save.s === 201 && !!save.d.id, `${save.s}`)
const id = save.d.id as string
const mine = await call(`/api/runs/${id}`, 'GET', undefined, cookie)
ok('stored config keeps the town, axis, news and first-to-hear roles', mine.d.cfg?.town?.trust === -0.25 && mine.d.cfg?.axis?.[0] === 'Keep cars' && mine.d.cfg?.news?.text.startsWith('The harbour') && mine.d.cfg?.news?.seedRoles?.join() === 'shopkeeper,student', JSON.stringify(mine.d.cfg?.town))
const sums = await call('/api/runs', 'GET', undefined, cookie); const row = (sums.d.runs ?? sums.d).find?.((r: any) => r.id === id)
ok('the server\'s own re-simulation equals the browser\'s (metrics are not client-supplied)', !!row && Math.abs(row.final_mean - lastL.mean) < 1e-9 && Math.abs(row.final_informed - lastL.informed) < 1e-9, `server mean ${row?.final_mean?.toFixed(4)} vs local ${lastL.mean.toFixed(4)}`)
await call(`/api/runs/${id}`, 'PATCH', { shared: true }, cookie)
const stranger = await call(`/api/runs/${id}`, 'GET')
ok('a stranger can read the shared run without signing in', stranger.s === 200 && stranger.d.shared === true && stranger.d.isOwner === false)
const rep = createState(stranger.d.cfg), rm = []; let j = 0
for (let t = 0; t < stranger.d.ticks; t++) { while (j < stranger.d.interventions.length && stranger.d.interventions[j].tick <= rep.tick) intervene(rep, stranger.d.interventions[j++].iv); rm.push(stepWorld(rep).metric) }
ok('the stranger\'s replay is IDENTICAL, metric for metric', JSON.stringify(rm) === JSON.stringify(lm))

// hostile town / roles are normalised by the server, never trusted
const evil = await call('/api/runs', 'POST', { cfg: { ...cfg, town: { trust: 99, social: -99, bias: 0.123456 }, news: { ...cfg.news, seedRoles: ['hacker', 'nurse'] } }, ticks: 60, interventions: [] }, cookie)
const evilBack = await call(`/api/runs/${evil.d.id}`, 'GET', undefined, cookie)
ok('an out-of-range town is clamped by the server', evilBack.d.cfg?.town?.trust === 0.3 && evilBack.d.cfg?.town?.social === -0.3 && evilBack.d.cfg?.town?.bias === 0.12, JSON.stringify(evilBack.d.cfg?.town))
ok('unknown first-to-hear roles are dropped', evilBack.d.cfg?.news?.seedRoles?.join() === 'nurse', evilBack.d.cfg?.news?.seedRoles?.join())
// an old-format run (no town field) still saves and replays
const legacy = { ...buildCfg('water', { seed: 99, population: 12 }) } as Record<string, unknown>
delete legacy.town // the format before towns existed
const old = await call('/api/runs', 'POST', { cfg: legacy, ticks: 60, interventions: [] }, cookie)
ok('a run saved in the old format (no town) is still accepted', old.s === 201)
for (const r of [id, evil.d.id, old.d.id]) if (r) await call(`/api/runs/${r}`, 'DELETE', undefined, cookie)
await call('/api/auth/me', 'DELETE', undefined, cookie)
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
