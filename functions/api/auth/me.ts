import { fail, json, sessionAddress, sessionCookie, sessionToken, sha256, type Ctx } from '../../_lib'

/** GET /api/auth/me — private session check (401 when the session is missing or expired). */
export const onRequestGet = async (ctx: Ctx) => {
  const address = await sessionAddress(ctx)
  if (!address) return fail(401, 'Not signed in')
  return json({ address })
}

/** DELETE /api/auth/me — sign out: revoke the session server-side and clear the cookie. */
export const onRequestDelete = async (ctx: Ctx) => {
  const token = sessionToken(ctx.request)
  if (token) await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('0'.repeat(64), 0) })
}
