// Street plans, per-resident tweaks and reports.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createState, stepWorld, intervene, layoutOf, LAYOUT_IDS, LAYOUT_META, GRID_W, GRID_H, route, placeName, RESIDENT_LIMIT, type Cfg } from '../src/engine/world'
import { buildCfg } from '../src/engine/templates'
import { runBatch, layoutComparison, residentComparison, defaultExperiment, sanitizeExperiment, encodeExperiment, decodeExperiment, cfgFor, cleanResidents, compare, valuesOf, summarize, OUTCOMES } from '../src/engine/lab'
import { buildReport, reportMarkdown, describeCondition } from '../src/engine/report'
import { sanitizeCfg, simulate } from '../functions/_lib'

const run = (cfg: Cfg, ticks = 144) => { const st = createState(cfg); const m = []; for (let t = 0; t < ticks; t++) m.push(stepWorld(st).metric); return { st, m } }

test('classic layout and an empty tweak set are byte-identical to the original engine', () => {
  const plain = run(buildCfg('water', { seed: 12, population: 12 })), same = run({ ...buildCfg('water', { seed: 12, population: 12 }), layout: 'classic', residents: {} })
  assert.equal(JSON.stringify(plain.m), JSON.stringify(same.m))
  assert.equal(buildCfg('water', { layout: 'classic' }).layout, undefined, 'classic is stored as "no layout"')
})

test('every layout is valid: inside the grid, no overlaps, nothing built on a road, every place reaches every place', () => {
  for (const id of LAYOUT_IDS) {
    const L = layoutOf(id)
    assert.equal(L.places.length, 14); assert.ok(L.places.some((p) => p.id === 'hall') && L.places.some((p) => p.kind === 'park') && L.places.filter((p) => p.kind === 'home').length === 8)
    for (const p of L.places) {
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= GRID_W && p.y + p.h + 1 <= GRID_H, `${id}/${p.id} fits the grid`)
      if (p.kind !== 'park') for (let k = 0; k < p.w * p.h; k++) assert.ok(!L.isRoad(p.x + (k % p.w), p.y + Math.floor(k / p.w)), `${id}/${p.id} stands on a road`)
    }
    // buildings must not touch: at least one empty column between neighbours (and no footprint, incl. its front apron row, may overlap another)
    for (let i = 0; i < L.places.length; i++) for (let j = i + 1; j < L.places.length; j++) {
      const a = L.places[i], b = L.places[j]
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1), `${id}: ${a.id} overlaps ${b.id}`)
      const sameRows = a.y < b.y + b.h && b.y < a.y + a.h
      if (sameRows && a.kind !== 'park' && b.kind !== 'park') assert.ok(a.x + a.w < b.x || b.x + b.w < a.x, `${id}: ${a.id} and ${b.id} touch with no gap between them`)
    }
    const door = (p: (typeof L.places)[number]): [number, number] => (p.kind === 'park' ? [p.x + 1, p.y + 1] : [p.x + Math.floor(p.w / 2), p.y + p.h - 1])
    for (const from of L.places) for (const to of L.places) {
      const [sx, sy] = door(from), [tx, ty] = door(to), r = route(sx, sy, tx, ty, id)
      if (from !== to) { assert.ok(r.length > 0 && r.at(-1)![0] === tx && r.at(-1)![1] === ty, `${id}: no route ${from.id}->${to.id}`); for (const [x, y] of r) assert.ok(L.cost[y * GRID_W + x] > 0, `${id}: ${from.id}->${to.id} crosses a blocked cell`) }
    }
  }
})

test('residents only ever stand on walkable cells in every layout, for the whole day', () => {
  for (const id of LAYOUT_IDS) { const L = layoutOf(id), st = createState({ ...buildCfg('rumor', { seed: 321, population: 16 }), layout: id }); for (let t = 0; t < 144; t++) { stepWorld(st); for (const a of st.agents) assert.ok(L.cost[a.y * GRID_W + a.x] > 0, `${id}: ${a.name} on a blocked cell at tick ${t}`) } }
})

