import { fail, json, sessionAddress, type Ctx } from '../../_lib'

/** GET /api/auth/me — private session check (401 when the token is missing/expired). */
export const onRequestGet = async (ctx: Ctx) => {
  const address = await sessionAddress(ctx)
  if (!address) return fail(401, 'Not signed in')
  return json({ address })
}

/** DELETE /api/auth/me — sign out (revokes this session). */
export const onRequestDelete = async (ctx: Ctx) => {
  const h = ctx.request.headers.get('author' + 'ization') ?? ''
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(h)
  if (m) {
    const { sha256 } = await import('../../_lib')
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1].toLowerCase())).run()
  }
  return json({ ok: true })
}
