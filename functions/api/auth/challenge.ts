import { isAddress, verifyMessage, getAddress } from 'viem'
import { allow, clientIp, fail, json, randomToken, readJson, sha256, type Ctx } from '../../_lib'

const CHALLENGE_TTL = 300
const SESSION_TTL = 60 * 60 * 24 * 7

/** POST /api/auth/challenge {address} -> single-use message to sign (no gas, no tx). */
export const onRequestPost = async (ctx: Ctx) => {
  const body = await readJson<{ address?: string }>(ctx.request)
  const address = body?.address
  if (!address || !isAddress(address)) return fail(400, 'Invalid wallet address')
  if (!(await allow(ctx.env, `ch:${clientIp(ctx.request)}`, 20, 300))) return fail(429, 'Too many attempts. Try again in a few minutes.')
  const addr = getAddress(address)
  const id = randomToken(16)
  const now = Math.floor(Date.now() / 1000)
  const message = [
    'Society Agent wants you to sign in.',
    '',
    `Wallet: ${addr}`,
    `Nonce: ${id}`,
    `Issued: ${new Date(now * 1000).toISOString()}`,
    '',
    'This request will not cost any gas.',
  ].join('\n')
  await ctx.env.DB.prepare('INSERT INTO challenges (id, address, message, expires_at) VALUES (?, ?, ?, ?)').bind(id, addr, message, now + CHALLENGE_TTL).run()
  return json({ id, message })
}

export { SESSION_TTL, verifyMessage, sha256, randomToken }
