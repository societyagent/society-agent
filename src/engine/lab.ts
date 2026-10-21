import { createState, intervene, stepWorld, type Cfg, type Intervention } from './world'
import { TEMPLATES, buildCfg } from './templates'

/**
 * Experiment Lab engine: run one scenario across many random towns (seeds) under several conditions, then compare.
 * Every condition is run on the SAME seeds, so differences are paired (same town, different move) — which removes most of the noise.
 * Everything here is deterministic: the same experiment code gives the same numbers in any browser and in Node.
 */

export type CondKind = 'none' | 'announce' | 'whisper'
export interface Condition { id: string; label: string; kind: CondKind; hour: number; agent: number; text: string; stance: number }
export type OutcomeId = 'final' | 'peak' | 'spread' | 'half'
export interface Experiment { template: string; text: string; population: number; n: number; batchSeed: number; outcome: OutcomeId; conds: Condition[] }

export const TICKS = 144
export const MAX_RUNS = 600 // seeds x conditions: keeps a lab run to a few seconds
export const hourToTick = (hour: number) => Math.max(0, Math.round((hour - 7) * 6)) // the day starts at 07:00, one tick = 10 minutes
export const hourLabel = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`

export const ivsOf = (c: Condition, population: number): { tick: number; iv: Intervention }[] => {
  const tick = hourToTick(c.hour)
  if (c.kind === 'announce') return [{ tick, iv: { type: 'announce', text: c.text, stance: c.stance } }]
  if (c.kind === 'whisper') return [{ tick, iv: { type: 'whisper', agent: Math.min(c.agent, population - 1), text: c.text, stance: c.stance } }]
  return []
}

/* ───────── running ───────── */
export interface RunResult { seed: number; final: number; peak: number; spread: number; halfHours: number | null; talks: number; series: Float32Array }

export function runOne(cfg: Cfg, ivs: { tick: number; iv: Intervention }[], ticks = TICKS): RunResult {
  const st = createState(cfg), series = new Float32Array(ticks)
  let i = 0, peak = -1, half: number | null = null, last = { mean: 0, spread: 0, talks: 0 }
  for (let t = 0; t < ticks; t++) {
    while (i < ivs.length && ivs[i].tick <= st.tick) { intervene(st, ivs[i].iv); i++ }
    const m = stepWorld(st).metric
    series[t] = m.mean; if (m.mean > peak) peak = m.mean
    if (half === null && m.informed >= 0.5) half = Math.max(0, t - cfg.news.startTick) / 6
    last = m
  }
  return { seed: cfg.seed, final: last.mean, peak, spread: last.spread, halfHours: half, talks: last.talks, series }
}

export const seedsFor = (batchSeed: number, n: number) => Array.from({ length: n }, (_, i) => (Math.imul(i + 1, 2654435761) ^ batchSeed) >>> 0)
export const cfgFor = (x: Experiment, seed: number): Cfg => buildCfg(x.template, { seed, text: x.text, population: x.population })

export interface Batch { x: Experiment; seeds: number[]; results: RunResult[][] } // results[condition][seedIndex]

export async function runBatch(x: Experiment, onProgress?: (done: number, total: number) => void, isCancelled?: () => boolean): Promise<Batch | null> {
  const seeds = seedsFor(x.batchSeed, x.n), results: RunResult[][] = x.conds.map(() => [])
  const total = seeds.length * x.conds.length; let done = 0
  for (let s = 0; s < seeds.length; s++) {
    for (let c = 0; c < x.conds.length; c++) { results[c].push(runOne(cfgFor(x, seeds[s]), ivsOf(x.conds[c], x.population))); done++ }
    if (s % 3 === 2) { onProgress?.(done, total); await new Promise((r) => setTimeout(r, 0)); if (isCancelled?.()) return null }
  }
  onProgress?.(total, total)
  return { x, seeds, results }
}

/* ───────── statistics ───────── */
export const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1)
export const sd = (v: number[]) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) }
export const quantile = (sorted: number[], q: number) => { if (!sorted.length) return NaN; const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo) }
/** Two-sided 95% Student-t critical values for df 1..30 (standard table); a Cornish–Fisher expansion beyond that (error < 0.1% for df > 30). */
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042]
export const tcrit = (df: number) => {
  if (df < 1) return Infinity
  if (df <= 30) return T975[Math.round(df) - 1]
  const z = 1.959964
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df)
}

export interface Summary { n: number; mean: number; sd: number; ci: [number, number]; median: number; p10: number; p90: number }
export function summarize(values: (number | null)[]): Summary {
  const v = values.filter((x): x is number => x !== null), n = v.length, m = mean(v), s = sd(v), half = n > 1 ? tcrit(n - 1) * s / Math.sqrt(n) : NaN
  const sorted = [...v].sort((a, b) => a - b)
  return { n, mean: m, sd: s, ci: [m - half, m + half], median: quantile(sorted, 0.5), p10: quantile(sorted, 0.1), p90: quantile(sorted, 0.9) }
}

export type Size = 'negligible' | 'small' | 'moderate' | 'large'
export interface Pair { n: number; delta: number; ci: [number, number]; lower: number; higher: number; dz: number; clear: boolean; size: Size }
/** Paired comparison of condition `a` against baseline `b` over the same towns. */
export function compare(a: (number | null)[], b: (number | null)[], minMeaningful: number): Pair {
  const d: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== null && b[i] !== null) d.push((a[i] as number) - (b[i] as number))
  const n = d.length, m = mean(d), s = sd(d), half = n > 1 ? tcrit(n - 1) * s / Math.sqrt(n) : NaN, dz = s > 0 ? m / s : m === 0 ? 0 : Math.sign(m) * Infinity
  const ci: [number, number] = [m - half, m + half], az = Math.abs(dz)
  return { n, delta: m, ci, lower: d.filter((x) => x < 0).length, higher: d.filter((x) => x > 0).length, dz, clear: n > 1 && (ci[0] > 0 || ci[1] < 0) && Math.abs(m) >= minMeaningful, size: az < 0.2 ? 'negligible' : az < 0.5 ? 'small' : az < 0.8 ? 'moderate' : 'large' }
}

/* ───────── outcomes ───────── */
export interface OutcomeDef { id: OutcomeId; label: string; short: string; digits: number; minMeaningful: number; get: (r: RunResult) => number | null; up: (axis: string[]) => string; down: (axis: string[]) => string; unit: string }
export const OUTCOMES: Record<OutcomeId, OutcomeDef> = {
  final: { id: 'final', label: 'Opinion at the end of the day', short: 'end-of-day opinion', digits: 2, minMeaningful: 0.02, unit: '', get: (r) => r.final, up: (a) => `more ${a[1].toLowerCase()}`, down: (a) => `more ${a[0].toLowerCase()}` },
  peak: { id: 'peak', label: 'Highest opinion reached', short: 'peak opinion', digits: 2, minMeaningful: 0.02, unit: '', get: (r) => r.peak, up: (a) => `a higher peak toward ${a[1].toLowerCase()}`, down: (a) => `a lower peak (less ${a[1].toLowerCase()})` },
  spread: { id: 'spread', label: 'Disagreement at the end of the day', short: 'disagreement', digits: 2, minMeaningful: 0.02, unit: '', get: (r) => r.spread, up: () => 'more disagreement', down: () => 'less disagreement' },
  half: { id: 'half', label: 'Hours until half the town knew', short: 'hours until half knew', digits: 1, minMeaningful: 0.25, unit: ' h', get: (r) => r.halfHours, up: () => 'slower news', down: () => 'faster news' },
}
export const valuesOf = (rs: RunResult[], o: OutcomeId) => rs.map((r) => OUTCOMES[o].get(r))
export const fmt = (v: number, o: OutcomeId) => (Number.isFinite(v) ? (v > 0 && o !== 'half' && o !== 'spread' ? '+' : '') + v.toFixed(OUTCOMES[o].digits) : '—')

/** Median / 10th / 90th percentile of the town's mean opinion at every tick. */
export function bands(rs: RunResult[], ticks = TICKS) {
  const median: number[] = [], lo: number[] = [], hi: number[] = []
  for (let t = 0; t < ticks; t++) { const col = rs.map((r) => r.series[t]).sort((a, b) => a - b); median.push(quantile(col, 0.5)); lo.push(quantile(col, 0.1)); hi.push(quantile(col, 0.9)) }
  return { median, lo, hi }
}

/** Which run to show for "watch the typical / calmest / most alarmed town": by end-of-day opinion. */
export function pickRun(rs: RunResult[], which: 'low' | 'mid' | 'high') {
  const order = rs.map((r, i) => ({ i, v: r.final })).sort((a, b) => a.v - b.v || a.i - b.i)
  return order[which === 'low' ? 0 : which === 'high' ? order.length - 1 : Math.floor((order.length - 1) / 2)].i
}

/* ───────── plain-language verdict ───────── */
export function verdict(label: string, base: string, p: Pair, o: OutcomeDef, axis: string[]): { headline: string; detail: string; tone: 'clear' | 'none' } {
  const dir = p.delta < 0 ? o.down(axis) : o.up(axis), amt = Math.abs(p.delta).toFixed(o.digits) + o.unit
  const same = p.delta < 0 ? p.lower : p.higher
  if (!p.clear) return { tone: 'none', headline: `${label}: no clear difference from “${base}”.`, detail: `Average change ${p.delta >= 0 ? '+' : '−'}${amt} (95% CI ${p.ci[0].toFixed(o.digits)} to ${p.ci[1].toFixed(o.digits)}). With ${p.n} towns the data cannot separate this from chance.` }
  return { tone: 'clear', headline: `${label}: ${dir} than “${base}” by ${amt}.`, detail: `Same direction in ${same} of ${p.n} towns · 95% CI ${p.ci[0].toFixed(o.digits)} to ${p.ci[1].toFixed(o.digits)} · ${p.size} effect.` }
}

/* ───────── defaults + shareable link ───────── */
export const DEFAULTS: Record<string, { statement: { text: string; stance: number }; whisper: { agent: number; text: string; stance: number } }> = {
  water: { statement: { text: 'Water will be restored by 6pm. There is no danger.', stance: -0.6 }, whisper: { agent: 3, text: 'I checked. It is a small leak and will be fixed today.', stance: -0.6 } },
  rumor: { statement: { text: 'The clinic is not closing. There are no such plans.', stance: -0.7 }, whisper: { agent: 3, text: 'I work there. Nobody has said anything about closing.', stance: -0.7 } },
  school: { statement: { text: 'No decision has been made. Parents will be consulted first.', stance: 0 }, whisper: { agent: 2, text: 'It is only a proposal. Nothing is decided.', stance: 0 } },
}

export function defaultExperiment(template = 'water'): Experiment {
  const d = DEFAULTS[template] ?? DEFAULTS.water, t = TEMPLATES.find((x) => x.id === template) ?? TEMPLATES[0]
  return {
    template: t.id, text: t.news.text, population: 12, n: 60, batchSeed: 20261021, outcome: 'final',
    conds: [
      { id: 'c1', label: 'Do nothing', kind: 'none', hour: 12, agent: 0, text: '', stance: 0 },
      { id: 'c2', label: 'Official statement', kind: 'announce', hour: 12, agent: 0, text: d.statement.text, stance: d.statement.stance },
      { id: 'c3', label: 'One quiet reassurance', kind: 'whisper', hour: 12, agent: d.whisper.agent, text: d.whisper.text, stance: d.whisper.stance },
    ],
  }
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d)
const str = (v: unknown, max: number) => (typeof v === 'string' ? [...v].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('').trim().slice(0, max) : '')

/** Validate anything that claims to be an experiment (a link, a saved file). Never trusts its input; bounds the compute. */
export function sanitizeExperiment(raw: unknown): Experiment | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const tpl = TEMPLATES.find((t) => t.id === r.template); if (!tpl) return null
  const conds: Condition[] = []
  for (const c of (Array.isArray(r.conds) ? r.conds : []).slice(0, 4)) {
    if (!c || typeof c !== 'object') return null
    const q = c as Record<string, unknown>
    if (!['none', 'announce', 'whisper'].includes(String(q.kind))) return null
    const kind = q.kind as CondKind, text = str(q.text, 240)
    if (kind !== 'none' && !text) return null
    conds.push({ id: `c${conds.length + 1}`, label: str(q.label, 40) || `Condition ${conds.length + 1}`, kind, hour: Math.round(num(q.hour, 8, 22, 12)), agent: Math.round(num(q.agent, 0, 15, 0)), text, stance: num(q.stance, -1, 1, 0) })
  }
  if (conds.length < 2) return null
  const n = Math.round(num(r.n, 10, 200, 60))
  const outcome = (Object.keys(OUTCOMES) as OutcomeId[]).includes(r.outcome as OutcomeId) ? (r.outcome as OutcomeId) : 'final'
  return { template: tpl.id, text: str(r.text, 240) || tpl.news.text, population: Math.round(num(r.population, 6, 16, 12)), n: Math.min(n, Math.floor(MAX_RUNS / conds.length)), batchSeed: Math.round(num(r.batchSeed, 0, 2 ** 31, 20261021)) >>> 0, outcome, conds }
}

const b64 = {
  enc: (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))),
}
export const encodeExperiment = (x: Experiment) => b64.enc(JSON.stringify(x))
export function decodeExperiment(code: string): Experiment | null {
  try { if (code.length > 4000) return null; return sanitizeExperiment(JSON.parse(b64.dec(code))) } catch { return null }
}

/** CSV with spreadsheet-formula protection for user-typed labels. */
export const csvCell = (v: string) => { const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export function toCsv(b: Batch): string {
  const rows = ['condition,seed,final_opinion,peak_opinion,final_disagreement,hours_until_half_knew,conversations']
  b.x.conds.forEach((c, ci) => b.results[ci].forEach((r) => rows.push([csvCell(c.label), r.seed, r.final.toFixed(4), r.peak.toFixed(4), r.spread.toFixed(4), r.halfHours === null ? '' : r.halfHours.toFixed(2), r.talks].join(','))))
  return rows.join('\n')
}
