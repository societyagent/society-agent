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

/** Metric tick n covers the ten minutes that END the step labelled n, and the day starts at 07:00: tick 1 is 07:00, tick 37 is 13:00. */
export const clockOf = (n) => { const m = (7 * 60 + (n - 1) * 10) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

/**
 * A run is long (144 steps of metrics and a hundred events). Give the model the answer and a bounded sample, not the whole log.
 * The sample always includes the steps just before and just after every intervention, because "what changed when we stepped in" is the
 * whole point of an intervention and a curve sampled every 12 steps can jump straight over it.
 */
export function digestRun(out, { everyNth = 12, events = 12 } = {}) {
  const m = out.result.metrics
  const marks = new Map() // tick -> why it is in the sample
  for (const x of m) if (x.tick % everyNth === 0 || x.tick === m.length) marks.set(x.tick, marks.get(x.tick) ?? '')
  for (const iv of out.interventions ?? []) {
    marks.set(iv.tick, `just before the ${iv.iv.type === 'announce' ? 'announcement' : 'whisper'}`)
    marks.set(iv.tick + 1, `just after the ${iv.iv.type === 'announce' ? 'announcement' : 'whisper'}`)
    marks.set(iv.tick + 7, 'one hour after')
  }
  const curve = m.filter((x) => marks.has(x.tick)).map((x) => ({ tick: x.tick, clock: clockOf(x.tick), informed: round(x.informed), mean: round(x.mean), spread: round(x.spread), ...(marks.get(x.tick) ? { note: marks.get(x.tick) } : {}) }))
  const key = out.result.events.filter((e) => ['news', 'shift', 'intervene'].includes(e.type)).slice(0, events).map((e) => ({ time: e.t, type: e.type, text: e.text }))
  return { scenario: out.cfg.name, ticks: out.ticks, final: out.result.final, findings: out.result.report, curve, keyEvents: key, note: 'Model of an invented town, not a forecast of real people. Same scenario, seed and interventions reproduce these numbers exactly. Each curve point is labelled with the clock at the start of the step it reports (point 1 is 07:00). An intervention at tick t happens at that clock time and first shows in curve point t+1. A public announcement informs every resident who has not yet heard in the same step, so a jump to 100% right after one is how the model works, not a conversation effect.' }
}
const round = (n) => Math.round(n * 1000) / 1000
