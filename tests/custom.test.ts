// Custom scenarios + town character: engine, validation, determinism, backward compatibility.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createState, stepWorld, intervene, ROLES, TOWN_LIMIT, type Cfg } from '../src/engine/world'
import { buildCfg, TOWN_PRESETS, townName, townOf, TEMPLATES } from '../src/engine/templates'
import { runBatch, bands, verdict, TICKS, compare, valuesOf, summarize, townComparison, customExperiment, sanitizeExperiment, encodeExperiment, decodeExperiment, cfgFor, defaultExperiment, OUTCOMES } from '../src/engine/lab'
import { sanitizeCfg, simulate } from '../functions/_lib'

const run = (cfg: Cfg, ticks = 144) => { const st = createState(cfg); const m = []; for (let t = 0; t < ticks; t++) m.push(stepWorld(st).metric); return { st, m } }

test('a town with no character is byte-identical to the original engine (old saved runs still replay)', () => {
  const a = run(buildCfg('water', { seed: 77, population: 12 })), b = run({ ...buildCfg('water', { seed: 77, population: 12 }), town: { trust: 0, social: 0, bias: 0 } })
  assert.equal(JSON.stringify(a.m), JSON.stringify(b.m)); assert.equal(JSON.stringify(a.st.agents.map((x) => x.traits)), JSON.stringify(b.st.agents.map((x) => x.traits)))
  assert.equal(townName(undefined), 'Everyday town'); assert.equal(townName({ trust: 0, social: 0, bias: 0 }), 'Everyday town')
})

test('town character shifts every resident\'s traits, within hard bounds', () => {
  const base = createState(buildCfg('water', { seed: 5 })).agents, sus = createState(buildCfg('water', { seed: 5, town: townOf('suspicious') })).agents
  for (let i = 0; i < base.length; i++) { assert.ok(sus[i].traits.trust < base[i].traits.trust + 1e-9); assert.ok(sus[i].traits.trust >= 0.05 && sus[i].traits.trust <= 0.95); assert.equal(sus[i].traits.social, base[i].traits.social) }
  const extreme = createState({ ...buildCfg('water', { seed: 5 }), town: { trust: 5, social: -5, bias: 9 } }).agents
  for (const a of extreme) { assert.ok(a.traits.trust <= 0.95 && a.traits.social >= 0.05 && a.traits.bias <= 1) }
})

test('measured effect: a tight-knit town spreads news faster than an isolated one, in the same seeds', async () => {
  const b = (await runBatch({ ...townComparison('water'), n: 40 }))!
  const p = compare(valuesOf(b.results[1], 'half'), valuesOf(b.results[2], 'half'), OUTCOMES.half.minMeaningful)
  assert.ok(p.clear && p.delta < -1, `tight vs isolated: ${JSON.stringify(p)}`)
  assert.ok(p.lower >= 26, `faster in only ${p.lower}/40 towns`) // a clear majority (sign test p<0.05); the effect varies town to town, it is not universal
})

test('measured effect: a nervous town ends the day more alarmed than an easygoing one', async () => {
  const x = { ...defaultExperiment('water'), n: 40, conds: [{ id: 'c1', label: 'Nervous', kind: 'none' as const, hour: 12, agent: 0, text: '', stance: 0, town: 'nervous' }, { id: 'c2', label: 'Easygoing', kind: 'none' as const, hour: 12, agent: 0, text: '', stance: 0, town: 'easygoing' }] }
  const b = (await runBatch(x))!
  assert.ok(summarize(valuesOf(b.results[0], 'final')).mean - summarize(valuesOf(b.results[1], 'final')).mean > 0.5)
})

test('the town of each condition is used, and is seed-paired (a condition does not depend on its siblings)', async () => {
  const x = townComparison('water'); const all = (await runBatch({ ...x, n: 12 }))!, only = (await runBatch({ ...x, n: 12, conds: [x.conds[2]] }))!
  assert.equal(JSON.stringify(all.results[2].map((r) => r.final)), JSON.stringify(only.results[0].map((r) => r.final)))
  assert.notEqual(cfgFor(x, 1, x.conds[1]).town?.social, undefined); assert.equal(cfgFor(x, 1, x.conds[0]).town, undefined)
})

