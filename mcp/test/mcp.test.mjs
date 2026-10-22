// MCP tests: config safety, request shaping against a mock, the real stdio protocol, and (opt-in) the live service.
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clockOf, createCore, digestRun, loadConfig } from '../src/core.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const LIVE = process.env.SOCIETY_AGENT_URL || ''
let pass = 0; const ok = (n) => { pass++; console.log('  ✓', n) }

// 1. config safety
{
  assert.strictEqual(loadConfig({}).base, 'https://societyagent.fun')
  assert.throws(() => loadConfig({ SOCIETY_AGENT_URL: 'http://evil.example' }), /https/)
  assert.throws(() => loadConfig({ SOCIETY_AGENT_URL: 'https://user:pw@evil.example' }), /plain origin/)
  assert.throws(() => loadConfig({ SOCIETY_AGENT_URL: 'https://x.example/?a=1' }), /plain origin/)
  assert.doesNotThrow(() => loadConfig({ SOCIETY_AGENT_URL: 'http://127.0.0.1:8788' }))
  assert.strictEqual(loadConfig({ SOCIETY_AGENT_URL: 'https://x.example/' }).base, 'https://x.example')
  assert.ok(loadConfig({ SOCIETY_AGENT_TIMEOUT_MS: '9999999' }).timeoutMs <= 120000)
  ok('config: https-only (http only for localhost), no credentials or query in the URL, timeout clamped')
}

// 2. requests go to the right paths with the right bodies, and errors are explained safely
{
  const seen = []
  const mk = (status, body) => async (url, init) => { seen.push({ url, method: init.method, body: init.body && JSON.parse(init.body) }); return { status, ok: status < 400, text: async () => JSON.stringify(body) } }
  const cfg = loadConfig({ SOCIETY_AGENT_URL: 'https://svc.example' })
  const core = createCore(cfg, mk(200, { ok: true }))
  await core.health(); await core.capabilities(); await core.simulate({ scenario: { name: 'x', news: { text: 't', stance: 0.5 } }, ticks: 24 }); await core.compare({ template: 'water', conds: [] })
  assert.deepStrictEqual(seen.map((s) => `${s.method} ${s.url}`), ['GET https://svc.example/api/health', 'GET https://svc.example/api/agent/capabilities', 'POST https://svc.example/api/agent/simulate', 'POST https://svc.example/api/agent/compare'])
  assert.strictEqual(seen[2].body.ticks, 24); assert.deepStrictEqual(seen[2].body.interventions, [])
  await assert.rejects(createCore(cfg, mk(429, { error: 'x' })).health(), /do not switch identities/)
  await assert.rejects(createCore(cfg, mk(400, { error: 'Invalid interventions' })).simulate({}), /400: Invalid interventions/)
  await assert.rejects(createCore(cfg, async () => { throw Object.assign(new Error('boom'), { name: 'TimeoutError' }) }).health(), /timed out/)
  ok('core: right paths, bodies shaped, 429 gives the do-not-evade message, API errors and timeouts are readable')
}

// 3. the digest is bounded and keeps the answer
{
  const metrics = Array.from({ length: 144 }, (_, i) => ({ tick: i + 1, informed: i / 143, mean: 0.2, spread: 0.1, talks: i }))
  const events = Array.from({ length: 300 }, (_, i) => ({ type: i % 3 ? 'say' : 'news', t: 'Day 1', text: 'e' + i }))
  const d = digestRun({ cfg: { name: 'N' }, ticks: 144, result: { final: { informed: 1 }, report: ['a', 'b'], metrics, events } })
  assert.ok(d.curve.length <= 13 && d.keyEvents.length <= 12); assert.deepStrictEqual(d.findings, ['a', 'b']); assert.match(d.note, /not a forecast/)
  ok('digest: a 144-step run with 300 events becomes a short curve and at most 12 key events, findings kept')
}

