import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Check, Copy, Download, FlaskConical, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { ROLES, personaOf } from '@/engine/world'
import { TEMPLATES, TOWN_PRESETS } from '@/engine/templates'
import { OUTCOMES, bands, type ChartMetric, compare, cfgFor, decodeExperiment, defaultExperiment, townComparison, encodeExperiment, fmt, hourLabel, hourToTick, ivsOf, pickRun, runBatch, summarize, toCsv, valuesOf, verdict, MAX_RUNS, TICKS, type Batch, type CondKind, type Condition, type Experiment, type OutcomeId } from '@/engine/lab'

const COLORS = ['#8b93a7', '#ff9a62', '#7ee0b0', '#c4a1ff']
const PEOPLE = Array.from({ length: 16 }, (_, i) => i)
const download = (name: string, mime: string, text: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
const KIND_LABEL: Record<CondKind, string> = { none: 'Do nothing', announce: 'Public announcement', whisper: 'Whisper to one person' }

/* ───────── distribution chart: median line + 10–90% band per condition ───────── */
function Bands({ b, axis, metric, hoverTick, setHover }: { b: Batch; axis: [string, string]; metric: ChartMetric; hoverTick: number | null; setHover: (t: number | null) => void }) {
  const W = 880, H = 330, pl = 46, pr = 14, pt = 18, pb = 34
  const data = useMemo(() => b.results.map((rs) => bands(rs, TICKS, metric)), [b, metric])
  const inf = metric === 'informed'
  const show = (v: number) => (inf ? `${Math.round(v * 100)}%` : v.toFixed(2))
  const all = data.flatMap((d) => [...d.lo, ...d.hi]); const lo = Math.min(-0.1, ...all), hi = Math.max(0.1, ...all)
  const y0 = inf ? -0.03 : Math.floor(lo * 10) / 10 - 0.05, y1 = inf ? 1.03 : Math.ceil(hi * 10) / 10 + 0.05
  const X = (t: number) => pl + (t / (TICKS - 1)) * (W - pl - pr), Y = (v: number) => pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb)
  const line = (v: number[], from = 0) => v.map((p, t) => (t < from ? '' : `${t === from ? 'M' : 'L'}${X(t).toFixed(1)},${Y(p).toFixed(1)}`)).join('')
  const startOf = (i: number) => (i === 0 || b.x.conds[i].kind === 'none' ? 0 : Math.max(0, hourToTick(b.x.conds[i].hour) - 1))
  const band = (d: { lo: number[]; hi: number[] }) => {
    const ts = d.hi.map((v, t) => (Number.isNaN(v) ? -1 : t)).filter((t) => t >= 0)
    if (!ts.length) return ''
    return `${ts.map((t, k) => `${k ? 'L' : 'M'}${X(t).toFixed(1)},${Y(d.hi[t]).toFixed(1)}`).join('')}${[...ts].reverse().map((t) => `L${X(t).toFixed(1)},${Y(d.lo[t]).toFixed(1)}`).join('')}Z`
  }
  const ticks = inf ? [0, 0.2, 0.4, 0.6, 0.8, 1] : Array.from({ length: 6 }, (_, i) => y0 + ((y1 - y0) * i) / 5)
  const hours = [8, 12, 16, 20, 24, 28, 31].map((h) => ({ h, t: (h - 7) * 6 })).filter((x) => x.t < TICKS)
  const ref = useRef<SVGSVGElement>(null)
  const move = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(), t = Math.round(((e.clientX - r.left) / r.width * W - pl) / (W - pl - pr) * (TICKS - 1)); setHover(Math.max(0, Math.min(TICKS - 1, t))) }
  const clk = (t: number) => `${String((7 + Math.floor(t / 6)) % 24).padStart(2, '0')}:${(t % 6) * 10 || '00'}`
  return <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img" aria-label={`${inf ? 'Share of the town that has heard the news' : 'Opinion'} over the day for ${b.x.conds.map((c) => c.label).join(', ')}; shaded bands show the middle 80% of ${b.seeds.length} towns`} onPointerMove={move} onPointerLeave={() => setHover(null)}>
    {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,.07)" /><text x={pl - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="rgba(255,255,255,.4)" fontFamily="DM Mono, monospace">{inf ? `${Math.round(v * 100)}%` : (Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}</text></g>)}
    {y0 < 0 && y1 > 0 && <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke="rgba(255,255,255,.22)" strokeDasharray="3 4" />}
    {hours.map((x) => <text key={x.h} x={X(x.t)} y={H - 10} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,.4)" fontFamily="DM Mono, monospace">{hourLabel(x.h)}</text>)}
    <text x={pl} y={11} fontSize="10.5" fill="rgba(255,255,255,.4)">{inf ? 'everyone has heard ↑' : `${axis[1].toLowerCase()} ↑`}</text><text x={pl} y={H - 24} fontSize="10.5" fill="rgba(255,255,255,.4)">{inf ? '↓ nobody has heard' : `↓ ${axis[0].toLowerCase()}`}</text>
    {data.map((d, i) => i === 0 || startOf(i) === 0 ? <path key={`b${i}`} d={band(d)} fill={COLORS[i]} opacity=".13" /> : <path key={`b${i}`} d={band({ lo: d.lo.map((v, t) => (t < startOf(i) ? NaN : v)), hi: d.hi.map((v, t) => (t < startOf(i) ? NaN : v)) })} fill={COLORS[i]} opacity=".13" />)}
    {b.x.conds.map((c, i) => c.kind !== 'none' && <line key={`m${i}`} x1={X(hourToTick(c.hour))} x2={X(hourToTick(c.hour))} y1={pt} y2={H - pb} stroke={COLORS[i]} strokeDasharray="2 4" opacity=".5" />)}
    {data.map((d, i) => <path key={`l${i}`} d={line(d.median, startOf(i))} fill="none" stroke={COLORS[i]} strokeWidth={i === 0 ? 2.8 : 2.4} strokeLinejoin="round" />)}
    {hoverTick !== null && <g><line x1={X(hoverTick)} x2={X(hoverTick)} y1={pt} y2={H - pb} stroke="rgba(255,255,255,.35)" />{data.map((d, i) => hoverTick >= startOf(i) && <circle key={i} cx={X(hoverTick)} cy={Y(d.median[hoverTick])} r="4" fill={COLORS[i]} stroke="#0c0b0a" strokeWidth="1.5" />)}
      <g transform={`translate(${Math.min(X(hoverTick) + 10, W - 250)},${pt + 4})`}><rect width="240" height={24 + data.length * 17} rx="8" fill="#17130f" stroke="rgba(255,255,255,.12)" /><text x="10" y="16" fontSize="11" fill="rgba(255,255,255,.55)" fontFamily="DM Mono, monospace">{clk(hoverTick)}</text>
        {data.map((d, i) => <text key={i} x="10" y={34 + i * 17} fontSize="11.5" fill={COLORS[i]}>{b.x.conds[i].label}: {show(d.median[hoverTick])}{hoverTick < startOf(i) ? ' (same as baseline)' : ''}</text>)}</g></g>}
  </svg>
}

