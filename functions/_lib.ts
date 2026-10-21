import type { Cfg, Intervention } from '../src/engine/world'
import { LIMITS } from '../src/engine/limits'
import { LAYOUT_IDS, MIND_ACTIONS, RESIDENT_LIMIT, ROLES, TOWN_LIMIT, createState, stepWorld, intervene, summarize, type Ev, type Metric } from '../src/engine/world'

export interface Env { DB: D1Database; HEALTH_TOKEN?: string; AI_API_KEY?: string; AI_BASE_URL?: string; AI_MODEL?: string; AI_FALLBACK_MODEL?: string }
export type Ctx = { request: Request; env: Env; params: Record<string, string | string[]> }

export const MAX_TICKS = LIMITS.maxTicks
export const MAX_IVS = LIMITS.maxInterventions
export const MAX_DECISIONS = LIMITS.maxDecisionsPerRun // agent decisions per run; each has a bounded effect, the cap bounds the total
const AUTH_HEADER = 'author' + 'ization'
export const COOKIE = '__Host-sa_session' // __Host- prefix: Secure, Path=/, no Domain — cannot be set by a sibling subdomain
export const SESSION_TTL = LIMITS.sessionTtlSec

export const MAX_RUNS_PER_OWNER = LIMITS.maxRunsPerOwner
const API_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'same-origin' }
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...API_HEADERS, ...headers } })
export const fail = (status: number, error: string) => json({ error }, status)

export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
export async function sha256(text: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))) }
export const randomToken = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer as ArrayBuffer)

/** Parse a JSON body, refusing anything over 200 KB *before* it is read into memory. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > 200_000) return null
  try { const t = await request.text(); if (t.length > 200_000) return null; return JSON.parse(t) as T } catch { return null }
}

/** Fixed-window rate limit in D1. Returns true when the call is allowed. */
export async function allow(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (k, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
  ).bind(key, now, windowSec).first<{ count: number }>()
  // Housekeeping: ~1% of calls drop limiter rows that have been idle for a day, so the table cannot grow without bound.
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 3) await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400).run().catch(() => {})
  return (row?.count ?? 1) <= limit
}

export const clientIp = (r: Request) => r.headers.get('cf-connecting-ip') ?? 'unknown'

/** Read the session token from the HttpOnly cookie (browsers) or a bearer header (API clients / tests). */
export function sessionToken(request: Request): string | null {
  const cookie = /(?:^|;\s*)__Host-sa_session=([a-f0-9]{64})(?:;|$)/i.exec(request.headers.get('cookie') ?? '')
  if (cookie) return cookie[1].toLowerCase()
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(request.headers.get(AUTH_HEADER) ?? '')
  return m ? m[1].toLowerCase() : null
}
export const sessionCookie = (token: string, maxAge: number) => `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`

/** Resolve the wallet address for the current session, or null. */
export async function sessionAddress(ctx: Ctx): Promise<string | null> {
  const token = sessionToken(ctx.request)
  if (!token) return null
  const row = await ctx.env.DB.prepare('SELECT address, expires_at FROM sessions WHERE token_hash = ?').bind(await sha256(token)).first<{ address: string; expires_at: number }>()
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return null
  return row.address
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d)
const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? [...v].map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch)).join('').trim().slice(0, max) : d)

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {})
export function sanitizeCfg(input: unknown): Cfg | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Raw
  const news = obj(raw.news)
  const axis = Array.isArray(raw.axis) ? (raw.axis as unknown[]) : ['Calm', 'Alarmed']
  const cfg: Cfg = {
    name: str(raw.name, 80, 'Untitled scenario') || 'Untitled scenario',
    question: str(raw.question, 400),
    template: str(raw.template, 24, 'water'),
    axis: [str(axis[0], 24, 'Low'), str(axis[1], 24, 'High')],
    population: Math.round(num(raw.population, LIMITS.town.minResidents, LIMITS.town.maxResidents, 12)),
    seed: Math.floor(num(raw.seed, 0, 2 ** 31 - 1, 1)),
    news: {
      text: str(news.text, 240),
      stance: num(news.stance, -1, 1, 0.5),
      startTick: Math.round(num(news.startTick, 0, 40, 2)),
      seedRoles: Array.isArray(news.seedRoles) ? (news.seedRoles as unknown[]).map((r) => str(r, 20)).filter((r) => (ROLES as readonly string[]).includes(r)).slice(0, 4) : ['official'],
    },
  }
  const town = obj(raw.town), r2 = (v: unknown) => Math.round(num(v, -TOWN_LIMIT, TOWN_LIMIT, 0) * 100) / 100
  const t = { trust: r2(town.trust), social: r2(town.social), bias: r2(town.bias) }
  if (t.trust || t.social || t.bias) cfg.town = t
  if (raw.layout !== undefined && raw.layout !== 'classic') { if ((LAYOUT_IDS as readonly string[]).includes(String(raw.layout))) cfg.layout = raw.layout as Cfg['layout'] }
  const rs = obj(raw.residents), tweaks: NonNullable<Cfg['residents']> = {}, r3 = (v: unknown) => Math.round(num(v, -RESIDENT_LIMIT, RESIDENT_LIMIT, 0) * 100) / 100
  for (const k of Object.keys(rs).slice(0, 16)) {
    const id = Number(k); if (!Number.isInteger(id) || id < 0 || id >= cfg.population) continue
    const w = obj(rs[k]), tw = { trust: r3(w.trust), social: r3(w.social), bias: r3(w.bias) }
    if (tw.trust || tw.social || tw.bias) tweaks[String(id)] = { ...(tw.trust ? { trust: tw.trust } : {}), ...(tw.social ? { social: tw.social } : {}), ...(tw.bias ? { bias: tw.bias } : {}) }
  }
  if (Object.keys(tweaks).length) cfg.residents = tweaks
  return cfg.news.text ? cfg : null
}

