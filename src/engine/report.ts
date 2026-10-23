import { TEMPLATES, TOWN_PRESETS, townName } from './templates'
import { LAYOUT_META, layoutOf, personaOf, type ResidentTweak } from './world'
import { OUTCOMES, cfgFor, ivsOf, compare, encodeExperiment, fmt, hourLabel, summarize, valuesOf, verdict, type Batch, type Condition, type Experiment } from './lab'

/**
 * Report generation is pure: the same batch always yields the same document. The page renders from these same pieces,
 * and the Markdown export is built from them too, so the two can never disagree.
 */
export interface Finding { label: string; headline: string; detail: string; clear: boolean; caution?: string }
export interface Row { label: string; mean: string; ci: string; spread: string }
export interface Report {
  title: string; question: string; news: string; measure: string; towns: number; seed: number
  setup: { label: string; lines: string[] }[]
  findings: Finding[]; rows: Row[]; axis: [string, string]
  summary: string; notes: string[]
}

const tweakWords = (t: ResidentTweak) => Object.entries(t).filter(([, v]) => v).map(([k, v]) => `${(v as number) > 0 ? 'more' : 'less'} ${k === 'social' ? 'sociable' : k === 'trust' ? 'trusting' : 'leaning to the second side'} (${(v as number) > 0 ? '+' : ''}${(v as number).toFixed(1)})`).join(', ')
const resName = (id: string) => personaOf(Number(id))?.name ?? `Resident ${Number(id) + 1}`

/** Compare effective inputs, not just labels or inherited configuration. */
export function comparisonChanges(x: Experiment, c: Condition): string[] {
  const base = x.conds[0], a = cfgFor(x, 1, base), b = cfgFor(x, 1, c), changes: string[] = []
  if (JSON.stringify(ivsOf(base, x.population)) !== JSON.stringify(ivsOf(c, x.population))) {
    changes.push(base.kind === 'announce' && c.kind === 'announce' && base.hour === c.hour && base.text === c.text && base.stance !== c.stance ? 'announcement tone' : 'intervention')
  }
  if (JSON.stringify(a.town ?? {}) !== JSON.stringify(b.town ?? {})) changes.push('town character')
  if (a.layout !== b.layout) changes.push('street plan')
  if (JSON.stringify(a.residents ?? {}) !== JSON.stringify(b.residents ?? {})) changes.push('resident traits')
  return changes
}

export function describeCondition(c: Condition, x: Experiment): string[] {
  const out: string[] = []
  const name = (id: number) => personaOf(id)?.name ?? `Resident ${id + 1}`
  if (c.kind === 'none') out.push('Nobody steps in.')
  else if (c.kind === 'announce') out.push(`Public announcement at ${hourLabel(c.hour)}: “${c.text}”`)
  else out.push(`Whisper to ${name(c.agent)} at ${hourLabel(c.hour)}: “${c.text}”`)
  if (c.kind !== 'none') { const axis = x.custom?.axis ?? TEMPLATES.find((t) => t.id === x.template)!.axis; out.push(`Tone: ${c.stance < -0.2 ? `toward ${axis[0].toLowerCase()}` : c.stance > 0.2 ? `toward ${axis[1].toLowerCase()}` : 'neutral'} (${c.stance > 0 ? '+' : ''}${c.stance.toFixed(1)}).`) }
  if (c.label.trim().toLowerCase() === 'do nothing' && c.kind !== 'none') out.push('Warning: this option is named “Do nothing” but it includes an intervention.')
  const town = c.town ?? x.town, layout = c.layout ?? x.layout
  out.push(`Town: ${townName(TOWN_PRESETS.find((p) => p.id === town)?.town)} · Street plan: ${layoutOf(layout).name}`)
  const res = cfgFor(x, 1, c).residents ?? {}
  for (const [id, t] of Object.entries(res)) out.push(`${resName(id)} is ${tweakWords(t)}.`)
  return out
}

