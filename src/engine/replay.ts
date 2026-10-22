import { createState, intervene, stepWorld, summarize, type Cfg, type Ev, type Intervention, type Metric } from './world'

/** Re-runs a recorded run (scenario + interventions) in the browser. Same engine as the server's replay, so the numbers match what was saved. */
export function replayRun(cfg: Cfg, ticks: number, ivs: { tick: number; iv: Intervention }[]) {
  const st = createState(cfg), metrics: Metric[] = [], events: Ev[] = []
  const sorted = [...ivs].sort((a, b) => a.tick - b.tick)
  let i = 0
  for (let t = 0; t < ticks; t++) {
    while (i < sorted.length && sorted[i].tick <= st.tick) { events.push(...intervene(st, sorted[i].iv)); i++ }
    const r = stepWorld(st); metrics.push(r.metric); events.push(...r.events)
  }
  return { st, metrics, events, report: summarize(st, metrics, events) }
}
