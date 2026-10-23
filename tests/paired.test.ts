import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultExperiment, runOne, seedsFor, cfgFor, ivsOf, TICKS } from '../src/engine/lab'
import { pairedAt } from '../src/engine/paired'

test('two views replay the same seeded town at the same clock with different recorded interventions', () => {
  const x = defaultExperiment('water'), at = pairedAt(x, 0, 1, 35)
  assert.equal(at.seed, seedsFor(x.batchSeed, x.n)[0])
  assert.equal(at.left.st.tick, at.right.st.tick)
  assert.equal(at.left.st.tick, 36)
  assert.equal(at.left.st.cfg.seed, at.right.st.cfg.seed)
  assert.equal(at.left.events.some((e) => e.type === 'intervene'), false)
  const after = pairedAt(x, 0, 1, 36)
  assert.equal(after.right.events.some((e) => e.type === 'intervene'), true)
  assert.equal(after.left.events.some((e) => e.type === 'intervene'), false)
})

test('the last replay frame agrees with the batch engine, and a mixed-town comparison stays honest', () => {
  const x = defaultExperiment('water'); x.conds[2].town = 'trusting'
  const at = pairedAt(x, 2, 2, TICKS - 1), seed = seedsFor(x.batchSeed, x.n)[2]
  for (const [i, side] of [at.left, at.right].entries()) {
    const cfg = cfgFor(x, seed, x.conds[i === 0 ? 0 : 2]); const result = runOne(cfg, ivsOf(x.conds[i === 0 ? 0 : 2], x.population))
    assert.equal(side.metrics.at(-1)!.mean, result.final)
  }
  assert.notDeepEqual(at.left.st.cfg.town, at.right.st.cfg.town)
})

test('a replay link cannot request an out-of-range seed, option or time', () => {
  const x = defaultExperiment('water')
  assert.throws(() => pairedAt(x, -1, 1, 10))
  assert.throws(() => pairedAt(x, 0, 0, 10))
  assert.throws(() => pairedAt(x, 0, 1, 999))
})
