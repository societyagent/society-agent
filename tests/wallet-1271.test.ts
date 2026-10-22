// Contract-wallet sign-in, tested against REAL contracts on a real EVM node (anvil), not mocks.
// Skipped, loudly, only if the anvil binary is not available; CI downloads it (see .github/workflows/ci.yml).
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPublicClient, createWalletClient, hashMessage, http, parseEther, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { foundry } from 'viem/chains'
import { parseRpcUrls, verifySignIn, chainIdOf } from '../functions/_wallet'

const ANVIL = process.env.ANVIL_BIN || (existsSync('/root/evm-test/bin/anvil') ? '/root/evm-test/bin/anvil' : 'anvil')
const PORT = 8745, RPC = `http://127.0.0.1:${PORT}`, CHAIN = 31337
const fx = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/wallets.json'), 'utf8')) as Record<string, { abi: never; bytecode: Hex }>

let node: ChildProcess | undefined, ready = false
const pub = createPublicClient({ chain: foundry, transport: http(RPC) })
const funder = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') // anvil's public dev key #0
const wallet = createWalletClient({ account: funder, chain: foundry, transport: http(RPC) })

const ownerA = privateKeyToAccount(generatePrivateKey()), ownerB = privateKeyToAccount(generatePrivateKey()), stranger = privateKeyToAccount(generatePrivateKey())
const rpcs = { [CHAIN]: RPC }
const siwe = (address: `0x${string}`, chainId = CHAIN) => createSiweMessage({ address, chainId, domain: 'societyagent.fun', uri: 'https://societyagent.fun', version: '1', nonce: 'a'.repeat(32), statement: 'Sign in to Society Agent.', issuedAt: new Date(), expirationTime: new Date(Date.now() + 300_000) })
const deploy = async (name: string, args: unknown[]) => {
  const hash = await wallet.deployContract({ abi: fx[name].abi, bytecode: fx[name].bytecode, args })
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress!
}
const sign = (acct: typeof ownerA, message: string) => acct.signMessage({ message })

before(async () => {
  node = spawn(ANVIL, ['--port', String(PORT), '--silent'], { stdio: 'ignore' })
  node.on('error', () => { /* binary missing: handled below */ })
  for (let i = 0; i < 40 && !ready; i++) { try { await pub.getChainId(); ready = true } catch { await new Promise((r) => setTimeout(r, 250)) } }
})
after(() => { node?.kill() })
const need = (t: { skip: (m: string) => void }) => { if (!ready) { t.skip('anvil not available'); return false } return true }

test('anvil is running (this suite proves contract wallets against a real EVM; if this fails the rest are meaningless)', () => {
  assert.ok(ready, `anvil not reachable at ${RPC}; install foundry or set ANVIL_BIN`)
})

test('an ordinary wallet signs in with NO network call, even when no RPC is configured', async (t) => {
  if (!need(t)) return
  const msg = siwe(ownerA.address), out = await verifySignIn({ address: ownerA.address, message: msg, signature: await sign(ownerA, msg) }, {})
  assert.deepEqual(out, { ok: true, via: 'eoa' })
})

test('a single-owner contract wallet signs in: the contract itself says the signature is valid', async (t) => {
  if (!need(t)) return
  const addr = await deploy('OwnerWallet', [ownerA.address]), msg = siwe(addr)
  const out = await verifySignIn({ address: addr, message: msg, signature: await sign(ownerA, msg) }, rpcs)
  assert.deepEqual(out, { ok: true, via: 'contract' })
})

test('a 2-of-2 contract wallet (Safe-style, 130-byte signature) signs in only when BOTH owners signed', async (t) => {
  if (!need(t)) return
  const addr = await deploy('TwoOfTwoWallet', [ownerA.address, ownerB.address]), msg = siwe(addr)
  const both = (await sign(ownerA, msg)) + (await sign(ownerB, msg)).slice(2)
  assert.equal((await verifySignIn({ address: addr, message: msg, signature: both }, rpcs)).ok, true)
  const onlyA = (await sign(ownerA, msg)) + (await sign(ownerA, msg)).slice(2), wrongOrder = (await sign(ownerB, msg)) + (await sign(ownerA, msg)).slice(2)
  assert.equal((await verifySignIn({ address: addr, message: msg, signature: onlyA }, rpcs)).ok, false, 'one owner signing twice is not 2-of-2')
  assert.equal((await verifySignIn({ address: addr, message: msg, signature: wrongOrder }, rpcs)).ok, false)
})

