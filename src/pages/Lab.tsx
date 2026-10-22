import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Check, ChevronRight, Copy, Download, FileText, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { LAYOUT_META, RESIDENT_LIMIT, ROLES, personaOf, type LayoutId, type ResidentTweak } from '@/engine/world'
import { TEMPLATES, TOWN_PRESETS } from '@/engine/templates'
import { AppShell } from '@/components/AppShell'
import { LIMITS } from '@/engine/limits'
import { BandsChart } from '@/components/BandsChart'
import { OUTCOMES, compare, cfgFor, decodeExperiment, defaultExperiment, layoutComparison, residentComparison, townComparison, encodeExperiment, fmt, hourLabel, ivsOf, pickRun, runBatch, summarize, toCsv, valuesOf, verdict, MAX_RUNS, type Batch, type CondKind, type Condition, type Experiment, type OutcomeId } from '@/engine/lab'

const COLORS = ['#8b93a7', '#ff9a62', '#7ee0b0', '#c4a1ff']
const PEOPLE = Array.from({ length: 16 }, (_, i) => i)
const download = (name: string, mime: string, text: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
const TWEAKS: { key: keyof ResidentTweak; label: string; lo: string; hi: string }[] = [
  { key: 'social', label: 'Sociability', lo: 'keeps to themselves', hi: 'talks to everyone' },
  { key: 'trust', label: 'Trust in others', lo: 'doubts everything', hi: 'believes easily' },
  { key: 'bias', label: 'Leaning', lo: 'toward the first side', hi: 'toward the second side' },
]
const firstResident = (r?: Record<string, ResidentTweak>): [string, ResidentTweak] | null => { const e = Object.entries(r ?? {})[0]; return e ? [e[0], e[1]] : null }
const KIND_LABEL: Record<CondKind, string> = { none: 'Do nothing', announce: 'Public announcement', whisper: 'Whisper to one person' }

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
  const cancel = useRef(0)
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


  const patch = (p: Partial<Experiment>) => { edited.current = true; setX((o) => ({ ...o, ...p })) }
  const patchCond = (i: number, p: Partial<Condition>) => patch({ conds: x.conds.map((c, k) => (k === i ? { ...c, ...p } : c)) })
  const pickTemplate = (id: string) => { const d = defaultExperiment(id); edited.current = true; setX((o) => ({ ...d, n: o.n, outcome: o.outcome })); setBatch(null) }
  const setN = (n: number) => patch({ n: Math.max(LIMITS.lab.minTowns, Math.min(Math.floor(MAX_RUNS / x.conds.length), n)) })
  const addCond = () => { if (x.conds.length >= LIMITS.lab.maxOptions) return; const d = defaultExperiment(x.template).conds[1]; patch({ conds: [...x.conds, { ...d, id: `c${x.conds.length + 1}`, label: `Option ${x.conds.length + 1}`, hour: 9 }], n: Math.min(x.n, Math.floor(MAX_RUNS / (x.conds.length + 1))) }) }
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

  return <AppShell>
    <div className="mx-auto max-w-6xl px-4 py-8 max-lg:pb-28 md:px-6">
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
                <label className="block text-xs text-white/50">How the news leans: {(x.custom?.stance ?? 0) < -0.2 ? `toward ${axis[0].toLowerCase() || 'one side'}` : (x.custom?.stance ?? 0) > 0.2 ? `toward ${axis[1].toLowerCase() || 'the other side'}` : 'neutral'}<input type="range" min={-1} max={1} step={0.1} value={x.custom?.stance ?? 0} onChange={(e) => patch({ custom: { ...x.custom!, stance: Number(e.target.value) } })} className="mt-2 w-full accent-[#ff9a62]" /><span className="mt-1 block text-white/55">Nudges the town relative to neutral; residents keep opinions of their own.</span></label>
                <fieldset><legend className="text-xs text-white/50">Who hears it first (pick up to 4)</legend><div className="mt-2 flex flex-wrap gap-2">{ROLES.map((r) => { const on = x.custom?.seedRoles.includes(r) ?? false; return <button key={r} type="button" aria-pressed={on} onClick={() => { const cur = x.custom!.seedRoles; const next = on ? cur.filter((q) => q !== r) : [...cur, r].slice(-4); patch({ custom: { ...x.custom!, seedRoles: next.length ? next : cur } }) }} className={`rounded-full border px-3 py-1 text-xs capitalize ${on ? 'border-ember-300/60 bg-ember-300/15 text-ember-100' : 'border-white/10 text-white/55 hover:text-white'}`}>{r}</button> })}</div></fieldset>
              </div>
            : <p className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/75">“{x.text}”</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-xs text-white/50">The town<select value={x.town ?? 'default'} onChange={(e) => patch({ town: e.target.value === 'default' ? undefined : e.target.value })} className="ml-2 rounded-lg border border-white/10 bg-[#17130f] px-3 py-1.5 text-sm text-white outline-none focus:border-ember-300/50">{TOWN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <label className="text-xs text-white/50">Street plan<select value={x.layout ?? 'classic'} onChange={(e) => patch({ layout: e.target.value === 'classic' ? undefined : (e.target.value as LayoutId) })} className="ml-2 rounded-lg border border-white/10 bg-[#17130f] px-3 py-1.5 text-sm text-white outline-none focus:border-ember-300/50">{LAYOUT_META.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-white/55">Try a ready-made question:</span>
            {([['Does the kind of town matter?', 'Same news, nobody steps in, three kinds of town', townComparison], ['Does the street plan matter?', 'Same news, nobody steps in, three street plans. Results differ by story, so try more than one.', layoutComparison], ['What if one person were different?', 'The same town, but one resident keeps to themselves (less sociable)', (tpl: string) => residentComparison(tpl, 8, { social: 0.4 })]] as const).map(([label, tip, make]) => <button key={label} onClick={() => { edited.current = true; setX((o) => ({ ...make(o.template), text: o.text, custom: o.custom, n: Math.min(o.n, 60) })); setBatch(null) }} title={tip} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/65 hover:border-ember-300/50 hover:text-white">{label} →</button>)}</div>

          <p className="mt-6 text-sm font-medium text-white/80">2 · The options to compare <span className="font-normal text-white/55">(the first is your baseline)</span></p>
          <div className="mt-3 space-y-3">{x.conds.map((c, i) => <div key={c.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-3"><i className="size-3 rounded-full" style={{ background: COLORS[i] }} />
              <input aria-label={`Name of option ${i + 1}`} value={c.label} maxLength={40} onChange={(e) => patchCond(i, { label: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-white/10 focus:border-ember-300/50" />
              {x.conds.length > 2 && <button onClick={() => removeCond(i)} aria-label={`Remove ${c.label}`} className="text-white/55 hover:text-rose-300"><Trash2 size={15} /></button>}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="text-xs text-white/50">What happens<select value={c.kind} onChange={(e) => { const k = e.target.value as CondKind; const d = defaultExperiment(x.template).conds[k === 'whisper' ? 2 : 1]; patchCond(i, k === 'none' ? { kind: k } : { kind: k, text: c.text || d.text, stance: c.text ? c.stance : d.stance, agent: k === 'whisper' ? (c.kind === 'whisper' ? c.agent : d.agent) : c.agent }) }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none focus:border-ember-300/50">{(Object.keys(KIND_LABEL) as CondKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
              {c.kind !== 'none' && <label className="text-xs text-white/50">At<select value={c.hour} onChange={(e) => patchCond(i, { hour: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none">{Array.from({ length: 15 }, (_, k) => k + 8).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></label>}
              {c.kind === 'whisper' && <label className="text-xs text-white/50">To<select value={c.agent} onChange={(e) => patchCond(i, { agent: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none">{PEOPLE.slice(0, x.population).map((p) => <option key={p} value={p}>{personaOf(p)?.name ?? `Resident ${p + 1}`} ({personaOf(p)?.role})</option>)}</select></label>}
            </div>
            <details className="group mt-3" open={!!(c.town || c.layout)}><summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-xs text-ember-200 transition hover:border-ember-300/50 hover:bg-ember-300/[.06] [&::-webkit-details-marker]:hidden"><ChevronRight size={13} className="shrink-0 transition group-open:rotate-90" />{c.town || c.layout ? `Own town and street plan: ${[c.town ? TOWN_PRESETS.find((p) => p.id === c.town)?.label : '', c.layout ? LAYOUT_META.find((m) => m.id === c.layout)?.name : ''].filter(Boolean).join(' · ')}` : 'Use a different town or street plan for this option (optional)'}</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/50">In which town<select value={c.town ?? ''} onChange={(e) => patchCond(i, { town: e.target.value || undefined })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none"><option value="">Same as the town above</option>{TOWN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
              <label className="block text-xs text-white/50">Street plan<select value={c.layout ?? ''} onChange={(e) => patchCond(i, { layout: (e.target.value || undefined) as LayoutId | undefined })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none"><option value="">Same as the plan above</option>{LAYOUT_META.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            </div></details>
            {(() => { const cur = firstResident(c.residents); const who = cur ? Number(cur[0]) : -1; const tw = cur?.[1] ?? {}
              return <details className="group mt-3" open={!!cur}><summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-xs text-ember-200 transition hover:border-ember-300/50 hover:bg-ember-300/[.06] [&::-webkit-details-marker]:hidden"><ChevronRight size={13} className="shrink-0 transition group-open:rotate-90" />{cur ? `Changing ${personaOf(who)?.name.split(' ')[0] ?? 'one person'}` : 'Change one person (optional)'}</summary>
                <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3">
                  <label className="block text-xs text-white/50">Who<select value={who} onChange={(e) => { const id = Number(e.target.value); patchCond(i, { residents: id < 0 ? undefined : { [String(id)]: tw } }) }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17130f] px-3 py-2 text-sm text-white outline-none sm:w-72"><option value={-1}>Nobody (everyone as they are)</option>{PEOPLE.slice(0, x.population).map((p) => <option key={p} value={p}>{personaOf(p)?.name} ({personaOf(p)?.role})</option>)}</select></label>
                  {cur && <div className="mt-3 grid gap-3 sm:grid-cols-3">{TWEAKS.map((t2) => { const v = tw[t2.key] ?? 0; return <label key={t2.key} className="block text-xs text-white/50">{t2.label}: <b className="font-mono font-normal text-white">{v > 0 ? '+' : ''}{v.toFixed(1)}</b><input type="range" min={-RESIDENT_LIMIT} max={RESIDENT_LIMIT} step={0.1} value={v} onChange={(e) => { const nv = Math.round(Number(e.target.value) * 10) / 10; const next = { ...tw, [t2.key]: nv }; if (!nv) delete next[t2.key]; patchCond(i, { residents: { [String(who)]: next } }) }} className="mt-2 w-full accent-[#ff9a62]" /><span className="mt-0.5 flex justify-between text-[10px] text-white/55"><span>{t2.lo}</span><span>{t2.hi}</span></span></label> })}</div>}
                </div></details> })()}
            {c.kind !== 'none' && <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]"><label className="text-xs text-white/50">The words<input value={c.text} maxLength={240} onChange={(e) => patchCond(i, { text: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-ember-300/50" /></label>
              <label className="text-xs text-white/50">Tone: {c.stance < -0.2 ? `toward ${axis[0].toLowerCase()}` : c.stance > 0.2 ? `toward ${axis[1].toLowerCase()}` : 'neutral'}<input type="range" min={-1} max={1} step={0.1} value={c.stance} onChange={(e) => patchCond(i, { stance: Number(e.target.value) })} className="mt-3 w-full accent-[#ff9a62]" /></label></div>}
          </div>)}</div>
          {x.conds.length < LIMITS.lab.maxOptions && <button onClick={addCond} className="mt-3 inline-flex items-center gap-1.5 text-sm text-ember-200 hover:underline"><Plus size={15} /> Add another option</button>}
        </div>

        <aside className="rounded-2xl border border-white/10 bg-white/[.025] p-5 lg:sticky lg:top-20 lg:self-start">
          <p className="text-sm font-medium text-white/80">3 · What to measure</p>
          <div className="mt-3 space-y-2">{(Object.keys(OUTCOMES) as OutcomeId[]).map((k) => <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${x.outcome === k ? 'border-ember-300/60 bg-ember-300/[.08]' : 'border-white/10 hover:border-white/25'}`}><input type="radio" name="outcome" checked={x.outcome === k} onChange={() => patch({ outcome: k })} className="accent-[#ff9a62]" />{OUTCOMES[k].label}</label>)}</div>
          <label className="mt-5 block text-sm text-white/70">Towns per option: <b className="font-mono text-white">{x.n}</b><input type="range" min={LIMITS.lab.minTowns} max={Math.floor(MAX_RUNS / x.conds.length)} step={5} value={x.n} onChange={(e) => setN(Number(e.target.value))} className="mt-2 w-full accent-[#ff9a62]" /></label>
          <p className="mt-1 text-xs text-white/55">{total} simulated days in total. More towns = more certain answers.</p>
          <button onClick={() => { edited.current = false; setParams({}, { replace: true }); void run(x) }} disabled={!valid || !!prog} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,.5)] disabled:opacity-40 max-lg:fixed max-lg:inset-x-3 max-lg:bottom-3 max-lg:z-30 max-lg:mt-0 max-lg:w-auto"><Play size={15} fill="currentColor" /> {prog ? 'Running…' : batch ? 'Run again' : `Run ${total} simulated days`}</button>
          {!valid && <p className="mt-2 text-xs text-rose-200/80">Every announcement or whisper needs some words.</p>}
          {prog && <div className="mt-4" role="progressbar" aria-valuenow={Math.round(prog.done / prog.total * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff9a62] transition-all" style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div><p className="mt-1.5 text-xs text-white/55">{prog.done} of {prog.total} days simulated</p></div>}
          <button onClick={() => { setX(defaultExperiment(x.template)); setBatch(null); setParams({}, { replace: true }) }} className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white"><RotateCcw size={12} /> Reset to the default experiment</button>
        </aside>
      </section>

      {batch && base && <section className="mt-10" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.2em] text-ember-200/60">Result · {batch.seeds.length} towns per option</p><h2 className="mt-2 text-2xl tracking-[-.03em] md:text-3xl">{o.label}</h2></div>
          <div className="flex flex-wrap gap-2"><button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Link copied' : 'Copy experiment link'}</button>
            <Link to={`/app/lab/report?x=${encodeExperiment(batch.x)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ember-300/40 bg-ember-300/10 px-3 py-2 text-sm text-ember-100 hover:bg-ember-300/20"><FileText size={14} /> Make a report</Link>
            <button onClick={() => download('society-agent-experiment.csv', 'text/csv', toCsv(batch))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white"><Download size={14} /> CSV</button></div></div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">{pairs.map((p, i) => p && (() => { const v = verdict(batch.x.conds[i].label, batch.x.conds[0].label, p, o, axis); return <div key={i} className={`rounded-2xl border p-5 ${v.tone === 'clear' ? 'border-[#7ee0b0]/30 bg-[#7ee0b0]/[.06]' : 'border-white/10 bg-white/[.025]'}`}>
          <div className="flex items-center gap-2"><i className="size-3 rounded-full" style={{ background: COLORS[i] }} /><span className="font-mono text-[10px] uppercase tracking-[.16em] text-white/55">{v.tone === 'clear' ? 'Clear difference' : 'No clear difference'}</span></div>
          <p className="mt-2 text-lg leading-snug">{v.headline}</p><p className="mt-2 text-sm leading-relaxed text-white/55">{v.detail}</p></div> })())}</div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-[#14110f] p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">{batch.x.conds.map((c, i) => <span key={c.id} className="inline-flex items-center gap-2"><i className="size-3 rounded-full" style={{ background: COLORS[i] }} />{c.label}</span>)}<span className="text-xs text-white/55">line = typical town · shaded = middle 80% of towns{batch.x.conds.some((c) => c.kind !== 'none') ? ' · dotted = when the move happens (until then every option is the same town)' : ''}</span></div>
          <div className="mt-3 overflow-x-auto"><div className="min-w-[620px]"><p className="mb-2 text-sm text-white/55">{o.id === 'half' ? 'How much of the town has heard the news, hour by hour' : 'How the town’s average opinion moves through the day'}</p><BandsChart b={batch} axis={axis} metric={o.id === 'half' ? 'informed' : 'opinion'} hoverTick={hover} setHover={setHover} colors={COLORS} /></div></div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-sm"><caption className="sr-only">Summary of {o.label} per option</caption>
          <thead className="bg-white/[.03] text-left text-xs uppercase tracking-wider text-white/55"><tr><th className="px-4 py-3">Option</th><th className="px-4 py-3">Average</th><th className="hidden px-4 py-3 md:table-cell">95% range of the average</th><th className="hidden px-4 py-3 md:table-cell">Typical towns (10th–90th)</th><th className="px-3 py-3 md:px-4">Watch a town</th></tr></thead>
          <tbody className="divide-y divide-white/[.06]">{batch.x.conds.map((c, i) => { const s = summarize(valuesOf(batch.results[i], o.id)); return <tr key={c.id}><td className="px-4 py-3"><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: COLORS[i] }} />{c.label}</span></td>
            <td className="px-4 py-3 font-mono">{fmt(s.mean, o.id)}{o.unit}</td><td className="hidden px-4 py-3 font-mono text-white/55 md:table-cell">{s.ci[0].toFixed(o.digits)} … {s.ci[1].toFixed(o.digits)}</td><td className="hidden px-4 py-3 font-mono text-white/55 md:table-cell">{s.p10.toFixed(o.digits)} … {s.p90.toFixed(o.digits)}</td>
            <td className="px-4 py-3"><span className="inline-flex flex-wrap gap-1.5 text-xs">{(['low', 'mid', 'high'] as const).map((w) => <button key={w} onClick={() => watch(i, w)} title={w === 'low' ? `Watch the town where this option ended up most ${axis[0].toLowerCase()}` : w === 'high' ? `Watch the town where this option ended up most ${axis[1].toLowerCase()}` : 'Watch the town in the middle of the pack'} className="rounded-md border border-white/10 px-2.5 py-1.5 text-white/60 hover:border-ember-300/50 hover:text-white">{w === 'low' ? axis[0].toLowerCase() : w === 'high' ? axis[1].toLowerCase() : 'typical'}</button>)}</span></td></tr> })}</tbody></table></div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-white/55">Every option is simulated in the same {batch.seeds.length} towns, so each comparison is between the same town with and without your move. “Clear” means the 95% range of the average difference excludes zero and is larger than {o.minMeaningful}{o.unit}. This is a model of one small invented town, not a forecast of real people. Share the link and anyone gets exactly these numbers.</p>
      </section>}
    </div>
  </AppShell>
}
