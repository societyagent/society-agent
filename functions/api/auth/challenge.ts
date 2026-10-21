import { LIMITS } from '../../../src/engine/limits'
import { createSiweMessage } from 'viem/siwe'
import { getAddress, isAddress } from 'viem'
import { allow, clientIp, fail, json, randomToken, readJson, type Ctx } from '../../_lib'

const CHALLENGE_TTL = LIMITS.challengeTtlSec

/**
 * POST /api/auth/challenge {address, chainId?} -> a single-use EIP-4361 (Sign-In with Ethereum) message.
 * The message names this deployment's domain, so SIWE-aware wallets warn when it is shown by a different origin.
 * Signing it is free: no gas, no transaction.
 */
export const onRequestPost = async (ctx: Ctx) => {
  const body = await readJson<{ address?: string; chainId?: number }>(ctx.request)
  const address = body?.address
  if (!address || !isAddress(address)) return fail(400, 'Invalid wallet address')
  const chainId = body?.chainId === undefined ? 1 : body.chainId
  if (!Number.isInteger(chainId) || chainId < 1 || chainId > 2 ** 31 - 1) return fail(400, 'Invalid chain id')
  if (!(await allow(ctx.env, `ch:${clientIp(ctx.request)}`, LIMITS.rate.challenge.limit, LIMITS.rate.challenge.windowSec))) return fail(429, 'Too many attempts. Try again in a few minutes.')
  const addr = getAddress(address)
  const url = new URL(ctx.request.url)
  const id = randomToken(16) // 32 hex chars: valid SIWE nonce, also the challenge id
  const now = Math.floor(Date.now() / 1000)
  const message = createSiweMessage({
    address: addr, chainId, domain: url.host, uri: url.origin, version: '1', nonce: id,
    statement: 'Sign in to Society Agent. This request will not trigger a transaction or cost any gas.',
    issuedAt: new Date(now * 1000), expirationTime: new Date((now + CHALLENGE_TTL) * 1000),
  })
  await ctx.env.DB.prepare('INSERT INTO challenges (id, address, message, expires_at) VALUES (?, ?, ?, ?)').bind(id, addr, message, now + CHALLENGE_TTL).run()
  return json({ id, message })
}
