import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { replayRun } from '../src/engine/replay'
import { newsTrail } from '../src/engine/trail'
import { buildCfg } from '../src/engine/templates'

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/water-main-run.json'), 'utf8'))

test('a news trail follows actual first-hearing events from source to resident, with their recorded clocks', () => {
  const { events, st } = replayRun(fixture.cfg, fixture.ticks, fixture.interventions)
  const target = events.find((e) => e.type === 'inform' && e.with !== undefined)!
  const trail = newsTrail(events, target.agent!)
  assert.ok(trail.length >= 2)
  assert.equal(trail.at(-1), target)
  assert.equal(trail[0].with, undefined)
  for (let i = 1; i < trail.length; i++) {
    assert.equal(trail[i].with, trail[i - 1].agent)
    assert.ok(trail[i].tick >= trail[i - 1].tick)
    assert.equal(st.agents[trail[i].agent!].heardAt, trail[i].tick)
  }
  assert.deepEqual(newsTrail(events, target.agent!), trail)
})

test('a direct whisper is traceable even though it does not emit an inform event', () => {
  const cfg = buildCfg('water', { seed: 42 })
  const { events } = replayRun(cfg, 4, [{ tick: 0, iv: { type: 'whisper', agent: 6, text: 'A quiet note', stance: -0.5 } }])
  const trail = newsTrail(events, 6)
  assert.equal(trail.length, 1)
  assert.match(trail[0].text, /Whispered to/)
  assert.deepEqual(newsTrail(events, 7), [])
})
