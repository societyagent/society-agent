import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Town } from '@/components/Town'
import { createState, dayClock, intervene, personaOf, stepWorld, type Metric, type State } from '@/engine/world'
import { buildCfg } from '@/engine/templates'

const ease = [0.22, 1, 0.36, 1] as const
const SEED = 20261021
const STEP = 12 // 09:00 — the moment "you" step in during the comparison

/* ───────── helpers ───────── */
function Fade({ children, d = 0, className }: { children: React.ReactNode; d?: number; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.7, delay: d, ease }}>{children}</motion.div>
}
const Eyebrow = ({ children }: { children: React.ReactNode }) => <p className="font-mono text-[11px] uppercase tracking-[.26em] text-[#ff9a62]">{children}</p>

function Sprite({ id, size = 64 }: { id: number; size?: number }) {
  const idx = (id % 6) * 3 * 27 + 24, col = idx % 27, row = Math.floor(idx / 27)
  return <div role="img" aria-label="" style={{ width: size, height: size, backgroundImage: 'url(/town/tiles.png)', backgroundSize: `${27 * size}px ${18 * size}px`, backgroundPosition: `-${col * size}px -${row * size}px`, imageRendering: 'pixelated' }} />
}

/* ───────── hero: the real engine, running ───────── */
function LiveTown() {
  const mk = (seed: number) => createState(buildCfg('water', { seed, population: 14 }))
  const st = useRef<State>(mk(SEED))
  const [, force] = useState(0)
  const [last, setLast] = useState<Metric | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) { for (let i = 0; i < 40; i++) stepWorld(st.current); force((n) => n + 1); return }
    const id = window.setInterval(() => {
      if (st.current.tick >= 144) st.current = mk(SEED + 1 + Math.floor(Math.random() * 999))
      setLast(stepWorld(st.current).metric); force((n) => n + 1)
    }, 170)
    return () => clearInterval(id)
  }, [reduce]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = st.current, agent = sel !== null ? s.agents[sel] : null
  return <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#14110f] shadow-[0_40px_120px_-30px_rgba(255,120,60,.25)]">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[.08] px-4 py-3 text-xs md:px-5">
      <span className="inline-flex items-center gap-2 rounded-full bg-[#ff9a62] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#1a0f08]"><i className="size-1.5 animate-pulse rounded-full bg-[#1a0f08]" />Breaking</span>
      <span className="min-w-0 flex-1 truncate text-white/75">A water main broke in the east district and pressure may drop by noon.</span>
      <span className="font-mono text-white/45">{dayClock(Math.max(0, s.tick - 1))}</span>
      <span className="hidden font-mono text-white/45 sm:inline">{Math.round((last?.informed ?? 0) * 100)}% have heard</span>
    </div>
    <div className="p-2 md:p-3"><Town agents={s.agents} selected={sel} mode="opinion" onSelect={setSel} tick={s.tick} /></div>
    <p className="border-t border-white/[.08] px-4 py-3 text-xs leading-relaxed text-white/50 md:px-5">{agent ? <><b className="text-white/85">{agent.name}</b>, {agent.age}, {agent.role}. {agent.bio} Right now: {agent.goal}.</> : 'This is the real simulation, not a video. Click anyone on the map to meet them.'}</p>
  </div>
}

/* ───────── the comparison: same morning, three ways ───────── */
type Kind = 'silence' | 'statement' | 'whisper'
const KINDS: { id: Kind; label: string; sub: string; color: string }[] = [
  { id: 'silence', label: 'Say nothing', sub: 'The rumor runs its course.', color: '#9a948b' },
  { id: 'statement', label: 'Official statement', sub: 'A public announcement at 09:00.', color: '#7ee0b0' },
  { id: 'whisper', label: 'One whisper', sub: 'You quietly reassure Paul, the clinic nurse.', color: '#ff9a62' },
]
function runKind(kind: Kind): Metric[] {
  const st = createState(buildCfg('water', { seed: SEED, population: 12 }))
  const out: Metric[] = []
  for (let t = 0; t < 96; t++) {
    if (t === STEP && kind === 'statement') intervene(st, { type: 'announce', text: 'Water will be restored by 6pm. There is no danger.', stance: -0.6 })
    if (t === STEP && kind === 'whisper') intervene(st, { type: 'whisper', agent: 3, text: 'The repair crew is already on site. Pressure is back by evening.', stance: -0.6 })
    out.push(stepWorld(st).metric)
  }
  return out
}