test('the street plan changes outcomes (measured, and not the same in every scenario)', async () => {
  const half = async (tpl: string, n = 60) => { const b = (await runBatch({ ...layoutComparison(tpl), n }))!; return { m: b.results.map((r) => summarize(valuesOf(r, 'half')).mean), p: [1, 2].map((i) => compare(valuesOf(b.results[i], 'half'), valuesOf(b.results[0], 'half'), OUTCOMES.half.minMeaningful)) } }
  // Measured over 60 and 120 towns: on the long main street news reaches half the town ~1 h sooner for the water and school scenarios,
  // but there is no clear difference for the rumor. The street plan matters, but how much depends on the story.
  const water = await half('water'), school = await half('school'), rumor = await half('rumor')
  assert.ok(water.p[1].clear && water.p[1].delta < -0.5, `water main street: ${JSON.stringify(water.p[1])}`)
  assert.ok(school.p[1].clear && school.p[1].delta < -0.5, `school main street: ${JSON.stringify(school.p[1])}`)
  assert.ok(!rumor.p[1].clear, 'the rumor shows no clear street-plan effect (we must not claim one)')
  assert.ok(water.m.every((v) => v > 0.5 && v < 6) && school.m.every((v) => v > 0.5 && v < 6))
  assert.equal(placeName('village', 'hall'), 'Town Hall'); assert.equal(LAYOUT_META.length, 3)
})

test('a per-resident tweak changes only that person, within bounds; the rest of the town starts identical', () => {
  const base = createState(buildCfg('water', { seed: 4 })).agents, tw = createState(buildCfg('water', { seed: 4, residents: { '8': { social: 0.4, trust: -0.2 } } })).agents
  for (let i = 0; i < base.length; i++) { if (i === 8) { assert.ok(tw[i].traits.social > base[i].traits.social && tw[i].traits.trust < base[i].traits.trust) } else assert.deepEqual(tw[i].traits, base[i].traits, `resident ${i} untouched`) }
  const extreme = createState({ ...buildCfg('water', { seed: 4 }), residents: { '0': { social: 9, trust: -9, bias: 9 } } }).agents[0].traits
  assert.ok(extreme.social <= 1 && extreme.trust >= 0.05 && extreme.bias <= 1)
  const both = createState({ ...buildCfg('water', { seed: 4 }), town: { trust: 0.25, social: 0, bias: 0 }, residents: { '2': { trust: -0.3 } } }).agents
  assert.ok(Math.abs(both[2].traits.trust - Math.max(0.05, base[2].traits.trust + 0.25 - 0.3)) < 1e-9, 'town character and personal tweak add up')
})

test('measured effect: making the official more sociable speeds the news up, in the same seeds', async () => {
  const b = (await runBatch({ ...residentComparison('water', 8, { social: 0.4 }), n: 40 }))!
  const p = compare(valuesOf(b.results[1], 'half'), valuesOf(b.results[0], 'half'), OUTCOMES.half.minMeaningful)
  assert.ok(p.clear && p.delta < -0.8, JSON.stringify(p))
})

test('a condition\'s own tweaks merge over the experiment baseline; siblings do not interfere', async () => {
  const x = { ...residentComparison('water', 8, { social: 0.4 }), residents: { '1': { trust: 0.3 } } }
  const c0 = cfgFor(x, 5, x.conds[0]), c1 = cfgFor(x, 5, x.conds[1])
  assert.deepEqual(c0.residents, { '1': { trust: 0.3 } }); assert.deepEqual(c1.residents, { '1': { trust: 0.3 }, '8': { social: 0.4 } })
  const all = (await runBatch({ ...x, n: 8 }))!, only = (await runBatch({ ...x, n: 8, conds: [x.conds[1]] }))!
  assert.equal(JSON.stringify(all.results[1].map((r) => r.final)), JSON.stringify(only.results[0].map((r) => r.final)))
})

