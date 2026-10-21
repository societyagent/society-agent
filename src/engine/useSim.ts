import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createState, intervene, stepWorld, type Cfg, type Ev, type Intervention, type Metric, type State } from './world'

/**
 * A running simulation as an external store.
 *
 * The engine mutates its `State` in place (that is what makes it fast and deterministic), so React cannot see changes by reference.
 * This store keeps the mutable state private and publishes an immutable snapshot (`version`) on every change, which
 * `useSyncExternalStore` observes. Components read `sim.state` only through the hook, never from a ref during render.
 */
export interface SimSnapshot { version: number; tick: number; metrics: Metric[]; events: Ev[]; ivs: { tick: number; iv: Intervention }[] }

export class Sim {
  private st: State
  private ver = 0
  private snap: SimSnapshot
  private subs = new Set<() => void>()
  private replayIvs: { tick: number; iv: Intervention }[]
  private metrics: Metric[] = []
  private events: Ev[] = []
  private ivs: { tick: number; iv: Intervention }[] = []
  private cfg: Cfg
  private replay: { tick: number; iv: Intervention }[]

  constructor(cfg: Cfg, replay: { tick: number; iv: Intervention }[] = []) {
    this.cfg = cfg; this.replay = replay
    this.st = createState(cfg); this.replayIvs = [...replay]; this.snap = this.make()
  }
  private make(): SimSnapshot { return { version: this.ver, tick: this.st.tick, metrics: this.metrics, events: this.events, ivs: this.ivs } }
  private emit() { this.ver++; this.snap = this.make(); this.subs.forEach((f) => f()) }

  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f) } }
  getSnapshot = () => this.snap
  /** Live (mutable) engine state — for rendering the map and for read-only inspection by event handlers. */
  get state(): State { return this.st }

  step(max: number): boolean {
    if (this.st.tick >= max) return false
    const fresh: Ev[] = []
    while (this.replayIvs.length && this.replayIvs[0].tick <= this.st.tick) fresh.push(...intervene(this.st, this.replayIvs.shift()!.iv))
    const r = stepWorld(this.st)
    fresh.push(...r.events)
    this.metrics = [...this.metrics, r.metric]
    if (fresh.length) this.events = [...this.events, ...fresh]
    this.emit(); return true
  }
  intervene(iv: Intervention) {
    this.ivs = [...this.ivs, { tick: this.st.tick, iv }]
    this.events = [...this.events, ...intervene(this.st, iv)]
    this.emit()
  }
  /** Replace the wording of already-logged lines and the speech bubble (cosmetic; never touches opinions or RNG). */
  voice(updates: { key: string; text: string; agent: number; line: string }[], keyOf: (e: Ev) => string) {
    const by = new Map(updates.map((u) => [u.key, u]))
    this.events = this.events.map((e) => { const u = by.get(keyOf(e)); return u ? { ...e, text: u.text } : e })
    for (const u of updates) { const a = this.st.agents[u.agent]; if (a) { a.line = u.line; a.lineAt = this.st.tick } }
    this.emit()
  }
  restart(cfg: Cfg) { this.cfg = cfg; this.reset() }
  reset() {
    this.st = createState(this.cfg); this.replayIvs = [...this.replay]
    this.metrics = []; this.events = []; this.ivs = []; this.emit()
  }
}

export function useSim(cfg: Cfg, replay?: { tick: number; iv: Intervention }[]): { sim: Sim; snap: SimSnapshot } {
  // One Sim per mounted simulation; a new cfg object means a new scenario.
  const [sim] = useState(() => new Sim(cfg, replay))
  const snap = useSyncExternalStore(sim.subscribe, sim.getSnapshot)
  return { sim, snap }
}

/** Drive a Sim on a timer while `running`. */
export function useSimClock(sim: Sim, running: boolean, intervalMs: number, max: number, onDone: () => void) {
  const done = useRef(onDone); useEffect(() => { done.current = onDone }, [onDone])
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => { if (!sim.step(max)) done.current() }, intervalMs)
    return () => clearInterval(id)
  }, [sim, running, intervalMs, max])
}
