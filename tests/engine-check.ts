import { createState, stepWorld, intervene, summarize, type Metric, type Ev } from '../src/engine/world'
import { buildCfg } from '../src/engine/templates'

function run(seed: number, ticks: number, iv?: boolean) {
  const st = createState(buildCfg('water', { seed }))
  const metrics: Metric[] = []; const events: Ev[] = []
  for (let i = 0; i < ticks; i++) {
    if (iv && i === 30) events.push(...intervene(st, { type: 'announce', text: 'Water will be restored by 6pm. No danger.', stance: -0.5 }))
    const r = stepWorld(st); metrics.push(r.metric); events.push(...r.events)
  }
  return { st, metrics, events }
}
const a = run(42, 72), b = run(42, 72), c = run(7, 72), d = run(42, 72, true)
console.log('deterministic:', JSON.stringify(a.metrics) === JSON.stringify(b.metrics), '| different seed differs:', JSON.stringify(a.metrics) !== JSON.stringify(c.metrics))
for (const k of [0, 5, 10, 20, 40, 71]) { const m = a.metrics[k]; console.log(`tick ${m.tick}`.padEnd(9), 'informed', (m.informed * 100).toFixed(0).padStart(3) + '%', 'mean', m.mean.toFixed(2).padStart(5), 'spread', m.spread.toFixed(2), 'talks', m.talks) }
console.log('event types:', Object.fromEntries(['news', 'say', 'inform', 'shift', 'arrive', 'intervene'].map((t) => [t, a.events.filter((e) => e.type === t).length])))
console.log('with announcement @30 -> final mean', d.metrics[71].mean.toFixed(2), 'vs without', a.metrics[71].mean.toFixed(2))
console.log('\nSAMPLE EVENTS'); for (const e of a.events.filter((e) => e.type !== 'say').slice(0, 5)) console.log(' ', e.t, e.text)
for (const e of a.events.filter((e) => e.type === 'say').slice(0, 4)) console.log(' ', e.t, e.text)
console.log('\nREPORT'); for (const l of summarize(a.st, a.metrics, a.events)) console.log(' -', l)
console.log('\nstate JSON size:', JSON.stringify(a.st).length, 'bytes; agent0 memory:', a.st.agents[0].memory.slice(0, 2))
