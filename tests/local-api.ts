// Run the REAL Pages Functions (same handlers that are deployed) behind a local HTTP server with an in-memory D1 stand-in,
// so the MCP live-suite can be run without spending the public network quota. The engine and the handlers are the real code.
import http from 'node:http'
import { onRequestPost as simulate } from '../functions/api/agent/simulate'
import { onRequestPost as compare } from '../functions/api/agent/compare'
import { onRequestGet as caps } from '../functions/api/agent/capabilities'

const counts = new Map<string, number>()
const env = { DB: { prepare: () => ({ bind: (k: string) => ({ first: async () => { const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return { count: n } }, run: async () => ({}), all: async () => ({ results: [] }) }) }) } }
const route: Record<string, (c: never) => Promise<Response>> = { '/api/agent/simulate': simulate as never, '/api/agent/compare': compare as never, '/api/agent/capabilities': caps as never, '/api/health': (async () => new Response(JSON.stringify({ ok: true, db: 'up', ms: 1 }), { headers: { 'content-type': 'application/json' } })) as never }
http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer)
  const h = route[new URL(req.url!, 'http://x').pathname]
  if (!h) { res.statusCode = 404; return res.end('{}') }
  const r = await h({ env, params: {}, request: new Request('https://societyagent.fun' + req.url, { method: req.method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.50' }, body: ['GET', 'HEAD'].includes(req.method!) ? undefined : Buffer.concat(chunks) }) } as never)
  res.statusCode = r.status; r.headers.forEach((v, k) => res.setHeader(k, v)); res.end(await r.text())
}).listen(Number(process.env.PORT || 8799), '127.0.0.1', () => console.log('local API ready'))
