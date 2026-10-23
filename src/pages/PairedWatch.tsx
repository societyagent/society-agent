import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Pause, Play, SkipForward, GitCompareArrows } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { Town } from '@/components/Town'
import { pairedAt } from '@/engine/paired'
import { decodeExperiment, hourToTick, TICKS } from '@/engine/lab'
import { comparisonChanges, describeCondition } from '@/engine/report'
import { dayClock, type Ev } from '@/engine/world'

function RecentEvents({ events }: { events: Ev[] }) {
  const latest = events.filter((e) => ['news', 'inform', 'say', 'shift', 'intervene'].includes(e.type)).slice(-4).reverse()
  return <div className="mt-4 border-t border-white/10 pt-4"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-white/50">What just happened</p>
    {latest.length ? <ul className="mt-3 space-y-2.5" aria-label="Recent events">{latest.map((e, i) => <li key={`${e.tick}-${i}`} className="flex gap-3 text-xs leading-relaxed text-white/70"><span className="shrink-0 font-mono text-ember-200">{e.t}</span><span>{e.text}</span></li>)}</ul> : <p className="mt-3 text-sm text-white/50">The town is waking up. The news has not broken yet.</p>}</div>
}

export function PairedWatch() {
  const [params, setParams] = useSearchParams()
  const code = params.get('x')
  const x = useMemo(() => code ? decodeExperiment(code) : null, [code])
  const number = (key: string, fallback: number, max: number) => { const raw = params.get(key), n = raw === null ? fallback : Number(raw); return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback }
  const seedIndex = number('seed', 0, (x?.n ?? 1) - 1)
  const option = Math.max(1, number('option', 1, (x?.conds.length ?? 2) - 1))
  const [tick, setTick] = useState(0), [playing, setPlaying] = useState(false), [selected, setSelected] = useState<number | null>(null)
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setTick((t) => { if (t >= TICKS - 1) { setPlaying(false); return t } return t + 1 }), 110); return () => window.clearInterval(timer) }, [playing])
  const pair = useMemo(() => x ? pairedAt(x, seedIndex, option, tick) : null, [x, seedIndex, option, tick])
  const update = (key: string, value: number) => { const next = new URLSearchParams(params); next.set(key, String(value)); setParams(next, { replace: true }) }
  if (!x || !pair) return <AppShell><main className="mx-auto max-w-xl px-5 py-20"><h1 className="text-3xl">No experiment to replay</h1><p className="mt-3 text-white/55">Run an experiment in the Lab, then choose “Watch a paired town”.</p><Link to="/app/lab" className="mt-6 inline-flex text-ember-200 underline">Open Experiment Lab</Link></main></AppShell>
  const changes = comparisonChanges(x, x.conds[option])
  const sides = [{ label: x.conds[0].label, run: pair.left, condition: x.conds[0] }, { label: x.conds[option].label, run: pair.right, condition: x.conds[option] }]
  const beforeMove = x.conds[option].kind === 'none' ? 0 : hourToTick(x.conds[option].hour)
  return <AppShell><main className="mx-auto max-w-[1500px] px-4 py-7 md:px-7">
    <Link to={`/app/lab?x=${code}`} className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white"><ArrowLeft size={15} /> Back to the experiment</Link>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-5"><div><p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.18em] text-ember-200"><GitCompareArrows size={16} /> A day, two versions</p><h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">Watch one town, two outcomes.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">Same random seed, same moment. See the residents, conversations and opinion changes behind the Lab numbers. This is one illustrative town, not the average of the experiment.</p></div>
      <div className="flex flex-wrap gap-3"><label className="text-xs text-white/55">Which town <select aria-label="Which town" value={seedIndex} onChange={(e) => { setPlaying(false); update('seed', Number(e.target.value)) }} className="mt-1 block rounded-lg border border-white/15 bg-[#17130f] px-3 py-2 text-sm text-white">{Array.from({ length: x.n }, (_, i) => <option key={i} value={i}>Town {i + 1}</option>)}</select></label><label className="text-xs text-white/55">Compare with <select aria-label="Compare with" value={option} onChange={(e) => { setPlaying(false); update('option', Number(e.target.value)) }} className="mt-1 block max-w-56 rounded-lg border border-white/15 bg-[#17130f] px-3 py-2 text-sm text-white">{x.conds.slice(1).map((c, i) => <option key={c.id} value={i + 1}>{c.label}</option>)}</select></label></div></div>
    {changes.length > 1 && <p className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm leading-relaxed text-amber-100">These versions change {changes.join(' and ')}. You can watch what happened, but cannot credit the difference to a single action.</p>}
    <div className="mt-6 rounded-2xl border border-ember-300/25 bg-gradient-to-r from-[#211710] to-[#11100f] p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3"><button aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => { if (tick === TICKS - 1) setTick(0); setPlaying(!playing) }} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black">{playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}{playing ? 'Pause' : 'Play the day'}</button><button onClick={() => { setPlaying(false); setTick(beforeMove) }} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2.5 text-sm text-white/75 hover:text-white"><SkipForward size={15} /> At the move</button><span aria-live="polite" className="ml-auto font-mono text-sm text-ember-200">{dayClock(tick)}</span></div>
      <input type="range" aria-label="Time in the town" min={0} max={TICKS - 1} value={tick} onChange={(e) => { setPlaying(false); setTick(Number(e.target.value)) }} className="mt-5 w-full accent-[#ff9a62]" /><div className="flex justify-between font-mono text-[10px] text-white/45"><span>07:00 · news breaks shortly after</span><span>Next morning</span></div>
    </div>
    <div className="mt-5 grid gap-4 xl:grid-cols-2">{sides.map(({ label, run, condition }, i) => { const m = run.metrics.at(-1)!; return <section key={condition.id} aria-label={`${label} replay`} className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#14120f] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ember-200">{i ? 'Compared option' : 'Baseline'}</p><h2 className="mt-1 font-display text-2xl">{label}</h2></div><div className="text-right font-mono text-xs text-white/65"><p>{Math.round(m.informed * run.st.agents.length)} / {run.st.agents.length} heard</p><p>Opinion {m.mean > 0 ? '+' : ''}{m.mean.toFixed(2)}</p></div></div>
      <p className="mt-3 min-h-10 text-xs leading-relaxed text-white/55">{describeCondition(condition, x)[0]}</p>
      <Town agents={run.st.agents} selected={selected} onSelect={setSelected} mode="opinion" tick={run.st.tick} layout={run.st.cfg.layout} />
      <RecentEvents events={run.events} />
    </section> })}</div>
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-5" aria-label="Resident comparison"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ember-200">Inside the town</p><h2 className="mt-1 font-display text-2xl">{selected === null ? 'Pick a resident on either map' : `What changed for ${pair.left.st.agents[selected]?.name ?? 'this resident'}?`}</h2></div><select aria-label="Inspect resident" value={selected ?? ''} onChange={(e) => setSelected(e.target.value === '' ? null : Number(e.target.value))} className="rounded-lg border border-white/15 bg-[#17130f] px-3 py-2 text-sm text-white"><option value="">Choose a resident</option>{pair.left.st.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      {selected !== null && <div className="mt-4 grid gap-4 md:grid-cols-2">{sides.map(({ label, run }) => { const a = run.st.agents[selected], evs = run.events.filter((e) => e.agent === selected && ['inform', 'say', 'shift', 'intervene'].includes(e.type)).slice(-3); return <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-medium">{label}</p><p className="mt-2 text-sm text-white/65">{a.informed ? `Heard the news · opinion ${a.opinion > 0 ? '+' : ''}${a.opinion.toFixed(2)}` : 'Has not heard the news yet'}</p>{evs.length ? <ul className="mt-3 space-y-2 text-xs leading-relaxed text-white/55">{evs.map((e, j) => <li key={`${e.tick}-${j}`}>{e.t} · {e.text}</li>)}</ul> : <p className="mt-3 text-xs text-white/45">No recorded action yet.</p>}</div> })}</div>}
    </section><p className="mt-5 pb-8 text-xs leading-relaxed text-white/40">This is a deterministic simulation of an invented town, not evidence about real people. Change the time or town to explore what the model actually recorded.</p>
  </main></AppShell>
}
