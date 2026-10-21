import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, ChevronDown, FlaskConical, Play } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { LIMITS } from '@/engine/limits'
import { LAYOUT_META, RESIDENT_LIMIT, ROLES, layoutOf, personaOf, type LayoutId, type ResidentTweak } from '@/engine/world'
import { TEMPLATES, TOWN_PRESETS, buildCfg, townOf } from '@/engine/templates'
import { MiniMap } from '@/components/MiniMap'
import { useAuth } from '@/lib/auth'

const chip = (on: boolean) => `tap-auto rounded-full border px-3.5 py-1.5 text-sm transition ${on ? 'border-ember-300/60 bg-ember-300/15 text-ember-100' : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white'}`
const field = 'mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition focus:border-ember-300/60'
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return <section aria-labelledby={`step-${n}`} className="relative pl-12 md:pl-14">
    <span aria-hidden className="absolute left-0 top-0 grid size-8 place-items-center rounded-full border border-white/15 bg-[#14110f] font-mono text-xs text-ember-200">{n}</span>
    <h2 id={`step-${n}`} className="text-lg leading-8 text-white">{title}</h2>
    {hint && <p className="mt-0.5 text-sm text-white/55">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
}

/* ───────── Dashboard: a guided, three-step set-up with a live preview of the town you are about to create ───────── */
export function Dashboard() {
  const nav = useNavigate()
  const auth = useAuth()
  const [pick, setPick] = useState(TEMPLATES[0].id)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [town, setTown] = useState('default')
  const [layout, setLayout] = useState<LayoutId>('classic')
  const [who, setWho] = useState(-1)
  const [tweak, setTweak] = useState<ResidentTweak>({})
  const [people, setPeople] = useState(12)
  const [axisA, setAxisA] = useState('Disagree'), [axisB, setAxisB] = useState('Agree')
  const [lean, setLean] = useState(0.3)
  const [first, setFirst] = useState<string[]>(['official', 'organizer'])
  const t = TEMPLATES.find((x) => x.id === pick)!
  const custom = pick === 'custom'
  const L = layoutOf(layout)
  const preset = TOWN_PRESETS.find((p) => p.id === town)!
  const changed = who >= 0 && who < people && Object.values(tweak).some(Boolean)
  const news = text.trim() || t.news.text
  const axis: [string, string] = custom ? [axisA.trim() || 'Disagree', axisB.trim() || 'Agree'] : t.axis
  const homes = useMemo(() => L.places.filter((p) => p.kind === 'home').length, [L])

  const start = () => nav('/app/sim', { state: { cfg: buildCfg(pick, {
    name: name.trim() || undefined, text: text.trim() || undefined, population: people, town: townOf(town), layout, residents: changed ? { [String(who)]: tweak } : undefined,
    ...(custom ? { axis: [axisA.trim() || 'Disagree', axisB.trim() || 'Agree'] as [string, string], stance: lean, seedRoles: first } : {}),
  }) } })

  return <AppShell>
    <div className="mx-auto max-w-[1180px] px-4 pb-28 pt-9 md:px-6 md:pb-16 md:pt-12">
      <p className="font-mono text-[11px] uppercase tracking-[.22em] text-ember-200/70">New simulation</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] tracking-[-.02em] md:text-6xl">What should the town react to?</h1>
      <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-white/60">Residents with their own personalities, routines and memories live through one day. You watch, step in, and read what changed. Three choices, about a minute.</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        <div className="space-y-12">
          <Step n={1} title="Choose the news" hint="This is what breaks at 07:20. Pick one, or write your own.">
            <div role="radiogroup" aria-label="Scenario" className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((x) => { const on = pick === x.id; return <button key={x.id} role="radio" aria-checked={on} onClick={() => { setPick(x.id); setText(''); if (x.id === 'custom') setName('') }}
                className={`group rounded-2xl border p-4 text-left transition ${on ? 'border-ember-300/60 bg-ember-300/[.08] shadow-[0_0_0_1px_rgba(255,185,138,.15)]' : 'border-white/10 bg-white/[.025] hover:border-white/25'}`}>
                <span className="flex items-start justify-between gap-3"><span className="text-[17px]">{x.title}</span><span aria-hidden className={`mt-1 size-4 shrink-0 rounded-full border ${on ? 'border-ember-300 bg-ember-300 shadow-[inset_0_0_0_3px_#1b140f]' : 'border-white/25'}`} /></span>
                <span className="mt-1.5 block text-sm leading-relaxed text-white/55">{x.blurb}</span>
                <span className="mt-3 block font-mono text-[10px] uppercase tracking-[.14em] text-white/50">{x.axis[0]} ↔ {x.axis[1]}</span>
              </button> })}
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.025] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/50">The headline</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">“{news}”</p>
              <details className="group mt-3" open={custom}>
                <summary className="tap-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-ember-200 hover:underline"><ChevronDown size={15} className="transition group-open:rotate-180" /> {custom ? 'Write your scenario' : 'Change the wording (optional)'}</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-white/70">Scenario name<input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.title} className={field} /></label>
                  <label className="block text-sm text-white/70">News text<input value={text} maxLength={240} onChange={(e) => setText(e.target.value)} placeholder={t.news.text} className={field} /></label>
                </div>
                {custom && <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-white/70">One side of the debate<input value={axisA} maxLength={24} onChange={(e) => setAxisA(e.target.value)} className={field} /></label>
                  <label className="block text-sm text-white/70">The other side<input value={axisB} maxLength={24} onChange={(e) => setAxisB(e.target.value)} className={field} /></label>
                  <label className="block text-sm text-white/70 md:col-span-2">How the news leans: <b className="font-normal text-white">{lean < -0.2 ? `toward “${axisA}”` : lean > 0.2 ? `toward “${axisB}”` : 'neutral'}</b>
                    <input type="range" min={-1} max={1} step={0.1} value={lean} onChange={(e) => setLean(Number(e.target.value))} className="mt-2 w-full accent-[#ff9a62]" />
                    <span className="mt-1 block text-xs text-white/55">Residents have opinions of their own, so this nudges the whole town relative to neutral; it does not decide where everyone ends up.</span></label>
                  <fieldset className="md:col-span-2"><legend className="text-sm text-white/70">Who hears it first <span className="text-white/55">(pick up to 4)</span></legend>
                    <div className="mt-2 flex flex-wrap gap-2">{ROLES.map((r) => { const on = first.includes(r); return <button key={r} type="button" aria-pressed={on} onClick={() => setFirst((cur) => { const next = on ? cur.filter((q) => q !== r) : [...cur, r].slice(-4); return next.length ? next : cur })} className={`${chip(on)} capitalize`}>{r}</button> })}</div></fieldset>
                </div>}
              </details>
            </div>
          </Step>

          <Step n={2} title="Build the town" hint="Who lives there and how it is laid out. The preview on the right updates as you choose.">
            <div className="space-y-6">
              <div><p className="text-sm text-white/70">What kind of town is it?</p>
                <div className="mt-2 flex flex-wrap gap-2">{TOWN_PRESETS.map((p) => <button key={p.id} type="button" aria-pressed={town === p.id} title={p.blurb} onClick={() => setTown(p.id)} className={chip(town === p.id)}>{p.label.replace(' town', '')}</button>)}</div>
                <p className="mt-2 text-sm text-white/55">{preset.blurb}</p></div>
              <div><p className="text-sm text-white/70">What does it look like?</p>
                <div className="mt-2 flex flex-wrap gap-2">{LAYOUT_META.map((m) => <button key={m.id} type="button" aria-pressed={layout === m.id} title={m.blurb} onClick={() => setLayout(m.id)} className={chip(layout === m.id)}>{m.name}</button>)}</div>
                <p className="mt-2 text-sm text-white/55">{L.blurb}</p></div>
              <label className="block max-w-sm text-sm text-white/70">Residents: <b className="font-mono text-white">{people}</b>
                <input type="range" min={LIMITS.town.minResidents} max={LIMITS.town.maxResidents} value={people} onChange={(e) => { const v = Number(e.target.value); setPeople(v); if (who >= v) { setWho(-1); setTweak({}) } }} className="mt-1 block w-full accent-[#ff9a62]" /></label>
              <details className="group">
                <summary className="tap-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-ember-200 hover:underline"><ChevronDown size={15} className="transition group-open:rotate-180" /> Change one resident (optional)</summary>
                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
                  <label className="block text-sm text-white/70">Who<select value={who} onChange={(e) => { setWho(Number(e.target.value)); setTweak({}) }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#17130f] px-3 py-2.5 text-sm text-white outline-none focus:border-ember-300/60 sm:w-80"><option value={-1}>Nobody — everyone as they are</option>{Array.from({ length: people }, (_, i) => <option key={i} value={i}>{personaOf(i)?.name} ({personaOf(i)?.role})</option>)}</select></label>
                  {who >= 0 && <div className="mt-4 grid gap-4 sm:grid-cols-3">{([['social', 'Sociability', 'keeps to themselves', 'talks to everyone'], ['trust', 'Trust in others', 'doubts everything', 'believes easily'], ['bias', 'Leaning', 'toward the first side', 'toward the second side']] as const).map(([k, label, lo, hi]) => { const v = tweak[k] ?? 0; return <label key={k} className="block text-sm text-white/70">{label}: <b className="font-mono font-normal text-white">{v > 0 ? '+' : ''}{v.toFixed(1)}</b>
                    <input type="range" min={-RESIDENT_LIMIT} max={RESIDENT_LIMIT} step={0.1} value={v} onChange={(e) => setTweak((o) => ({ ...o, [k]: Math.round(Number(e.target.value) * 10) / 10 }))} className="mt-1 w-full accent-[#ff9a62]" /><span className="flex justify-between text-[11px] text-white/55"><span>{lo}</span><span>{hi}</span></span></label> })}</div>}
                  {who >= 0 && <p className="mt-3 text-xs text-white/55">One person can change how the town behaves, but not always. To find out whether it matters, compare it in the Experiment Lab.</p>}
                </div>
              </details>
            </div>
          </Step>

          <Step n={3} title="Run it" hint="No account needed. Sign in only if you want to save and share the run.">
            <div className="flex flex-wrap items-center gap-4"><button onClick={start} className="tap-auto inline-flex items-center gap-2.5 rounded-xl bg-white px-7 py-4 text-base font-semibold text-black shadow-[0_10px_40px_-10px_rgba(255,185,138,.5)] transition hover:bg-ember-100"><Play size={17} fill="currentColor" /> Start simulation</button><p className="text-sm text-white/55">About 25 seconds at 4× speed</p></div>
            <Link to="/app/lab" className="group mt-8 flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[.025] p-5 transition hover:border-ember-300/50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember-300/15 text-ember-200"><FlaskConical size={18} /></span>
              <span><span className="block font-medium">Not sure what matters? Try the Experiment Lab <span className="ml-1 rounded-full bg-[#7ee0b0]/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#7ee0b0]">no sign-in</span></span>
                <span className="mt-1 block text-sm leading-relaxed text-white/55">One run can be luck. Compare options across dozens of random towns and get a plain-language answer about what really changes the outcome.</span></span>
              <ArrowRight size={16} className="ml-auto mt-1 shrink-0 text-white/55 transition group-hover:translate-x-0.5 group-hover:text-white" /></Link>
            {auth.session && <p className="mt-4 text-sm text-white/55">Signed in as {short(auth.session.address)}. <Link to="/app/runs" className="text-ember-200 underline-offset-4 hover:underline">View saved runs</Link></p>}
          </Step>
        </div>

        <aside aria-label="Preview of your simulation" className="lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#110f0d]">
            <MiniMap layout={layout} people={people} />
            <div className="space-y-4 p-5">
              <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/50">Your simulation</p><p className="mt-1 font-display text-2xl leading-tight">{name.trim() || t.title}</p></div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-white/50">Town</dt><dd className="mt-0.5 text-white/90">{preset.label}</dd></div>
                <div><dt className="text-white/50">Street plan</dt><dd className="mt-0.5 text-white/90">{L.name}</dd></div>
                <div><dt className="text-white/50">Residents</dt><dd className="mt-0.5 text-white/90">{people} <span className="text-white/50">· {homes} homes</span></dd></div>
                <div><dt className="text-white/50">Debate</dt><dd className="mt-0.5 text-white/90">{axis[0]} ↔ {axis[1]}</dd></div>
                {changed && <div className="col-span-2"><dt className="text-white/50">Changed</dt><dd className="mt-0.5 text-white/90">{personaOf(who)?.name}</dd></div>}
              </dl>
              <button onClick={start} className="tap-auto hidden w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-[15px] font-semibold text-black transition hover:bg-ember-100 lg:inline-flex"><Play size={16} fill="currentColor" /> Start simulation</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0c0b0a]/95 p-3 backdrop-blur lg:hidden"><button onClick={start} className="tap-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-base font-semibold text-black"><Play size={16} fill="currentColor" /> Start simulation</button></div>
  </AppShell>
}