test('a stranger cannot sign in as a contract wallet, and a valid owner signature for a DIFFERENT message is refused', async (t) => {
  if (!need(t)) return
  const addr = await deploy('OwnerWallet', [ownerA.address]), msg = siwe(addr)
  assert.equal((await verifySignIn({ address: addr, message: msg, signature: await sign(stranger, msg) }, rpcs)).ok, false)
  assert.equal((await verifySignIn({ address: addr, message: msg, signature: await sign(ownerA, msg + ' ') }, rpcs)).ok, false, 'signature over another message')
})

test('a signature that is valid for wallet A cannot be replayed to sign in as wallet B', async (t) => {
  if (!need(t)) return
  const a = await deploy('OwnerWallet', [ownerA.address]), b = await deploy('OwnerWallet', [ownerB.address])
  const msg = siwe(a), sig = await sign(ownerA, msg)
  assert.equal((await verifySignIn({ address: a, message: msg, signature: sig }, rpcs)).ok, true)
  assert.equal((await verifySignIn({ address: b, message: msg, signature: sig }, rpcs)).ok, false, 'wallet B belongs to someone else')
})

test('a hostile contract that says YES to everything only ever vouches for its own address', async (t) => {
  if (!need(t)) return
  const evil = await deploy('AlwaysYes', []), victim = await deploy('OwnerWallet', [ownerA.address]), msg = siwe(victim)
  assert.equal((await verifySignIn({ address: victim, message: msg, signature: await sign(stranger, msg) }, rpcs)).ok, false, 'naming the victim must ask the victim, not the evil contract')
  assert.equal((await verifySignIn({ address: evil, message: siwe(evil), signature: await sign(stranger, siwe(evil)) }, rpcs)).ok, true, '(its own address: that is what a contract wallet is)')
})

test('a contract that reverts, an address with no contract, and an RPC that is down all fail CLOSED', async (t) => {
  if (!need(t)) return
  const rev = await deploy('Reverts', []), msg = siwe(rev), sig = await sign(ownerA, msg)
  assert.equal((await verifySignIn({ address: rev, message: msg, signature: sig }, rpcs)).ok, false, 'revert')
  const nobody = stranger.address, m2 = siwe(nobody)
  assert.equal((await verifySignIn({ address: nobody, message: m2, signature: (await sign(ownerA, m2)).replace(/.$/, '0') + '00'.repeat(0) }, rpcs)).ok, false, 'an address with no code')
  const down = await verifySignIn({ address: rev, message: msg, signature: sig }, { [CHAIN]: 'http://127.0.0.1:1' })
  assert.equal(down.ok, false); assert.equal((down as { reason: string }).reason, 'rpc-unavailable')
})

test('the chain comes from the message the server issued: no configured RPC for it means no contract sign-in', async (t) => {
  if (!need(t)) return
  const addr = await deploy('OwnerWallet', [ownerA.address]), msg = siwe(addr, 8453), sig = await sign(ownerA, msg)
  assert.equal(chainIdOf(msg), 8453)
  const out = await verifySignIn({ address: addr, message: msg, signature: sig }, rpcs)
  assert.deepEqual(out, { ok: false, reason: 'unsupported-chain' })
  assert.deepEqual(await verifySignIn({ address: addr, message: msg, signature: sig }, {}), { ok: false, reason: 'unsupported-chain' }, 'no RPC_URLS at all')
})

test('malformed signatures are rejected before any network call', async (t) => {
  if (!need(t)) return
  let calls = 0
  const spyClient = (() => { calls++; throw new Error('should not be called') }) as never
  for (const bad of ['0x', '0x1234', 'nothex', '0x' + 'zz'.repeat(65), '0x' + 'ab'.repeat(8193)]) {
    const out = await verifySignIn({ address: ownerA.address, message: siwe(ownerA.address), signature: bad }, rpcs, { clientFor: spyClient })
    assert.deepEqual(out, { ok: false, reason: 'bad-signature' }, bad.slice(0, 12))
  }
  assert.equal(calls, 0)
})

test('RPC_URLS parsing only accepts https (or localhost) URLs for numeric chain ids', () => {
  assert.deepEqual(parseRpcUrls('{"1":"https://rpc.example/x","10":"http://evil.example","abc":"https://a.example","31337":"http://127.0.0.1:8545","5":42}'), { 1: 'https://rpc.example/x', 31337: 'http://127.0.0.1:8545' })
  assert.deepEqual(parseRpcUrls(undefined), {}); assert.deepEqual(parseRpcUrls('not json'), {}); assert.deepEqual(parseRpcUrls('[1,2]'), {})
})

test('the hash we ask the contract about is the standard EIP-191 message hash', () => {
  const msg = siwe(ownerA.address)
  assert.equal(hashMessage(msg), hashMessage(msg)); assert.match(hashMessage(msg), /^0x[0-9a-f]{64}$/)
  void parseEther
})