// 3a. the curve must not jump over an intervention (the 0.1.1 sampling hid the very moment a demo is about)
{
  const metrics = Array.from({ length: 144 }, (_, i) => ({ tick: i + 1, informed: i + 1 >= 37 ? 1 : 0.333, mean: i + 1 >= 37 ? 0.133 : 0.228, spread: 0.1, talks: i }))
  const d = digestRun({ cfg: { name: 'N' }, ticks: 144, interventions: [{ tick: 36, iv: { type: 'announce', text: 't', stance: -0.6 } }], result: { final: {}, report: [], metrics, events: [] } })
  const at = (t) => d.curve.find((c) => c.tick === t)
  assert.strictEqual(at(36).informed, 0.333); assert.match(at(36).note, /just before the announcement/)
  assert.strictEqual(at(37).informed, 1); assert.match(at(37).note, /just after the announcement/)
  assert.ok(at(43), 'one hour after'); assert.ok(d.curve.length <= 20, 'still bounded: ' + d.curve.length)
  assert.match(d.note, /announcement informs every resident/)
  assert.strictEqual(clockOf(1), '07:00'); assert.strictEqual(clockOf(37), '13:00'); assert.strictEqual(clockOf(144), '06:50'); assert.strictEqual(clockOf(73), '19:00')
  ok('digest: the steps just before and after an intervention are always in the curve, each point has a clock time, and the curve stays small')
}

// 3b. started the way npx and global installs start it: through a symlink in node_modules/.bin (this once left the server silent)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bin-')), link = path.join(dir, 'society-agent-mcp')
  fs.symlinkSync(path.join(here, '../src/index.js'), link)
  const out = await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [link], { stdio: ['pipe', 'pipe', 'inherit'] }); let got = ''
    const t = setTimeout(() => { c.kill(); reject(new Error('server started through a symlink never answered')) }, 20_000)
    c.stdout.on('data', (d) => { got += d; if (got.includes('\n')) { clearTimeout(t); c.kill(); resolve(got) } })
    c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } }) + '\n')
  })
  assert.strictEqual(JSON.parse(out.split('\n')[0]).result.serverInfo.name, 'society-agent')
  ok('bin: the server answers when launched through a symlink, as npx and global installs do')
}

