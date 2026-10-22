// Society Agent core: the whole MCP surface is three HTTP calls to the public agent API. Nothing here can spend money, sign anything or read a secret.
export const DEFAULT_BASE = 'https://societyagent.fun'

/** The base URL is the only thing a deployer can change. It must be https (plain http only for localhost, so tests and self-hosting work). */
export function loadConfig(env = process.env) {
  const base = String(env.SOCIETY_AGENT_URL || DEFAULT_BASE).replace(/\/+$/, '')
  let u
  try { u = new URL(base) } catch { throw new Error('SOCIETY_AGENT_URL is not a valid URL') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('SOCIETY_AGENT_URL must be https (http is allowed only for localhost)')
  if (u.search || u.hash || u.username || u.password) throw new Error('SOCIETY_AGENT_URL must be a plain origin')
  return { base: u.origin, timeoutMs: Math.min(Math.max(Number(env.SOCIETY_AGENT_TIMEOUT_MS) || 60_000, 5_000), 120_000) }
}

export function createCore(cfg, fetchImpl = fetch) {
  async function call(method, path, body) {
    let res
    try {
      res = await fetchImpl(cfg.base + path, { method, headers: { 'content-type': 'application/json', 'user-agent': 'society-agent-mcp/1' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(cfg.timeoutMs) })
    } catch (e) { throw new Error(`Society Agent is unreachable: ${e?.name === 'TimeoutError' ? 'timed out' : 'network error'}`) }
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text) } catch { /* not json */ }
    if (res.status === 429) throw new Error('Rate limit reached for this network. Wait and retry later; do not switch identities to get around it.')
    if (!res.ok) throw new Error(`Society Agent returned ${res.status}: ${(data && data.error) || text.slice(0, 160)}`)
    if (!data) throw new Error('Society Agent returned something that is not JSON')
    return data
  }
  return {
    capabilities: () => call('GET', '/api/agent/capabilities'),
    health: () => call('GET', '/api/health'),
    simulate: (a) => call('POST', '/api/agent/simulate', { cfg: a.scenario, ticks: a.ticks, interventions: a.interventions ?? [] }),
    compare: (a) => call('POST', '/api/agent/compare', a),
  }
}

/** A run is long (144 steps of metrics and a hundred events). Give the model the answer and a bounded sample, not the whole log. */
export function digestRun(out, { everyNth = 12, events = 12 } = {}) {
  const m = out.result.metrics
  const curve = m.filter((_, i) => i % everyNth === everyNth - 1 || i === m.length - 1).map((x) => ({ tick: x.tick, informed: round(x.informed), mean: round(x.mean), spread: round(x.spread) }))
  const key = out.result.events.filter((e) => ['news', 'shift', 'intervene'].includes(e.type)).slice(0, events).map((e) => ({ time: e.t, type: e.type, text: e.text }))
  return { scenario: out.cfg.name, ticks: out.ticks, final: out.result.final, findings: out.result.report, curve, keyEvents: key, note: 'Model of an invented town, not a forecast of real people. Same scenario, seed and interventions reproduce these numbers exactly.' }
}
const round = (n) => Math.round(n * 1000) / 1000
