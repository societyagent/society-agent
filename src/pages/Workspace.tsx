import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Bookmark, Check, ChevronDown, Copy, Download, LogOut, Megaphone, MessageCircle, Mic, Pause, Play, RotateCcw, Send, Share2, Sparkles, Wallet, X } from 'lucide-react'
import { Town } from '@/components/Town'
import { api, useAuth } from '@/lib/auth'
import { PLACES, clock, createState, dayClock, intervene, stepWorld, summarize, type Cfg, type Ev, type Intervention, type Metric, type State } from '@/engine/world'
import { TEMPLATES, buildCfg } from '@/engine/templates'

type Speed = 1 | 4 | 12
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const stanceLabel = (v: number) => (v > 0.5 ? 'alarmed' : v > 0.15 ? 'worried' : v > -0.15 ? 'neutral' : 'skeptical')
const download = (name: string, mime: string, text: string) => { const u = URL.createObjectURL(new Blob([text], { type: mime })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }

/* ───────── Charts ───────── */
function Chart({ metrics, axis }: { metrics: Metric[]; axis: [string, string] }) {
  const w = 640, h = 150, pad = 26
  const n = Math.max(metrics.length, 2)
  const x = (i: number) => pad + (i / (n - 1)) * (w - pad * 2)
  const line = (get: (m: Metric) => number, lo: number, hi: number) => metrics.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${(h - pad - ((get(m) - lo) / (hi - lo)) * (h - pad * 2)).toFixed(1)}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Spread of news and average opinion over time">
    {[0, .5, 1].map((t) => <line key={t} x1={pad} x2={w - pad} y1={h - pad - t * (h - pad * 2)} y2={h - pad - t * (h - pad * 2)} stroke="rgba(255,255,255,.07)" />)}
    <text x={4} y={h - pad + 4} fontSize="9" fill="rgba(255,255,255,.35)">0%</text><text x={4} y={pad + 3} fontSize="9" fill="rgba(255,255,255,.35)">100%</text>
    {metrics.length > 1 && <><path d={line((m) => m.informed, 0, 1)} fill="none" stroke="#7ee0b0" strokeWidth="2.2" /><path d={line((m) => (m.mean + 1) / 2, 0, 1)} fill="none" stroke="#ff9a62" strokeWidth="2.2" strokeDasharray="5 3" /></>}
    <g fontSize="10"><circle cx={pad + 4} cy={9} r="3.5" fill="#7ee0b0" /><text x={pad + 12} y={12} fill="rgba(255,255,255,.65)">Informed</text><circle cx={pad + 84} cy={9} r="3.5" fill="#ff9a62" /><text x={pad + 92} y={12} fill="rgba(255,255,255,.65)">Opinion ({axis[0]} ↔ {axis[1]})</text></g>
  </svg>
}

/* ───────── Auth gate ───────── */
function SignIn({ busy, error, onSignIn }: { busy: boolean; error: string; onSignIn: () => void }) {
  return <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[.03] p-7 text-center">
    <Wallet className="mx-auto text-ember-300" size={26} />
    <h2 className="mt-4 text-xl">Sign in to save runs</h2>
    <p className="mt-2 text-sm leading-relaxed text-white/50">You can run and explore any scenario without signing in. Sign in with your wallet to save runs, share them, and export reports. Signing is free — it never sends a transaction.</p>
    <button onClick={onSignIn} disabled={busy} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-60"><Wallet size={16} />{busy ? 'Waiting for wallet…' : 'Sign in with wallet'}</button>
    {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
  </div>
}

/* ───────── Header ───────── */
function Header({ back }: { back?: boolean }) {
  const { session, signOut, signIn, busy, error } = useAuth()
  return <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[.08] bg-[#0c0b0a]/90 px-4 backdrop-blur md:px-6">
    <div className="flex items-center gap-4">
      {back ? <Link to="/app" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"><ArrowLeft size={16} /> Scenarios</Link> : <Link to="/" className="flex items-center gap-2 text-sm font-semibold"><img src="/brand/society-mark.jpg" alt="" className="size-6 rounded-md" />society agent</Link>}
    </div>
    <div className="flex items-center gap-3 text-sm">
      {session
        ? <><Link to="/app/runs" className="text-white/60 hover:text-white">My runs</Link><span className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-white/60">{short(session.address)}</span><button onClick={signOut} aria-label="Sign out" className="text-white/45 hover:text-white"><LogOut size={16} /></button></>
        : <button onClick={signIn} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-white/80 transition hover:border-ember-400/60 hover:text-white disabled:opacity-60"><Wallet size={14} />{busy ? 'Connecting…' : 'Connect wallet'}</button>}
    </div>
    {error && !session && <p role="alert" className="absolute right-4 top-[3.6rem] max-w-xs rounded-xl border border-white/10 bg-[#17130f] px-3 py-2 text-xs leading-relaxed text-white/70 shadow-xl md:right-6">{error}</p>}
  </header>
}

/* ───────── Dashboard ───────── */
export function Dashboard() {
  const nav = useNavigate()
  const auth = useAuth()
  const [pick, setPick] = useState(TEMPLATES[0].id)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const t = TEMPLATES.find((x) => x.id === pick)!
  const start = () => nav('/app/sim', { state: { cfg: buildCfg(pick, { name: name.trim() || undefined, text: text.trim() || undefined }) } })
  return <main className="min-h-screen bg-[#0c0b0a] text-white">
    <Header />
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <p className="text-xs uppercase tracking-[.2em] text-ember-200/60">New simulation</p>
      <h1 className="mt-3 text-3xl tracking-[-.04em] md:text-5xl">What should the town react to?</h1>
      <p className="mt-3 max-w-2xl text-white/55">Pick a situation. A town of residents with their own personalities, routines, and memories will live through it — you watch, step in, and read what changed.</p>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {TEMPLATES.map((x) => <button key={x.id} onClick={() => { setPick(x.id); setText('') }} className={`rounded-2xl border p-5 text-left transition ${pick === x.id ? 'border-ember-300/60 bg-ember-300/[.08]' : 'border-white/10 bg-white/[.025] hover:border-white/25'}`}><h3 className="text-lg">{x.title}</h3><p className="mt-2 text-sm leading-relaxed text-white/50">{x.blurb}</p><p className="mt-4 font-mono text-[10px] uppercase tracking-[.14em] text-white/35">{x.axis[0]} ↔ {x.axis[1]}</p></button>)}
      </div>
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.025] p-5">
        <p className="text-sm text-white/70">You picked <span className="font-medium text-white">{t.title}</span>. The news that will hit town:</p>
        <p className="mt-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-white/80">“{text.trim() || t.news.text}”</p>
        <details className="group mt-4"><summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm text-ember-200 hover:underline"><ChevronDown size={15} className="transition group-open:rotate-180" /> Customize the news (optional)</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-white/70">Scenario name<input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.title} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-ember-300/50" /></label>
            <label className="block text-sm text-white/70">News text<input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.news.text} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-ember-300/50" /></label>
          </div></details>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4"><button onClick={start} className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-base font-semibold text-black"><Play size={17} fill="currentColor" /> Start simulation</button><p className="text-sm text-white/40">About 1 minute at 4× speed · no sign-in needed</p></div>
      {auth.session && <p className="mt-4 text-sm text-white/40">Signed in as {short(auth.session.address)}. <Link to="/app/runs" className="text-ember-200 underline-offset-4 hover:underline">View saved runs</Link></p>}
    </div>
  </main>
}

/* ───────── Onboarding ───────── */
const TOUR_KEY = 'society-agent-tour-v1'
function Tour({ onClose }: { onClose: () => void }) {
  const steps = [
    ['Watch', 'The day starts by itself. At 07:20 the news breaks and a couple of residents hear it first; everyone then walks the town and talks. Use Pause or 12× to control time.'],
    ['Inspect', 'Click any resident on the map to read their bio, mood and memories — and see who they heard it from.'],
    ['Step in', 'On the right, send a public announcement or whisper to one person. Try it around the time half the town has heard.'],
    ['Read', 'When the day ends, “What happened” explains the outcome. Compare it with a run where you stayed silent.'],
  ]
  return <section className="mb-4 rounded-2xl border border-ember-300/30 bg-ember-300/[.06] p-5">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-base">How this works — 4 steps</h2><p className="mt-1 text-sm text-white/55">You’re watching a small town react to one piece of news. Nothing here is real data — it’s a model you can poke at.</p></div><button onClick={onClose} aria-label="Dismiss guide" className="rounded-lg border border-white/10 p-1.5 text-white/50 hover:text-white"><X size={15} /></button></div>
    <ol className="mt-4 grid gap-3 md:grid-cols-4">{steps.map(([t, d], i) => <li key={t} className="rounded-xl border border-white/10 bg-black/25 p-3"><p className="flex items-center gap-2 text-sm font-medium"><span className="grid size-5 place-items-center rounded-full bg-ember-300 text-[11px] font-semibold text-black">{i + 1}</span>{t}</p><p className="mt-2 text-xs leading-relaxed text-white/55">{d}</p></li>)}</ol>
    <button onClick={onClose} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">Got it</button>
  </section>
}

/** One plain-language sentence about what is happening right now. */
function narrate(st: State, events: Ev[], done: boolean, started: boolean, total: number): string {
  if (!started) return 'The day is about to begin. The news breaks at 07:20 — watch who hears it first.'
  const heard = st.agents.filter((a) => a.informed)
  if (!heard.length) return 'Quiet morning. Nobody has heard the news yet.'
  const mood = heard.reduce((n, a) => n + a.opinion, 0) / heard.length
  const talk = [...events].reverse().find((e) => e.type === 'say')
  const where = talk?.place ? PLACES.find((p) => p.id === talk.place)?.name : ''
  const base = `${heard.length} of ${total} residents have heard the news${heard.length === total ? '' : `, ${total - heard.length} still don’t know`}. On average they feel ${stanceLabel(mood)}.`
  if (done) return `The day is over. ${base} Scroll down for what happened.`
  return talk ? `${base} Latest: ${talk.text.split(': ')[0]}${where ? ` at ${where}` : ''}.` : base
}

/* ───────── Simulation ───────── */
export function Simulation({ replay }: { replay?: { cfg: Cfg; ivs: { tick: number; iv: Intervention }[]; ticks: number; id: string; shared: boolean; isOwner: boolean; name: string } }) {
  const loc = (window.history.state?.usr ?? {}) as { cfg?: Cfg }
  const cfg = replay?.cfg ?? loc.cfg ?? buildCfg('water')
  const nav = useNavigate()
  const auth = useAuth()
  const st = useRef<State>(createState(cfg))
  const [, force] = useState(0)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [ivs, setIvs] = useState<{ tick: number; iv: Intervention }[]>([])
  const [running, setRunning] = useState(!replay)
  const [speed, setSpeed] = useState<Speed>(4)
  const [sel, setSel] = useState<number | null>(null)
  const [mode, setMode] = useState<'opinion' | 'informed'>('opinion')
  const [text, setText] = useState('')
  const [stance, setStance] = useState(-0.5)
  const [target, setTarget] = useState<'all' | number>('all')
  const [saved, setSaved] = useState<{ id: string; shared: boolean } | null>(replay ? { id: replay.id, shared: replay.shared } : null)
  const [saveErr, setSaveErr] = useState(''); const [copied, setCopied] = useState(false)
  const MAX = replay?.ticks ?? 144
  const [tour, setTour] = useState(() => { try { return !replay && localStorage.getItem(TOUR_KEY) !== '1' } catch { return !replay } })
  const closeTour = () => { setTour(false); try { localStorage.setItem(TOUR_KEY, '1') } catch { /* private mode */ } }
  // AI layer — purely cosmetic/explanatory: it never changes simulation state, so runs stay reproducible.
  const [voicesOn, setVoicesOn] = useState(false)
  const [voiceNote, setVoiceNote] = useState('')
  const voiced = useRef<Set<string>>(new Set())
  const voiceCalls = useRef(0); const voiceBusy = useRef(false)
  const [chat, setChat] = useState<Record<number, { q: string; a: string }[]>>({})
  const [question, setQuestion] = useState(''); const [asking, setAsking] = useState(false); const [askErr, setAskErr] = useState('')
  const [analysis, setAnalysis] = useState(''); const [analysing, setAnalysing] = useState(false); const [aiErr, setAiErr] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const replayIvs = useRef([...(replay?.ivs ?? [])])

  const advance = useCallback(() => {
    const s = st.current
    if (s.tick >= MAX) { setRunning(false); return }
    const fresh: Ev[] = []
    while (replayIvs.current.length && replayIvs.current[0].tick <= s.tick) fresh.push(...intervene(s, replayIvs.current.shift()!.iv))
    const r = stepWorld(s)
    fresh.push(...r.events)
    setMetrics((m) => [...m, r.metric]); if (fresh.length) setEvents((e) => [...e, ...fresh])
    force((n) => n + 1)
  }, [MAX])

  useEffect(() => { if (!running) return; const id = window.setInterval(advance, 1000 / (speed === 1 ? 2 : speed === 4 ? 6 : 16)); return () => clearInterval(id) }, [running, speed, advance])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [events.length])

  const evKey = (e: Ev) => `${e.tick}-${e.agent}-${e.with}`
  // Keep the latest events in a ref so the voice timer is created once and never reset by per-tick state changes.
  const eventsRef = useRef<Ev[]>([])
  eventsRef.current = events
  useEffect(() => {
    if (!voicesOn || !auth.session || replay) return
    const token = auth.session.token
    const id = window.setInterval(async () => {
      if (voiceBusy.current || voiceCalls.current >= 14) { if (voiceCalls.current >= 14) setVoiceNote('Voice limit for this run reached.'); return }
      const pending = eventsRef.current.filter((e) => e.type === 'say' && e.news && e.agent !== undefined && e.with !== undefined && !voiced.current.has(evKey(e))).slice(-4)
      if (!pending.length) return
      voiceBusy.current = true; voiceCalls.current++
      pending.forEach((e) => voiced.current.add(evKey(e)))
      try {
        const r = await api<{ lines: { i: number; line: string }[] }>('/api/ai', { method: 'POST', token, body: { kind: 'voices', news: cfg.news.text, items: pending.map((e) => ({ speaker: e.agent, listener: e.with, stance: e.stance, place: PLACES.find((p) => p.id === e.place)?.name })) } })
        setVoiceNote('')
        const byKey = new Map(r.lines.map((l) => [evKey(pending[l.i]), l.line]))
        setEvents((all) => all.map((e) => { const line = byKey.get(evKey(e)); return line ? { ...e, text: `${st.current.agents[e.agent!].name.split(' ')[0]} to ${st.current.agents[e.with!].name.split(' ')[0]}: “${line}”` } : e }))
        for (const l of r.lines) { const e = pending[l.i]; const a = st.current.agents[e.agent!]; if (a) { a.line = l.line; a.lineAt = st.current.tick } }
      } catch (err) { setVoiceNote((err as Error).message) } finally { voiceBusy.current = false }
    }, 5000)
    return () => clearInterval(id)
  }, [voicesOn, auth.session, replay, cfg.news.text]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = st.current
  const last = metrics[metrics.length - 1]
  const done = s.tick >= MAX
  const agent = sel !== null ? s.agents[sel] : null
  const report = useMemo(() => (done ? summarize(s, metrics, events) : null), [done, metrics, events, s])

  const ask = async () => {
    if (!auth.session || sel === null || !question.trim() || asking) return
    const a = st.current.agents[sel]; const q = question.trim(); const hist = chat[sel] ?? []
    setAsking(true); setAskErr('')
    try {
      const r = await api<{ answer: string }>('/api/ai', { method: 'POST', token: auth.session.token, body: { kind: 'interview', agent: a.id, question: q, news: cfg.news.text, informed: a.informed, opinion: a.opinion, memory: a.memory, goal: a.goal, place: PLACES.find((p) => p.id === a.place)?.name, history: hist.slice(-4) } })
      setChat((c) => ({ ...c, [sel]: [...(c[sel] ?? []), { q, a: r.answer }] })); setQuestion('')
    } catch (e) { setAskErr((e as Error).message) } finally { setAsking(false) }
  }
  const writeAnalysis = async () => {
    if (!auth.session || analysing) return
    setAnalysing(true); setAiErr('')
    try {
      const step = Math.max(1, Math.floor(metrics.length / 24))
      const r = await api<{ analysis: string }>('/api/ai', { method: 'POST', token: auth.session.token, body: { kind: 'analysis', question: cfg.question, news: cfg.news.text, axis: cfg.axis, report, metrics: metrics.filter((_, i) => i % step === 0 || i === metrics.length - 1), events: events.filter((e) => e.type !== 'say').slice(-30).map((e) => `${e.t}: ${e.text}`) } })
      setAnalysis(r.analysis)
    } catch (e) { setAiErr((e as Error).message) } finally { setAnalysing(false) }
  }
  const send = () => {
    if (!text.trim()) return
    const iv: Intervention = target === 'all' ? { type: 'announce', text, stance } : { type: 'whisper', agent: target, text, stance }
    setIvs((p) => [...p, { tick: s.tick, iv }]); setEvents((e) => [...e, ...intervene(s, iv)]); setText(''); force((n) => n + 1)
  }
  const reset = () => { st.current = createState(cfg); replayIvs.current = [...(replay?.ivs ?? [])]; setMetrics([]); setEvents([]); setIvs([]); setSaved(null); setSel(null); setRunning(true); voiced.current = new Set(); voiceCalls.current = 0; setChat({}); setAnalysis(''); setVoiceNote(''); force((n) => n + 1) }
  const save = async () => {
    if (!auth.session) return
    setSaveErr('')
    try { const r = await api<{ id: string }>('/api/runs', { method: 'POST', token: auth.session.token, body: { cfg, ticks: Math.max(12, s.tick), interventions: ivs } }); setSaved({ id: r.id, shared: false }) } catch (e) { setSaveErr((e as Error).message) }
  }
  const share = async () => {
    if (!auth.session || !saved) return
    try { const r = await api<{ shared: boolean }>(`/api/runs/${saved.id}`, { method: 'PATCH', token: auth.session.token, body: { shared: !saved.shared } }); setSaved({ ...saved, shared: r.shared }) } catch (e) { setSaveErr((e as Error).message) }
  }
  const link = saved ? `${location.origin}/r/${saved.id}` : ''
  const exportJson = () => download(`${cfg.name.replace(/\W+/g, '-').toLowerCase()}-run.json`, 'application/json', JSON.stringify({ cfg, ticks: s.tick, interventions: ivs, metrics, events, report: summarize(s, metrics, events) }, null, 2))
  const exportCsv = () => download('society-agent-metrics.csv', 'text/csv', ['tick,time,informed,mean_opinion,spread,conversations', ...metrics.map((m) => `${m.tick},${dayClock(m.tick - 1)},${m.informed.toFixed(3)},${m.mean.toFixed(3)},${m.spread.toFixed(3)},${m.talks}`)].join('\n'))

  return <main className="min-h-screen bg-[#0c0b0a] text-white">
    <Header back />
    <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl tracking-[-.03em] md:text-3xl">{replay?.name ?? cfg.name}</h1><p className="mt-1 max-w-3xl text-sm text-white/50">News: “{cfg.news.text}”</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-white/10 px-3 py-2 font-mono text-sm tabular-nums whitespace-nowrap">{dayClock(Math.max(0, s.tick - 1 + (s.tick === 0 ? 0 : 1)))}</span>
          <button onClick={() => setRunning((r) => !r)} disabled={done} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">{done ? 'Finished' : running ? <><Pause size={15} /> Pause</> : <><Play size={15} fill="currentColor" /> {s.tick === 0 ? 'Start' : 'Resume'}</>}</button>
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/10">{([1, 4, 12] as Speed[]).map((v) => <button key={v} onClick={() => setSpeed(v)} className={`whitespace-nowrap px-3 py-2 text-xs ${speed === v ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>{v}×</button>)}</div>
          <button onClick={reset} aria-label="Restart" className="rounded-lg border border-white/10 p-2.5 text-white/60 hover:text-white"><RotateCcw size={15} /></button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {tour && <Tour onClose={closeTour} />}
          <p className="mb-2 rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm text-white/75" aria-live="polite">{narrate(s, events, done, s.tick > 0, s.agents.length)}</p>
          <Town agents={s.agents} selected={sel} mode={mode} onSelect={setSel} tick={s.tick} />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-white/45">
            <div className="flex overflow-hidden rounded-lg border border-white/10">{(['opinion', 'informed'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? 'bg-white/15 text-white' : 'hover:text-white'}`}>{m === 'opinion' ? 'Color: opinion' : 'Color: who knows'}</button>)}</div>
            <span className="text-white/30">Dot above each head =</span><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#7c8499]" /> hasn't heard</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#78c896]" /> calm / skeptical</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#ef5a46]" /> alarmed</span>
            {!replay && (auth.session
              ? <button onClick={() => setVoicesOn((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${voicesOn ? 'border-ember-300/60 bg-ember-300/15 text-ember-100' : 'border-white/10 hover:text-white'}`}><Mic size={13} /> AI voices {voicesOn ? 'on' : 'off'}</button>
              : <button onClick={auth.signIn} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 hover:text-white"><Mic size={13} /> Sign in for AI voices</button>)}
            {voiceNote && <span className="text-amber-200/80">{voiceNote}</span>}
            <button onClick={() => setTour(true)} className="underline-offset-4 hover:text-white hover:underline">How does this work?</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Heard the news', `${Math.round((last?.informed ?? 0) * 100)}%`, `of ${s.agents.length} residents`], [`Avg. opinion`, last ? `${last.mean.toFixed(2)} · ${stanceLabel(last.mean)}` : '—', `${cfg.axis[0]} −1 … +1 ${cfg.axis[1]}`], ['Disagreement', last ? last.spread.toFixed(2) : '—', '0 = everyone agrees'], ['Conversations', String(last?.talks ?? 0), 'so far today']].map(([k, v, h]) => <div key={k} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-white/40">{k}</p><p className="mt-1 text-xl tabular-nums">{v}</p><p className="mt-1 text-[11px] leading-snug text-white/30">{h}</p></div>)}
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.025] p-4"><Chart metrics={metrics} axis={cfg.axis} /></div>

          {report && <section className="mt-4 rounded-2xl border border-ember-300/25 bg-ember-300/[.05] p-6">
            <h2 className="text-lg">What happened</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/75">{report.map((l) => <li key={l} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-300" />{l}</li>)}</ul>
            {analysis ? <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed text-white/75">{analysis.split('\n').filter(Boolean).map((para, i) => <p key={i} className="mt-2 first:mt-0">{para.split(/(\*\*[^*]+\*\*)/g).map((part, j) => /^\*\*[^*]+\*\*$/.test(part) ? <b key={j} className="text-white">{part.slice(2, -2)}</b> : part)}</p>)}</div>
              : auth.session ? <button onClick={writeAnalysis} disabled={analysing} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-ember-300/40 bg-ember-300/10 px-4 py-2.5 text-sm text-ember-100 disabled:opacity-60"><Sparkles size={15} /> {analysing ? 'Writing analysis…' : 'Write AI analysis'}</button>
              : <button onClick={auth.signIn} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/70"><Sparkles size={15} /> Sign in for AI analysis</button>}
            {aiErr && <p className="mt-3 text-sm text-rose-300">{aiErr}</p>}
            <p className="mt-4 text-xs text-white/40">These findings describe this simulated town under this seed. The engine is a transparent model, not a forecast of a real community.</p>
          </section>}

          <section className="mt-4 rounded-2xl border border-white/10 bg-white/[.025] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-base">Save &amp; share</h2>
              <button onClick={exportJson} disabled={!metrics.length} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white disabled:opacity-40"><Download size={14} /> JSON</button>
              <button onClick={exportCsv} disabled={!metrics.length} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white disabled:opacity-40"><Download size={14} /> CSV</button>
              {!replay && (auth.session ? <button onClick={save} disabled={!metrics.length || !!saved} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"><Bookmark size={14} /> {saved ? 'Saved' : 'Save run'}</button> : <button onClick={auth.signIn} disabled={auth.busy} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black"><Wallet size={14} /> {auth.busy ? 'Waiting…' : 'Sign in to save'}</button>)}
              {saved && (replay ? replay.isOwner : true) && <button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white"><Share2 size={14} /> {saved.shared ? 'Stop sharing' : 'Create share link'}</button>}
            </div>
            {saved?.shared && <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/70"><span className="truncate">{link}</span><button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="ml-auto shrink-0 text-ember-200">{copied ? 'Copied' : <Copy size={14} />}</button></div>}
            {(saveErr || auth.error) && <p className="mt-3 text-sm text-rose-300">{saveErr || auth.error}</p>}
            {saved && !replay && <button onClick={() => nav(`/app/runs/${saved.id}`)} className="mt-3 text-sm text-ember-200 hover:underline">Open saved run →</button>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
            {agent ? <div>
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full text-sm font-semibold text-black" style={{ background: agent.color }}>{agent.name[0]}</span><div><p className="font-medium">{agent.name}</p><p className="text-xs text-white/45">{agent.age} · {agent.role}</p></div></div>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{agent.bio}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-black/30 p-2"><dt className="text-white/35">Now</dt><dd className="mt-0.5 text-white/80">{agent.goal}</dd></div>
                <div className="rounded-lg bg-black/30 p-2"><dt className="text-white/35">Stance</dt><dd className="mt-0.5 text-white/80">{agent.informed ? `${stanceLabel(agent.opinion)} (${agent.opinion.toFixed(2)})` : 'hasn\'t heard'}</dd></div>
                <div className="rounded-lg bg-black/30 p-2"><dt className="text-white/35">Heard from</dt><dd className="mt-0.5 text-white/80">{agent.heardFrom ?? '—'}</dd></div>
                <div className="rounded-lg bg-black/30 p-2"><dt className="text-white/35">Trust / sociability</dt><dd className="mt-0.5 text-white/80">{agent.traits.trust.toFixed(2)} / {agent.traits.social.toFixed(2)}</dd></div>
              </dl>
              <p className="mt-3 text-xs font-medium uppercase tracking-[.14em] text-white/35">Memory</p>
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs leading-relaxed text-white/60">{agent.memory.length ? agent.memory.map((m) => <li key={m}>{m}</li>) : <li className="text-white/35">Nothing memorable yet.</li>}</ul>
              <p className="mt-4 text-xs font-medium uppercase tracking-[.14em] text-white/35">Interview {agent.name.split(' ')[0]}</p>
              <div className="mt-2 space-y-2">{(chat[agent.id] ?? []).map((c, i) => <div key={i} className="text-xs leading-relaxed"><p className="text-white/45">You: {c.q}</p><p className="mt-1 rounded-lg bg-ember-300/[.08] p-2 text-white/80">{c.a}</p></div>)}</div>
              {auth.session ? <form onSubmit={(e) => { e.preventDefault(); ask() }} className="mt-2 flex gap-2"><input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder={agent.informed ? 'How are you feeling about this?' : 'Have you heard anything today?'} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none placeholder:text-white/25 focus:border-ember-300/50" /><button disabled={asking || !question.trim()} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">{asking ? '…' : 'Ask'}</button></form>
                : <button onClick={auth.signIn} className="mt-2 w-full rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70">Sign in to interview residents</button>}
              {askErr && <p className="mt-2 text-xs text-rose-300">{askErr}</p>}
            </div> : <div className="py-5 text-center"><p className="text-sm text-white/60">Click a resident on the map</p><p className="mt-1 text-xs leading-relaxed text-white/35">to read their bio, how they feel about the news, who told them, and what they remember{auth.session ? ' — and interview them' : ''}.</p></div>}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
            <h2 className="flex items-center gap-2 text-sm"><Megaphone size={15} className="text-ember-300" /> Step in</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/40">{s.tick === 0 ? 'Available once the simulation has started.' : `Tell the town something and watch opinions react. ${Math.round((last?.informed ?? 0) * 100) < 40 ? 'Tip: wait until more people have heard the news.' : 'Good moment to step in.'}`}</p>
            <select value={String(target)} onChange={(e) => setTarget(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"><option value="all">Public announcement (everyone)</option>{s.agents.map((a) => <option key={a.id} value={a.id}>Whisper to {a.name}</option>)}</select>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. Water will be restored by 6pm. No danger." className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/25 focus:border-ember-300/50" />
            <div className="mt-2 flex items-center gap-2 text-xs text-white/50"><span>{cfg.axis[0]}</span><input type="range" min={-1} max={1} step={0.1} value={stance} onChange={(e) => setStance(Number(e.target.value))} className="flex-1 accent-ember-400" /><span>{cfg.axis[1]}</span></div>
            <button onClick={send} disabled={!text.trim() || s.tick === 0} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-black disabled:opacity-40"><Send size={14} /> Send</button>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
            <h2 className="flex items-center gap-2 text-sm"><MessageCircle size={15} className="text-ember-300" /> Town log</h2>
            <div ref={log} className="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">{events.length ? events.slice(-80).map((e, i) => <p key={i} className={`text-xs leading-relaxed ${e.type === 'news' || e.type === 'intervene' ? 'text-amber-200/90' : e.type === 'shift' ? 'text-ember-200' : e.type === 'inform' ? 'text-emerald-200/80' : 'text-white/60'}`}><span className="mr-1.5 font-mono text-white/30">{e.t.replace(/^Day \d+ · /, '')}</span>{e.text}</p>) : <p className="text-xs text-white/35">The town wakes up at {clock(0)}. Events will appear here.</p>}</div>
          </section>
        </aside>
      </div>
    </div>
  </main>
}

/* ───────── My runs ───────── */
export function MyRuns() {
  const auth = useAuth()
  const [runs, setRuns] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { if (!auth.session) return; api<{ runs: any[] }>('/api/runs', { token: auth.session.token }).then((r) => setRuns(r.runs)).catch((e) => setErr(e.message)) }, [auth.session])
  const del = async (id: string) => { if (!auth.session) return; await api(`/api/runs/${id}`, { method: 'DELETE', token: auth.session.token }); setRuns((r) => r?.filter((x) => x.id !== id) ?? null) }
  return <main className="min-h-screen bg-[#0c0b0a] text-white"><Header back />
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-6"><h1 className="text-3xl tracking-[-.04em]">My runs</h1>
      {!auth.session ? <div className="mt-8"><SignIn busy={auth.busy} error={auth.error} onSignIn={auth.signIn} /></div> : err ? <p className="mt-6 text-rose-300">{err}</p> : runs === null ? <p className="mt-6 text-white/40">Loading…</p> : runs.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/50">No saved runs yet. <Link to="/app" className="text-ember-200 hover:underline">Start a simulation</Link>, then press “Save run”.</div> :
        <div className="mt-6 space-y-2">{runs.map((r) => <div key={r.id} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[.025] p-4"><Link to={`/app/runs/${r.id}`} className="min-w-0 flex-1"><p className="truncate font-medium">{r.name}</p><p className="mt-1 text-xs text-white/40">{new Date(r.created_at).toLocaleString()} · {Math.round(r.final_informed * 100)}% informed · opinion {r.final_mean.toFixed(2)} {r.shared ? '· shared' : ''}</p></Link><button onClick={() => del(r.id)} className="text-xs text-white/40 hover:text-rose-300">Delete</button></div>)}</div>}
    </div></main>
}

/* ───────── Saved / shared run (replay) ───────── */
export function RunView() {
  const { id } = useParams()
  const auth = useAuth()
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api(`/api/runs/${id}`, { token: auth.session?.token }).then(setData).catch((e) => setErr(e.status === 404 ? 'This run doesn’t exist or isn’t shared.' : e.message)) }, [id, auth.session])
  if (err) return <main className="grid min-h-screen place-items-center bg-[#0c0b0a] px-4 text-center text-white"><div><p className="text-white/60">{err}</p><Link to="/app" className="mt-4 inline-block text-ember-200 hover:underline">Start your own simulation</Link></div></main>
  if (!data) return <main className="grid min-h-screen place-items-center bg-[#0c0b0a] text-white/40">Loading run…</main>
  return <Simulation key={data.id} replay={{ cfg: data.cfg, ivs: data.interventions, ticks: data.ticks, id: data.id, shared: data.shared, isOwner: data.isOwner, name: data.name }} />
}
