// Backward-compatibility guard. `tests/fixtures/golden.json` was recorded from the ORIGINAL engine (before towns, street plans, per-resident tweaks).
// Any change that alters a run made with the original settings makes this test fail, because saved and shared runs would stop replaying exactly.
// If you change the engine ON PURPOSE, bump the engine version, document it, and re-record with:  npx tsx tests/golden.test.ts --record
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createState, intervene, stepWorld } from '../src/engine/world'
import { buildCfg, TEMPLATES } from '../src/engine/templates'

const FILE = new URL('./fixtures/golden.json', import.meta.url)
function fingerprints(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of TEMPLATES) for (const seed of [1, 42, 20261021, 987654321]) for (const pop of [6, 12, 16]) {
    const st = createState(buildCfg(t.id, { seed, population: pop })), h = createHash('sha256')
    for (let k = 0; k < 144; k++) {
      if (k === 30) h.update(JSON.stringify(intervene(st, { type: 'announce', text: 'x', stance: -0.5 })))
      if (k === 50) h.update(JSON.stringify(intervene(st, { type: 'whisper', agent: 2, text: 'y', stance: 0.4 })))
      if (k === 70) h.update(JSON.stringify(intervene(st, { type: 'decide', agent: 1, action: 'warn', text: 'z', stance: 0.2 })))
      const r = stepWorld(st); h.update(JSON.stringify(r.metric)); h.update(JSON.stringify(r.events))
    }
    h.update(JSON.stringify(st.agents.map((a) => [a.id, a.name, a.x, a.y, a.opinion, a.informed, a.heardAt, a.memory, a.traits, a.stubborn])))
    out[`${t.id}/${seed}/${pop}`] = h.digest('hex').slice(0, 20)
  }
  return out
}

if (process.argv.includes('--record')) { const f = fingerprints(); writeFileSync(FILE, JSON.stringify(f, null, 1) + '\n'); console.log('recorded', Object.keys(f).length, 'fingerprints') }
else test('36 full runs made with the original settings replay byte-for-byte (saved and shared runs stay valid)', () => {
  const want = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>, got = fingerprints()
  assert.equal(Object.keys(want).length, 36)
  const bad = Object.keys(want).filter((k) => want[k] !== got[k])
  assert.deepEqual(bad, [], `engine output changed for: ${bad.slice(0, 5).join(', ')}`)
})