function Comparison() {
  const runs = useMemo(() => KINDS.map((k) => ({ ...k, m: runKind(k.id) })), [])
  const [on, setOn] = useState<Kind>('statement')
  const W = 760, H = 330, pl = 40, pr = 16, pt = 22, pb = 36
  const all = runs.flatMap((r) => r.m.map((x) => x.mean))
  const lo = Math.min(0, ...all) - 0.05, hi = Math.max(...all) + 0.08
  const x = (i: number) => pl + (i / 95) * (W - pl - pr)
  const y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb)
  const path = (m: Metric[]) => m.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.mean).toFixed(1)}`).join(' ')
  const stats = runs.map((r) => ({ id: r.id, peak: Math.max(...r.m.map((p) => p.mean)), final: r.m[r.m.length - 1].mean }))
  const best = stats.reduce((a, b) => (b.final < a.final ? b : a)).id
  return <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
    <div className="flex flex-col justify-center rounded-3xl border border-white/10 bg-[#14110f] p-4 md:p-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Average alarm over one day for three responses to the same news">
        {[0, .25, .5, .75].map((t) => { const v = lo + t * (hi - lo); return <g key={t}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.06)" /><text x={pl - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.35)" fontFamily="DM Mono">{v.toFixed(1)}</text></g> })}
        <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.18)" strokeDasharray="2 4" />
        <line x1={x(STEP)} x2={x(STEP)} y1={pt} y2={H - pb} stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        <text x={x(STEP) + 6} y={pt + 10} fontSize="10" fill="rgba(255,255,255,.6)" fontFamily="DM Mono">{dayClock(STEP).replace('Day 1 · ', '')} · you step in</text>
        {[0, 24, 48, 72, 95].map((t) => <text key={t} x={x(t)} y={H - 12} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.35)" fontFamily="DM Mono">{dayClock(t).replace('Day 1 · ', '')}</text>)}
        {runs.map((r) => <path key={r.id} d={path(r.m)} fill="none" stroke={r.color} strokeWidth={on === r.id ? 3.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" opacity={on === r.id ? 1 : 0.35} style={{ transition: 'all .3s' }} />)}
      </svg>
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[.18em] text-white/35">Average alarm in town · 0 = calm · same seed, only your move differs</p>
    </div>
    <div className="flex flex-col gap-3">
      {runs.map((r) => { const s = stats.find((q) => q.id === r.id)!; const active = on === r.id
        return <button key={r.id} onClick={() => setOn(r.id)} onMouseEnter={() => setOn(r.id)} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-white/30 bg-white/[.06]' : 'border-white/10 bg-white/[.02] hover:border-white/20'}`} style={{ boxShadow: active ? `inset 3px 0 0 ${r.color}` : undefined }}>
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-base"><i className="size-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>{best === r.id && <span className="rounded-full bg-[#7ee0b0]/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#7ee0b0]">calmest end</span>}</div>
          <p className="mt-1 text-sm text-white/50">{r.sub}</p>
          <div className="mt-3 flex gap-6 font-mono text-xs text-white/70"><span>peak <b className="text-white">{s.peak.toFixed(2)}</b></span><span>end of day <b className="text-white">{s.final.toFixed(2)}</b></span></div>
        </button> })}
      <p className="px-1 text-xs leading-relaxed text-white/40">Computed in your browser, just now, by the same engine the app runs. Change the seed or the message in the app and the curves change with it.</p>
    </div>
  </div>
}

