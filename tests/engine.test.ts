// Engine unit tests — run with `npm test` (node:test via tsx). No network, no browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createState, intervene, stepWorld, summarize, route, costGrid, GRID_W, GRID_H, PLACES, type Cfg, type Metric, type Ev } from '../src/engine/world'
import { buildCfg, TEMPLATES } from '../src/engine/templates'
import { sanitizeCfg, sanitizeIvs, simulate } from '../functions/_lib'

const run = (cfg: Cfg, ticks: number, ivAt?: { tick: number; announce: string }) => {
  const st = createState(cfg), metrics: Metric[] = [], events: Ev[] = []
  for (let t = 0; t < ticks; t++) {
    if (ivAt && t === ivAt.tick) events.push(...intervene(st, { type: 'announce', text: ivAt.announce, stance: -0.6 }))
    const r = stepWorld(st); metrics.push(r.metric); events.push(...r.events)
  }
  return { st, metrics, events }
}
const water = (over: Partial<Parameters<typeof buildCfg>[1]> = {}) => buildCfg('water', { seed: 42, population: 12, ...over })

test('determinism: same config and seed give byte-identical runs', () => {
  const a = run(water(), 96), b = run(water(), 96)
  assert.equal(JSON.stringify(a.metrics), JSON.stringify(b.metrics))
  assert.equal(JSON.stringify(a.events), JSON.stringify(b.events))
})

test('determinism survives other simulations running in between (no shared mutable state)', () => {
  const first = JSON.stringify(run(water(), 72).metrics)
  run(water({ seed: 7 }), 72); run(buildCfg('rumor', { seed: 99 }), 72)
  assert.equal(JSON.stringify(run(water(), 72).metrics), first)
})

test('different seeds produce different histories', () => {
  assert.notEqual(JSON.stringify(run(water({ seed: 1 }), 72).metrics), JSON.stringify(run(water({ seed: 2 }), 72).metrics))
})

test('nobody knows the news before it breaks, and it spreads afterwards', () => {
  const { metrics } = run(water(), 96)
  assert.equal(metrics[0].informed, 0)
  assert.ok(metrics.at(-1)!.informed >= 0.75, `informed ${metrics.at(-1)!.informed}`)
  for (let i = 1; i < metrics.length; i++) assert.ok(metrics[i].informed >= metrics[i - 1].informed - 1e-9, 'informed fraction never decreases')
})

test('all metrics stay inside their valid ranges', () => {
  for (const t of TEMPLATES) for (const seed of [3, 11, 29]) {
    for (const m of run(buildCfg(t.id, { seed, population: 14 }), 144).metrics) {
      assert.ok(m.informed >= 0 && m.informed <= 1); assert.ok(m.mean >= -1 && m.mean <= 1); assert.ok(m.spread >= 0 && m.spread <= 2); assert.ok(Number.isFinite(m.talks))
    }
  }
})

test('an official statement calms the town compared with silence (same seed)', () => {
  const silent = run(water(), 96).metrics.at(-1)!.mean
  const spoke = run(water(), 96, { tick: 12, announce: 'Water will be restored by 6pm.' }).metrics.at(-1)!.mean
  assert.ok(spoke < silent, `statement ${spoke} vs silence ${silent}`)
})

test('an intervention is logged and does not alter anything before it happens', () => {
  const a = run(water(), 60), b = run(water(), 60, { tick: 40, announce: 'Please stay calm.' })
  assert.equal(JSON.stringify(a.metrics.slice(0, 40)), JSON.stringify(b.metrics.slice(0, 40)))
  assert.ok(b.events.some((e) => e.type === 'intervene'))
})

test('agents only ever stand on walkable cells and stay on the map', () => {
  const g = costGrid(), st = createState(water({ population: 16 }))
  for (let t = 0; t < 144; t++) {
    stepWorld(st)
    for (const a of st.agents) {
      assert.ok(a.x >= 0 && a.x < GRID_W && a.y >= 0 && a.y < GRID_H, 'on map')
      assert.ok(g[a.y * GRID_W + a.x] > 0, `agent ${a.name} walked onto a blocked cell (${a.x},${a.y}) at tick ${t}`)
    }
  }
})

