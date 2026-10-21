// Experiment Lab unit tests — statistics, pairing, determinism, link codec. Run with `npm run test:unit`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { stepWorld, createState } from '../src/engine/world'
import { buildCfg } from '../src/engine/templates'
import { OUTCOMES, bands, compare, csvCell, decodeExperiment, defaultExperiment, encodeExperiment, hourToTick, ivsOf, pickRun, quantile, runBatch, runOne, sanitizeExperiment, seedsFor, summarize, tcrit, toCsv, valuesOf, verdict, MAX_RUNS, TICKS } from '../src/engine/lab'

const small = (over: Partial<ReturnType<typeof defaultExperiment>> = {}) => ({ ...defaultExperiment('water'), n: 12, ...over })

test('time mapping: the day starts at 07:00 and a tick is ten minutes', () => {
  assert.equal(hourToTick(7), 0); assert.equal(hourToTick(8), 6); assert.equal(hourToTick(12), 30); assert.equal(hourToTick(22), 90)
})

test('t critical values match the published table', () => {
  for (const [df, want] of [[1, 12.706], [4, 2.776], [5, 2.571], [10, 2.228], [20, 2.086], [30, 2.042], [40, 2.021], [59, 2.001], [119, 1.980]] as const) assert.ok(Math.abs(tcrit(df) - want) / want < 0.002, `df ${df}: ${tcrit(df)} vs ${want}`)
})

test('summary statistics on known data', () => {
  const s = summarize([1, 2, 3, 4, 5])
  assert.equal(s.mean, 3); assert.ok(Math.abs(s.sd - 1.5811) < 1e-3); assert.equal(s.median, 3)
  assert.ok(Math.abs(s.ci[0] - (3 - 2.776 * 1.5811 / Math.sqrt(5))) < 0.02, `ci low ${s.ci[0]}`)
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5)
  assert.equal(summarize([null, null, 4]).n, 1) // missing values are dropped, not treated as zero
})

test('paired comparison: detects a real shift, ignores noise, handles missing values', () => {
  const base = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 0.3)
  const shifted = base.map((v, i) => v - 0.1 + Math.cos(i * 7) * 0.01)
  const p = compare(shifted, base, 0.02)
  assert.ok(p.clear && p.delta < -0.09 && p.delta > -0.11); assert.equal(p.lower, 40); assert.equal(p.size, 'large')
  const noise = compare(base.map((v, i) => v + Math.cos(i * 13) * 0.2), base, 0.02)
  assert.equal(noise.clear, false)
  const withNull = compare([1, null, 3], [0, 5, 2], 0); assert.equal(withNull.n, 2)
  assert.equal(compare([1], [0], 0).clear, false) // one observation can never be "clear"
})

test('a "no intervention" condition is exactly an ordinary run (no hidden side effects)', () => {
  const x = small(), cfg = buildCfg('water', { seed: 12345, population: 12 })
  const a = runOne(cfg, ivsOf(x.conds[0], 12)), st = createState(cfg); let last = 0
  for (let t = 0; t < TICKS; t++) last = stepWorld(st).metric.mean
  assert.equal(a.final, last)
})

test('common random numbers: a condition\'s results do not depend on which other conditions are in the experiment', async () => {
  const x = small(); const all = (await runBatch(x))!, only = (await runBatch({ ...x, conds: [x.conds[1]] }))!
  assert.equal(JSON.stringify(all.results[1].map((r) => [r.final, r.peak, r.spread, r.halfHours])), JSON.stringify(only.results[0].map((r) => [r.final, r.peak, r.spread, r.halfHours])))
})

test('batches are deterministic and seeds are distinct', async () => {
  const x = small(), a = (await runBatch(x))!, b = (await runBatch(x))!
  assert.equal(JSON.stringify(a.results.map((c) => c.map((r) => [r.final, r.spread, r.halfHours]))), JSON.stringify(b.results.map((c) => c.map((r) => [r.final, r.spread, r.halfHours]))))
  assert.equal(new Set(seedsFor(x.batchSeed, 200)).size, 200)
  assert.notEqual(JSON.stringify(seedsFor(1, 5)), JSON.stringify(seedsFor(2, 5)))
})

