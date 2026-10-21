import { fail, logError, type Ctx } from '../_lib'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * The API is consumed only by this app (same origin). Therefore:
 *  - state-changing requests that carry an Origin header must come from this exact origin (CSRF defence on top of SameSite=Strict);
 *  - CORS is never granted, and preflights are answered without any Access-Control-* headers so cross-origin browsers fail closed.
 */
export const onRequest = async (ctx: Ctx & { next: () => Promise<Response> }) => {
  const { request } = ctx
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, POST, PATCH, DELETE', 'cache-control': 'no-store' } })
  if (!SAFE.has(request.method)) {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return fail(403, 'Cross-origin requests are not allowed')
    const site = request.headers.get('sec-fetch-site')
    if (site && site !== 'same-origin' && site !== 'none') return fail(403, 'Cross-site requests are not allowed')
  }
  let res: Response
  try { res = await ctx.next() } catch (err) {
    await logError(ctx.env, { source: 'server', kind: 'api', message: err instanceof Error ? err.message : String(err), route: `${request.method} ${new URL(request.url).pathname}`, detail: err instanceof Error ? (err.stack ?? '') : '' })
    return fail(500, 'Something went wrong on our side. Please try again.')
  }
  if (res.status >= 500) await logError(ctx.env, { source: 'server', kind: 'api', message: `HTTP ${res.status}`, route: `${request.method} ${new URL(request.url).pathname}` })
  const out = new Response(res.body, res)
  for (const h of [...out.headers.keys()]) if (h.startsWith('access-control-')) out.headers.delete(h)
  return out
}