test('router finds a path between every pair of places and never routes through roofs', () => {
  const g = costGrid()
  for (const from of PLACES) for (const to of PLACES) {
    const start: [number, number] = from.kind === 'park' ? [from.x + 1, from.y + 1] : [from.x + Math.floor(from.w / 2), from.y + from.h - 1]
    const goal: [number, number] = to.kind === 'park' ? [to.x + 1, to.y + 1] : [to.x + Math.floor(to.w / 2), to.y + to.h - 1]
    const p = route(start[0], start[1], goal[0], goal[1])
    assert.ok(from === to || p.length > 0, `no route ${from.id} -> ${to.id}`)
    for (const [x, y] of p) assert.ok(g[y * GRID_W + x] > 0, `route ${from.id}->${to.id} crosses a blocked cell`)
  }
})

test('the report is grounded: its numbers match the run', () => {
  const { st, metrics, events } = run(water(), 96)
  const text = summarize(st, metrics, events).join(' ')
  assert.ok(text.includes(`${st.agents.filter((a) => a.informed).length}`), 'mentions how many heard')
  assert.ok(summarize(st, metrics, events).length >= 4)
})

test('server replay equals client replay (what makes saved runs unforgeable)', () => {
  const cfg = water(), client = run(cfg, 72, { tick: 20, announce: 'Water restored by 6pm.' })
  const server = simulate(sanitizeCfg(JSON.parse(JSON.stringify(cfg)))!, 72, sanitizeIvs([{ tick: 20, iv: { type: 'announce', text: 'Water restored by 6pm.', stance: -0.6 } }])!)
  assert.equal(JSON.stringify(server.metrics), JSON.stringify(client.metrics))
})

test('input sanitising: bounds, control characters and unknown types', () => {
  const cfg = sanitizeCfg({ name: 'x'.repeat(500) + '\u0000\u0007', question: 1, population: 9999, seed: -5, axis: [1, 2], news: { text: 'ok\u0000text', stance: 99, startTick: -3, seedRoles: Array(50).fill('a'.repeat(99)) } })!
  assert.ok(cfg.name.length <= 80 && [...cfg.name].every((ch) => ch.charCodeAt(0) >= 32))
  assert.equal(cfg.population, 16); assert.ok(cfg.seed >= 0); assert.equal(cfg.news.stance, 1); assert.equal(cfg.news.startTick, 0)
  assert.ok(cfg.news.seedRoles.length <= 6 && cfg.news.seedRoles.every((r) => r.length <= 20))
  assert.equal(sanitizeCfg({ news: { text: '' } }), null)
  assert.equal(sanitizeCfg(null), null); assert.equal(sanitizeCfg('x'), null)
  assert.equal(sanitizeIvs([{ tick: 1, iv: { type: 'nuke', text: 'x' } }]), null)
  assert.equal(sanitizeIvs(Array(81).fill({ tick: 1, iv: { type: 'announce', text: 'x' } })), null) // MAX_IVS = 80
  assert.equal(sanitizeIvs([{ tick: 1, iv: { type: 'announce', text: '' } }]), null)
  assert.equal(sanitizeIvs('nope'), null)
})

/* ───────── agent minds: LLM decisions are recorded inputs; the engine stays deterministic ───────── */
const decide = (agent: number, action: 'warn' | 'reassure' | 'verify' | 'stay_quiet', stance = 0.2, text = 'Please be careful.') => ({ type: 'decide' as const, agent, action, text, stance })
const runWith = (cfg: Cfg, ticks: number, ivs: { tick: number; iv: ReturnType<typeof decide> }[]) => {
  const st = createState(cfg), metrics: Metric[] = [], events: Ev[] = []; let i = 0
  for (let t = 0; t < ticks; t++) { while (i < ivs.length && ivs[i].tick <= st.tick) events.push(...intervene(st, ivs[i++].iv)); const r = stepWorld(st); metrics.push(r.metric); events.push(...r.events) }
  return { st, metrics, events }
}
const firstInformed = (cfg: Cfg) => { const st = createState(cfg); while (!st.agents.some((a) => a.informed) && st.tick < 140) stepWorld(st); return { tick: st.tick, id: st.agents.find((a) => a.informed)!.id } }

test('minds: the same recorded decisions replay to a byte-identical run', () => {
  const cfg = water(), f = firstInformed(cfg)
  const ivs = [{ tick: f.tick + 6, iv: decide(f.id, 'warn', 0.25) }, { tick: f.tick + 20, iv: decide(f.id, 'reassure', -0.2) }]
  assert.equal(JSON.stringify(runWith(cfg, 96, ivs).metrics), JSON.stringify(runWith(cfg, 96, ivs).metrics))
})

