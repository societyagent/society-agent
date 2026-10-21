import { allow, audit, fail, json, MAX_RUNS_PER_OWNER, MAX_TICKS, randomToken, readJson, sanitizeCfg, sanitizeIvs, sessionAddress, simulate, type Ctx } from '../../_lib'

/** GET /api/runs — the signed-in user's saved runs (summary only). */
export const onRequestGet = async (ctx: Ctx) => {
  const owner = await sessionAddress(ctx)
  if (!owner) return fail(401, 'Not signed in')
  const { results } = await ctx.env.DB.prepare('SELECT id, name, template, ticks, final_informed, final_mean, shared, created_at FROM runs WHERE owner = ? ORDER BY created_at DESC LIMIT 100').bind(owner).all()
  return json({ runs: results })
}

/**
 * POST /api/runs {cfg, ticks, interventions} — save a run. The server replays the deterministic
 * engine itself, so stored metrics/events/report can never be forged by the client.
 */
export const onRequestPost = async (ctx: Ctx) => {
  const owner = await sessionAddress(ctx)
  if (!owner) return fail(401, 'Not signed in')
  if (!(await allow(ctx.env, `run:${owner}`, 40, 3600))) return fail(429, 'Run limit reached. Try again later.')
  const count = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE owner = ?').bind(owner).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_RUNS_PER_OWNER) return fail(409, `You have ${MAX_RUNS_PER_OWNER} saved runs. Delete some to save new ones.`)
  const body = await readJson<{ cfg?: unknown; ticks?: number; interventions?: unknown }>(ctx.request)
  const cfg = sanitizeCfg(body?.cfg)
  if (!cfg) return fail(400, 'Scenario needs a news item to simulate')
  const ivs = sanitizeIvs(body?.interventions ?? [])
  if (!ivs) return fail(400, 'Invalid interventions')
  const ticks = Math.max(12, Math.min(MAX_TICKS, Math.round(Number(body?.ticks) || 72)))

  const { metrics, events, report } = simulate(cfg, ticks, ivs)
  const last = metrics[metrics.length - 1]
  const id = randomToken(8)
  await ctx.env.DB.prepare(
    `INSERT INTO runs (id, owner, name, template, ticks, cfg_json, ivs_json, metrics_json, events_json, report_json, final_informed, final_mean, shared, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).bind(id, owner, cfg.name, cfg.template, ticks, JSON.stringify(cfg), JSON.stringify(ivs), JSON.stringify(metrics), JSON.stringify(events), JSON.stringify(report), last.informed, last.mean, Date.now()).run()
  await audit(ctx.env, 'run_saved', owner, id)
  return json({ id }, 201)
}
