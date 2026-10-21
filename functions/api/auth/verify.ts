import { getAddress, isAddress, verifyMessage } from 'viem'
import { allow, clientIp, fail, json, randomToken, readJson, sha256, type Ctx } from '../../_lib'

const SESSION_TTL = 60 * 60 * 24 * 7

/** POST /api/auth/verify {id, address, signature} -> session token. Challenge is burned atomically. */
export const onRequestPost = async (ctx: Ctx) => {
  const body = await readJson<{ id?: string; address?: string; signature?: string }>(ctx.request)
  if (!body?.id || !body.address || !body.signature || !isAddress(body.address)) return fail(400, 'Missing or invalid fields')
  if (!/^0x[0-9a-fA-F]{130}$/.test(body.signature)) return fail(401, 'Invalid signature')
  if (!(await allow(ctx.env, `vf:${clientIp(ctx.request)}`, 30, 300))) return fail(429, 'Too many attempts. Try again in a few minutes.')
  const addr = getAddress(body.address)
  const now = Math.floor(Date.now() / 1000)

  const row = await ctx.env.DB.prepare('SELECT message FROM challenges WHERE id = ? AND address = ? AND used_at IS NULL AND expires_at > ?').bind(body.id, addr, now).first<{ message: string }>()
  if (!row) return fail(400, 'Challenge expired or already used. Request a new one.')

  let ok = false
  try { ok = await verifyMessage({ address: addr, message: row.message, signature: body.signature as `0x${string}` }) } catch { ok = false }
  if (!ok) return fail(401, 'Signature does not match this wallet')

  // Burn the challenge: only one concurrent request can win.
  const burned = await ctx.env.DB.prepare('UPDATE challenges SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?').bind(now, body.id, now).run()
  if ((burned.meta?.changes ?? 0) !== 1) return fail(400, 'Challenge expired or already used. Request a new one.')

  const token = randomToken(32)
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT OR IGNORE INTO users (address, created_at) VALUES (?, ?)').bind(addr, now),
    ctx.env.DB.prepare('INSERT INTO sessions (token_hash, address, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), addr, now + SESSION_TTL),
    ctx.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    ctx.env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now - 3600),
  ])
  return json({ token, address: addr, expiresAt: (now + SESSION_TTL) * 1000 })
}
