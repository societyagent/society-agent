import { createPublicClient, defineChain, hashMessage, http, isHex, type Hex, type PublicClient } from 'viem'
import { parseSiweMessage } from 'viem/siwe'
import { verifyMessage } from 'viem'

/**
 * Wallet signature verification for sign-in.
 *
 * Ordinary wallets (EOA) sign with a key, and the address is recovered from the signature: nothing else is needed.
 * Contract wallets (Safe, Argent, Coinbase Smart Wallet, any EIP-1271 account) have no key. Their contract decides whether a signature is
 * valid, so the ONLY way to know is to ask the contract on the chain the user is signed in on: `isValidSignature(hash, signature)`.
 * Counterfactual (not yet deployed) wallets sign in the ERC-6492 wrapper; viem's `verifyHash` unwraps that too.
 *
 * Safety rules enforced here (each has a test):
 *  - A contract answer is only trusted from an RPC the OPERATOR configured (RPC_URLS). The client never supplies an RPC.
 *  - The chain id that selects the RPC comes from the SIWE message the SERVER issued and stored, not from the request.
 *  - If the RPC is down, slow or errors, the result is "cannot verify", never "valid". Failing closed is the whole point.
 *  - A 65-byte signature is checked as an EOA first with no network call, so ordinary sign-in never depends on an RPC.
 */

export type VerifyOutcome = { ok: true; via: 'eoa' | 'contract' } | { ok: false; reason: 'invalid' | 'unsupported-chain' | 'rpc-unavailable' | 'bad-signature'; detail?: string }

/** `RPC_URLS` is a JSON object, e.g. {"1":"https://…","8453":"https://…"}. Only https URLs for a numeric chain id are accepted. */
export function parseRpcUrls(raw: string | undefined): Record<number, string> {
  if (!raw) return {}
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return {} }
  const out: Record<number, string> = {}
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const id = Number(k)
    if (Number.isInteger(id) && id > 0 && typeof v === 'string') { try { const u = new URL(v); if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) out[id] = v } catch { /* skip bad url */ } }
  }
  return out
}

export const chainIdOf = (message: string): number | null => { const c = parseSiweMessage(message).chainId; return typeof c === 'number' && Number.isInteger(c) && c > 0 ? c : null }

const short = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message.split('\n')[0]}` : String(e)).slice(0, 160)
const MAX_SIG_HEX = 2 + 2 * 8192 // a contract wallet signature can be long (multisig), but not unbounded

export interface VerifyDeps { clientFor?: (chainId: number, url: string) => PublicClient; timeoutMs?: number }

const defaultClient = (chainId: number, url: string): PublicClient =>
  createPublicClient({ chain: defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } } }), transport: http(url, { retryCount: 1, timeout: 8000 }) })

export async function verifySignIn(
  p: { address: `0x${string}`; message: string; signature: string },
  rpcUrls: Record<number, string>,
  deps: VerifyDeps = {},
): Promise<VerifyOutcome> {
  const sig = p.signature
  if (!isHex(sig) || sig.length < 132 || sig.length > MAX_SIG_HEX || sig.length % 2 !== 0) return { ok: false, reason: 'bad-signature' }

  // 1. ordinary wallet: pure maths, no network
  if (/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    try { if (await verifyMessage({ address: p.address, message: p.message, signature: sig })) return { ok: true, via: 'eoa' } } catch { /* fall through to the contract path */ }
  }

  // 2. contract wallet: ask the contract, on the chain named in the message the server issued
  const chainId = chainIdOf(p.message)
  const url = chainId === null ? undefined : rpcUrls[chainId]
  if (chainId === null || !url) return { ok: false, reason: 'unsupported-chain' }
  try {
    const client = (deps.clientFor ?? defaultClient)(chainId, url)
    const valid = await client.verifyHash({ address: p.address, hash: hashMessage(p.message), signature: sig as Hex })
    if (valid) return { ok: true, via: 'contract' }
    // viem answers `false` both for "the contract said no" and for "the node could not be reached", so a `false` alone cannot be told apart.
    // Ask the node something trivial: if it does not answer, the honest message is "could not check", not "your signature is wrong".
    try { await client.getChainId() } catch (e) { return { ok: false, reason: 'rpc-unavailable', detail: short(e) } }
    return { ok: false, reason: 'invalid' }
  } catch (e) {
    return { ok: false, reason: 'rpc-unavailable', detail: short(e) } // never "valid" on an error
  }
}