/* ───────── page ───────── */
export function Lab() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const fromLink = useMemo(() => { const c = params.get('x'); return c ? decodeExperiment(c) : null }, [params])
  const [x, setX] = useState<Experiment>(() => fromLink ?? defaultExperiment('water'))
  const [batch, setBatch] = useState<Batch | null>(null)
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [linkErr] = useState(() => !!params.get('x') && !fromLink)
  const cancel = useRef(0), started = useRef(false)
  const t = TEMPLATES.find((q) => q.id === x.template)!
  const axis: [string, string] = (batch ? batch.x.custom?.axis : x.custom?.axis) ?? t.axis
  const total = x.n * x.conds.length
  const edited = useRef(false)

  const run = useCallback(async (exp: Experiment) => {
    const id = ++cancel.current; setProg({ done: 0, total: exp.n * exp.conds.length }); setBatch(null)
    const t0 = performance.now()
    const b = await runBatch(exp, (done, tot) => { if (id === cancel.current) setProg({ done, total: tot }) }, () => id !== cancel.current)
    if (b && id === cancel.current) { setBatch(b); setProg(null); void t0 }
  }, [])
  useEffect(() => { if (fromLink && !started.current) { started.current = true; void run(fromLink) } }, [fromLink, run])

  const patch = (p: Partial<Experiment>) => { edited.current = true; setX((o) => ({ ...o, ...p })) }
  const patchCond = (i: number, p: Partial<Condition>) => patch({ conds: x.conds.map((c, k) => (k === i ? { ...c, ...p } : c)) })
  const pickTemplate = (id: string) => { const d = defaultExperiment(id); edited.current = true; setX((o) => ({ ...d, n: o.n, outcome: o.outcome })); setBatch(null) }
  const setN = (n: number) => patch({ n: Math.max(10, Math.min(Math.floor(MAX_RUNS / x.conds.length), n)) })
  const addCond = () => { if (x.conds.length >= 4) return; const d = defaultExperiment(x.template).conds[1]; patch({ conds: [...x.conds, { ...d, id: `c${x.conds.length + 1}`, label: `Option ${x.conds.length + 1}`, hour: 9 }], n: Math.min(x.n, Math.floor(MAX_RUNS / (x.conds.length + 1))) }) }
  const removeCond = (i: number) => { if (x.conds.length <= 2) return; patch({ conds: x.conds.filter((_, k) => k !== i) }) }
  const valid = x.conds.every((c) => c.kind === 'none' || c.text.trim()) && x.conds.length >= 2

  const share = async () => { const url = `${location.origin}/app/lab?x=${encodeExperiment(x)}`; try { await navigator.clipboard.writeText(url) } catch { /* clipboard blocked */ } setCopied(true); setTimeout(() => setCopied(false), 1800) }
  const o = OUTCOMES[batch?.x.outcome ?? x.outcome]
  const base = batch ? summarize(valuesOf(batch.results[0], o.id)) : null
  const pairs = batch ? batch.x.conds.map((_c, i) => (i === 0 ? null : compare(valuesOf(batch.results[i], o.id), valuesOf(batch.results[0], o.id), o.minMeaningful))) : []
  const watch = (ci: number, which: 'low' | 'mid' | 'high') => {
    if (!batch) return; const idx = pickRun(batch.results[ci], which), seed = batch.seeds[idx], cfg = cfgFor(batch.x, seed, batch.x.conds[ci])
    const ivs = ivsOf(batch.x.conds[ci], batch.x.population)
    nav('/app/sim', { state: { cfg: { ...cfg, name: `${t.title} — ${batch.x.conds[ci].label} (${which === 'low' ? 'calmest' : which === 'high' ? 'most alarmed' : 'typical'} town)` }, ivs } })
  }

  return <main className="min-h-screen bg-[#0c0b0a] text-white">
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[.08] bg-[#0c0b0a]/90 px-4 backdrop-blur md:px-6">
      <Link to="/app" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"><ArrowLeft size={16} /> Scenarios</Link>
      <span className="inline-flex items-center gap-2 text-sm font-medium"><FlaskConical size={15} className="text-ember-300" /> Experiment Lab</span>
    </header>
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <p className="text-xs uppercase tracking-[.2em] text-ember-200/60">Compare, don’t guess</p>
      <h1 className="mt-3 max-w-3xl text-3xl tracking-[-.03em] md:text-5xl">Run the same town {x.n} times. Change one thing. See what it really does.</h1>
      <p className="mt-3 max-w-2xl text-white/55">A single run can be luck. The lab replays the day in {x.n} different random towns for every option, using the <i>same</i> towns each time, then tells you in plain language whether the difference is real.</p>
      {linkErr && <p role="alert" className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">That experiment link is not valid, so the default experiment is loaded instead.</p>}

      <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
          <p className="text-sm font-medium text-white/80">1 · The situation</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{TEMPLATES.map((q) => <button key={q.id} onClick={() => pickTemplate(q.id)} className={`rounded-xl border p-3 text-left text-sm transition ${x.template === q.id ? 'border-ember-300/60 bg-ember-300/[.08]' : 'border-white/10 hover:border-white/25'}`}>{q.title}</button>)}</div>
          {x.template === 'custom'
            ? <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <label className="block text-xs text-white/50">The news<input value={x.text} maxLength={240} onChange={(e) => patch({ text: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-ember-300/50" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-white/50">Opinion axis: one side<input value={x.custom?.axis[0] ?? ''} maxLength={24} onChange={(e) => patch({ custom: { ...x.custom!, axis: [e.target.value, x.custom!.axis[1]] } })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-ember-300/50" /></label>
                  <label className="block text-xs text-white/50">…and the other side<input value={x.custom?.axis[1] ?? ''} maxLength={24} onChange={(e) => patch({ custom: { ...x.custom!, axis: [x.custom!.axis[0], e.target.value] } })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-ember-300/50" /></label>
                </div>
                <label className="block text-xs text-white/50">How the news leans: {(x.custom?.stance ?? 0) < -0.2 ? `toward ${axis[0].toLowerCase() || 'one side'}` : (x.custom?.stance ?? 0) > 0.2 ? `toward ${axis[1].toLowerCase() || 'the other side'}` : 'neutral'}<input type="range" min={-1} max={1} step={0.1} value={x.custom?.stance ?? 0} onChange={(e) => patch({ custom: { ...x.custom!, stance: Number(e.target.value) } })} className="mt-2 w-full accent-[#ff9a62]" /><span className="mt-1 block text-white/40">Nudges the town relative to neutral; residents keep opinions of their own.</span></label>
                <fieldset><legend className="text-xs text-white/50">Who hears it first (pick up to 4)</legend><div className="mt-2 flex flex-wrap gap-2">{ROLES.map((r) => { const on = x.custom?.seedRoles.includes(r) ?? false; return <button key={r} type="button" aria-pressed={on} onClick={() => { const cur = x.custom!.seedRoles; const next = on ? cur.filter((q) => q !== r) : [...cur, r].slice(-4); patch({ custom: { ...x.custom!, seedRoles: next.length ? next : cur } }) }} className={`rounded-full border px-3 py-1 text-xs capitalize ${on ? 'border-ember-300/60 bg-ember-300/15 text-ember-100' : 'border-white/10 text-white/55 hover:text-white'}`}>{r}</button> })}</div></fieldset>
              </div>
            : <p className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/75">“{x.text}”</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-xs text-white/50">The town<select value={x.town ?? 'default'} onChange={(e) => patch({ town: e.target.value === 'default' ? undefined : e.target.value })} className="ml-2 rounded-lg border border-white/10 bg-[#17130f] px-3 py-1.5 text-sm text-white outline-none focus:border-ember-300/50">{TOWN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <button onClick={() => { edited.current = true; setX((o) => ({ ...townComparison(o.template), text: o.text, custom: o.custom, n: Math.min(o.n, 60) })); setBatch(null) }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/65 hover:border-ember-300/50 hover:text-white" title="Same news, nobody steps in, three kinds of town">Does the kind of town matter? Try it →</button>
          </div>

          <p className="mt-6 text-sm font-medium text-white/80">2 · The options to compare <span className="font-normal text-white/40">(the first is your baseline)</span></p>
          <div className="mt-3 space-y-3">{x.conds.map((c, i) => <div key={c.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-3"><i className="size-3 rounded-full" style={{ background: COLORS[i] }} />
              <input aria-label={`Name of option ${i + 1}`} value={c.label} maxLength={40} onChange={(e) => patchCond(i, { label: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-white/10 focus:border-ember-300/50" />
              {x.conds.length > 2 && <button onClick={() => removeCond(i)} aria-label={`Remove ${c.label}`} className="text-white/35 hover:text-rose-300"><Trash2 size={15} /></button>}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="text-xs text-white/50">What happens<select value={c.kind} onChange={(e) => { const k = e.target.value as CondKind; const d = defaultExperiment(x.template).conds[k === 'whisper' ? 2 : 1]; patchCond(i, k === 'none' ? { kind: k } : { kind: k, text: c.text || d.text, stance: c.text ? c.stance : d.stance, agent: k === 'whisper' ? (c.kind === 'whisper' ? c.agent : d.agent) : c.agent }) }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none focus:border-ember-300/50">{(Object.keys(KIND_LABEL) as CondKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
              {c.kind !== 'none' && <label className="text-xs text-white/50">At<select value={c.hour} onChange={(e) => patchCond(i, { hour: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none">{Array.from({ length: 15 }, (_, k) => k + 8).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></label>}
              {c.kind === 'whisper' && <label className="text-xs text-white/50">To<select value={c.agent} onChange={(e) => patchCond(i, { agent: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none">{PEOPLE.slice(0, x.population).map((p) => <option key={p} value={p}>{personaOf(p)?.name ?? `Resident ${p + 1}`} ({personaOf(p)?.role})</option>)}</select></label>}
            </div>
            <label className="mt-3 block text-xs text-white/50">In which town<select value={c.town ?? ''} onChange={(e) => patchCond(i, { town: e.target.value || undefined })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none sm:w-64"><option value="">Same as the town above</option>{TOWN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            {c.kind !== 'none' && <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]"><label className="text-xs text-white/50">The words<input value={c.text} maxLength={240} onChange={(e) => patchCond(i, { text: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-ember-300/50" /></label>
              <label className="text-xs text-white/50">Tone: {c.stance < -0.2 ? `toward ${axis[0].toLowerCase()}` : c.stance > 0.2 ? `toward ${axis[1].toLowerCase()}` : 'neutral'}<input type="range" min={-1} max={1} step={0.1} value={c.stance} onChange={(e) => patchCond(i, { stance: Number(e.target.value) })} className="mt-3 w-full accent-[#ff9a62]" /></label></div>}
          </div>)}</div>
          {x.conds.length < 4 && <button onClick={addCond} className="mt-3 inline-flex items-center gap-1.5 text-sm text-ember-200 hover:underline"><Plus size={15} /> Add another option</button>}
        </div>

        <aside className="rounded-2xl border border-white/10 bg-white/[.025] p-5 lg:sticky lg:top-20 lg:self-start">
          <p className="text-sm font-medium text-white/80">3 · What to measure</p>
          <div className="mt-3 space-y-2">{(Object.keys(OUTCOMES) as OutcomeId[]).map((k) => <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${x.outcome === k ? 'border-ember-300/60 bg-ember-300/[.08]' : 'border-white/10 hover:border-white/25'}`}><input type="radio" name="outcome" checked={x.outcome === k} onChange={() => patch({ outcome: k })} className="accent-[#ff9a62]" />{OUTCOMES[k].label}</label>)}</div>
          <label className="mt-5 block text-sm text-white/70">Towns per option: <b className="font-mono text-white">{x.n}</b><input type="range" min={10} max={Math.floor(MAX_RUNS / x.conds.length)} step={5} value={x.n} onChange={(e) => setN(Number(e.target.value))} className="mt-2 w-full accent-[#ff9a62]" /></label>
          <p className="mt-1 text-xs text-white/40">{total} simulated days in total. More towns = more certain answers.</p>
          <button onClick={() => { edited.current = false; setParams({}, { replace: true }); void run(x) }} disabled={!valid || !!prog} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-black disabled:opacity-40"><Play size={15} fill="currentColor" /> {prog ? 'Running…' : batch ? 'Run again' : `Run ${total} simulated days`}</button>
          {!valid && <p className="mt-2 text-xs text-rose-200/80">Every announcement or whisper needs some words.</p>}
          {prog && <div className="mt-4" role="progressbar" aria-valuenow={Math.round(prog.done / prog.total * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff9a62] transition-all" style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div><p className="mt-1.5 text-xs text-white/45">{prog.done} of {prog.total} days simulated</p></div>}
          <button onClick={() => { setX(defaultExperiment(x.template)); setBatch(null); setParams({}, { replace: true }) }} className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white"><RotateCcw size={12} /> Reset to the default experiment</button>
        </aside>
      </section>

      {batch && base && <section className="mt-10" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.2em] text-ember-200/60">Result · {batch.seeds.length} towns per option</p><h2 className="mt-2 text-2xl tracking-[-.03em] md:text-3xl">{o.label}</h2></div>
          <div className="flex flex-wrap gap-2"><button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Link copied' : 'Copy experiment link'}</button>
            <button onClick={() => download('society-agent-experiment.csv', 'text/csv', toCsv(batch))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white"><Download size={14} /> CSV</button></div></div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">{pairs.map((p, i) => p && (() => { const v = verdict(batch.x.conds[i].label, batch.x.conds[0].label, p, o, axis); return <div key={i} className={`rounded-2xl border p-5 ${v.tone === 'clear' ? 'border-[#7ee0b0]/30 bg-[#7ee0b0]/[.06]' : 'border-white/10 bg-white/[.025]'}`}>
          <div className="flex items-center gap-2"><i className="size-3 rounded-full" style={{ background: COLORS[i] }} /><span className="font-mono text-[10px] uppercase tracking-[.16em] text-white/45">{v.tone === 'clear' ? 'Clear difference' : 'No clear difference'}</span></div>
          <p className="mt-2 text-lg leading-snug">{v.headline}</p><p className="mt-2 text-sm leading-relaxed text-white/55">{v.detail}</p></div> })())}</div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-[#14110f] p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">{batch.x.conds.map((c, i) => <span key={c.id} className="inline-flex items-center gap-2"><i className="size-3 rounded-full" style={{ background: COLORS[i] }} />{c.label}</span>)}<span className="text-xs text-white/40">line = typical town · shaded = middle 80% of towns{batch.x.conds.some((c) => c.kind !== 'none') ? ' · dotted = when the move happens (until then every option is the same town)' : ''}</span></div>
          <div className="mt-3 overflow-x-auto"><div className="min-w-[620px]"><p className="mb-2 text-sm text-white/55">{o.id === 'half' ? 'How much of the town has heard the news, hour by hour' : 'How the town’s average opinion moves through the day'}</p><Bands b={batch} axis={axis} metric={o.id === 'half' ? 'informed' : 'opinion'} hoverTick={hover} setHover={setHover} /></div></div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-sm"><caption className="sr-only">Summary of {o.label} per option</caption>
          <thead className="bg-white/[.03] text-left text-xs uppercase tracking-wider text-white/45"><tr><th className="px-4 py-3">Option</th><th className="px-4 py-3">Average</th><th className="hidden px-4 py-3 md:table-cell">95% range of the average</th><th className="hidden px-4 py-3 md:table-cell">Typical towns (10th–90th)</th><th className="px-3 py-3 md:px-4">Watch a town</th></tr></thead>
          <tbody className="divide-y divide-white/[.06]">{batch.x.conds.map((c, i) => { const s = summarize(valuesOf(batch.results[i], o.id)); return <tr key={c.id}><td className="px-4 py-3"><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: COLORS[i] }} />{c.label}</span></td>
            <td className="px-4 py-3 font-mono">{fmt(s.mean, o.id)}{o.unit}</td><td className="hidden px-4 py-3 font-mono text-white/55 md:table-cell">{s.ci[0].toFixed(o.digits)} … {s.ci[1].toFixed(o.digits)}</td><td className="hidden px-4 py-3 font-mono text-white/55 md:table-cell">{s.p10.toFixed(o.digits)} … {s.p90.toFixed(o.digits)}</td>
            <td className="px-4 py-3"><span className="inline-flex flex-wrap gap-1.5 text-xs">{(['low', 'mid', 'high'] as const).map((w) => <button key={w} onClick={() => watch(i, w)} title={w === 'low' ? `Watch the town where this option ended up most ${axis[0].toLowerCase()}` : w === 'high' ? `Watch the town where this option ended up most ${axis[1].toLowerCase()}` : 'Watch the town in the middle of the pack'} className="rounded-md border border-white/10 px-2.5 py-1.5 text-white/60 hover:border-ember-300/50 hover:text-white">{w === 'low' ? axis[0].toLowerCase() : w === 'high' ? axis[1].toLowerCase() : 'typical'}</button>)}</span></td></tr> })}</tbody></table></div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-white/40">Every option is simulated in the same {batch.seeds.length} towns, so each comparison is between the same town with and without your move. “Clear” means the 95% range of the average difference excludes zero and is larger than {o.minMeaningful}{o.unit}. This is a model of one small invented town, not a forecast of real people. Share the link and anyone gets exactly these numbers.</p>
      </section>}
    </div>
  </main>
}
