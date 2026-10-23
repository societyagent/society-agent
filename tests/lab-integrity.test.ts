import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultExperiment, runBatch } from '../src/engine/lab'
import { buildReport, comparisonChanges, describeCondition, reportMarkdown } from '../src/engine/report'

test('report shows the actual intervention and stance even when a condition has a misleading label', () => {
  const x = defaultExperiment('water')
  x.conds[0] = { ...x.conds[1], id: 'c1', label: 'Do nothing', stance: 0.7 }
  const lines = describeCondition(x.conds[0], x).join(' ')
  assert.match(lines, /Public announcement/)
  assert.match(lines, /Tone.*alarmed/i)
  assert.deepEqual(comparisonChanges(x, x.conds[1]), ['announcement tone'])
})

test('mixed changes are disclosed in the report rather than attributed to a whisper alone', async () => {
  const x = defaultExperiment('water'); x.n = 10
  x.conds[2].town = 'trusting'
  const b = (await runBatch(x))!, r = buildReport(b), md = reportMarkdown(b, 'https://example.org')
  assert.deepEqual(comparisonChanges(x, x.conds[2]), ['intervention', 'town character'])
  assert.match(r.findings[1].caution!, /cannot attribute.*whisper alone/i)
  assert.match(r.notes.join(' '), /same 10 random seeds.*different version of the town/i)
  assert.match(md, /cannot attribute.*whisper alone/i)
  assert.match(md, /Town: Trusting town/)
})

test('a default intervention-only comparison does not receive a mixed-changes warning', async () => {
  const x = defaultExperiment('water'); x.n = 10
  const r = buildReport((await runBatch(x))!)
  assert.deepEqual(comparisonChanges(x, x.conds[1]), ['intervention'])
  assert.equal(r.findings[0].caution, undefined)
})

test('setup lists effective resident traits after condition overrides only one field', () => {
  const x = defaultExperiment('water')
  x.residents = { '3': { trust: 0.2 } }
  x.conds[1].residents = { '3': { social: 0.4 } }
  const words = describeCondition(x.conds[1], x).join(' ')
  assert.match(words, /trusting.*0\.2/)
  assert.match(words, /sociable.*0\.4/)
})