test('validation: the server clamps and drops bad layouts and resident tweaks', () => {
  const c = sanitizeCfg({ name: 'x', population: 8, seed: 1, layout: 'atlantis', residents: { '0': { social: 9 }, '99': { trust: 0.2 }, '-1': { trust: 0.2 }, 'x': { trust: 0.2 }, '3': { trust: 0.123456, bias: 'NaN' }, '4': { trust: 0 } }, news: { text: 'a' } })!
  assert.equal(c.layout, undefined, 'unknown layout is dropped'); assert.deepEqual(c.residents, { '0': { social: RESIDENT_LIMIT }, '3': { trust: 0.12 } }, 'out-of-range ids dropped, values clamped and rounded, zeros removed')
  assert.equal(sanitizeCfg({ name: 'x', population: 8, layout: 'village', news: { text: 'a' } })!.layout, 'village'); assert.equal(sanitizeCfg({ name: 'x', layout: 'classic', news: { text: 'a' } })!.layout, undefined)
  assert.equal(cleanResidents({ '0': { social: 1 }, '20': { social: 1 } }, 12)!['20'], undefined)
  assert.equal(cleanResidents('nope', 12), undefined)
})

test('server replay equals an independent client-style replay for a village town with a changed resident', () => {
  const cfg = buildCfg('rumor', { seed: 55, population: 14, layout: 'village', residents: { '8': { social: -0.5 } } })
  const iv = { type: 'announce' as const, text: 'There are no such plans.', stance: -0.6 }
  // client path: step the engine directly, applying the announcement at tick 36
  const st = createState(cfg), client = []
  for (let t = 0; t < 96; t++) { if (t === 36) intervene(st, iv); client.push(stepWorld(st).metric) }
  // server path: config goes through the server's validation and its own replay function
  const server = simulate(sanitizeCfg(JSON.parse(JSON.stringify(cfg)))!, 96, [{ tick: 36, iv }])
  assert.equal(JSON.stringify(server.metrics), JSON.stringify(client))
  assert.equal(sanitizeCfg(JSON.parse(JSON.stringify(cfg)))!.layout, 'village')
})

test('experiment links carry layouts and tweaks, and reject tampering', () => {
  const x = { ...layoutComparison('water'), residents: { '1': { trust: 0.3 } } }; x.conds[1].residents = { '8': { social: 0.4 } }
  assert.deepStrictEqual(decodeExperiment(encodeExperiment(x)), x)
  const bad = sanitizeExperiment({ ...x, layout: 'moon', residents: { '77': { trust: 1 }, '1': { trust: 9 } }, conds: x.conds.map((c) => ({ ...c, layout: 'moon', residents: { '50': { social: 1 } } })) })!
  assert.equal(bad.layout, undefined); assert.deepEqual(bad.residents, { '1': { trust: RESIDENT_LIMIT } }); assert.ok(bad.conds.every((c) => c.layout === undefined && c.residents === undefined))
  assert.deepEqual(sanitizeExperiment({ ...defaultExperiment('water'), population: 6, residents: { '8': { trust: 0.2 }, '5': { trust: 0.2 } } })!.residents, { '5': { trust: 0.2 } }, 'a resident beyond the population is dropped')
})

test('report: built from the same data, honest wording, and Markdown that cannot be hijacked', async () => {
  const x = { ...layoutComparison('water'), n: 30 }; x.conds[1].label = 'Village | square'
  const b = (await runBatch(x))!, r = buildReport(b)
  assert.equal(r.findings.length, 2); assert.equal(r.rows.length, 3); assert.equal(r.towns, 30)
  assert.match(r.summary, /of 2 options? made a clear difference|None of the options/)
  assert.ok(r.setup.every((s) => s.lines.length >= 2) && r.setup[1].lines.some((l) => /Village square/.test(l)))
  assert.ok(r.notes.some((n) => /not a forecast of real people/.test(n)) && r.notes.some((n) => /same 30 randomly generated towns/.test(n)))
  const md = reportMarkdown(b, 'https://example.test/app/lab?x=abc')
  assert.ok(md.startsWith('# ') && md.includes('## Findings') && md.includes('| Option |') && md.includes('Village \\| square') && md.includes('[Re-run this experiment](https://example.test/app/lab?x=abc)'))
  assert.equal(JSON.stringify(buildReport(b)), JSON.stringify(r), 'a report is a pure function of its batch')
  const withTweak = (await runBatch({ ...residentComparison('water', 8, { social: 0.4 }), n: 6 }))!
  assert.ok(describeCondition(withTweak.x.conds[1], withTweak.x).some((l) => /Leila Nasser is more sociable \(\+0\.4\)/.test(l)))
})
