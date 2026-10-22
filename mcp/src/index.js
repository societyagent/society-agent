#!/usr/bin/env node
// Society Agent MCP server (stdio). Three tools over the public agent API. No keys, no wallet, no spending.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { createCore, digestRun, loadConfig } from './core.js'

export const VERSION = '0.1.3'

const STANCE = z.number().min(-1).max(1).describe('-1 calming … +1 alarming')
const SCENARIO = z.object({
  name: z.string().max(80), question: z.string().max(240).optional(), template: z.enum(['water', 'custom']).optional().describe('"water" is the built-in water-main scenario'),
  axis: z.tuple([z.string().max(24), z.string().max(24)]).optional(), population: z.number().int().min(6).max(16).optional(), seed: z.number().int().min(0).optional(),
  news: z.object({ text: z.string().min(1).max(240), stance: STANCE, startTick: z.number().int().min(0).max(60).optional(), seedRoles: z.array(z.string().max(20)).max(6).optional() }),
}).describe('The town scenario: what happens, how alarming it is, and who hears it first')
const OPTION = z.object({ label: z.string().max(40), kind: z.enum(['none', 'announce', 'whisper']), text: z.string().max(240).optional(), hour: z.number().int().min(8).max(22).optional().describe('hour of the day the move happens, 8 to 22 (12 is noon)'), stance: STANCE.optional(), agent: z.number().int().min(0).max(15).optional().describe('resident index for a whisper') })

export const SAFETY_TEXT = `Society Agent MCP safety model

- Every tool is read-only against the public Society Agent API. Nothing is stored, nothing is signed, no money moves, no AI model is called.
- You can only send a scenario and a list of interventions. You cannot give the server a URL, a header or a secret.
- The service limits each network by the hour. On a rate-limit error stop and report it; never try to get around it.
- Results describe a model of one invented town. They are not predictions about real people: say so when you report them.`

export function buildServer(cfg = loadConfig(), core = createCore(cfg)) {
  const server = new McpServer({ name: 'society-agent', version: VERSION }, { instructions: 'Society Agent simulates how news spreads through an invented town. Use society_simulate for one run and society_compare to test whether an intervention makes a clear difference. Always state that results are a model, not a forecast.' })
  const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })
  const wrap = (fn) => async (args) => { try { return ok(await fn(args || {})) } catch (e) { return { isError: true, content: [{ type: 'text', text: `Error: ${e?.message || e}` }] } } }
  const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }

  server.registerTool('society_status', { title: 'Service status', description: 'Live health of Society Agent and the tools it offers. Call this first.', inputSchema: {}, annotations: RO },
    wrap(async () => ({ health: await core.health(), capabilities: await core.capabilities() })))

  server.registerTool('society_simulate', { title: 'Simulate one run', description: 'Run one deterministic simulation of a town hearing news, with optional interventions. Returns the final state, written findings, a short curve (with clock times, and the steps just before and after every intervention) and key events. Same inputs always give the same numbers.',
    inputSchema: { scenario: SCENARIO, ticks: z.number().int().min(12).max(144).optional().describe('number of ten-minute steps; 144 is one full day starting at 07:00'), interventions: z.array(z.object({ tick: z.number().int().min(0).max(143).describe('when to step in. Tick 0 is 07:00 and each tick is ten minutes, so tick 36 is 13:00 and tick 72 is 19:00'), iv: z.discriminatedUnion('type', [z.object({ type: z.literal('announce'), text: z.string().max(240), stance: STANCE }), z.object({ type: z.literal('whisper'), agent: z.number().int().min(0).max(15), text: z.string().max(240), stance: STANCE })]) })).max(20).optional() }, annotations: RO },
    wrap(async (a) => digestRun(await core.simulate(a))))

  server.registerTool('society_compare', { title: 'Compare interventions', description: 'Test 2-4 options in the SAME random towns with a paired statistical test. Returns, for each option versus the first, whether the difference is clear or could be chance. Only options are compared against the FIRST one: to test option B against option A directly, put A first. Read the stated size of the change, not just the effect-size word. Use this, not a single run, before claiming one move beats another.',
    inputSchema: { template: z.enum(['water']).describe('built-in scenario'), conds: z.array(OPTION).min(2).max(4).describe('the first option is the baseline'), n: z.number().int().min(10).max(30).optional().describe('number of random towns'), outcome: z.enum(['final', 'peak', 'spread', 'half']).optional().describe('what to measure: final opinion (default), peak opinion, spread (disagreement), or half (hours until half the town knew)') }, annotations: RO },
    wrap(async (a) => { const r = await core.compare(a); return { measure: r.measure, towns: r.towns, simulatedDays: r.simulatedDays, rows: r.rows, findings: r.findings, notes: r.notes } }))

  server.registerResource('safety', 'society://safety', { title: 'Safety model', description: 'What this server can and cannot do', mimeType: 'text/plain' }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: SAFETY_TEXT }] }))
  return server
}

// Start only when run as a program. `npx` and global installs launch us through a symlink in .bin, so compare REAL paths (a plain
// `import.meta.url === file://argv[1]` check is false for a symlink and the server would silently never start).
const real = (p) => { try { return realpathSync(p) } catch { return p } }
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const server = buildServer()
  await server.connect(new StdioServerTransport())
}
