import { LIMITS } from '../../../src/engine/limits'
import { OUTCOMES, compare, runBatch, sanitizeExperiment, summarize, valuesOf, verdict } from '../../../src/engine/lab'
import { TEMPLATES } from '../../../src/engine/templates'
import { allow, clientIp, fail, json, readJson, type Ctx } from '../../_lib'

/**
 * POST /api/agent/compare: the Experiment Lab for agents. Several options are simulated in the SAME random towns and compared with a
 * paired test, so an agent gets "does this move make a clear difference, or is it chance" instead of one anecdote.
 * Public and bounded: no storage, no AI model. It counts against the agent quota once per simulated day, not once per call.
 */
export const onRequestPost = async (ctx: Ctx) => {
  const body = await readJson<Record<string, unknown>>(ctx.request)
  // sanitizeExperiment falls back to 'final' for anything it does not know, which is right for a shared lab link but wrong for an agent: asking for
  // "talks" and silently getting end-of-day opinion looks valid and is not. So an explicit, unknown outcome is an error here.
  if (body && body.outcome !== undefined && !Object.prototype.hasOwnProperty.call(OUTCOMES, String(body.outcome))) return fail(400, `Unknown outcome "${String(body.outcome).slice(0, 24)}". Use one of: ${Object.keys(OUTCOMES).join(', ')}.`)
  const x = sanitizeExperiment(body)
  if (!x) return fail(400, 'Send {template, conds: 2-4 options, n: towns}. Each option is {kind: none|announce|whisper, label, text, hour, stance}.')
  const cap = LIMITS.agentCompare
  x.n = Math.max(cap.minTowns, Math.min(cap.maxTowns, x.n))
  if (x.n * x.conds.length > cap.maxSimulatedDays) x.n = Math.max(cap.minTowns, Math.floor(cap.maxSimulatedDays / x.conds.length))
  const days = x.n * x.conds.length
  if (days > cap.maxSimulatedDays) return fail(400, `Too many simulated days (${days}). At most ${cap.maxSimulatedDays} per call: use fewer options.`)

  // a comparison costs one network credit per ten simulated days (min 1), so it cannot be used to dodge the single-run limit
  const credits = Math.max(1, Math.ceil(days / 10))
  for (let i = 0; i < credits; i++) {
    if (!(await allow(ctx.env, `agent:${clientIp(ctx.request)}`, LIMITS.rate.agentSimNetwork.limit, LIMITS.rate.agentSimNetwork.windowSec))) return fail(429, 'Too many agent simulations from this network. Try again later.')
  }
  if (!(await allow(ctx.env, 'agent:global', LIMITS.rate.agentSimGlobal.limit, LIMITS.rate.agentSimGlobal.windowSec))) return fail(429, 'Agent simulation is busy right now. Try again later.')

  const b = await runBatch(x)
  if (!b) return fail(500, 'Comparison was cancelled')
  const o = OUTCOMES[x.outcome], tpl = TEMPLATES.find((t) => t.id === x.template)!
  const axis = (x.custom?.axis ?? tpl.axis) as [string, string]
  const base = x.conds[0]
  const rows = x.conds.map((c, i) => { const s = summarize(valuesOf(b.results[i], o.id)); return { option: c.label, mean: s.mean, ci95: s.ci, p10: s.p10, p90: s.p90, n: s.n } })
  const findings = x.conds.slice(1).map((c, i) => {
    const p = compare(valuesOf(b.results[i + 1], o.id), valuesOf(b.results[0], o.id), o.minMeaningful)
    const v = verdict(c.label, base.label, p, o, axis)
    return { option: c.label, versus: base.label, clear: v.tone === 'clear', headline: v.headline, detail: v.detail, meanDifference: p.delta, townsWhereLower: p.lower, towns: p.n }
  })
  return json({
    protocol: 'society-agent/v1', measure: { id: o.id, label: o.label, unit: o.unit.trim() }, towns: b.seeds.length, simulatedDays: days, batchSeed: x.batchSeed,
    rows, findings, notes: ['Every option ran in the same random towns, so each comparison is the same town with and without the change.', 'A model of an invented town, not a forecast of real people.'],
    experiment: x,
  })
}