// 4. the real stdio protocol: spawn the server and speak MCP to it
{
  const child = spawn(process.execPath, [path.join(here, '../src/index.js')], { env: { ...process.env, SOCIETY_AGENT_URL: LIVE || 'https://societyagent.fun' }, stdio: ['pipe', 'pipe', 'inherit'] })
  let buf = ''; const waiting = new Map()
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); waiting.get(m.id)?.(m) } })
  const rpc = (id, method, params) => new Promise((res, rej) => { waiting.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); setTimeout(() => rej(new Error('rpc timeout ' + method)), 90_000) })
  const init = await rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
  assert.strictEqual(init.result.serverInfo.name, 'society-agent')
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const tools = (await rpc(2, 'tools/list', {})).result.tools
  assert.deepStrictEqual(tools.map((t) => t.name).sort(), ['society_compare', 'society_simulate', 'society_status'])
  assert.ok(tools.every((t) => t.annotations.readOnlyHint === true), 'every tool is read-only')
  const props = JSON.stringify(tools.map((t) => t.inputSchema))
  assert.ok(!/"url"|"header"|"apiKey"|"secret"|"privateKey"/i.test(props), 'no tool accepts a URL, header or secret')
  const sim = tools.find((t) => t.name === 'society_simulate'), cmp = tools.find((t) => t.name === 'society_compare')
  assert.match(JSON.stringify(sim.inputSchema), /Tick 0 is 07:00/); assert.match(JSON.stringify(sim.inputSchema), /tick 36 is 13:00/)
  assert.match(cmp.description, /FIRST one/); assert.match(cmp.description, /effect-size word/)
  const res = (await rpc(3, 'resources/read', { uri: 'society://safety' })).result.contents[0].text
  assert.match(res, /read-only/)
  ok('stdio protocol: 3 tools, all read-only, none can take a URL/header/secret, safety resource readable')

  if (LIVE) {
    const st = JSON.parse((await rpc(4, 'tools/call', { name: 'society_status', arguments: {} })).result.content[0].text)
    assert.strictEqual(st.health.ok, true); assert.ok(st.capabilities.tools.some((t) => t.name === 'compare_options'))
    const sim = JSON.parse((await rpc(5, 'tools/call', { name: 'society_simulate', arguments: { scenario: { name: 'Water main break', template: 'water', seed: 42, population: 12, news: { text: 'A water main broke in the east district and pressure may drop by noon.', stance: 0.6, startTick: 2, seedRoles: ['official', 'nurse'] } }, ticks: 144, interventions: [] } })).result.content[0].text)
    assert.strictEqual(sim.final.informed, 1); assert.ok(sim.findings.length >= 5 && sim.curve.length <= 13)
    const jump = JSON.parse((await rpc(8, 'tools/call', { name: 'society_simulate', arguments: { scenario: { name: 'Water main break', template: 'water', news: { text: 'A water main broke in the east district and pressure may drop by noon.', stance: 0.6 } }, ticks: 144, interventions: [{ tick: 36, iv: { type: 'announce', text: 'Water will be restored by 6pm. There is no danger.', stance: -0.6 } }] } })).result.content[0].text)
    const before = jump.curve.find((c) => c.tick === 36), after = jump.curve.find((c) => c.tick === 37)
    assert.ok(before && after && before.informed < 0.5 && after.informed === 1, `the announcement jump must be visible: ${JSON.stringify([before, after])}`)
    assert.strictEqual(before.clock, '12:50'); assert.strictEqual(after.clock, '13:00')
    assert.ok(!jump.findings.some((f) => /everyone knew after/.test(f) && /Half the town knew (\d+\.\d) simulated hours.*everyone knew after \1 hours/.test(f)), 'no duplicated "5.7 / 5.7" sentence')
    const cmp = JSON.parse((await rpc(6, 'tools/call', { name: 'society_compare', arguments: { template: 'water', n: 10, outcome: 'final', conds: [{ label: 'Do nothing', kind: 'none' }, { label: 'Official statement', kind: 'announce', text: 'Water will be restored by 6pm.', hour: 12, stance: -0.6 }] } })).result.content[0].text)
    assert.strictEqual(cmp.towns, 10); assert.strictEqual(cmp.findings.length, 1); assert.ok(typeof cmp.findings[0].headline === 'string')
    const noTalks = tools.find((t) => t.name === 'society_compare').inputSchema.properties.outcome
    assert.deepStrictEqual([...noTalks.enum].sort(), ['final', 'half', 'peak', 'spread'], 'the tool offers only outcomes the engine measures')
    for (const o of ['peak', 'spread', 'half']) {
      const r = JSON.parse((await rpc(20 + o.length, 'tools/call', { name: 'society_compare', arguments: { template: 'water', n: 10, outcome: o, conds: [{ label: 'Do nothing', kind: 'none' }, { label: 'Official statement', kind: 'announce', text: 'Water will be restored by 6pm.', hour: 12, stance: -0.6 }] } })).result.content[0].text)
      assert.strictEqual(r.measure.id, o, `asked for ${o}, got ${r.measure.id}`)
    }
    const bad = (await rpc(7, 'tools/call', { name: 'society_compare', arguments: { template: 'water', conds: [{ label: 'a', kind: 'none' }] } })).result
    assert.ok(bad.isError || /min|too_small|at least/i.test(JSON.stringify(bad)), 'one option is rejected')
    ok(`live ${LIVE}: status healthy, one run finishes (informed=1, ${sim.findings.length} findings), a 10-town comparison returns a verdict, every offered outcome returns the measure that was asked for, invalid input rejected`)
  } else console.log('  - live checks skipped (set SOCIETY_AGENT_URL to run them)')
  child.kill()
}
console.log(`\n${pass} groups passed`)
