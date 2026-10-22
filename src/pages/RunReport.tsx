import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Check, Copy, Download, Printer } from 'lucide-react'
import { replayRun } from '@/engine/replay'
import { buildRunDoc, runMarkdown, type RunDoc } from '@/engine/runReport'
import { api, useAuth } from '@/lib/auth'
import { useEffect } from 'react'
import type { Cfg, Intervention } from '@/engine/world'

interface RunData { id: string; name: string; cfg: Cfg; interventions: { tick: number; iv: Intervention }[]; ticks: number; shared: boolean; isOwner: boolean }
const download = (name: string, mime: string, text: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }

/** Two small lines for the printed page: who has heard (ink) and the mean opinion (ember). No axes library, so it prints sharply at any size. */
function Lines({ doc }: { doc: RunDoc }) {
  const W = 760, H = 220, pl = 40, pr = 64, pt = 14, pb = 26, n = doc.chart.informed.length
  if (n < 2) return null
  const x = (i: number) => pl + (i / (n - 1)) * (W - pl - pr)
  const op = doc.chart.opinion
  const yI = (v: number) => pt + (1 - v) * (H - pt - pb), yO = (v: number) => pt + (1 - (Math.max(-1, Math.min(1, v)) + 1) / 2) * (H - pt - pb)
  const path = (vals: number[], y: (v: number) => number) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const hours = [0, 6, 12, 18, 24].filter((h) => h * 6 < n)
  return <svg role="img" aria-label="Share of residents who have heard the news, and the average opinion, over the run" viewBox={`0 0 ${W} ${H}`} className="block w-full">
    {[0, 0.5, 1].map((g) => <g key={g}><line x1={pl} x2={W - pr} y1={yI(g)} y2={yI(g)} stroke="rgba(20,16,10,.12)" /><text x={pl - 6} y={yI(g) + 4} textAnchor="end" fontSize="10" fill="rgba(20,16,10,.62)">{Math.round(g * 100)}%</text></g>)}
    {[1, 0, -1].map((g) => <text key={g} x={W - pr + 6} y={yO(g) + 4} fontSize="10" fill="#b9531f">{g === 1 ? doc.axis[1] : g === -1 ? doc.axis[0] : 'neutral'}</text>)}
    {hours.map((h) => <text key={h} x={x(h * 6)} y={H - 8} textAnchor="middle" fontSize="10" fill="rgba(20,16,10,.62)">{`+${h}h`}</text>)}
    <path d={path(doc.chart.informed, yI)} fill="none" stroke="#1c1814" strokeWidth="2.2" strokeLinejoin="round" />
    <path d={path(op, yO)} fill="none" stroke="#d9632b" strokeWidth="2.2" strokeLinejoin="round" strokeDasharray="5 4" />
  </svg>
}

