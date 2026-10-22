import test from 'node:test'
import assert from 'node:assert/strict'
import { clientIp, MAX_JSON_BYTES, readJson } from '../functions/_lib'

test('client IP keeps IPv4 and groups IPv6 addresses by /64', () => {
  const req = (ip: string) => new Request('https://societyagent.fun/api/test', { headers: { 'cf-connecting-ip': ip } })
  assert.equal(clientIp(req('203.0.113.7')), '203.0.113.7')
  assert.equal(clientIp(req('2001:db8:abcd:42::1')), '2001:0db8:abcd:0042::/64')
  assert.equal(clientIp(req('2001:db8:abcd:42:ffff::2')), '2001:0db8:abcd:0042::/64')
  assert.equal(clientIp(req('not-an-ip')), 'unknown')
})

test('readJson stops a chunked body at the byte cap', async () => {
  const bytes = new TextEncoder().encode('x'.repeat(MAX_JSON_BYTES + 1))
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } })
  const request = new Request('https://societyagent.fun/api/test', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
  assert.equal(await readJson(request), null)
  assert.deepEqual(await readJson(new Request('https://societyagent.fun/api/test', { method: 'POST', body: '{"ok":true}' })), { ok: true })
})