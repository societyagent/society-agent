/**
 * Society Agent engine — a deterministic, seeded town simulation.
 * Agents have personas, traits, memory and an opinion on one issue. They move
 * through a 2D town, talk to each other, spread information and shift opinion
 * (bounded-confidence dynamics with trust and role amplification).
 * Runs identically in the browser (live preview) and on the edge (persisted runs).
 */
export const GRID_W = 48
export const GRID_H = 28

export type PlaceKind = 'civic' | 'food' | 'market' | 'school' | 'health' | 'park' | 'home'
export type Door = 's' | 'n' | null
export interface Place { id: string; name: string; kind: PlaceKind; x: number; y: number; w: number; h: number; door: Door }

/** A town's shape. Every layout has the same named places (so residents' routines work everywhere) in different positions and street plans. */
export type LayoutId = 'classic' | 'village' | 'mainstreet'
export const LAYOUT_IDS: readonly LayoutId[] = ['classic', 'village', 'mainstreet']
interface LayoutDef { id: LayoutId; name: string; blurb: string; hRoads: number[]; vRoads: number[]; places: Place[] }
export interface Layout extends LayoutDef { isRoad: (x: number, y: number) => boolean; cost: Uint8Array }  // hRoads / vRoads come from LayoutDef

const homes = (pos: [number, number][]): Place[] => pos.map(([x, y], i): Place => ({ id: `home${i}`, name: `House ${i + 1}`, kind: 'home', x, y, w: 3, h: 3, door: 's' }))
const P = (id: string, name: string, kind: PlaceKind, x: number, y: number, w: number, h: number): Place => ({ id, name, kind, x, y, w, h, door: kind === 'park' ? null : 's' })

const DEFS: Record<LayoutId, LayoutDef> = {
  // Two avenues and two cross streets, a plaza in the middle. The original town.
  classic: {
    id: 'classic', name: 'Classic town', blurb: 'Two avenues and two cross streets, with a plaza in the middle.',
    hRoads: [9, 15], vRoads: [17, 29],
    places: [
      P('hall', 'Town Hall', 'civic', 19, 3, 9, 5), P('cafe', 'Corner Cafe', 'food', 5, 4, 7, 4), P('market', 'Market', 'market', 34, 4, 9, 5),
      P('school', 'School', 'school', 5, 17, 9, 5), P('clinic', 'Clinic', 'health', 35, 17, 8, 5), P('park', 'Riverside Park', 'park', 19, 17, 9, 9),
      ...homes([[2, 11], [8, 11], [14, 11], [20, 11], [26, 11], [32, 11], [38, 11], [44, 11]]),
    ],
  },
  // One crossroads and a tight core: every place is close to every other.
  village: {
    id: 'village', name: 'Village square', blurb: 'One crossroads with every place packed close around it.',
    // Houses must stand directly above a road (their front door opens onto it), so a second street runs along the south edge.
    hRoads: [13, 22], vRoads: [23],
    places: [
      P('cafe', 'Corner Cafe', 'food', 14, 8, 6, 4), P('hall', 'Town Hall', 'civic', 25, 7, 7, 5), P('market', 'Market', 'market', 34, 8, 6, 4),
      P('school', 'School', 'school', 13, 16, 6, 5), P('park', 'Riverside Park', 'park', 25, 15, 6, 6), P('clinic', 'Clinic', 'health', 33, 16, 6, 5),
      ...homes([[5, 9], [9, 9], [41, 9], [45, 9], [5, 18], [9, 18], [41, 18], [45, 18]]),
    ],
  },
  // A long street: the town is strung out along it, with a second street at the bottom.
  mainstreet: {
    id: 'mainstreet', name: 'Long main street', blurb: 'One long street with the town strung out along it.',
    hRoads: [13, 22], vRoads: [23],
    places: [
      P('cafe', 'Corner Cafe', 'food', 2, 8, 7, 4), P('hall', 'Town Hall', 'civic', 27, 7, 9, 5), P('market', 'Market', 'market', 40, 8, 7, 4),
      P('school', 'School', 'school', 2, 16, 8, 5), P('park', 'Riverside Park', 'park', 15, 15, 7, 6), P('clinic', 'Clinic', 'health', 41, 16, 6, 5),
      ...homes([[11, 9], [15, 9], [19, 9], [11, 18], [25, 18], [29, 18], [33, 18], [37, 18]]),
    ],
  },
}

