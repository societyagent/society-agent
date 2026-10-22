import { LIMITS } from '../../../src/engine/limits'
import { allow, clientIp, fail, json, MAX_TICKS, readJson, sanitizeCfg, sanitizeIvs, simulate, type Ctx } from '../../_lib'

/** Public, bounded deterministic simulation. It stores nothing and never calls an AI model. */
export const onRequestPost = async (ctx: Ctx) => {
  const body = await readJson<{ cfg?: unknown; ticks?: number; interventions?: unknown }>(ctx.request)
  const cfg = sanitizeCfg(body?.cfg)
  if (!cfg) return fail(400, 'Scenario needs a news item to simulate')
  const interventions = sanitizeIvs(body?.interventions ?? [])
  if (!interventions) return fail(400, 'Invalid interventions')
  if (!(await allow(ctx.env, `agent:${clientIp(ctx.request)}`, LIMITS.rate.agentSimNetwork.limit, LIMITS.rate.agentSimNetwork.windowSec))) return fail(429, 'Too many agent simulations from this network. Try again later.')
  if (!(await allow(ctx.env, 'agent:global', LIMITS.rate.agentSimGlobal.limit, LIMITS.rate.agentSimGlobal.windowSec))) return fail(429, 'Agent simulation is busy right now. Try again later.')
  const ticks = Math.max(12, Math.min(144, MAX_TICKS, Math.round(Number(body?.ticks) || 144)))
  const { metrics, events, report } = simulate(cfg, ticks, interventions)
  const last = metrics.at(-1)!
  return json({ cfg, ticks, interventions, result: { final: { informed: last.informed, mean: last.mean, spread: last.spread, talks: last.talks }, report, metrics, events } })
}