/* ───────── residents ───────── */
function Residents() {
  const people = Array.from({ length: 8 }, (_, i) => ({ id: i, p: personaOf(i) })).filter((x) => x.p)
  return <div className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
    {people.map(({ id, p }) => <div key={id} className="bg-[#0f0d0c] p-5 transition hover:bg-[#17130f]">
      <div className="flex items-center gap-3"><div className="grid size-14 place-items-center rounded-xl bg-[#1d1814]"><Sprite id={id} size={44} /></div><div><p className="font-display text-xl leading-none">{p!.name}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[.16em] text-white/40">{p!.age} · {p!.role}</p></div></div>
      <p className="mt-4 text-sm leading-relaxed text-white/55">{p!.bio}</p>
      <div className="mt-4 space-y-1.5 font-mono text-[10px] uppercase tracking-wider text-white/40">
        {([['trust', p!.traits.trust], ['social', p!.traits.social]] as const).map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="w-12">{k}</span><span className="h-1 flex-1 rounded-full bg-white/10"><i className="block h-1 rounded-full bg-[#ff9a62]" style={{ width: `${Math.round(v * 100)}%` }} /></span></div>)}
      </div>
    </div>)}
  </div>
}

const steps = [
  ['Choose what hits the town', 'A burst pipe, a clinic rumor, a school-schedule proposal. Edit the news however you like.'],
  ['Watch the day unfold', 'Residents wake, work, gather and talk. The news travels through who trusts whom — not through a formula on a slider.'],
  ['Step in', 'Announce something to everyone, or whisper to one person at the right moment, and see opinions bend.'],
  ['Read what changed', 'A plain-language report, charts, a replay you can share, and CSV/JSON you can cite.'],
]

