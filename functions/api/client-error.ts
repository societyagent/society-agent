import { allow, clientIp, json, logError, readJson, type Ctx } from '../_lib'

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')

/** POST /api/client-error — the browser reports uncaught errors and CSP violations. Always 204; never trusted for anything but triage. */
export const onRequestPost = async (ctx: Ctx) => {
  if (!(await allow(ctx.env, `ce:${clientIp(ctx.request)}`, 20, 600))) return new Response(null, { status: 204 })
  const b = await readJson<Record<string, unknown>>(ctx.request)
  if (!b) return new Response(null, { status: 204 })
  const kind = ['error', 'unhandledrejection', 'csp'].includes(String(b.kind)) ? String(b.kind) : 'error'
  const route = clip(b.route, 120).replace(/[0-9a-f]{16,}/gi, ':id') // never store run ids / tokens from the URL
  await logError(ctx.env, { source: 'client', kind, message: clip(b.message, 300), route, detail: clip(b.detail, 600) })
  return json({ ok: true }, 202)
}