function compile(d: LayoutDef): Layout {
  const isRoad = (x: number, y: number) => d.hRoads.some((r) => y === r || y === r + 1) || d.vRoads.some((c) => x === c || x === c + 1)
  const v0 = d.vRoads[0], vN = d.vRoads[d.vRoads.length - 1] + 1
  const g = new Uint8Array(GRID_W * GRID_H)
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !g[y * GRID_W + x]) g[y * GRID_W + x] = v }
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (isRoad(x, y)) g[y * GRID_W + x] = 1
  for (const p of d.places) {
    if (p.kind === 'park') { for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) set(x, y, 1); continue }
    for (let x = p.x; x < p.x + p.w; x++) g[(p.y + p.h - 1) * GRID_W + x] = 2
    // Paved apron from the lobby down to the next road; if no road is close, a short sidewalk runs to the nearest vertical street.
    const y0 = p.y + p.h
    let road = -1
    for (let k = 0; k < 4 && road < 0; k++) if (isRoad(p.x, y0 + k)) road = y0 + k
    if (road >= 0) { for (let y = y0; y < road; y++) for (let x = p.x; x < p.x + p.w; x++) set(x, y, 1) }
    else {
      for (let x = p.x; x < p.x + p.w; x++) set(x, y0, 1)
      if (p.x + p.w - 1 < v0) for (let x = p.x + p.w; x < v0; x++) set(x, y0, 1)
      else if (p.x > vN) for (let x = p.x - 1; x > vN; x--) set(x, y0, 1)
    }
  }
  return { ...d, isRoad, cost: g }
}
export const LAYOUT_META = LAYOUT_IDS.map((id) => ({ id, name: DEFS[id].name, blurb: DEFS[id].blurb }))
const LAYOUTS = new Map<LayoutId, Layout>()
export function layoutOf(id?: string): Layout {
  const k: LayoutId = (LAYOUT_IDS as readonly string[]).includes(id ?? '') ? (id as LayoutId) : 'classic'
  let l = LAYOUTS.get(k); if (!l) { l = compile(DEFS[k]); LAYOUTS.set(k, l) }
  return l
}

// The classic layout under its original names (kept so existing callers and saved runs keep working).
export const PLACES: Place[] = DEFS.classic.places
export const isRoad = (x: number, y: number) => layoutOf('classic').isRoad(x, y)
/** 0 = blocked, 1 = road / sidewalk / park, 2 = a building's lobby row. Roofs stay blocked. */
export const costGrid = (layout?: string): Uint8Array => layoutOf(layout).cost

export function route(sx: number, sy: number, tx: number, ty: number, layout?: string): [number, number][] {
  if (sx === tx && sy === ty) return []
  const g = costGrid(layout), N = GRID_W * GRID_H
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1)
  const heap: [number, number][] = []
  const push = (d: number, i: number) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const par = (k - 1) >> 1; if (heap[par][0] <= heap[k][0]) break; [heap[par], heap[k]] = [heap[k], heap[par]]; k = par } }
  const pop = (): [number, number] => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m } } return top }
  const si = sy * GRID_W + sx, ti = ty * GRID_W + tx
  dist[si] = 0; push(0, si)
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]
  while (heap.length) {
    const [d, i] = pop()
    if (d > dist[i]) continue
    if (i === ti) break
    const x = i % GRID_W, y = (i / GRID_W) | 0
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k]
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
      const ni = ny * GRID_W + nx, c = g[ni]
      if (!c) continue
      const nd = d + (c === 2 ? 1.6 : 1)
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = i; push(nd, ni) }
    }
  }
  if (prev[ti] === -1) return [[tx, ty]]
  const out: [number, number][] = []
  for (let i = ti; i !== si; i = prev[i]) out.push([i % GRID_W, (i / GRID_W) | 0])
  return out.reverse()
}

export const placeById = (id: string, layout?: string) => layoutOf(layout).places.find((p) => p.id === id)!
export const placeName = (layout: string | undefined, id: string | null | undefined) => (id ? layoutOf(layout).places.find((p) => p.id === id)?.name ?? id : '')