test('minds: a decision from someone who has not heard the news does nothing', () => {
  const cfg = water(), st = createState(cfg), before = JSON.stringify(st.agents.map((a) => a.opinion))
  const evs = intervene(st, decide(0, 'warn', 0.3))
  assert.equal(evs.length, 0); assert.equal(JSON.stringify(st.agents.map((a) => a.opinion)), before)
})

test('minds: warning raises alarm and reassuring lowers it, relative to the same run without the decision', () => {
  const cfg = water(), f = firstInformed(cfg), at = f.tick + 10
  const base = runWith(cfg, 96, []).metrics.at(-1)!.mean
  const warned = runWith(cfg, 96, [{ tick: at, iv: decide(f.id, 'warn', 0.3, 'This is serious.') }]).metrics.at(-1)!.mean
  const calmed = runWith(cfg, 96, [{ tick: at, iv: decide(f.id, 'reassure', -0.3, 'It will be fine.') }]).metrics.at(-1)!.mean
  assert.ok(warned > base, `warn ${warned} should exceed baseline ${base}`)
  assert.ok(calmed < base, `reassure ${calmed} should be below baseline ${base}`)
})

test('minds: a decision is bounded — even a hostile stance cannot move opinions more than a small, fixed amount', () => {
  const cfg = water(), f = firstInformed(cfg), st = createState(cfg)
  while (st.tick < f.tick + 8) stepWorld(st)
  const speaker = st.agents[f.id], before = st.agents.map((a) => a.opinion)
  intervene(st, decide(f.id, 'warn', 99, 'x'.repeat(500)))
  for (const a of st.agents) { const d = Math.abs(a.opinion - before[a.id]); assert.ok(d <= (a.id === speaker.id ? 0.31 : 0.3), `agent ${a.id} moved ${d}`); assert.ok(a.opinion >= -1 && a.opinion <= 1) }
})

test('minds: staying quiet changes no one else', () => {
  const cfg = water(), f = firstInformed(cfg), st = createState(cfg)
  while (st.tick < f.tick + 8) stepWorld(st)
  const others = st.agents.filter((a) => a.id !== f.id).map((a) => a.opinion)
  intervene(st, decide(f.id, 'stay_quiet', 0))
  assert.equal(JSON.stringify(st.agents.filter((a) => a.id !== f.id).map((a) => a.opinion)), JSON.stringify(others))
})

test('minds: the server validates decisions strictly (unknown action, bad agent, quota)', () => {
  assert.equal(sanitizeIvs([{ tick: 3, iv: { type: 'decide', agent: 2, action: 'detonate', text: 'x', stance: 0.1 } }]), null)
  assert.equal(sanitizeIvs([{ tick: 3, iv: { type: 'decide', agent: 99, action: 'warn', text: 'x', stance: 0.1 } }]), null, 'a non-existent resident is rejected, not clamped onto a real one')
  assert.equal(sanitizeIvs([{ tick: 3, iv: { type: 'whisper', agent: -1, text: 'x', stance: 0.1 } }]), null)
  assert.equal(sanitizeIvs([{ tick: 3, iv: { type: 'decide', agent: 1.5, action: 'warn', text: 'x', stance: 0.1 } }]), null)
  const ok = sanitizeIvs([{ tick: 3, iv: { type: 'decide', agent: 15, action: 'warn', text: 'y'.repeat(900), stance: 5 } }])!
  assert.equal(ok.length, 1)
  const d = ok[0].iv as ReturnType<typeof decide>
  assert.equal(d.agent, 15); assert.ok(d.text.length <= 160); assert.equal(d.stance, 0.3)
  assert.equal(sanitizeIvs(Array.from({ length: 41 }, () => ({ tick: 1, iv: { type: 'decide', agent: 1, action: 'warn', text: 'x', stance: 0.1 } }))), null)
})

test('minds: server replay with decisions equals client replay (saved runs stay unforgeable)', () => {
  const cfg = water(), f = firstInformed(cfg)
  const raw = [{ tick: f.tick + 5, iv: decide(f.id, 'warn', 0.2, 'Stay alert.') }, { tick: f.tick + 18, iv: decide(f.id, 'verify', 0, 'Let me check.') }]
  const client = runWith(cfg, 96, raw)
  const server = simulate(sanitizeCfg(JSON.parse(JSON.stringify(cfg)))!, 96, sanitizeIvs(raw)!)
  assert.equal(JSON.stringify(server.metrics), JSON.stringify(client.metrics))
})
