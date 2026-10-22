import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GLOBAL_RULES, NETWORK_PREFIXES, abuseAlerts, dueAlerts, quotaAlerts } from '../ops/alerts'
import { LIMITS } from '../src/engine/limits'

const NOW = 1_800_000_000
const row = (k: string, count: number, ageSec = 60) => ({ k, count, window_start: NOW - ageSec })

test('the keys and limits the alerts watch are the ones the API handlers really write and enforce', () => {
  const root = join(import.meta.dirname, '..')
  const src = ['functions/api/runs/index.ts', 'functions/api/ai.ts', 'functions/api/agent/simulate.ts'].map((f) => readFileSync(join(root, f), 'utf8')).join('\n')
  for (const g of GLOBAL_RULES) assert.ok(src.includes(`'${g.prefix}'`), `no handler writes the counter ${g.prefix}`)
  for (const n of NETWORK_PREFIXES) assert.ok(src.includes('`' + n.prefix + '${'), `no handler writes per-network keys starting ${n.prefix}`)
  assert.equal(GLOBAL_RULES.find((g) => g.prefix === 'run:global')!.limit, LIMITS.rate.saveRunGlobal.limit)
  assert.equal(GLOBAL_RULES.find((g) => g.prefix === 'agent:global')!.limit, LIMITS.rate.agentSimGlobal.limit)
})

test('a quota warns at 80% and says "refused" when full; below 80% stays quiet', () => {
  const lim = LIMITS.rate.aiGlobal.limit
  assert.equal(quotaAlerts([row('ai:global', Math.floor(lim * 0.5))], NOW).length, 0)
  const warn = quotaAlerts([row('ai:global', Math.ceil(lim * 0.85))], NOW)
  assert.equal(warn.length, 1); assert.match(warn[0].text, /AI calls.*at \d+%/)
  const full = quotaAlerts([row('ai:global', lim)], NOW)
  assert.equal(full.length, 1); assert.match(full[0].text, /limit reached.*refused/)
})

test('a finished window is not pressure: an old counter never alerts', () => {
  assert.equal(quotaAlerts([row('run:global', 9999, 7200)], NOW).length, 0)
})

test('abuse needs several different networks at their cap; one heavy user is not abuse', () => {
  const cap = LIMITS.rate.saveRunNetwork.limit
  assert.equal(abuseAlerts([row('runip:1.1.1.1', cap)], NOW).length, 0)
  const many = ['a', 'b', 'c', 'd', 'e'].map((x) => row(`runip:10.0.0.${x}`, cap))
  const out = abuseAlerts(many, NOW); assert.equal(out.length, 1); assert.match(out[0].text, /5 networks/)
  assert.equal(abuseAlerts(many.map((r) => ({ ...r, count: cap - 1 })), NOW).length, 0)
})

test('the global agent counter is never mistaken for a network', () => {
  const cap = LIMITS.rate.agentSimNetwork.limit
  const rows = [row('agent:global', 9999), ...['a', 'b', 'c', 'd'].map((x) => row(`agent:2001:db8:${x}::`, cap))]
  assert.equal(abuseAlerts(rows, NOW).length, 0, '4 real networks + the global row must not reach 5')
  assert.equal(abuseAlerts([...rows, row('agent:2001:db8:e::', cap)], NOW).length, 1)
})

test('the same alert is not repeated every 15 minutes: one per cooldown, a new kind still goes out', () => {
  const a = { key: 'ai:global:warn', text: 'x' }, b = { key: 'run:global:full', text: 'y' }
  assert.deepEqual(dueAlerts([a, b], {}, NOW), [a, b])
  assert.deepEqual(dueAlerts([a, b], { [a.key]: NOW - 900 }, NOW), [b])
  assert.deepEqual(dueAlerts([a], { [a.key]: NOW - 4 * 3600 }, NOW), [a])
})

test('the ops worker runs the pressure watch on its schedule', () => {
  const w = readFileSync(join(import.meta.dirname, '..', 'ops/worker.ts'), 'utf8')
  assert.match(w, /await pressureWatch\(env\)/); assert.match(w, /alert_sent/)
})