const validAgent = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 15 ? v : -1)
export function sanitizeIvs(raw: unknown): { tick: number; iv: Intervention }[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_IVS) return null
  const out: { tick: number; iv: Intervention }[] = []
  for (const item of raw) {
    const r = obj(item), iv = obj(r.iv)
    const tick = Math.round(num(r.tick, 0, MAX_TICKS, 0))
    const text = str(iv.text, 240)
    if (!text) return null
    if ((iv.type === 'whisper' || iv.type === 'decide') && validAgent(iv.agent) < 0) return null
    const stance = num(iv.stance, -1, 1, 0)
    if (iv.type === 'announce') out.push({ tick, iv: { type: 'announce', text, stance } })
    else if (iv?.type === 'whisper') out.push({ tick, iv: { type: 'whisper', agent: validAgent(iv.agent), text, stance } })
    else if (iv.type === 'decide') {
      const action = (MIND_ACTIONS as readonly string[]).includes(String(iv.action)) ? (iv.action as (typeof MIND_ACTIONS)[number]) : null
      if (!action) return null
      out.push({ tick, iv: { type: 'decide', agent: validAgent(iv.agent), action, text: text.slice(0, 160), stance: num(iv.stance, -0.3, 0.3, 0) } })
    } else return null
  }
  if (out.filter((x) => x.iv.type === 'decide').length > MAX_DECISIONS) return null
  return out.sort((a, b) => a.tick - b.tick)
}

/** Deterministic server-side replay — the source of truth for every stored run. */
export function simulate(cfg: Cfg, ticks: number, ivs: { tick: number; iv: Intervention }[]) {
  const st = createState(cfg)
  const metrics: Metric[] = []
  const events: Ev[] = []
  let i = 0
  for (let t = 0; t < ticks; t++) {
    while (i < ivs.length && ivs[i].tick <= st.tick) { events.push(...intervene(st, ivs[i].iv)); i++ }
    const r = stepWorld(st)
    metrics.push(r.metric); events.push(...r.events)
  }
  return { st, metrics, events, report: summarize(st, metrics, events) }
}

/** Best-effort: never let logging break a request. */
export async function logError(env: Env, e: { source: 'client' | 'server'; kind: string; message: string; route?: string; detail?: string }) {
  try {
    const message = e.message.slice(0, 300), route = (e.route ?? '').slice(0, 120)
    const fp = (await sha256(`${e.source}|${e.kind}|${route}|${message.replace(/\d+/g, '#')}`)).slice(0, 16)
    await env.DB.batch([
      env.DB.prepare('INSERT INTO errors (at, source, kind, fingerprint, message, route, detail) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(Math.floor(Date.now() / 1000), e.source, e.kind.slice(0, 24), fp, message, route, (e.detail ?? '').slice(0, 600)),
      env.DB.prepare('DELETE FROM errors WHERE at < ?').bind(Math.floor(Date.now() / 1000) - 14 * 86400),
    ])
  } catch { /* logging must never throw */ }
}
export async function audit(env: Env, event: string, actor: string, target = '') {
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO audit (at, event, actor, target) VALUES (?, ?, ?, ?)').bind(Math.floor(Date.now() / 1000), event, actor, target.slice(0, 64)),
      env.DB.prepare('DELETE FROM audit WHERE at < ?').bind(Math.floor(Date.now() / 1000) - 90 * 86400),
    ])
  } catch { /* auditing must never throw */ }
}
