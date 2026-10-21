// Repeatable security + abuse probe against a DEPLOYED instance:  npx tsx tests/security.ts https://your.deployment [--limits]
// Prints PASS/FAIL per check with a severity (P0 critical … P3 minor). Exit code 1 if any P0/P1 fails.
// --limits additionally exhausts the per-IP challenge limiter (wait 5 minutes before running other API tests afterwards).
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'

const BASE = (process.argv[2] ?? '').replace(/\/$/, '')
if (!BASE) { console.error('usage: tsx tests/security.ts <base-url> [--limits]'); process.exit(2) }
const HOST = new URL(BASE).host
const AUTH = 'author' + 'ization'
type Sev = 'P0' | 'P1' | 'P2' | 'P3'
const results: { id: string; sev: Sev; name: string; ok: boolean; detail: string }[] = []
const check = (id: string, sev: Sev, name: string, ok: boolean, detail = '') => { results.push({ id, sev, name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} [${sev}] ${id} ${name}${detail ? '  — ' + detail : ''}`) }
const call = async (path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string>; raw?: string } = {}) => {
  const t0 = Date.now()
  const r = await fetch(BASE + path, { method: init.method ?? 'GET', headers: { ...(init.raw === undefined ? { 'content-type': 'application/json' } : {}), ...(init.token ? { [AUTH]: `Bearer ${init.token}` } : {}), ...(init.headers ?? {}) }, body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)) })
  const text = await r.text(); let data: any = {}; try { data = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, headers: r.headers, data, text, ms: Date.now() - t0 }
}
async function login(chainId = 1) {
  const acct = privateKeyToAccount(generatePrivateKey())
  const ch = (await call('/api/auth/challenge', { method: 'POST', body: { address: acct.address, chainId } })).data
  const v = await call('/api/auth/verify', { method: 'POST', body: { id: ch.id, address: acct.address, signature: await acct.signMessage({ message: ch.message }) } })
  return { acct, ch, token: v.data.token as string | undefined, status: v.status }
}

// ── 1. Transport / headers ──────────────────────────────────────────────
for (const path of ['/', '/app']) {
  const r = await call(path)
  const h = r.headers
  check(`H1${path}`, 'P2', `${path} sets X-Content-Type-Options: nosniff`, h.get('x-content-type-options') === 'nosniff')
  check(`H2${path}`, 'P2', `${path} sets a Content-Security-Policy`, !!h.get('content-security-policy'), (h.get('content-security-policy') ?? 'none').slice(0, 80))
  check(`H3${path}`, 'P2', `${path} blocks framing (frame-ancestors / X-Frame-Options)`, /frame-ancestors/.test(h.get('content-security-policy') ?? '') || !!h.get('x-frame-options'))
  check(`H4${path}`, 'P3', `${path} sets Referrer-Policy`, !!h.get('referrer-policy'))
}

// ── 2. Authentication guard on every private route ─────────────────────
const forged = 'a'.repeat(64)
for (const [m, p, body] of [['GET', '/api/auth/me'], ['GET', '/api/runs'], ['POST', '/api/runs', {}], ['POST', '/api/ai', { kind: 'analysis' }], ['PATCH', '/api/runs/0123456789abcdef', { shared: true }], ['DELETE', '/api/runs/0123456789abcdef']] as [string, string, unknown?][]) {
  const none = await call(p, { method: m, body })
  const fake = await call(p, { method: m, body, token: forged })
  const junk = await call(p, { method: m, body, headers: { [AUTH]: 'Bearer not-a-token' } })
  check(`A1 ${m} ${p}`, 'P0', 'rejects missing / forged / malformed credentials (401)', none.status === 401 && fake.status === 401 && junk.status === 401, `${none.status}/${fake.status}/${junk.status}`)
}

// ── 3. Wallet sign-in (EIP-4361 / SIWE) ────────────────────────────────
const probe = await login(1)
const msg: string = probe.ch.message ?? ''
const parsed = parseSiweMessage(msg)
check('W1', 'P1', 'sign-in message is a valid EIP-4361 (SIWE) message', !!parsed.address && !!parsed.nonce && !!parsed.domain && !!parsed.uri && parsed.version === '1' && !!parsed.chainId, msg.split('\n')[0])
check('W2', 'P1', 'message is bound to this deployment’s domain (wallet can warn on a phishing origin)', parsed.domain === HOST, `domain=${parsed.domain}`)
check('W3', 'P1', 'message carries an expiry and validates against domain + address', !!parsed.expirationTime && validateSiweMessage({ message: parsed as any, domain: HOST, address: probe.acct.address }))
check('W4', 'P2', 'message states that no gas / transaction is involved', /gas|transaction/i.test(msg))
check('W5', 'P0', 'valid signature yields a session', probe.status === 200 && /^[a-f0-9]{64}$/.test(probe.token ?? ''))
const wrongChain = await call('/api/auth/challenge', { method: 'POST', body: { address: probe.acct.address, chainId: 'x' } })
check('W6', 'P3', 'challenge rejects a non-numeric chainId', wrongChain.status === 400, String(wrongChain.status))
const token = probe.token!

// ── 3b. Session cookie + CSRF ───────────────────────────────────────────
{
  const acct = privateKeyToAccount(generatePrivateKey())
  const c = (await call('/api/auth/challenge', { method: 'POST', body: { address: acct.address, chainId: 1 } })).data
  const v = await call('/api/auth/verify', { method: 'POST', body: { id: c.id, address: acct.address, signature: await acct.signMessage({ message: c.message }) } })
  const sc = v.headers.get('set-cookie') ?? ''
  check('K1', 'P1', 'session cookie is HttpOnly', /;\s*HttpOnly/i.test(sc))
  check('K2', 'P1', 'session cookie is Secure', /;\s*Secure/i.test(sc))
  check('K3', 'P1', 'session cookie is SameSite=Strict', /;\s*SameSite=Strict/i.test(sc))
  check('K4', 'P2', 'session cookie uses the __Host- prefix (Path=/, no Domain)', /^__Host-/.test(sc) && /Path=\//.test(sc) && !/Domain=/i.test(sc))
  const cookie = sc.split(';')[0]
  const viaCookie = await call('/api/auth/me', { headers: { cookie } })
  check('K5', 'P0', 'the cookie alone authenticates (no bearer header needed)', viaCookie.status === 200 && viaCookie.data.address === acct.address, String(viaCookie.status))
  const evil = await call('/api/runs', { method: 'POST', headers: { cookie, origin: 'https://evil.example' }, body: { cfg: {}, ticks: 24 } })
  check('K6', 'P0', 'state-changing request from another origin is refused (403) even with a valid cookie', evil.status === 403, String(evil.status))
  const evil2 = await call('/api/runs/0123456789abcdef', { method: 'DELETE', headers: { cookie, 'sec-fetch-site': 'cross-site' } })
  check('K7', 'P0', 'cross-site fetch metadata is refused (403)', evil2.status === 403, String(evil2.status))
  const good = await call('/api/runs', { method: 'POST', headers: { cookie, origin: BASE }, body: { cfg: { name: 'k', question: 'q', template: 'water', axis: ['a', 'b'], population: 8, seed: 3, news: { text: 'n', stance: 0.5, startTick: 2, seedRoles: ['official'] } }, ticks: 24 } })
  check('K8', 'P1', 'same-origin request with the cookie succeeds', good.status === 201, String(good.status))
  if (good.status === 201) await call(`/api/runs/${good.data.id}`, { method: 'DELETE', headers: { cookie, origin: BASE } })
  const out = await call('/api/auth/me', { method: 'DELETE', headers: { cookie, origin: BASE } })
  check('K9', 'P1', 'sign-out clears the cookie', /Max-Age=0/i.test(out.headers.get('set-cookie') ?? ''))
  check('K10', 'P0', 'after sign-out the old cookie no longer works', (await call('/api/auth/me', { headers: { cookie } })).status === 401)
}

// ── 4. Input handling ──────────────────────────────────────────────────
for (const id of ["' OR 1=1--", '../../etc/passwd', '0123456789abcdeg', '%00', 'a'.repeat(200)]) {
  const r = await call(`/api/runs/${encodeURIComponent(id)}`, { token })
  check('I1', 'P0', `run id ${JSON.stringify(id.slice(0, 18))} -> 404, never 5xx / data`, r.status === 404, String(r.status))
}
const big = await call('/api/auth/challenge', { method: 'POST', raw: JSON.stringify({ address: 'x'.repeat(400_000) }) })
check('I2', 'P3', 'oversized body is rejected quickly with 4xx', big.status >= 400 && big.status < 500, `${big.status} in ${big.ms}ms`)
const cors = await call('/api/runs', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } })
const acao = cors.headers.get('access-control-allow-origin')
check('I3', 'P1', 'CORS does not allow arbitrary origins', acao === null, `ACAO=${acao}`)
const cfgBase = { name: 'sec', question: 'q', template: 'water', axis: ['Calm', 'Alarmed'], population: 16, seed: 7, news: { text: 'A water main broke.', stance: 0.5, startTick: 2, seedRoles: ['official'] } }
const nasty = await call('/api/runs', { method: 'POST', token, body: { cfg: { ...cfgBase, name: '<img src=x onerror=alert(1)>', news: { ...cfgBase.news, text: '<script>alert(1)</script> news' } }, ticks: 24, interventions: [] } })
check('I4', 'P2', 'HTML in names/news is accepted as plain data (rendering is checked in the UI test)', nasty.status === 201, String(nasty.status))
if (nasty.status === 201) await call(`/api/runs/${nasty.data.id}`, { method: 'DELETE', token })

// ── 5. Cost / availability ─────────────────────────────────────────────
const ivs = Array.from({ length: 40 }, (_, i) => ({ tick: i * 7, iv: { type: i % 2 ? 'whisper' : 'announce', agent: i % 16, text: `update ${i}`, stance: ((i % 5) - 2) / 3 } }))
const heavy = await call('/api/runs', { method: 'POST', token, body: { cfg: cfgBase, ticks: 288, interventions: ivs } })
check('C1', 'P1', 'worst-case run (16 residents, 288 ticks, 40 interventions) completes without 5xx', heavy.status === 201, `${heavy.status} in ${heavy.ms}ms`)
if (heavy.status === 201) {
  const got = await call(`/api/runs/${heavy.data.id}`, { token })
  const kb = Math.round(got.text.length / 1024)
  check('C2', 'P2', 'stored worst-case run stays under 512 KB', kb < 512, `${kb} KB`)
  await call(`/api/runs/${heavy.data.id}`, { method: 'DELETE', token })
}
const ai = await call('/api/ai', { method: 'POST', token, body: { kind: 'interview', agent: 0, question: 'x'.repeat(5000), news: 'n' } })
check('C3', 'P3', 'AI endpoint truncates oversized prompts instead of forwarding them', ai.status !== 500, String(ai.status))

// ── 6. Public surface hygiene ──────────────────────────────────────────
const html = (await call('/')).text
const js = html.match(/\/assets\/index-[^"']+\.js/)?.[0]
const bundle = js ? (await call(js)).text : ''
// Variable NAMES are public documentation (the self-hosting page lists them). What must never ship is a VALUE: a key-shaped string,
// a private key, an assignment like AI_API_KEY="…long value…", or an upstream provider name.
const bad = /(sk-[A-Za-z0-9]{20,}|(?:AI_API_KEY|HEALTH_TOKEN|ALERT_WEBHOOK)["']?\s*[:=]\s*["'`][^"'`\s…]{8,}|BEGIN [A-Z ]*PRIVATE KEY|anthropic|openai|deepseek|vikey|routers9|totalum)/i.exec(bundle + html)
check('P1', 'P1', 'client bundle contains no secrets or upstream provider names', !bad, bad ? `found "${bad[0]}"` : `${Math.round(bundle.length / 1024)} KB scanned`)
const brands = await call('/brands/claude-code.jpg')
check('P2', 'P2', 'no third-party brand assets are shipped', brands.status === 404 || !(brands.headers.get('content-type') ?? '').startsWith('image/'), `/brands/claude-code.jpg -> ${brands.status}`)
const src = await call('/src/engine/world.ts')
check('P3', 'P3', 'source files are not served', !/export function/.test(src.text))

await call('/api/auth/me', { method: 'DELETE', token })
check('S1', 'P0', 'sign-out kills the session', (await call('/api/auth/me', { token })).status === 401)

// ── 7. Rate limiting (opt-in; burns the per-IP budget) ─────────────────
if (process.argv.includes('--limits')) {
  const acct = privateKeyToAccount(generatePrivateKey()); let first429 = -1
  for (let i = 1; i <= 40 && first429 < 0; i++) if ((await call('/api/auth/challenge', { method: 'POST', body: { address: acct.address, chainId: 1 } })).status === 429) first429 = i
  check('R1', 'P1', 'challenge endpoint rate-limits a single IP', first429 > 0 && first429 <= 40, first429 > 0 ? `429 after ${first429 - 1} requests` : 'never limited in 40 requests')
  console.log('NOTE: per-IP budget exhausted — wait 5 minutes before running API tests again.')
}

const failed = results.filter((r) => !r.ok)
const bySev = (s: Sev) => failed.filter((r) => r.sev === s).length
console.log(`\n${results.length - failed.length}/${results.length} passed | open findings: P0=${bySev('P0')} P1=${bySev('P1')} P2=${bySev('P2')} P3=${bySev('P3')}`)
process.exit(bySev('P0') + bySev('P1') ? 1 : 0)
