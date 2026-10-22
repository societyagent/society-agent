import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequestPost as compareRoute } from '../functions/api/agent/compare'
import { onRequestGet as capabilities } from '../functions/api/agent/capabilities'
import { LIMITS } from '../src/engine/limits'
import { OUTCOMES } from '../src/engine/lab'
import { onRequestGet as openapiGet } from '../functions/openapi.json.ts'

/** A tiny fake D1 whose rate_limits table really counts, so the quota behaviour is tested, not assumed. */
function counterEnv() {
  const counts = new Map<string, number>()
  return { counts, DB: { prepare: () => ({ bind: (k: string) => ({ first: async () => { const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return { count: n } }, run: async () => ({}) }) }) } }
}
const call = (env: unknown, body: unknown, ip = '203.0.113.7') => compareRoute({ env, params: {}, request: new Request('https://societyagent.fun/api/agent/compare', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }) } as never)

const exp = (n: number, extra: Record<string, unknown> = {}) => ({
  template: 'water', n, outcome: 'final', ...extra,
  conds: [{ label: 'Do nothing', kind: 'none' }, { label: 'Official statement', kind: 'announce', text: 'Water will be restored by 6pm.', hour: 12, stance: -0.6 }],
})

test('a comparison returns per-option statistics and a verdict against the first option', async () => {
  const env = counterEnv(), res = await call(env, exp(12))
  assert.equal(res.status, 200)
  const out = await res.json() as { rows: { option: string; n: number }[]; findings: { option: string; versus: string; clear: boolean; headline: string }[]; towns: number; simulatedDays: number }
  assert.equal(out.towns, 12); assert.equal(out.simulatedDays, 24)
  assert.deepEqual(out.rows.map((r) => r.option), ['Do nothing', 'Official statement'])
  assert.equal(out.findings.length, 1); assert.equal(out.findings[0].versus, 'Do nothing'); assert.ok(out.findings[0].headline.length > 10)
})

test('the same request gives the same numbers (deterministic, so an agent can cite it)', async () => {
  const a = await (await call(counterEnv(), exp(12))).json(), b = await (await call(counterEnv(), exp(12))).json()
  assert.equal(JSON.stringify(a), JSON.stringify(b))
})

test('the size of a comparison is capped: asking for 200 towns x 4 options never runs more than the cap', async () => {
  const body = exp(200); (body.conds as unknown[]).push({ label: 'C', kind: 'none' }, { label: 'D', kind: 'none' })
  const res = await call(counterEnv(), body), out = await res.json() as { simulatedDays: number; towns: number }
  assert.equal(res.status, 200)
  assert.ok(out.simulatedDays <= LIMITS.agentCompare.maxSimulatedDays, `ran ${out.simulatedDays} days`)
  assert.ok(out.towns >= LIMITS.agentCompare.minTowns && out.towns <= LIMITS.agentCompare.maxTowns)
})

test('a comparison costs more quota than one run, so it cannot be used to dodge the single-run limit', async () => {
  const env = counterEnv(); await call(env, exp(30))
  const used = env.counts.get('agent:203.0.113.7')!
  assert.ok(used >= 5, `a 60-day comparison used only ${used} network credit(s)`)
})

test('once the network quota is spent the request is refused with 429, and a different network is not affected', async () => {
  const env = counterEnv(), body = exp(30)
  let refused = 0
  for (let i = 0; i < 10 && !refused; i++) { const r = await call(env, body); if (r.status === 429) refused = i + 1 }
  assert.ok(refused > 0 && refused <= 8, `never refused (limit ${LIMITS.rate.agentSimNetwork.limit}/h)`)
  assert.equal((await call(env, exp(12), '198.51.100.9')).status, 200)
})

test('bad input is rejected before any simulation runs', async () => {
  const env = counterEnv()
  for (const bad of [null, {}, { template: 'water', conds: [{ kind: 'none' }] }, { template: 'nope', conds: exp(12).conds }, { template: 'water', conds: [{ kind: 'none' }, { kind: 'announce' }] }]) {
    assert.equal((await call(env, bad)).status, 400, JSON.stringify(bad).slice(0, 60))
  }
  assert.equal(env.counts.size, 0, 'no quota was spent on invalid input')
})

test('agents can discover the comparison tool', async () => {
  const caps = await (await capabilities({ request: new Request('https://societyagent.fun/api/agent/capabilities') } as never)).json() as { tools: { name: string; path: string }[] }
  assert.ok(caps.tools.some((t) => t.name === 'compare_options' && t.path === '/api/agent/compare'))
})

test('an outcome the engine does not measure is refused, never silently replaced by another measure', async () => {
  for (const bad of ['talks', 'bogus', 'FINAL', '__proto__', 'constructor', 7, null]) {
    const res = await call(counterEnv(), exp(12, { outcome: bad }))
    assert.equal(res.status, 400, `outcome ${JSON.stringify(bad)} must be a 400, got ${res.status}`)
    const msg = (await res.json() as { error: string }).error
    assert.match(msg, /final, peak, spread, half/, 'the error names the valid outcomes')
  }
})

test('every outcome the engine measures is accepted and is the measure that comes back', async () => {
  for (const id of Object.keys(OUTCOMES)) {
    const res = await call(counterEnv(), exp(10, { outcome: id }))
    assert.equal(res.status, 200, id)
    assert.equal((await res.json() as { measure: { id: string } }).measure.id, id, `asked for ${id}, got a different measure`)
  }
  const omitted = await call(counterEnv(), (() => { const e = exp(10); delete (e as { outcome?: string }).outcome; return e })())
  assert.equal(omitted.status, 200); assert.equal((await omitted.json() as { measure: { id: string } }).measure.id, 'final', 'leaving it out still means final opinion')
})

test('the contract advertises exactly the outcomes the engine measures (OpenAPI and the MCP schema)', async () => {
  const real = Object.keys(OUTCOMES).sort()
  const spec = await (await openapiGet({ request: new Request('https://societyagent.fun/openapi.json') } as never)).json() as { paths: Record<string, { post?: { requestBody?: { content: Record<string, { schema: { properties: { outcome?: { enum: string[] } } } }> } } }> }
  const advertised = spec.paths['/api/agent/compare'].post!.requestBody!.content['application/json'].schema.properties.outcome!.enum
  assert.deepEqual([...advertised].sort(), real, 'OpenAPI promises an outcome the engine cannot measure (or hides one it can)')
  const mcp = (await import('node:fs')).readFileSync(new URL('../mcp/src/index.js', import.meta.url), 'utf8')
  const m = /outcome: z\.enum\(\[([^\]]*)\]\)/.exec(mcp)
  assert.ok(m, 'the MCP compare tool declares an outcome enum')
  assert.deepEqual(m![1].split(',').map((x) => x.trim().replace(/['"]/g, '')).sort(), real, 'the MCP schema promises an outcome the engine cannot measure')
})