export interface Traits { social: number; trust: number; bias: number }
export interface Agent {
  id: number; name: string; age: number; role: string; bio: string; color: string
  home: string; work: string
  x: number; y: number; tx: number; ty: number
  place: string | null; dest: string; path: [number, number][]; goal: string
  informed: boolean; opinion: number
  heardAt: number | null; heardFrom: string | null
  traits: Traits; memory: string[]
  line: string | null; lineAt: number
  stubborn: number; lastWith: number; lastWithAt: number
}
export interface NewsCfg { text: string; stance: number; startTick: number; seedRoles: string[] }
/** Optional character of the whole town: a shift added to every resident's traits. Absent or all-zero = the standard town, byte-for-byte. */
export interface TownCfg { trust: number; social: number; bias: number }
export const TOWN_LIMIT = 0.3
export const ROLES = ['official', 'journalist', 'organizer', 'nurse', 'teacher', 'shopkeeper', 'retiree', 'barista', 'student'] as const
/** Per-resident adjustment, added on top of the town's character. Same bounds idea as `TownCfg`, a little wider because it targets one person. */
export interface ResidentTweak { trust?: number; social?: number; bias?: number }
export const RESIDENT_LIMIT = 0.5
export interface Cfg {
  name: string; question: string; template: string
  news: NewsCfg; population: number; axis: [string, string]; seed: number
  town?: TownCfg
  layout?: LayoutId
  residents?: Record<string, ResidentTweak>
}
export interface State { tick: number; rng: number; agents: Agent[]; cfg: Cfg; newsStarted: boolean; talks: number }
export interface Ev { tick: number; t: string; type: 'news' | 'say' | 'inform' | 'shift' | 'arrive' | 'intervene'; agent?: number; with?: number; place?: string; text: string; news?: boolean; stance?: string }
export interface Metric { tick: number; informed: number; mean: number; spread: number; talks: number }

const PERSONAS: Omit<Agent, 'x' | 'y' | 'tx' | 'ty' | 'place' | 'dest' | 'path' | 'goal' | 'informed' | 'opinion' | 'heardAt' | 'heardFrom' | 'memory' | 'line' | 'lineAt' | 'home' | 'id' | 'stubborn' | 'lastWith' | 'lastWithAt'>[] = [
  { name: 'Maya Rahman', age: 34, role: 'organizer', bio: 'Runs the neighborhood association. Warm, assertive, quick to rally people.', color: '#a78bfa', work: 'hall', traits: { social: .9, trust: .6, bias: .35 } },
  { name: 'Omar Haddad', age: 41, role: 'journalist', bio: 'Local reporter. Skeptical by habit, spreads what he can verify — and some he cannot.', color: '#f472b6', work: 'cafe', traits: { social: .8, trust: .3, bias: .1 } },
  { name: 'Ines Duarte', age: 29, role: 'teacher', bio: 'Teaches at the school. Careful, values evidence, worries about the kids.', color: '#34d399', work: 'school', traits: { social: .6, trust: .6, bias: .2 } },
  { name: 'Paul Weiss', age: 52, role: 'nurse', bio: 'Clinic nurse practitioner. Calm under pressure, trusted by many.', color: '#60a5fa', work: 'clinic', traits: { social: .5, trust: .5, bias: -.1 } },
  { name: 'Rosa Alvarez', age: 47, role: 'shopkeeper', bio: 'Owns a market stall. Hears everything, repeats most of it.', color: '#fbbf24', work: 'market', traits: { social: .95, trust: .7, bias: .3 } },
  { name: 'Kenji Mori', age: 19, role: 'student', bio: 'University student home for the term. Online a lot, trusts peers over officials.', color: '#fb7185', work: 'school', traits: { social: .7, trust: .4, bias: .25 } },
  { name: 'Grace Okafor', age: 68, role: 'retiree', bio: 'Retired bus driver. Spends days in the park. Distrusts announcements.', color: '#c4b5fd', work: 'park', traits: { social: .75, trust: .2, bias: .4 } },
  { name: 'Tom Becker', age: 38, role: 'barista', bio: 'Runs the cafe counter. Friendly, neutral, the town\'s unofficial switchboard.', color: '#fdba74', work: 'cafe', traits: { social: .9, trust: .6, bias: 0 } },
  { name: 'Leila Nasser', age: 44, role: 'official', bio: 'Deputy clerk at Town Hall. Speaks carefully, believes in process.', color: '#67e8f9', work: 'hall', traits: { social: .4, trust: .8, bias: -.2 } },
  { name: 'Diego Santos', age: 31, role: 'shopkeeper', bio: 'Sells produce at the market. Practical, impatient with rumors.', color: '#86efac', work: 'market', traits: { social: .65, trust: .45, bias: -.05 } },
  { name: 'Hana Kim', age: 26, role: 'teacher', bio: 'Primary school teacher. Open-minded, easily swayed by people she respects.', color: '#f9a8d4', work: 'school', traits: { social: .6, trust: .65, bias: .3 } },
  { name: 'Victor Lang', age: 58, role: 'retiree', bio: 'Former engineer. Wants numbers before opinions, dislikes panic.', color: '#93c5fd', work: 'park', traits: { social: .45, trust: .35, bias: -.3 } },
  { name: 'Amina Yusuf', age: 36, role: 'nurse', bio: 'Night-shift nurse. Tired, pragmatic, informs patients directly.', color: '#5eead4', work: 'clinic', traits: { social: .55, trust: .55, bias: .1 } },
  { name: 'Ben Carter', age: 22, role: 'barista', bio: 'Part-time at the cafe, full-time group-chat addict.', color: '#fca5a5', work: 'cafe', traits: { social: .85, trust: .5, bias: .45 } },
  { name: 'Sofia Petrov', age: 50, role: 'official', bio: 'Council member. Polished, persuasive, protective of the town\'s image.', color: '#fde68a', work: 'hall', traits: { social: .7, trust: .75, bias: -.35 } },
  { name: 'Jamal Reed', age: 33, role: 'organizer', bio: 'Union rep who knocks doors. Convinced collective action works.', color: '#d8b4fe', work: 'market', traits: { social: .85, trust: .4, bias: .5 } },
]

