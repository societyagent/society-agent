import { audit, fail, json, readJson, sessionAddress, type Ctx } from '../../_lib'

const row = (ctx: Ctx) => ctx.env.DB.prepare('SELECT * FROM runs WHERE id = ?').bind(String(ctx.params.id))
interface RunRow { id: string; owner: string; name: string; template: string; ticks: number; shared: number; created_at: number; cfg_json: string; ivs_json: string; metrics_json: string; events_json: string; report_json: string }
const parse = (r: RunRow) => ({
  id: r.id, name: r.name, template: r.template, ticks: r.ticks, shared: !!r.shared, createdAt: r.created_at,
  cfg: JSON.parse(r.cfg_json), interventions: JSON.parse(r.ivs_json), metrics: JSON.parse(r.metrics_json), events: JSON.parse(r.events_json), report: JSON.parse(r.report_json),
})

/** GET /api/runs/:id — owner always; anyone else only when the run is shared. Wallet address is never exposed. */
export const onRequestGet = async (ctx: Ctx) => {
  if (!/^[a-f0-9]{16}$/.test(String(ctx.params.id))) return fail(404, 'Run not found')
  const r = await row(ctx).first<RunRow>()
  if (!r) return fail(404, 'Run not found')
  const me = await sessionAddress(ctx)
  const isOwner = me !== null && me === r.owner
  if (!isOwner && !r.shared) return fail(404, 'Run not found')
  return json({ ...parse(r), isOwner })
}

/** PATCH /api/runs/:id {shared} — owner toggles the public share link. */
export const onRequestPatch = async (ctx: Ctx) => {
  const me = await sessionAddress(ctx)
  if (!me) return fail(401, 'Not signed in')
  const body = await readJson<{ shared?: boolean }>(ctx.request)
  if (typeof body?.shared !== 'boolean') return fail(400, 'shared must be true or false')
  const res = await ctx.env.DB.prepare('UPDATE runs SET shared = ? WHERE id = ? AND owner = ?').bind(body.shared ? 1 : 0, String(ctx.params.id), me).run()
  if ((res.meta?.changes ?? 0) !== 1) return fail(404, 'Run not found')
  await audit(ctx.env, body.shared ? 'run_shared' : 'run_unshared', me, String(ctx.params.id))
  return json({ shared: body.shared })
}

/** DELETE /api/runs/:id — owner only. */
export const onRequestDelete = async (ctx: Ctx) => {
  const me = await sessionAddress(ctx)
  if (!me) return fail(401, 'Not signed in')
  const res = await ctx.env.DB.prepare('DELETE FROM runs WHERE id = ? AND owner = ?').bind(String(ctx.params.id), me).run()
  if ((res.meta?.changes ?? 0) !== 1) return fail(404, 'Run not found')
  await audit(ctx.env, 'run_deleted', me, String(ctx.params.id))
  return json({ ok: true })
}