test('custom scenario: author-chosen axis, news, stance and first-to-hear roles drive the run', () => {
  const cfg = buildCfg('custom', { seed: 9, text: 'The library will stay open all night.', axis: ['Against', 'In favour'], stance: -0.8, seedRoles: ['student', 'journalist'] })
  assert.deepEqual(cfg.axis, ['Against', 'In favour']); assert.equal(cfg.news.stance, -0.8); assert.deepEqual(cfg.news.seedRoles, ['student', 'journalist'])
  const st = createState(cfg); let first: string[] = []
  for (let t = 0; t < 12 && !first.length; t++) { stepWorld(st); first = st.agents.filter((a) => a.informed && a.heardFrom === 'public announcement').map((a) => a.role) }
  assert.ok(first.length > 0 && first.every((r) => ['student', 'journalist'].includes(r)), `first to hear the news itself: ${first}`)
  // Residents have their own built-in leanings (on average slightly toward the high end of the axis), so the news lean moves the town
  // RELATIVE to neutral rather than fixing the sign of the result. Measured over 60 towns: monotonic, -0.8 below +0.8 in 60/60.
  const mean = (stance: number) => { let tot = 0; for (let k = 0; k < 20; k++) { const c = buildCfg('custom', { seed: k * 7919 + 3, stance, seedRoles: ['student', 'journalist'] }); tot += run(c).m.at(-1)!.mean } return tot / 20 }
  const [lo, mid, hi] = [mean(-0.8), mean(0), mean(0.8)]
  assert.ok(lo < mid && mid < hi, `the news lean is monotonic: ${lo.toFixed(3)} < ${mid.toFixed(3)} < ${hi.toFixed(3)}`)
  const { st: end } = run(cfg)
  assert.match(String(simulate(cfg, 144, []).report.join(' ')), /Against ↔ In favour/)
  assert.ok(end.agents.length === 12)
})

test('custom scenario validation: server rejects/clamps hostile input', () => {
  const evil = sanitizeCfg({ name: 'x', question: 'q', template: 'custom', axis: ['a'.repeat(99), 'b\u0000'], population: 999, seed: 1, town: { trust: 99, social: -99, bias: 'NaN' }, news: { text: 'ok', stance: 7, startTick: 99, seedRoles: ['hacker', 'official', 'x'.repeat(50), 'nurse', 'student', 'retiree', 'teacher'] } })!
  assert.ok(evil.axis[0].length <= 24 && [...evil.axis[1]].every((ch) => ch.charCodeAt(0) >= 32)); assert.equal(evil.population, 16)
  assert.deepEqual(evil.town, { trust: TOWN_LIMIT, social: -TOWN_LIMIT, bias: 0 })
  assert.ok(evil.news.seedRoles.every((r) => (ROLES as readonly string[]).includes(r)) && evil.news.seedRoles.length <= 4, evil.news.seedRoles.join())
  assert.equal(sanitizeCfg({ name: 'x', news: { text: 'a', seedRoles: ['hacker'] } })!.news.seedRoles.length, 0, 'unknown roles are dropped, never trusted')
  assert.equal(sanitizeCfg({ template: 'custom', news: { text: '' } }), null)
  const plain = sanitizeCfg({ name: 'x', news: { text: 'a' }, town: { trust: 0, social: 0, bias: 0 } })!; assert.equal(plain.town, undefined, 'a neutral town is stored as no town')
})

test('server replay equals client replay for a custom scenario in a non-default town', () => {
  const cfg = buildCfg('custom', { seed: 31, text: 'Free bus passes for everyone.', axis: ['No', 'Yes'], town: townOf('trusting'), seedRoles: ['organizer'], stance: 0.6 })
  const ivs = [{ tick: 30, iv: { type: 'announce' as const, text: 'It is a pilot.', stance: 0 } }]
  const client = createState(cfg), cm = []; for (let t = 0; t < 96; t++) { if (t === 30) intervene(client, ivs[0].iv); cm.push(stepWorld(client).metric) }
  const server = simulate(sanitizeCfg(JSON.parse(JSON.stringify(cfg)))!, 96, ivs)
  assert.equal(JSON.stringify(server.metrics), JSON.stringify(cm))
})