export const personaOf = (id: number) => PERSONAS[id]
export const ROLE_WEIGHT: Record<string, number> = { journalist: 1.5, organizer: 1.3, official: 1.25, nurse: 1.15, teacher: 1.1, shopkeeper: 1.05 }

function rand(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v))
export const clock = (tick: number) => {
  const m = (7 * 60 + tick * 10) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
const hourOf = (tick: number) => Math.floor(((7 * 60 + tick * 10) % 1440) / 60)
const dayOf = (tick: number) => Math.floor((7 * 60 + tick * 10) / 1440) + 1
export const dayClock = (tick: number) => `Day ${dayOf(tick)} · ${clock(tick)}`

function point(p: Place, s: { rng: number }, id = 0): [number, number] {
  // Golden-ratio offsets per resident keep people spread out (deterministic, still consumes exactly two rng draws).
  const GR = 0.61803398875
  const rx = (rand(s) + id * GR) % 1, ry = (rand(s) + id * GR * GR) % 1
  if (p.kind === 'park') return [p.x + 1 + Math.floor(rx * (p.w - 2)), p.y + 1 + Math.floor(ry * (p.h - 2))]
  const inset = p.w >= 5 ? 1 : 0
  return [p.x + inset + Math.floor(rx * (p.w - 2 * inset)), p.y + p.h - 1]
}

export function createState(cfg: Cfg): State {
  const s = { rng: cfg.seed >>> 0 } as { rng: number }
  const n = Math.max(6, Math.min(PERSONAS.length, cfg.population))
  const shift = cfg.town && (cfg.town.trust || cfg.town.social || cfg.town.bias) ? cfg.town : null
  const agents: Agent[] = PERSONAS.slice(0, n).map((p, i) => {
    const tw = cfg.residents?.[String(i)]
    const traits = shift || tw ? { social: clamp(p.traits.social + (shift?.social ?? 0) + (tw?.social ?? 0), 0.05, 1), trust: clamp(p.traits.trust + (shift?.trust ?? 0) + (tw?.trust ?? 0), 0.05, 0.95), bias: clamp(p.traits.bias + (shift?.bias ?? 0) + (tw?.bias ?? 0), -1, 1) } : p.traits
    const home = `home${i % 8}`
    const [x, y] = point(placeById(home, cfg.layout), s, i)
    return { ...p, traits, id: i, home, x, y, tx: x, ty: y, place: home, dest: home, path: [], goal: 'sleeping', informed: false, opinion: 0, heardAt: null, heardFrom: null, memory: [], line: null, lineAt: -99, stubborn: clamp(0.25 + (1 - traits.trust) * 0.5 + (p.age > 55 ? 0.15 : 0), 0, 0.9), lastWith: -1, lastWithAt: -99 }
  })
  return { tick: 0, rng: s.rng, agents, cfg, newsStarted: false, talks: 0 }
}

function stance(a: number): 'alarmed' | 'worried' | 'neutral' | 'skeptical' {
  return a > 0.5 ? 'alarmed' : a > 0.15 ? 'worried' : a > -0.15 ? 'neutral' : 'skeptical'
}
const pick = <T,>(arr: T[], s: { rng: number }) => arr[Math.floor(rand(s) * arr.length)]
const first = (name: string) => name.split(' ')[0]

function speech(speaker: Agent, listener: Agent, topic: string, s: { rng: number }): string {
  const tpl: Record<string, string[]> = {
    alarmed: [`This is serious — ${topic}. We can't just wait it out.`, `Have you heard? ${topic}. People need to act now.`, `I'm genuinely worried: ${topic}.`],
    worried: [`I keep thinking about it — ${topic}. It could get worse.`, `Did you hear that ${topic}? I'm not sure what to make of it.`, `Honestly a bit uneasy: ${topic}.`],
    neutral: [`Apparently ${topic}. Let's see what actually happens.`, `${topic[0].toUpperCase()}${topic.slice(1)} — we'll know more soon.`, `Heard ${topic}. No point jumping to conclusions.`],
    skeptical: [`People are overreacting. ${topic[0].toUpperCase()}${topic.slice(1)} — so what?`, `I don't buy it: ${topic}. Show me proof.`, `That sounds exaggerated — ${topic}.`],
  }
  const line = pick(tpl[stance(speaker.opinion)], s)
  const flavor: Record<string, string> = { journalist: ' I\'m checking sources.', official: ' We\'re following procedure.', organizer: ' We should talk as a group.', nurse: ' Stay level-headed.', teacher: ' Think of the children.', shopkeeper: ' Everyone at the market is talking about it.', retiree: ' I\'ve seen this before.', student: ' It\'s all over the group chat.', barista: ' Half the cafe was on about it.' }
  return `${first(listener.name)}, ${/^I(['’ ])/.test(line) ? line : line[0].toLowerCase() + line.slice(1)}${flavor[speaker.role] && rand(s) < 0.5 ? flavor[speaker.role] : ''}`
}
const smalltalk = ['Nice weather for it.', 'Long day already.', 'Have you eaten?', 'Busy morning, isn\'t it?', 'The kids are loud today.', 'Coffee\'s better here than at home.']

function remember(a: Agent, tick: number, text: string) {
  a.memory.unshift(`${dayClock(tick)} — ${text}`)
  if (a.memory.length > 14) a.memory.pop()
}

function targetFor(a: Agent, st: State, s: { rng: number }): { place: string; goal: string } {
  const h = hourOf(st.tick)
  const informedUrgent = a.informed && Math.abs(a.opinion) > 0.45 && a.traits.social > 0.55 && h >= 8 && h < 21
  if (h >= 22 || h < 7) return { place: a.home, goal: 'resting at home' }
  if (informedUrgent && rand(s) < 0.45) return { place: 'hall', goal: 'gathering at Town Hall to discuss the news' }
  if (h < 8) return { place: rand(s) < a.traits.social ? 'cafe' : a.home, goal: 'morning coffee' }
  if (h >= 12 && h < 13) return { place: rand(s) < 0.5 ? 'cafe' : 'market', goal: 'lunch' }
  if (h >= 17 && h < 20) return { place: a.traits.social > 0.55 ? 'park' : 'cafe', goal: 'evening out' }
  if (h >= 20) return { place: a.home, goal: 'heading home' }
  return { place: a.work, goal: 'working' }
}

function inform(st: State, listener: Agent, from: Agent | null, base: number, evs: Ev[], via: string) {
  listener.informed = true
  listener.heardAt = st.tick
  listener.heardFrom = from ? from.name : 'public announcement'
  const src = from ? from.opinion * 0.6 : st.cfg.news.stance * 0.6
  listener.opinion = clamp(src * (0.35 + 0.65 * listener.traits.trust) + listener.traits.bias * 0.9 - (listener.traits.trust < 0.3 && from?.role === 'official' ? 0.35 : 0) + base)
  remember(listener, st.tick, from ? `${first(from.name)} told me: "${st.cfg.news.text}"` : `Heard the announcement: "${st.cfg.news.text}"`)
  evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'inform', agent: listener.id, with: from?.id, place: listener.place ?? undefined, text: `${first(listener.name)} heard the news${from ? ` from ${first(from.name)}` : ''} (${via}) and feels ${stance(listener.opinion)}.` })
}

