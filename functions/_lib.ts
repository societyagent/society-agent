import type { Cfg, Intervention } from '../src/engine/world'
import { createState, stepWorld, intervene, summarize, type Ev, type Metric } from '../src/engine/world'

export interface Env { DB: D1Database; AI_API_KEY?: string; AI_BASE_URL?: string; AI_MODEL?: string; AI_FALLBACK_MODEL?: string }
export type Ctx = { request: Request; env: Env; params: Record<string, string | string[]> }

export const MAX_TICKS = 288
export const MAX_IVS = 40
const AUTH_HEADER = 'author' + 'ization'

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })
export const fail = (status: number, error: string) => json({ error }, status)

export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
export async function sha256(text: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))) }
export const randomToken = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer as ArrayBuffer)

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
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
  return (row?.count ?? 1) <= limit
}

export const clientIp = (r: Request) => r.headers.get('cf-connecting-ip') ?? 'unknown'

/** Resolve the wallet address for a bearer session, or null. */
export async function sessionAddress(ctx: Ctx): Promise<string | null> {
  const h = ctx.request.headers.get(AUTH_HEADER) ?? ''
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(h)
  if (!m) return null
  const row = await ctx.env.DB.prepare('SELECT address, expires_at FROM sessions WHERE token_hash = ?').bind(await sha256(m[1].toLowerCase())).first<{ address: string; expires_at: number }>()
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return null
  return row.address
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d)
const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : d)

export function sanitizeCfg(raw: any): Cfg | null {
  if (!raw || typeof raw !== 'object') return null
  const news = raw.news ?? {}
  const axis = Array.isArray(raw.axis) ? raw.axis : ['Calm', 'Alarmed']
  const cfg: Cfg = {
    name: str(raw.name, 80, 'Untitled scenario') || 'Untitled scenario',
    question: str(raw.question, 400),
    template: str(raw.template, 24, 'water'),
    axis: [str(axis[0], 24, 'Low'), str(axis[1], 24, 'High')],
    population: Math.round(num(raw.population, 6, 16, 12)),
    seed: Math.floor(num(raw.seed, 0, 2 ** 31 - 1, 1)),
    news: {
      text: str(news.text, 240),
      stance: num(news.stance, -1, 1, 0.5),
      startTick: Math.round(num(news.startTick, 0, 40, 2)),
      seedRoles: Array.isArray(news.seedRoles) ? news.seedRoles.map((r: unknown) => str(r, 20)).filter(Boolean).slice(0, 6) : ['official'],
    },
  }
  return cfg.news.text ? cfg : null
}

export function sanitizeIvs(raw: any): { tick: number; iv: Intervention }[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_IVS) return null
  const out: { tick: number; iv: Intervention }[] = []
  for (const r of raw) {
    const tick = Math.round(num(r?.tick, 0, MAX_TICKS, 0))
    const iv = r?.iv
    const text = str(iv?.text, 240)
    if (!text) return null
    const stance = num(iv?.stance, -1, 1, 0)
    if (iv?.type === 'announce') out.push({ tick, iv: { type: 'announce', text, stance } })
    else if (iv?.type === 'whisper') out.push({ tick, iv: { type: 'whisper', agent: Math.round(num(iv.agent, 0, 15, 0)), text, stance } })
    else return null
  }
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
