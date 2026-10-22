// Pure decisions for the ops worker: which quotas are close to running out, and which networks look like abuse.
// Kept free of Cloudflare types so it can be unit-tested; the worker only reads D1 and passes plain rows in.

export interface LimitRow { k: string; count: number; window_start: number }
export interface QuotaRule { prefix: string; label: string; limit: number; windowSec: number }

import { LIMITS } from '../src/engine/limits'

/** The deployment-wide counters. The keys are exactly the ones the API handlers write, and the limits come from the same LIMITS table the handlers enforce. */
export const GLOBAL_RULES: QuotaRule[] = [
  { prefix: 'run:global', label: 'saved runs (deployment-wide)', ...LIMITS.rate.saveRunGlobal },
  { prefix: 'ai:global', label: 'AI calls (deployment-wide)', ...LIMITS.rate.aiGlobal },
  { prefix: 'agent:global', label: 'agent simulations (deployment-wide)', ...LIMITS.rate.agentSimGlobal },
].map(({ prefix, label, limit, windowSec }) => ({ prefix, label, limit, windowSec }))
/** Per-network keys: many of these at the cap at once means someone is probing, not one busy user. */
export const NETWORK_PREFIXES: { prefix: string; limit: number; windowSec: number }[] = [
  { prefix: 'runip:', limit: LIMITS.rate.saveRunNetwork.limit, windowSec: LIMITS.rate.saveRunNetwork.windowSec },
  { prefix: 'aip:', limit: LIMITS.rate.aiNetwork.limit, windowSec: LIMITS.rate.aiNetwork.windowSec },
  { prefix: 'agent:', limit: LIMITS.rate.agentSimNetwork.limit, windowSec: LIMITS.rate.agentSimNetwork.windowSec },
]

export interface Alert { key: string; text: string }

/** A counter only means something inside its window: an old row is a finished window, not pressure. */
const live = (r: LimitRow, windowSec: number, now: number) => now - r.window_start < windowSec

export function quotaAlerts(rows: LimitRow[], now: number, warnAt = 0.8): Alert[] {
  const out: Alert[] = []
  for (const rule of GLOBAL_RULES) {
    const r = rows.find((x) => x.k === rule.prefix)
    if (!r || !live(r, rule.windowSec, now)) continue
    const used = r.count / rule.limit
    if (used >= 1) out.push({ key: `${rule.prefix}:full`, text: `Society Agent: ${rule.label} limit reached (${r.count}/${rule.limit} this hour). New requests are being refused.` })
    else if (used >= warnAt) out.push({ key: `${rule.prefix}:warn`, text: `Society Agent: ${rule.label} at ${Math.round(used * 100)}% (${r.count}/${rule.limit} this hour).` })
  }
  return out
}

/** Abuse looks like several different networks all at their cap in the same window. One heavy user is not abuse. */
export function abuseAlerts(rows: LimitRow[], now: number, minNetworks = 5): Alert[] {
  const out: Alert[] = []
  for (const n of NETWORK_PREFIXES) {
    const capped = rows.filter((r) => r.k.startsWith(n.prefix) && !r.k.endsWith(':global') && live(r, n.windowSec, now) && r.count >= n.limit)
    if (capped.length >= minNetworks) out.push({ key: `${n.prefix}:abuse`, text: `Society Agent: ${capped.length} networks are at the ${n.prefix.replace(/:$/, '')} limit within the same hour. Possible scripted abuse.` })
  }
  return out
}

/** Do not repeat the same alert every 15 minutes: send a key at most once per cooldown. */
export function dueAlerts(candidates: Alert[], lastSent: Record<string, number>, now: number, cooldownSec = 3 * 3600): Alert[] {
  return candidates.filter((a) => now - (lastSent[a.key] ?? 0) >= cooldownSec)
}