export function stepWorld(st: State): { events: Ev[]; metric: Metric } {
  const evs: Ev[] = []
  const s = st as unknown as { rng: number }
  const n = st.cfg.news

  // 1. News enters the town.
  if (!st.newsStarted && st.tick >= n.startTick) {
    st.newsStarted = true
    const pool = st.agents.filter((a) => n.seedRoles.includes(a.role))
    const seeds = (pool.length ? pool : st.agents).slice(0, 2)
    evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'news', text: `News breaks: "${n.text}"` })
    for (const a of seeds) inform(st, a, null, 0.15, evs, 'first to hear')
  }

  // 2. Intentions + movement: route along streets, 2 cells per tick.
  for (const a of st.agents) {
    if (st.tick % 3 === a.id % 3 || a.goal === 'sleeping') {
      const t = targetFor(a, st, s)
      if (t.place !== a.dest || a.goal !== t.goal) {
        const [tx, ty] = point(placeById(t.place, st.cfg.layout), s, a.id)
        a.tx = tx; a.ty = ty; a.goal = t.goal; a.dest = t.place
        a.path = route(a.x, a.y, tx, ty, st.cfg.layout)
        if (a.path.length) a.place = null
        else a.place = a.dest
      }
    }
    for (let k = 0; k < 2 && a.path.length; k++) { const [nx, ny] = a.path.shift()!; a.x = nx; a.y = ny }
    if (!a.path.length && a.place === null) a.place = a.dest
  }

  // 3. Conversations between nearby agents.
  // Fisher–Yates with the seeded RNG: RNG consumption must not depend on the JS engine's sort implementation.
  const order = [...st.agents]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const busy = new Set<number>()
  for (const a of order) {
    if (busy.has(a.id)) continue
    const near = st.agents.filter((b) => b.id !== a.id && !busy.has(b.id) && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 2)
    if (!near.length) continue
    const fresh = near.filter((b) => !(a.lastWith === b.id && st.tick - a.lastWithAt < 8))
    if (!fresh.length) continue
    const b = fresh[Math.floor(rand(s) * fresh.length)]
    a.lastWith = b.id; a.lastWithAt = st.tick; b.lastWith = a.id; b.lastWithAt = st.tick
    if (rand(s) > 0.2 + 0.55 * ((a.traits.social + b.traits.social) / 2)) continue
    busy.add(a.id); busy.add(b.id)
    st.talks++
    const speaker = a.informed && (!b.informed || rand(s) < 0.5) ? a : b.informed ? b : null
    if (!speaker) {
      if (rand(s) < 0.18) { a.line = pick(smalltalk, s); a.lineAt = st.tick; evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'say', agent: a.id, with: b.id, place: a.place ?? undefined, text: `${first(a.name)} to ${first(b.name)}: "${a.line}"` }) }
      continue
    }
    const listener = speaker === a ? b : a
    const w = ROLE_WEIGHT[speaker.role] ?? 1
    const topic = n.text.charAt(0).toLowerCase() + n.text.slice(1).replace(/[.!]$/, '')
    const line = speech(speaker, listener, topic, s)
    speaker.line = line; speaker.lineAt = st.tick
    evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'say', agent: speaker.id, with: listener.id, place: speaker.place ?? undefined, news: true, stance: stance(speaker.opinion), text: `${first(speaker.name)} to ${first(listener.name)}: "${line}"` })
    if (!listener.informed) {
      if (rand(s) < Math.min(0.97, (0.45 + 0.4 * listener.traits.trust) * w)) inform(st, listener, speaker, 0, evs, 'conversation')
      continue
    }
    const gap = speaker.opinion - listener.opinion
    const before = stance(listener.opinion)
    const reactance = speaker.role === 'official' && listener.traits.trust < 0.35
    if (reactance) listener.opinion = clamp(listener.opinion - Math.sign(gap || 1) * 0.07)
    else if (Math.abs(gap) < 0.7) listener.opinion = clamp(listener.opinion + 0.13 * gap * w * listener.traits.trust * (1 - listener.stubborn))
    else if (rand(s) < 0.35) listener.opinion = clamp(listener.opinion - Math.sign(gap) * 0.05)
    else if (Math.abs(gap) < 0.25) listener.opinion = clamp(listener.opinion + Math.sign(listener.opinion || 1) * 0.03)
    remember(listener, st.tick, `${first(speaker.name)} said it felt ${stance(speaker.opinion)}; I now feel ${stance(listener.opinion)}.`)
    if (stance(listener.opinion) !== before) evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'shift', agent: listener.id, with: speaker.id, text: `${first(listener.name)} shifted from ${before} to ${stance(listener.opinion)} after talking to ${first(speaker.name)}.` })
  }

  st.tick++
  const informedAgents = st.agents.filter((a) => a.informed)
  const mean = informedAgents.length ? informedAgents.reduce((x, a) => x + a.opinion, 0) / informedAgents.length : 0
  const spread = informedAgents.length > 1 ? Math.sqrt(informedAgents.reduce((x, a) => x + (a.opinion - mean) ** 2, 0) / informedAgents.length) : 0
  return { events: evs, metric: { tick: st.tick, informed: informedAgents.length / st.agents.length, mean, spread, talks: st.talks } }
}