export function buildReport(b: Batch): Report {
  const x = b.x, o = OUTCOMES[x.outcome], tpl = TEMPLATES.find((t) => t.id === x.template)!
  const axis: [string, string] = x.custom?.axis ?? tpl.axis
  const base = x.conds[0]
  const findings: Finding[] = x.conds.slice(1).map((c, i) => {
    const p = compare(valuesOf(b.results[i + 1], o.id), valuesOf(b.results[0], o.id), o.minMeaningful)
    const v = verdict(c.label, base.label, p, o, axis)
    const changed = comparisonChanges(x, c)
    const caution = changed.length > 1 ? `This option changes ${changed.join(' and ')}. You cannot attribute this result to the ${c.kind === 'whisper' ? 'whisper' : 'intervention'} alone.` : undefined
    return { label: c.label, headline: v.headline, detail: v.detail, clear: v.tone === 'clear', caution }
  })
  const rows: Row[] = x.conds.map((c, i) => {
    const s = summarize(valuesOf(b.results[i], o.id))
    return { label: c.label, mean: `${fmt(s.mean, o.id)}${o.unit}`, ci: `${s.ci[0].toFixed(o.digits)} … ${s.ci[1].toFixed(o.digits)}`, spread: `${s.p10.toFixed(o.digits)} … ${s.p90.toFixed(o.digits)}` }
  })
  const clear = findings.filter((f) => f.clear)
  const summary = !findings.length ? '' : clear.length
    ? `${clear.length} of ${findings.length} option${findings.length > 1 ? 's' : ''} made a clear difference compared with “${base.label}”. ${clear.map((f) => f.headline).join(' ')}`
    : `None of the options made a difference that can be told apart from chance across ${b.seeds.length} towns, compared with “${base.label}”.`
  return {
    title: `${tpl.title}: what really changes the outcome?`, question: x.template === 'custom' ? 'How does this news spread through a town, and what shapes what people end up believing?' : tpl.question,
    news: x.text, measure: o.label, towns: b.seeds.length, seed: x.batchSeed,
    setup: x.conds.map((c) => ({ label: c.label, lines: describeCondition(c, x) })),
    findings, rows, axis, summary,
    notes: [
      `Every option used the same ${b.seeds.length} random seeds. If an option also changes town character, street plan, or resident traits, it is a different version of the town; the result cannot isolate a single cause.`,
      `“Clear difference” means the 95% range of the average difference excludes zero and is larger than ${o.minMeaningful}${o.unit.trim() ? ' ' + o.unit.trim() : ''}.`,
      'This is a model of one small invented town with simple rules, not a forecast of real people. Use it to compare options and form hypotheses, not to predict.',
      `Reproducible: the experiment link below re-runs the same towns (seed ${x.batchSeed}) and returns exactly these numbers in any browser.`,
    ],
  }
}

export function reportMarkdown(b: Batch, link: string): string {
  const r = buildReport(b), L: string[] = []
  L.push(`# ${r.title}`, '', `*${r.question}*`, '')
  L.push(`**The news:** “${r.news}”  `, `**Measured:** ${r.measure}  `, `**Towns per option:** ${r.towns}  `, `**Street plans available:** ${LAYOUT_META.map((m) => m.name).join(', ')}`, '')
  if (r.summary) L.push('## The short answer', '', r.summary, '')
  if (r.findings.length) { L.push('## Findings', ''); for (const f of r.findings) L.push(`- **${f.headline}** ${f.detail}${f.caution ? ` **Caution:** ${f.caution}` : ''}`); L.push('') }
  L.push('## Results', '', '| Option | Average | 95% range of the average | Typical towns (10th–90th) |', '| --- | --- | --- | --- |')
  for (const row of r.rows) L.push(`| ${row.label.replace(/\|/g, '\\|')} | ${row.mean} | ${row.ci} | ${row.spread} |`)
  L.push('', '## What each option was', '')
  for (const s of r.setup) { L.push(`**${s.label}**`); for (const line of s.lines) L.push(`- ${line}`); L.push('') }
  L.push('## How to read this', '', ...r.notes.map((n) => `- ${n}`), '', `[Re-run this experiment](${link})`, '')
  return L.join('\n')
}
export const reportLink = (origin: string, x: Experiment) => `${origin}/app/lab?x=${encodeExperiment(x)}`
