import { json, type Ctx } from '../_lib'

/** GET /api/health — liveness + database round-trip. Safe to expose: it reveals nothing beyond up/down and latency. */
export const onRequestGet = async (ctx: Ctx) => {
  const t0 = Date.now()
  try {
    const row = await ctx.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    return json({ ok: row?.ok === 1, db: 'up', ms: Date.now() - t0 })
  } catch {
    return json({ ok: false, db: 'down', ms: Date.now() - t0 }, 503)
  }
}
