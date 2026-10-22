import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { replayRun } from '../src/engine/replay'
import { buildRunDoc, runMarkdown } from '../src/engine/runReport'
import { dayClock, spreadTiming, spreaderStats } from '../src/engine/world'
import { onRequestPost as simulateAgent } from '../functions/api/agent/simulate'

const fx = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/water-main-run.json'), 'utf8'))
const run = () => replayRun(fx.cfg, fx.ticks, fx.interventions)

test('a tie for strongest spreader is reported as a tie, in a stable order (the water-main run: Paul, Ines and Hana each told 2)', () => {
  const r = run(), top = spreaderStats(r.st, r.events)
  assert.deepEqual(top.filter(([, n]) => n === top[0][1]).map(([name]) => name.split(' ')[0]).sort(), ['Hana', 'Ines', 'Paul'])
  const line = r.report.find((l) => /spreader/.test(l))!
  assert.match(line, /tied as the strongest spreaders/); assert.match(line, /each directly informing 2 people/)
  assert.doesNotMatch(line, /was the strongest spreader/)
  assert.deepEqual(spreaderStats(r.st, r.events), top, 'order does not change between calls')
})

test('a single clear leader is still named alone', () => {
  const r = run(), top = spreaderStats(r.st, r.events)
  // drop every "inform" credited to Ines and Hana, so Paul (2) stands alone
  const names = new Set(['Ines', 'Hana'])
  const trimmed = r.events.filter((e) => !(e.type === 'inform' && e.with !== undefined && names.has(r.st.agents[e.with].name.split(' ')[0])))
  const lone = spreaderStats(r.st, trimmed)
  assert.equal(lone[0][0].split(' ')[0], 'Paul'); assert.ok(lone[0][1] > (lone[1]?.[1] ?? 0), 'Paul is strictly ahead')
  assert.ok(top.length > lone.length || top[0][1] === lone[0][1])
})

test('one clock for everything: the report, the CSV rows and the event log agree to the minute', () => {
  const r = run(), t = spreadTiming(r.metrics, fx.cfg.news.startTick)
  const csvTime = (tick: number) => dayClock(tick - 1) // what the CSV export writes for row `tick`
  const halfRow = r.metrics.find((m) => m.informed >= 0.5)!, allRow = r.metrics.find((m) => m.informed >= 1)!
  assert.equal(t.half!.clock, csvTime(halfRow.tick)); assert.equal(t.all!.clock, csvTime(allRow.tick))
  assert.match(r.report[1], new RegExp(t.half!.clock.replace(/[·]/g, '·'))) // the sentence names the same clock the CSV shows
  // the first event of the step with that tick carries the same label as the CSV row
  const ev = r.events.find((e) => e.tick === halfRow.tick - 1 && e.type === 'inform')
  if (ev) assert.equal(ev.t, csvTime(halfRow.tick))
})

test('hours are counted from the moment the news breaks, like the Experiment Lab does', () => {
  const r = run(), t = spreadTiming(r.metrics, fx.cfg.news.startTick), row = r.metrics.find((m) => m.informed >= 0.5)!
  assert.equal(t.half!.hours, Math.max(0, row.tick - 1 - fx.cfg.news.startTick) / 6)
})

test('the run report is grounded in the run: every number comes from its metrics and events', () => {
  const r = run(), doc = buildRunDoc({ cfg: fx.cfg, ticks: fx.ticks, interventions: fx.interventions, ...r, link: 'https://x/r/1' })
  const last = r.metrics[r.metrics.length - 1]
  assert.equal(doc.facts.find((f) => f.label === 'Heard the news')!.value, `${Math.round(last.informed * 12)} of 12`)
  assert.equal(doc.facts.find((f) => f.label === 'Opinion shifts')!.value, String(r.events.filter((e) => e.type === 'shift').length))
  assert.equal(doc.chart.informed.length, fx.ticks); assert.equal(doc.chart.opinion.length, fx.ticks)
  assert.deepEqual(doc.findings, r.report)
  assert.ok(doc.moves[0].startsWith('Nobody stepped in'))
})

test('the report is deterministic and the Markdown is built from the same document (no drift)', () => {
  const mk = () => { const r = run(); return buildRunDoc({ cfg: fx.cfg, ticks: fx.ticks, interventions: fx.interventions, ...r, link: 'https://x/r/1' }) }
  const a = mk(), b = mk()
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  const md = runMarkdown(a)
  for (const f of a.findings) assert.ok(md.includes(f), `Markdown lacks a finding: ${f}`)
  for (const f of a.facts) assert.ok(md.includes(f.value), `Markdown lacks fact ${f.label}`)
  assert.match(md, /^# Water main break/); assert.match(md, /not a forecast of real people/)
})

test('a run with interventions lists them with the same clock as the event log', () => {
  const ivs = [{ tick: 20, iv: { type: 'announce' as const, text: 'Water will be restored by 6pm.', stance: -0.6 } }]
  const r = replayRun(fx.cfg, 72, ivs), doc = buildRunDoc({ cfg: fx.cfg, ticks: 72, interventions: ivs, ...r, link: 'l' })
  assert.match(doc.moves[0], new RegExp(dayClock(20).replace('·', '·'))); assert.match(doc.moves[0], /public announcement/)
  const logged = r.events.find((e) => e.type === 'intervene')!
  assert.ok(doc.moves[0].startsWith(logged.t), `${doc.moves[0]} vs ${logged.t}`)
})

test('the report page and its routes exist, and the simulation links to them', () => {
  const root = join(import.meta.dirname, '..')
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8'), ws = readFileSync(join(root, 'src/pages/Workspace.tsx'), 'utf8')
  assert.match(app, /\/app\/runs\/:id\/report/); assert.match(app, /\/r\/:id\/report/)
  assert.match(ws, /\/report`/); assert.match(ws, />\s*<FileText size=\{14\} \/> Report</)
})

test('the agent endpoint reports the same spreader line as the app (one implementation)', async () => {
  const res = await simulateAgent({ env: { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ count: 1 }), run: async () => ({}) }) }) } }, params: {}, request: new Request('https://x/api/agent/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cfg: fx.cfg, ticks: fx.ticks, interventions: [] }) }) } as never)
  assert.equal(res.status, 200)
  const body = await res.json() as { result: { report: string[] } }
  assert.deepEqual(body.result.report, run().report)
})
