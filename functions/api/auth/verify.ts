import { LIMITS } from '../../../src/engine/limits'
import { getAddress, isAddress } from 'viem'
import { parseRpcUrls, verifySignIn } from '../../_wallet'
import { allow, audit, logError, clientIp, fail, json, randomToken, readJson, sessionCookie, sha256, SESSION_TTL, type Ctx } from '../../_lib'

/** POST /api/auth/verify {id, address, signature} -> session token. Challenge is burned atomically. */
export const onRequestPost = async (ctx: Ctx) => {
  const body = await readJson<{ id?: string; address?: string; signature?: string }>(ctx.request)
  if (!body?.id || !body.address || !body.signature || !isAddress(body.address)) return fail(400, 'Missing or invalid fields')
  if (typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]{130,16386}$/.test(body.signature)) return fail(401, 'Invalid signature')
  if (!(await allow(ctx.env, `vf:${clientIp(ctx.request)}`, LIMITS.rate.verify.limit, LIMITS.rate.verify.windowSec))) return fail(429, 'Too many attempts. Try again in a few minutes.')
  const addr = getAddress(body.address)
  const now = Math.floor(Date.now() / 1000)

  const row = await ctx.env.DB.prepare('SELECT message FROM challenges WHERE id = ? AND address = ? AND used_at IS NULL AND expires_at > ?').bind(body.id, addr, now).first<{ message: string }>()
  if (!row) return fail(400, 'Challenge expired or already used. Request a new one.')

  // Ordinary wallets are checked by maths alone. A contract wallet (Safe, smart account) is checked by asking the contract, on the chain named in the
  // message WE issued, through an RPC the operator configured. If that RPC cannot answer, the sign-in fails closed.
  const out = await verifySignIn({ address: addr, message: row.message, signature: body.signature }, parseRpcUrls(ctx.env.RPC_URLS))
  if (!out.ok) {
    if (out.reason === 'unsupported-chain') return fail(401, 'Contract wallets can only sign in on a network this deployment supports. Switch your wallet to Ethereum mainnet and try again.')
    if (out.reason === 'rpc-unavailable') { await logError(ctx.env, { source: 'server', kind: 'wallet-rpc', message: 'contract wallet check could not reach the node', route: '/api/auth/verify', detail: out.detail }); return fail(503, 'Could not check your contract wallet right now. Try again in a minute.') }
    return fail(401, 'Signature does not match this wallet')
  }

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
  await audit(ctx.env, out.via === 'contract' ? 'signin_contract' : 'signin', addr)
  return json({ token, address: addr, expiresAt: (now + SESSION_TTL) * 1000 }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL) })
}