export const MIND_ACTIONS = ['warn', 'reassure', 'verify', 'stay_quiet'] as const
export type MindAction = (typeof MIND_ACTIONS)[number]
/**
 * `decide` is a resident's own choice (typically produced by a language model, then RECORDED as an input).
 * The engine never calls a model: given the recorded decision it applies a bounded, fully deterministic effect,
 * so a run with minds on replays byte-for-byte on the server and for every viewer.
 */
export type Intervention =
  | { type: 'announce'; text: string; stance: number }
  | { type: 'whisper'; agent: number; text: string; stance: number }
  | { type: 'decide'; agent: number; action: MindAction; text: string; stance: number }
export const HEARING_RADIUS = 3

export function intervene(st: State, iv: Intervention): Ev[] {
  const evs: Ev[] = []
  const text = iv.text.trim().slice(0, 240)
  if (iv.type === 'announce') {
    evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'intervene', text: `Public announcement: "${text}"` })
    for (const a of st.agents) {
      if (!a.informed) { inform(st, a, null, iv.stance * 0.3, evs, 'announcement') }
      else {
        const before = stance(a.opinion)
        a.opinion = clamp(a.opinion + (iv.stance - a.opinion) * 0.35 * a.traits.trust)
        remember(a, st.tick, `Official announcement: "${text}"`)
        if (stance(a.opinion) !== before) evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'shift', agent: a.id, text: `${first(a.name)} shifted from ${before} to ${stance(a.opinion)} after the announcement.` })
      }
    }
  } else if (iv.type === 'decide') {
    const a = st.agents[iv.agent]
    if (!a || !a.informed) return evs // only someone who has heard the news can act on it
    const shift = Math.max(-0.3, Math.min(0.3, iv.stance))
    const verb = { warn: 'warn the others', reassure: 'reassure the others', verify: 'check the facts first', stay_quiet: 'stay quiet' }[iv.action]
    const said = iv.action === 'stay_quiet' ? '' : ': "' + text + '"'
    evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'intervene', agent: a.id, text: `${first(a.name)} chooses to ${verb}${said || '.'}` })
    const before = stance(a.opinion)
    a.opinion = clamp(iv.action === 'verify' ? a.opinion * 0.7 + shift : a.opinion + shift)
    remember(a, st.tick, `I decided to ${verb}${said}`)
    if (stance(a.opinion) !== before) evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'shift', agent: a.id, text: `${first(a.name)} shifted from ${before} to ${stance(a.opinion)}` })
    if (iv.action === 'stay_quiet') return evs
    const target = iv.action === 'warn' ? 0.6 : iv.action === 'reassure' ? -0.5 : 0
    for (const l of st.agents) {
      if (l.id === a.id || Math.abs(l.x - a.x) + Math.abs(l.y - a.y) > HEARING_RADIUS) continue
      if (!l.informed) { inform(st, l, a, 0, evs, 'conversation'); continue }
      const was = stance(l.opinion)
      l.opinion = clamp(l.opinion + (target - l.opinion) * 0.22 * l.traits.trust * (1 - 0.5 * l.stubborn))
      remember(l, st.tick, `${first(a.name)} said: "${text}"`)
      if (stance(l.opinion) !== was) evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'shift', agent: l.id, with: a.id, text: `${first(l.name)} shifted from ${was} to ${stance(l.opinion)} after ${first(a.name)} spoke` })
    }
  } else {
    const a = st.agents[iv.agent]
    if (a) {
      evs.push({ tick: st.tick, t: dayClock(st.tick), type: 'intervene', agent: a.id, text: `Whispered to ${first(a.name)}: "${text}"` })
      a.informed = true; a.heardAt = st.tick; a.heardFrom = 'you'
      a.opinion = clamp(a.opinion * 0.4 + iv.stance * 0.7)
      remember(a, st.tick, `A stranger told me: "${text}"`)
    }
  }
  return evs
}

