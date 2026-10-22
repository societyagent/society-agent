// Cron worker: uptime probe, error alerting, and daily restore-point bookkeeping for the Society Agent D1 database.
// Secrets (wrangler secret put): ALERT_WEBHOOK (optional, any https endpoint that accepts JSON), HEALTH_TOKEN (to read /api/ops/summary).
import { abuseAlerts, dueAlerts, quotaAlerts, type LimitRow } from './alerts'

export interface Env {
  DB: D1Database
  TARGET: string
  ALERT_WEBHOOK?: string
  HEALTH_TOKEN?: string
}

async function alert(env: Env, text: string) {
  console.log('[alert]', text)
  if (!env.ALERT_WEBHOOK) return
  await fetch(env.ALERT_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }) }).catch(() => {})
}

async function probe(env: Env) {
  const t0 = Date.now()
  const results: string[] = []
  for (const [name, path, ok] of [['health', '/api/health', (r: Response) => r.ok], ['landing', '/', (r: Response) => r.ok], ['app', '/app', (r: Response) => r.ok], ['auth guard', '/api/auth/me', (r: Response) => r.status === 401]] as const) {
    try {
      const r = await fetch(env.TARGET + path, { headers: { 'user-agent': 'society-agent-uptime/1' }, signal: AbortSignal.timeout(10_000) })
      if (!ok(r)) results.push(`${name}: HTTP ${r.status}`)
    } catch (e) { results.push(`${name}: ${e instanceof Error ? e.message : 'failed'}`) }
  }
  await env.DB.prepare('INSERT INTO uptime (at, ok, ms, detail) VALUES (?, ?, ?, ?)').bind(Math.floor(Date.now() / 1000), results.length ? 0 : 1, Date.now() - t0, results.join('; ').slice(0, 300)).run()
  await env.DB.prepare('DELETE FROM uptime WHERE at < ?').bind(Math.floor(Date.now() / 1000) - 30 * 86400).run()
  // alert on the 2nd consecutive failure only (one blip is noise)
  const last2 = await env.DB.prepare('SELECT ok FROM uptime ORDER BY at DESC LIMIT 2').all<{ ok: number }>()
  if (results.length && last2.results.length === 2 && last2.results.every((r) => r.ok === 0)) await alert(env, `Society Agent DOWN: ${results.join('; ')}`)
  const prev = await env.DB.prepare('SELECT ok FROM uptime ORDER BY at DESC LIMIT 1 OFFSET 2').first<{ ok: number }>()
  if (!results.length && prev && prev.ok === 0) await alert(env, 'Society Agent recovered: all probes passing')
}

async function errorWatch(env: Env) {
  const since = Math.floor(Date.now() / 1000) - 15 * 60
  const row = await env.DB.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT fingerprint) AS kinds FROM errors WHERE at > ? AND source = 'server'").bind(since).first<{ n: number; kinds: number }>()
  if ((row?.n ?? 0) >= 5) await alert(env, `Society Agent: ${row!.n} server errors (${row!.kinds} kinds) in the last 15 minutes`)
}

async function pressureWatch(env: Env) {
  const now = Math.floor(Date.now() / 1000)
  const rows = (await env.DB.prepare('SELECT k, count, window_start FROM rate_limits WHERE window_start > ?').bind(now - 3600).all<LimitRow>()).results
  const candidates = [...quotaAlerts(rows, now), ...abuseAlerts(rows, now)]
  if (!candidates.length) return
  // remember what was already sent in the audit table (event 'alert_sent', target = the alert key), so a 15-minute cron does not repeat itself
  const sent = (await env.DB.prepare("SELECT target, MAX(at) AS at FROM audit WHERE event = 'alert_sent' AND at > ? GROUP BY target").bind(now - 24 * 3600).all<{ target: string; at: number }>()).results
  const lastSent = Object.fromEntries(sent.map((r) => [r.target, r.at]))
  for (const a of dueAlerts(candidates, lastSent, now)) {
    await alert(env, a.text)
    await env.DB.prepare("INSERT INTO audit (at, event, actor, target) VALUES (?, 'alert_sent', 'ops', ?)").bind(now, a.key.slice(0, 64)).run()
  }
}

async function restorePoint(env: Env) {
  // Time Travel keeps 30 days of point-in-time history automatically; record today's bookmark-equivalent timestamp so a restore target is easy to pick.
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare("INSERT INTO audit (at, event, actor, target) VALUES (?, 'restore_point', 'ops', ?)").bind(now, new Date(now * 1000).toISOString()).run()
}

export default {
  async scheduled(ev: ScheduledEvent, env: Env) {
    if (ev.cron === '17 3 * * *') { await restorePoint(env); return }
    await probe(env); await errorWatch(env); await pressureWatch(env)
  },
  async fetch() { return new Response('society-agent-ops: scheduled worker', { status: 200 }) },
}