test('experiment links carry the custom scenario and per-option towns, and reject tampering', () => {
  const x = customExperiment(); x.town = 'tight'; x.conds[1].town = 'suspicious'; x.custom!.axis = ['Nope', 'Yes please']
  const back = decodeExperiment(encodeExperiment(x))!
  assert.deepStrictEqual(back, x)
  const bad = sanitizeExperiment({ ...x, town: 'martian', custom: { axis: ['x'.repeat(80), 'y'], seedRoles: ['hacker', 'nurse'], stance: 55 }, conds: x.conds.map((c) => ({ ...c, town: 'mars' })) })!
  assert.equal(bad.town, undefined); assert.ok(bad.custom!.axis[0].length <= 24 && bad.custom!.seedRoles.join() === 'nurse' && bad.custom!.stance === 1); assert.ok(bad.conds.every((c) => c.town === undefined))
  assert.equal(sanitizeExperiment({ template: 'water', custom: { axis: ['a', 'b'] }, conds: x.conds })!.custom, undefined, 'only the custom template may carry a custom scenario')
  assert.ok(TOWN_PRESETS.every((p) => !p.town || ['trust', 'social', 'bias'].every((k) => Math.abs((p.town as unknown as Record<string, number>)[k]) <= TOWN_LIMIT)))
  assert.ok(TEMPLATES.some((t) => t.id === 'custom'))
})

test('the "who has heard" chart data: monotonic, 0 -> ~100%, and tight-knit towns are ahead of isolated ones at the same hour', async () => {
  const b = (await runBatch({ ...townComparison('water'), n: 30 }))!
  const [everyday, tight, isolated] = b.results.map((rs) => bands(rs, TICKS, 'informed'))
  for (const d of [everyday, tight, isolated]) {
    assert.equal(d.median[0], 0); assert.ok(d.median.at(-1)! >= 0.9)
    for (let i = 1; i < TICKS; i++) assert.ok(d.median[i] >= d.median[i - 1] - 1e-9, 'median share who heard never decreases')
  }
  const t0 = 30 // 12:00
  assert.ok(tight.median[t0] > isolated.median[t0] + 0.2, `at noon: tight-knit ${tight.median[t0]} vs isolated ${isolated.median[t0]}`)
})

test('verdict wording is honest about ties and opposite outcomes', () => {
  const v = verdict('Option', 'Base', { n: 60, delta: -1.4, ci: [-2.3, -0.5], lower: 29, higher: 18, dz: -0.4, clear: true, size: 'small' }, OUTCOMES.half, ['Calm', 'Alarmed'])
  assert.match(v.detail, /Same direction in 29 of 60 towns \(the other way in 18, no change in 13\)/)
  const clean = verdict('Option', 'Base', { n: 60, delta: -0.1, ci: [-0.12, -0.11], lower: 60, higher: 0, dz: -3, clear: true, size: 'large' }, OUTCOMES.final, ['Calm', 'Alarmed'])
  assert.doesNotMatch(clean.detail, /other way|no change/)
})

test('"not clear" is explained by its real reason: chance, or a change too small to count (never "chance" for a real small one)', () => {
  const axis = ['Calm', 'Alarmed']
  // range includes zero: genuinely cannot be told from chance
  const chance = verdict('Option', 'Base', { n: 20, delta: -0.003, ci: [-0.01, 0.004], lower: 11, higher: 9, dz: -0.1, clear: false, size: 'negligible' }, OUTCOMES.peak, axis)
  assert.equal(chance.tone, 'none'); assert.match(chance.headline, /no clear difference/); assert.match(chance.detail, /cannot separate this from chance/)
  // range excludes zero but below the meaningful size: real, small, and the text must say so
  const small = verdict('Option', 'Base', { n: 20, delta: -0.0177, ci: [-0.028, -0.007], lower: 17, higher: 3, dz: -0.7, clear: false, size: 'moderate' }, OUTCOMES.spread, axis)
  assert.equal(small.tone, 'none'); assert.match(small.headline, /real but very small/)
  assert.match(small.detail, /excludes zero/); assert.match(small.detail, /not chance/); assert.match(small.detail, /0\.02/)
  assert.doesNotMatch(small.detail, /cannot separate this from chance/, 'a real small change must never be called chance')
})

test('the real spread comparison (a noon statement, 20 towns) is the small-but-real case, and says so', async () => {
  const x = defaultExperiment('water'); x.n = 20; x.outcome = 'spread'
  const b = await runBatch(x); assert.ok(b)
  const o = OUTCOMES.spread, p = compare(valuesOf(b!.results[1], o.id), valuesOf(b!.results[0], o.id), o.minMeaningful)
  assert.ok(p.ci[1] < 0, 'the range excludes zero'); assert.ok(!p.clear, 'but it is under the meaningful size')
  assert.match(verdict('Statement', 'Do nothing', p, o, ['Calm', 'Alarmed']).detail, /not chance/)
})
