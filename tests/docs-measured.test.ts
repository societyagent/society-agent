import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runBatch, summarize, townComparison, valuesOf } from '../src/engine/lab'

/** The quick-start page quotes "1.4 / 2.8 / 4.5 hours". Recompute it from the engine so the page cannot drift. */
test('the "hours until half the town knows" numbers in the docs are what the engine measures', async () => {
  const page = readFileSync(join(import.meta.dirname, '..', 'src/docs/pages/start.tsx'), 'utf8')
  const m = /Measured on (\d+) random towns, news reaches half the town in about ([\d.]+) hours in a tight-knit town, ([\d.]+) in an everyday one and ([\d.]+) in an isolated one/.exec(page)
  assert.ok(m, 'the measured sentence moved or was reworded: update this test with it')
  const [, n, tight, everyday, isolated] = m
  const b = (await runBatch({ ...townComparison('water'), n: Number(n) }))!
  const mean = (i: number) => summarize(valuesOf(b.results[i], 'half')).mean
  // conditions are: 0 everyday, 1 tight-knit, 2 isolated
  assert.equal(mean(1).toFixed(1), tight, 'tight-knit town')
  assert.equal(mean(0).toFixed(1), everyday, 'everyday town')
  assert.equal(mean(2).toFixed(1), isolated, 'isolated town')
})
