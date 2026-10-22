import { TEMPLATES } from './templates'
import { dayClock, personaOf, spreadTiming, type Cfg, type Ev, type Intervention, type Metric, type State } from './world'

/**
 * The write-up of ONE saved run. Pure: the same run always gives the same document, and the page and the Markdown export both read this object,
 * so they cannot disagree. Every number comes from the run's own metrics and events.
 */
export interface RunDoc {
  title: string; question: string; news: string; axis: [string, string]
  facts: { label: string; value: string }[]
  findings: string[]
  moves: string[]
  timeline: { clock: string; text: string; kind: 'news' | 'inform' | 'shift' | 'intervene' }[]
  voices: { clock: string; text: string; stance: string }[]
  chart: { informed: number[]; opinion: number[] }
  notes: string[]
  link: string
}

const KEY_TYPES = new Set(['news', 'shift', 'intervene'])
const who = (id: number | undefined) => (id === undefined ? 'everyone' : personaOf(id)?.name ?? `Resident ${id + 1}`)

export function describeMove(m: { tick: number; iv: Intervention }): string {
  const at = dayClock(m.tick)
  return m.iv.type === 'announce' ? `${at} — public announcement: “${m.iv.text}”`
    : m.iv.type === 'whisper' ? `${at} — whisper to ${who(m.iv.agent)}: “${m.iv.text}”`
    : `${at} — ${who((m.iv as { agent?: number }).agent)} acted on their own.`
}

export function buildRunDoc(a: { cfg: Cfg; ticks: number; interventions: { tick: number; iv: Intervention }[]; st: State; metrics: Metric[]; events: Ev[]; report: string[]; link: string }): RunDoc {
  const { cfg, st, metrics, events } = a
  const tpl = TEMPLATES.find((t) => t.id === cfg.template)
  const last = metrics[metrics.length - 1]
  const timing = spreadTiming(metrics, cfg.news.startTick)
  const talks = events.filter((e) => e.type === 'say' && e.news).length
  const shifts = events.filter((e) => e.type === 'shift').length

  const facts = [
    { label: 'Residents', value: String(st.agents.length) },
    { label: 'Simulated time', value: `${(a.ticks / 6).toFixed(1)} hours (${a.ticks} steps of ten minutes)` },
    { label: 'Heard the news', value: `${Math.round((last?.informed ?? 0) * st.agents.length)} of ${st.agents.length}` },
    { label: 'Half the town knew', value: timing.half ? `${timing.half.hours.toFixed(1)} h after the news (${timing.half.clock})` : 'not reached' },
    { label: 'Everyone knew', value: timing.all ? `${timing.all.hours.toFixed(1)} h after the news (${timing.all.clock})` : 'not reached' },
    { label: 'Final opinion', value: last ? `${last.mean.toFixed(2)} on ${cfg.axis[0]} ↔ ${cfg.axis[1]} (spread ${last.spread.toFixed(2)})` : '—' },
    { label: 'News conversations', value: String(talks) },
    { label: 'Opinion shifts', value: String(shifts) },
    { label: 'Seed', value: String(cfg.seed) },
  ]
  const findings = [...a.report]
  const moves = a.interventions.length ? a.interventions.map(describeMove) : ['Nobody stepped in: this run shows how the news moves on its own.']

  const timeline = events.filter((e) => KEY_TYPES.has(e.type) || (e.type === 'inform' && e.with === undefined)).slice(0, 14)
    .map((e) => ({ clock: e.t, text: e.text, kind: e.type as RunDoc['timeline'][number]['kind'] }))
  const voices = events.filter((e) => e.type === 'say' && e.news && e.stance).filter((e, i, all) => all.findIndex((x) => x.stance === e.stance && x.agent === e.agent) === i).slice(0, 5)
    .map((e) => ({ clock: e.t, text: e.text, stance: String(e.stance) }))

  return {
    title: cfg.name, question: cfg.question || tpl?.question || '', news: cfg.news.text, axis: cfg.axis as [string, string],
    facts, findings, moves, timeline, voices,
    chart: { informed: metrics.map((m) => m.informed), opinion: metrics.map((m) => m.mean) },
    notes: [
      'This is a model of one small invented town with simple rules, not a forecast of real people. Use it to compare options and form hypotheses, not to predict.',
      `Reproducible: the same scenario, seed (${cfg.seed}) and interventions give exactly these numbers in any browser. A saved run is replayed by the server, so it cannot be edited.`,
      'Times are counted from the moment the news breaks and use the same clock as the event log and the CSV export.',
    ],
    link: a.link,
  }
}

export function runMarkdown(d: RunDoc): string {
  const L: string[] = [`# ${d.title}`, '', `> ${d.question}`, '', `**The news:** “${d.news}”`, '', '## Findings', '', ...d.findings.map((f) => `- ${f}`), '', '## At a glance', '', '| | |', '|---|---|', ...d.facts.map((f) => `| ${f.label} | ${f.value} |`), '', '## What was done', '', ...d.moves.map((m) => `- ${m}`), '', '## Key moments', '', ...d.timeline.map((t) => `- **${t.clock}** — ${t.text}`)]
  if (d.voices.length) L.push('', '## What residents said', '', ...d.voices.map((v) => `- **${v.clock}** (${v.stance}) — ${v.text}`))
  L.push('', '## How to read this', '', ...d.notes.map((n) => `- ${n}`), '', `[Open this run](${d.link})`, '')
  return L.join('\n')
}
