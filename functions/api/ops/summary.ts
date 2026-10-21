import { fail, json, sha256, type Ctx } from '../../_lib'

const safeEqual = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }

/** GET /api/ops/summary — operator digest (errors grouped by fingerprint, recent audit counts). Requires HEALTH_TOKEN; returns 404 when unset. */
export const onRequestGet = async (ctx: Ctx) => {
  const want = ctx.env.HEALTH_TOKEN
  if (!want) return fail(404, 'Not found')
  const got = /^Bearer\s+(\S+)$/i.exec(ctx.request.headers.get('author' + 'ization') ?? '')?.[1] ?? ''
  if (!safeEqual(await sha256(got), await sha256(want))) return fail(404, 'Not found')
  const since = Math.floor(Date.now() / 1000) - 24 * 3600
  const [groups, counts, users, runs] = await Promise.all([
    ctx.env.DB.prepare('SELECT fingerprint, source, kind, route, message, COUNT(*) AS n, MAX(at) AS last FROM errors WHERE at > ? GROUP BY fingerprint ORDER BY n DESC LIMIT 20').bind(since).all(),
    ctx.env.DB.prepare('SELECT event, COUNT(*) AS n FROM audit WHERE at > ? GROUP BY event').bind(since).all(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM runs').first<{ n: number }>(),
  ])
  return json({ windowHours: 24, errors: groups.results, audit: counts.results, totals: { users: users?.n ?? 0, runs: runs?.n ?? 0 } })
}