test('the water-main experiment gives the known, defensible result (statement calms the town)', async () => {
  const x = { ...defaultExperiment('water'), n: 40 }, b = (await runBatch(x))!
  const p = compare(valuesOf(b.results[1], 'final'), valuesOf(b.results[0], 'final'), OUTCOMES.final.minMeaningful)
  assert.ok(p.clear && p.delta < 0, `statement vs nothing: ${JSON.stringify(p)}`); assert.ok(p.lower >= 36, `calmer in ${p.lower}/40`)
  const v = verdict('Official statement', 'Do nothing', p, OUTCOMES.final, ['Calm', 'Alarmed'])
  assert.equal(v.tone, 'clear'); assert.match(v.headline, /more calm/)
})

test('bands and picked runs are consistent with the data', async () => {
  const b = (await runBatch(small()))!, bd = bands(b.results[0])
  assert.equal(bd.median.length, TICKS)
  for (let t = 0; t < TICKS; t++) assert.ok(bd.lo[t] <= bd.median[t] + 1e-9 && bd.median[t] <= bd.hi[t] + 1e-9)
  const lo = pickRun(b.results[1], 'low'), hi = pickRun(b.results[1], 'high')
  assert.ok(b.results[1][lo].final <= b.results[1][hi].final)
})

test('shareable links: round trip, and hostile input is rejected or bounded', () => {
  const x = defaultExperiment('rumor'), back = decodeExperiment(encodeExperiment(x))!
  assert.equal(JSON.stringify(back), JSON.stringify(x))
  assert.equal(decodeExperiment('%%%not-base64%%%'), null); assert.equal(decodeExperiment('x'.repeat(5000)), null)
  const evil = sanitizeExperiment({ template: 'water', text: 'a'.repeat(5000), population: 9999, n: 99999, batchSeed: -4, outcome: 'nope', conds: Array.from({ length: 50 }, () => ({ kind: 'announce', hour: 99, agent: 99, text: 'x'.repeat(999), stance: 77, label: 'y'.repeat(300) })) })!
  assert.equal(evil.conds.length, 4); assert.ok(evil.population === 16 && evil.text.length <= 240 && evil.outcome === 'final')
  assert.ok(evil.n * evil.conds.length <= MAX_RUNS, 'compute is bounded')
  assert.ok(evil.conds.every((c) => c.hour <= 22 && c.agent <= 15 && Math.abs(c.stance) <= 1 && c.label.length <= 40))
  assert.equal(sanitizeExperiment({ template: 'water', conds: [{ kind: 'none' }] }), null, 'needs at least two conditions')
  assert.equal(sanitizeExperiment({ template: 'nope', conds: [{ kind: 'none' }, { kind: 'none' }] }), null)
  assert.equal(sanitizeExperiment({ template: 'water', conds: [{ kind: 'none' }, { kind: 'announce', text: '' }] }), null, 'an intervention needs words')
  assert.equal(sanitizeExperiment({ template: 'water', conds: [{ kind: 'none' }, { kind: 'launch-missiles', text: 'x' }] }), null)
})

test('CSV export neutralises spreadsheet formulas and quotes properly', async () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`); assert.equal(csvCell('+1'), "'+1"); assert.equal(csvCell('plain'), 'plain'); assert.equal(csvCell('a,b'), '"a,b"')
  const x = small(); x.conds[0].label = '=cmd|calc'
  const csv = toCsv((await runBatch({ ...x, n: 3 }))!)
  assert.ok(csv.split('\n')[0].startsWith('condition,seed')); assert.ok(csv.includes("'=cmd|calc")); assert.equal(csv.split('\n').length, 1 + 3 * 3)
})
