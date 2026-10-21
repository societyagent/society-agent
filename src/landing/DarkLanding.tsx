import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BrainCircuit, Eye, FileText, Map, Megaphone, Share2, Users } from 'lucide-react'
import { Town } from '@/components/Town'
import { createState, dayClock, stepWorld, type Metric, type State } from '@/engine/world'
import { buildCfg } from '@/engine/templates'

const ease = [0.22, 1, 0.36, 1] as const

/** A real, running simulation — same engine as the app — embedded in the hero. */
function LiveTown() {
  const st = useRef<State>(createState(buildCfg('water', { seed: 20261021, population: 14 })))
  const [, force] = useState(0)
  const [last, setLast] = useState<Metric | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) { for (let i = 0; i < 30; i++) stepWorld(st.current); force((n) => n + 1); return }
    const id = window.setInterval(() => {
      if (st.current.tick >= 144) st.current = createState(buildCfg('water', { seed: 20261021 + Math.floor(Math.random() * 999), population: 14 }))
      setLast(stepWorld(st.current).metric); force((n) => n + 1)
    }, 170)
    return () => clearInterval(id)
  }, [reduce])
  const s = st.current
  const agent = sel !== null ? s.agents[sel] : null
  return <div className="rounded-3xl border border-white/10 bg-white/[.03] p-3 shadow-2xl shadow-black/50 md:p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-white/50">
      <span className="inline-flex items-center gap-2"><i className="size-2 animate-pulse rounded-full bg-emerald-400" /> Live simulation · {dayClock(Math.max(0, s.tick - 1))}</span>
      <span>{Math.round((last?.informed ?? 0) * 100)}% have heard the news · {last?.talks ?? 0} conversations</span>
    </div>
    <Town agents={s.agents} selected={sel} mode="opinion" onSelect={setSel} tick={s.tick} />
    <p className="mt-3 px-1 text-xs leading-relaxed text-white/45">{agent ? <><b className="text-white/75">{agent.name}</b> · {agent.role} — {agent.bio} Now: {agent.goal}.</> : 'Scenario: a water main breaks. Click anyone to see who they are — then open the app and step in yourself.'}</p>
  </div>
}

const Fade = ({ children, d = 0, className }: { children: React.ReactNode; d?: number; className?: string }) => <motion.div className={className} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, delay: d, ease }}>{children}</motion.div>

const steps = [
  { icon: Map, t: 'Pick a situation', d: 'Choose a town event — a burst pipe, a clinic rumor, a school-schedule proposal — and edit the news that hits.' },
  { icon: Users, t: 'A town wakes up', d: 'Residents with jobs, routines, traits, and memories move through the day and talk to each other.' },
  { icon: Megaphone, t: 'You step in', d: 'Make a public announcement or whisper to one person. Watch trust, rumors, and opinions respond.' },
  { icon: FileText, t: 'Read what changed', d: 'Get a plain-language report, charts, a full replay, and exports you can share or cite.' },
]
const features = [
  { icon: Eye, t: 'See it happen', d: 'A live 2D town. Colors show who knows and how they feel. Click any resident for their bio, mood, and memory.' },
  { icon: BrainCircuit, t: 'Opinions with causes', d: 'Trust, stubbornness, social role, and who said it all shape how someone shifts — and every shift is logged with its reason.' },
  { icon: Megaphone, t: 'Interventions', d: 'Compare “say nothing” with an official statement or one well-placed whisper, on the same seed.' },
  { icon: BrainCircuit, t: 'Talk to the town', d: 'Interview any resident in character — grounded in what they actually heard and remember — and let AI voices speak the conversations on the map.' },
  { icon: Share2, t: 'Save, share, export', d: 'Sign in with your wallet to keep runs, publish a replay link, and export JSON or CSV. No gas, no transaction.' },
]

