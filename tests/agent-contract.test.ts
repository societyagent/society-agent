import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequestGet as capabilities } from '../functions/api/agent/capabilities'
import { onRequestGet as openapi } from '../functions/openapi.json.ts'
import { onRequestGet as llms } from '../functions/llms.txt.ts'

test('agent discovery exposes only the real public agent contract', async () => {
  const res = await capabilities({ request: new Request('https://societyagent.fun/api/agent/capabilities') } as never)
  const body = await res.json() as { protocol: string; custody: string; tools: { name: string; path: string }[] }
  assert.equal(body.protocol, 'society-agent/v1')
  assert.equal(body.custody, 'none')
  assert.deepEqual(body.tools.map((tool) => [tool.name, tool.path]), [['simulate_town', '/api/agent/simulate'], ['health', '/api/health']])
})

test('OpenAPI and llms references expose no secret-taking operation', async () => {
  const api = JSON.stringify(await (await openapi()).json())
  const text = await (await llms()).text()
  assert.match(api, /\/api\/agent\/simulate/)
  assert.match(text, /POST https:\/\/societyagent.fun\/api\/agent\/simulate/)
  assert.doesNotMatch(api, /"(?:privateKey|seedPhrase|mnemonic|broadcast)"/i)
})
