import type { Ctx } from '../_lib'

/**
 * The API is consumed only by this app (same origin, bearer token in a header — no cookies).
 * Cross-origin browsers must therefore be refused: answer preflights with no CORS headers so they fail,
 * and strip any CORS headers that might be added downstream.
 */
export const onRequest = async (ctx: Ctx & { next: () => Promise<Response> }) => {
  if (ctx.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, POST, PATCH, DELETE', 'cache-control': 'no-store' } })
  const res = await ctx.next()
  const out = new Response(res.body, res)
  for (const h of [...out.headers.keys()]) if (h.startsWith('access-control-')) out.headers.delete(h)
  return out
}