export function DarkLanding() {
  return <div className="min-h-screen bg-[#090a0d] text-white">
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[.06] bg-[#090a0d]/80 px-5 py-3.5 backdrop-blur-xl md:px-10">
      <nav className="mx-auto flex max-w-6xl items-center justify-between"><a href="#top" className="flex items-center gap-2.5 font-semibold tracking-tight"><img src="/brand/society-mark.jpg" alt="" className="size-7 rounded-lg" />society agent</a>
        <div className="hidden items-center gap-7 text-sm text-white/55 md:flex"><a href="#how" className="hover:text-white">How it works</a><a href="#why" className="hover:text-white">Why it’s different</a><a href="#research" className="hover:text-white">Research</a></div>
        <Link to="/app" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">Open the app</Link></nav>
    </header>

    <section id="top" className="relative px-5 pb-16 pt-24 md:px-10 md:pt-28">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 70% 0%, rgba(124,109,240,.20), transparent 70%)' }} />
      <div className="relative mx-auto max-w-6xl">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs uppercase tracking-[.24em] text-violet-200/70">Agent-based society simulation</motion.p>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease }} className="mt-4 max-w-4xl text-5xl font-medium leading-[1] tracking-[-.055em] sm:text-6xl">Drop news into a town.<br /><span className="text-white/40">Watch a society react.</span></motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .1, ease }} className="mt-4 max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">Residents with personalities, routines, and memories talk, spread information, and change their minds. Step in with an announcement, compare outcomes, and read what actually happened.</motion.p>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .2, ease }} className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/app" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black">Run a simulation <ArrowRight size={16} /></Link>
          <a href="#how" className="rounded-full border border-white/15 px-6 py-3.5 text-sm font-medium text-white/80 hover:bg-white/5">How it works</a>
          <span className="text-xs text-white/35">No sign-up needed to run one.</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .25, ease }} className="mt-8"><LiveTown /></motion.div>
      </div>
    </section>

    <section id="how" className="px-5 py-24 md:px-10"><div className="mx-auto max-w-6xl">
      <Fade><p className="text-xs uppercase tracking-[.22em] text-white/40">How it works</p><h2 className="mt-4 max-w-3xl text-4xl tracking-[-.04em] md:text-5xl">From a headline to a finding, in four steps.</h2></Fade>
      <div className="mt-12 grid gap-3 md:grid-cols-4">{steps.map(({ icon: Icon, t, d }, i) => <Fade key={t} d={i * 0.07}><div className="h-full rounded-2xl border border-white/10 bg-white/[.025] p-6"><div className="flex items-center justify-between"><Icon className="text-violet-300" size={20} /><span className="font-mono text-xs text-white/30">0{i + 1}</span></div><h3 className="mt-8 text-lg">{t}</h3><p className="mt-2 text-sm leading-relaxed text-white/50">{d}</p></div></Fade>)}</div>
    </div></section>

    <section id="why" className="border-y border-white/[.06] bg-white/[.015] px-5 py-24 md:px-10"><div className="mx-auto max-w-6xl">
      <Fade><p className="text-xs uppercase tracking-[.22em] text-white/40">Why it’s different</p><h2 className="mt-4 max-w-3xl text-4xl tracking-[-.04em] md:text-5xl">Not a dashboard of numbers. A town you can watch.</h2></Fade>
      <div className="mt-12 grid gap-3 md:grid-cols-2">{features.map(({ icon: Icon, t, d }, i) => <Fade key={t} d={i * 0.06}><div className="flex h-full gap-5 rounded-2xl border border-white/10 bg-[#0b0c10] p-6"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><Icon size={20} /></div><div><h3 className="text-lg">{t}</h3><p className="mt-2 text-sm leading-relaxed text-white/50">{d}</p></div></div></Fade>)}</div>
    </div></section>

    <section id="research" className="px-5 py-24 md:px-10"><div className="mx-auto max-w-4xl text-center">
      <Fade><p className="text-xs uppercase tracking-[.22em] text-white/40">Reproducible by design</p><h2 className="mt-4 text-4xl tracking-[-.04em] md:text-5xl">Same seed, same town, same result.</h2>
        <p className="mx-auto mt-6 max-w-2xl leading-relaxed text-white/55">Movement and opinion dynamics run on a transparent model, so every run can be replayed exactly from its seed and the interventions you made — and compared against a run where you did nothing.</p>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/40">Language models give residents their voice — spoken lines on the map, interviews you can hold, and a written analysis — without ever changing the outcome.</p></Fade>
      <Fade d={0.1}><Link to="/app" className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-semibold text-black">Start your first simulation <ArrowRight size={16} /></Link></Fade>
    </div></section>

    <footer className="border-t border-white/[.06] px-5 py-8 text-center text-xs text-white/35">© 2026 Society Agent · Social simulation workspace</footer>
  </div>
}