/** How many people each resident directly told the news to, most first. Ties are broken by name so the order is stable. */
export function spreaderStats(st: State, events: Ev[]): [string, number][] {
  const m = new Map<string, number>()
  for (const e of events) if (e.type === 'inform' && e.with !== undefined) { const k = st.agents[e.with]?.name; if (k) m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/**
 * One convention for time everywhere (report, CSV, event log, Lab): a metric row `tick` N is the state after N steps and is labelled with the
 * clock at the START of that step (`dayClock(N - 1)`, the same label the events of that step carry). Durations are counted from the moment the
 * news breaks, exactly as the Experiment Lab counts "hours until half the town knew".
 */
export function spreadTiming(metrics: Metric[], startTick: number) {
  const hoursSince = (m: Metric) => Math.max(0, m.tick - 1 - startTick) / 6
  const at = (m: Metric | undefined) => (m ? { hours: hoursSince(m), clock: dayClock(m.tick - 1) } : null)
  return { half: at(metrics.find((m) => m.informed >= 0.5)), all: at(metrics.find((m) => m.informed >= 1)) }
}

export function summarize(st: State, metrics: Metric[], events: Ev[]) {
  const total = st.agents.length
  const timing = spreadTiming(metrics, st.cfg.news.startTick)
  const spreaders = spreaderStats(st, events)
  const places = new Map<string, number>()
  for (const e of events) if (e.type === 'say' && e.place) places.set(e.place, (places.get(e.place) ?? 0) + 1)
  const topPlace = [...places.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const last = metrics[metrics.length - 1]
  const shifts = events.filter((e) => e.type === 'shift').length
  const lines: string[] = []
  lines.push(`${Math.round((last?.informed ?? 0) * total)} of ${total} residents had heard the news by the end of the run (${last ? dayClock(last.tick - 1) : 'the start'}).`)
  if (timing.half) {
    // a public announcement can inform everyone in the same step; say so instead of printing the same number twice
    const same = timing.all && timing.all.hours === timing.half.hours
    lines.push(`Half the town knew ${timing.half.hours.toFixed(1)} simulated hours after the news broke (by ${timing.half.clock})${timing.all ? (same ? ', and everyone knew at that same moment' : `; everyone knew after ${timing.all.hours.toFixed(1)} hours`) : ''}.`)
  }
  else lines.push('The news had not yet reached half the town.')
  if (spreaders.length) {
    const best = spreaders[0][1], leaders = spreaders.filter(([, n]) => n === best).map(([name]) => name.split(' ')[0])
    const people = `${best} ${best === 1 ? 'person' : 'people'}`
    lines.push(leaders.length === 1
      ? `${spreaders[0][0]} was the strongest spreader, directly informing ${people}.`
      : `${leaders.slice(0, -1).join(', ')} and ${leaders[leaders.length - 1]} tied as the strongest spreaders, each directly informing ${people}.`)
  }
  if (topPlace) lines.push(`Most conversation happened at ${placeName(st.cfg.layout, topPlace[0])} (${topPlace[1]} exchanges).`)
  if (last) lines.push(`Average opinion ended at ${last.mean.toFixed(2)} on the ${st.cfg.axis[0]} ↔ ${st.cfg.axis[1]} axis, with spread ${last.spread.toFixed(2)} — ${last.spread > 0.45 ? 'a polarized town' : last.spread > 0.25 ? 'noticeable disagreement' : 'broad agreement'}.`)
  lines.push(`${shifts} opinion shift${shifts === 1 ? '' : 's'} crossed a stance boundary after conversations or interventions.`)
  return lines
}

/** The cast, for documentation and UI. Read-only view of the engine's own list. */
export const PERSONAS_PUBLIC: readonly Readonly<{ name: string; age: number; role: string; bio: string; work: string; traits: Traits }>[] = PERSONAS