/** A shareable, printable write-up of one saved run. Light "paper" theme so it prints cleanly. */
export function RunReport() {
  const { id } = useParams()
  const auth = useAuth()
  const [data, setData] = useState<RunData | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { api<RunData>(`/api/runs/${id}`).then(setData).catch((e) => setErr(e.status === 404 ? 'This run does not exist or is not shared.' : e.message)) }, [id, auth.session])

  const doc = useMemo(() => {
    if (!data) return null
    const r = replayRun(data.cfg, data.ticks, data.interventions)
    return buildRunDoc({ cfg: data.cfg, ticks: data.ticks, interventions: data.interventions, ...r, link: `${location.origin}/${data.isOwner ? 'app/runs' : 'r'}/${data.id}` })
  }, [data])

  if (err) return <main className="min-h-screen bg-[#0c0b0a] px-6 py-16 text-white"><div className="mx-auto max-w-xl"><h1 className="text-2xl">This report is not available</h1><p className="mt-3 text-white/60">{err}</p><Link to="/app" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">Start your own simulation</Link></div></main>
  const copy = async () => { try { await navigator.clipboard.writeText(location.href) } catch { /* clipboard blocked */ } setCopied(true); setTimeout(() => setCopied(false), 1800) }
  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white/60 px-3 py-2 text-sm hover:bg-white disabled:opacity-40'

  return <main className="report min-h-screen bg-[#e9e4da] text-[#1c1814] print:bg-white">
    <style>{`@media print { .no-print { display: none !important } .report { background: #fff !important } .sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; border: 0 !important; padding: 0 !important } .avoid { break-inside: avoid } @page { margin: 16mm } }`}</style>
    <div className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-[#e9e4da]/90 px-4 py-3 backdrop-blur md:px-8">
      <Link to={id ? `/app/runs/${id}` : '/app'} className="tap inline-flex items-center gap-2 text-sm text-black/60 hover:text-black"><ArrowLeft size={15} /> Back to the run</Link>
      <div className="flex flex-wrap gap-2">
        <button onClick={copy} className={btn}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Link copied' : 'Copy report link'}</button>
        <button disabled={!doc} onClick={() => doc && download(`${doc.title.replace(/\W+/g, '-').toLowerCase()}-report.md`, 'text/markdown', runMarkdown(doc))} className={btn}><Download size={14} /> Markdown</button>
        <button disabled={!doc} onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1814] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40"><Printer size={14} /> Print / save as PDF</button>
      </div>
    </div>
    <article className="sheet mx-auto my-8 max-w-[820px] rounded-sm border border-black/10 bg-[#fffdf8] px-6 py-10 shadow-[0_20px_60px_-30px_rgba(40,30,10,.5)] md:px-14 md:py-14">
      {!doc && <div role="status" className="py-20 text-center"><p className="font-display text-3xl">Rebuilding the run…</p></div>}
      {doc && <>
        <p className="font-mono text-[11px] uppercase tracking-[.22em] text-[#b9531f]">Society Agent · run report</p>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] tracking-[-.02em] md:text-5xl">{doc.title}</h1>
        {doc.question && <p className="mt-4 text-lg italic leading-snug text-black/60">{doc.question}</p>}
        <p className="mt-6 border-y border-black/10 py-4 text-sm"><span className="font-mono text-[10px] uppercase tracking-[.16em] text-black/62">The news </span><br />“{doc.news}”</p>

        <section className="avoid mt-9"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">Findings</h2>
          <ul className="mt-3 space-y-3">{doc.findings.map((f) => <li key={f} className="border-l-[3px] border-[#1f9d6b] pl-4 text-lg leading-snug">{f}</li>)}</ul></section>

        <section className="avoid mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">The day at a glance</h2>
          <div className="mt-3 rounded-lg border border-black/10 bg-white p-3 md:p-5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm"><span className="inline-flex items-center gap-2"><i className="h-0.5 w-5 bg-[#1c1814]" />Share who heard</span><span className="inline-flex items-center gap-2"><i className="h-0 w-5 border-t-2 border-dashed border-[#d9632b]" />Average opinion ({doc.axis[0]} ↔ {doc.axis[1]})</span></div>
            <div className="mt-2"><Lines doc={doc} /></div>
            <p className="mt-2 text-xs text-black/62">Time runs from the start of the day (07:00). Left axis: share who heard. Right axis: average opinion on its full −1 to +1 scale, so a small shift looks small.</p>
          </div></section>

        <section className="avoid mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">The numbers</h2>
          <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">{doc.facts.map((f) => <div key={f.label} className="border-b border-black/10 pb-2"><dt className="font-mono text-[10px] uppercase tracking-[.16em] text-black/62">{f.label}</dt><dd className="mt-1">{f.value}</dd></div>)}</dl></section>

        <section className="avoid mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">What was done</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">{doc.moves.map((m) => <li key={m}>{m}</li>)}</ul></section>

        <section className="mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">Key moments</h2>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed">{doc.timeline.map((t, i) => <li key={i} className="avoid grid grid-cols-[110px_1fr] gap-3"><span className="font-mono text-xs text-black/62">{t.clock}</span><span>{t.text}</span></li>)}</ol></section>

        {doc.voices.length > 0 && <section className="avoid mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">What residents said</h2>
          <ul className="mt-3 space-y-3 text-sm">{doc.voices.map((v, i) => <li key={i} className="avoid"><span className="font-mono text-xs text-black/62">{v.clock} · {v.stance}</span><p className="mt-0.5 italic leading-snug">{v.text}</p></li>)}</ul></section>}

        <section className="avoid mt-10 border-t border-black/15 pt-6"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">How to read this</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-black/60">{doc.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="mt-5 hidden break-all font-mono text-[10px] text-black/62 print:block">{doc.link}</p></section>
      </>}
    </article>
  </main>
}