export function DarkLanding() {
  return <div className="min-h-screen bg-[#0c0b0a] font-sans text-[#f3ead9] selection:bg-[#ff9a62] selection:text-black">
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[.07] bg-[#0c0b0a]/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 md:px-8">
        <a href="#top" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"><img src="/brand/society-mark.jpg" alt="" className="size-7 rounded-lg" />society agent</a>
        <div className="hidden items-center gap-8 text-sm text-white/55 md:flex"><a href="#compare" className="hover:text-white">The experiment</a><a href="#people" className="hover:text-white">The people</a><a href="#how" className="hover:text-white">How it works</a></div>
        <Link to="/app" className="inline-flex items-center gap-1.5 rounded-full bg-[#f3ead9] px-4 py-2 text-sm font-semibold text-black transition hover:bg-white">Open the app <ArrowUpRight size={15} /></Link>
      </nav>
    </header>

    <section id="top" className="relative overflow-hidden px-5 pb-20 pt-24 md:px-8 md:pt-28">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 85% -5%, rgba(255,140,70,.22), transparent 65%), radial-gradient(ellipse 50% 40% at 0% 30%, rgba(126,224,176,.07), transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.35]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'linear-gradient(to bottom, black, transparent 70%)' }} />
      <div className="relative mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Eyebrow>An agent-based society simulator</Eyebrow></motion.div>
        <motion.h1 initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, ease }} className="font-display mt-5 text-[clamp(2.7rem,6.4vw,5.6rem)] font-normal leading-[.95] tracking-[-.03em]">Drop news into a town.<br /><em className="text-[#ff9a62]">Watch it decide</em> what to believe.</motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .1, ease }} className="mt-5 max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">Residents with jobs, habits, memories and different levels of trust walk the same streets, talk, and change their minds. You decide what the town hears — and read exactly what happened.</motion.p>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .2, ease }} className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/app" className="inline-flex items-center gap-2 rounded-full bg-[#ff9a62] px-7 py-4 text-[15px] font-semibold text-[#1a0f08] transition hover:bg-[#ffb185]">Run a simulation <ArrowRight size={17} /></Link>
          <a href="#compare" className="rounded-full border border-white/15 px-6 py-4 text-[15px] text-white/80 transition hover:border-white/40">See an experiment</a>
          <span className="text-sm text-white/40">No sign-up needed.</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: .3, ease }} className="mt-9"><LiveTown /></motion.div>
      </div>
    </section>

    <section id="compare" className="border-t border-white/[.07] px-5 py-24 md:px-8"><div className="mx-auto max-w-6xl">
      <Fade><Eyebrow>The experiment</Eyebrow><h2 className="font-display mt-4 max-w-3xl text-5xl leading-[1] tracking-[-.02em] md:text-6xl">One morning. <em className="text-white/45">Three ways to answer it.</em></h2>
        <p className="mt-5 max-w-2xl text-white/55">A water main breaks. The town starts to worry. Do you stay quiet, make an official statement, or quietly reassure the one person everyone trusts? Same town, same seed, same minute — only your move changes.</p></Fade>
      <Fade d={0.1} className="mt-10"><Comparison /></Fade>
    </div></section>

    <section id="people" className="border-t border-white/[.07] bg-[#0a0908] px-5 py-24 md:px-8"><div className="mx-auto max-w-6xl">
      <Fade><Eyebrow>The people</Eyebrow><h2 className="font-display mt-4 max-w-3xl text-5xl leading-[1] tracking-[-.02em] md:text-6xl">Nobody is an average. <em className="text-white/45">Everyone has a reason.</em></h2>
        <p className="mt-5 max-w-2xl text-white/55">Each resident has a job, a home, a place they drift to, and a different trust in officials and neighbours. That is why the same sentence lands differently on each of them.</p></Fade>
      <Fade d={0.1} className="mt-10"><Residents /></Fade>
    </div></section>

    <section id="how" className="border-t border-white/[.07] px-5 py-24 md:px-8"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.3fr]">
      <Fade><Eyebrow>How it works</Eyebrow><h2 className="font-display mt-4 text-5xl leading-[1] tracking-[-.02em] md:text-6xl">From a headline <em className="text-white/45">to a finding.</em></h2>
        <Link to="/app" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f3ead9] px-6 py-3.5 text-sm font-semibold text-black">Start your first simulation <ArrowRight size={16} /></Link></Fade>
      <div className="divide-y divide-white/10 border-y border-white/10">{steps.map(([t, d], i) => <Fade key={t} d={i * 0.05}><div className="flex gap-6 py-6"><span className="font-display w-12 shrink-0 text-5xl leading-none text-[#ff9a62]/80">{i + 1}</span><div><h3 className="text-xl">{t}</h3><p className="mt-2 leading-relaxed text-white/55">{d}</p></div></div></Fade>)}</div>
    </div></section>

    <section className="border-t border-white/[.07] bg-[#0a0908] px-5 py-24 md:px-8"><div className="mx-auto max-w-6xl">
      <Fade><Eyebrow>Built to be checked</Eyebrow><h2 className="font-display mt-4 max-w-3xl text-5xl leading-[1] tracking-[-.02em] md:text-6xl">Same seed, same town, <em className="text-white/45">same result.</em></h2></Fade>
      <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-3">
        {[['Reproducible', 'Movement and opinion dynamics run on a transparent, seeded model. Replay any run exactly, and compare it with a run where you did nothing.'], ['AI is a voice, not a vote', 'Language models speak for residents — lines on the map, interviews you can hold, a written analysis — but they never change the outcome.'], ['Yours to keep', 'Sign in with a wallet (free, no transaction) to save runs, share a replay link, or export the data. Runs are private until you share them.']].map(([t, d]) => <Fade key={t} className="bg-[#0f0d0c] p-7"><h3 className="font-display text-2xl">{t}</h3><p className="mt-3 text-sm leading-relaxed text-white/55">{d}</p></Fade>)}
      </div>
    </div></section>

    <section className="relative overflow-hidden border-t border-white/[.07] px-5 py-28 text-center md:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 70% at 50% 120%, rgba(255,140,70,.25), transparent 70%)' }} />
      <Fade className="relative"><h2 className="font-display mx-auto max-w-3xl text-6xl leading-[.95] tracking-[-.03em] md:text-7xl">What would your town do?</h2>
        <Link to="/app" className="mt-10 inline-flex items-center gap-2 rounded-full bg-[#ff9a62] px-8 py-4 text-base font-semibold text-[#1a0f08] hover:bg-[#ffb185]">Run a simulation <ArrowRight size={18} /></Link></Fade>
    </section>
    <footer className="border-t border-white/[.07] px-5 py-8 text-center font-mono text-[11px] uppercase tracking-[.18em] text-white/30">Society Agent · early release · map art by Kenney (CC0)</footer>
  </div>
}
