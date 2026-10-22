import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Check, Copy, Download, FlaskConical, Printer } from 'lucide-react'
import { BandsChart } from '@/components/BandsChart'
import { decodeExperiment, runBatch, type Batch } from '@/engine/lab'
import { buildReport, reportLink, reportMarkdown } from '@/engine/report'

const INK = ['#6b7385', '#d9632b', '#1f9d6b', '#7c4dff']
const download = (name: string, mime: string, text: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }

/** A shareable, printable write-up of one experiment, rebuilt from the experiment link. Light "paper" theme so it prints cleanly. */
export function Report() {
  const [params] = useSearchParams()
  const code = params.get('x')
  const x = useMemo(() => (code ? decodeExperiment(code) : null), [code])
  const [batch, setBatch] = useState<Batch | null>(null)
  const [prog, setProg] = useState(0)
  const [copied, setCopied] = useState(false)
  const started = useRef('')

  useEffect(() => {
    if (!x || !code || started.current === code) return
    started.current = code
    let live = true
    void runBatch(x, (d, t) => { if (live) setProg(d / t) }, () => !live).then((b) => { if (live && b) setBatch(b) })
    return () => { live = false; started.current = '' }
  }, [x, code])

  const r = useMemo(() => (batch ? buildReport(batch) : null), [batch])
  const link = x ? reportLink(location.origin, x) : ''
  const copy = async () => { try { await navigator.clipboard.writeText(location.href) } catch { /* clipboard blocked */ } setCopied(true); setTimeout(() => setCopied(false), 1800) }

  if (!x) return <main className="min-h-screen bg-[#0c0b0a] px-6 py-16 text-white"><div className="mx-auto max-w-xl"><h1 className="text-2xl">This report link is not valid</h1><p className="mt-3 text-white/60">Open the Experiment Lab, run an experiment and choose “Make a report” to get a link that works.</p><Link to="/app/lab" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"><FlaskConical size={15} /> Open the Experiment Lab</Link></div></main>

  return <main className="report min-h-screen bg-[#e9e4da] text-[#1c1814] print:bg-white">
    <style>{`@media print { .no-print { display: none !important } .report { background: #fff !important } .sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; border: 0 !important; padding: 0 !important } .avoid { break-inside: avoid } @page { margin: 16mm } }`}</style>
    <div className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-[#e9e4da]/90 px-4 py-3 backdrop-blur md:px-8">
      <Link to={`/app/lab?x=${code}`} className="tap inline-flex items-center gap-2 text-sm text-black/60 hover:text-black"><ArrowLeft size={15} /> Back to the lab</Link>
      <div className="flex flex-wrap gap-2">
        <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white/60 px-3 py-2 text-sm hover:bg-white">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Link copied' : 'Copy report link'}</button>
        <button disabled={!batch} onClick={() => batch && download('society-agent-report.md', 'text/markdown', reportMarkdown(batch, link))} className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white/60 px-3 py-2 text-sm hover:bg-white disabled:opacity-40"><Download size={14} /> Markdown</button>
        <button disabled={!batch} onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1814] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40"><Printer size={14} /> Print / save as PDF</button>
      </div>
    </div>

    <article className="sheet mx-auto my-8 max-w-[820px] rounded-sm border border-black/10 bg-[#fffdf8] px-6 py-10 shadow-[0_20px_60px_-30px_rgba(40,30,10,.5)] md:px-14 md:py-14">
      {!r && <div role="status" className="py-20 text-center"><p className="font-display text-3xl">Running {x.n * x.conds.length} simulated days…</p><div className="mx-auto mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-[#d9632b] transition-all" style={{ width: `${prog * 100}%` }} /></div></div>}
      {r && batch && <>
        <p className="font-mono text-[11px] uppercase tracking-[.22em] text-[#b9531f]">Society Agent · experiment report</p>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] tracking-[-.02em] md:text-5xl">{r.title}</h1>
        <p className="mt-4 text-lg italic leading-snug text-black/60">{r.question}</p>

        <dl className="mt-8 grid gap-x-8 gap-y-3 border-y border-black/10 py-5 text-sm sm:grid-cols-2">
          <div><dt className="font-mono text-[10px] uppercase tracking-[.16em] text-black/62">The news</dt><dd className="mt-1">“{r.news}”</dd></div>
          <div><dt className="font-mono text-[10px] uppercase tracking-[.16em] text-black/62">Measured</dt><dd className="mt-1">{r.measure}</dd></div>
          <div><dt className="font-mono text-[10px] uppercase tracking-[.16em] text-black/62">Random towns per option</dt><dd className="mt-1">{r.towns}</dd></div>
          <div><dt className="font-mono text-[10px] uppercase tracking-[.16em] text-black/62">Options compared</dt><dd className="mt-1">{batch.x.conds.map((c) => c.label).join(' · ')}</dd></div>
        </dl>

        {r.summary && <section className="avoid mt-9"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">The short answer</h2><p className="mt-3 font-display text-2xl leading-snug md:text-[28px]">{r.summary}</p></section>}

        <section className="avoid mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">What the experiment shows</h2>
          <div className="mt-3 rounded-lg border border-black/10 bg-white p-3 md:p-5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{batch.x.conds.map((c, i) => <span key={c.id} className="inline-flex items-center gap-2"><i className="size-3 rounded-full" style={{ background: INK[i] }} />{c.label}</span>)}</div>
            <div className="mt-2 overflow-x-auto"><div className="min-w-[560px]"><BandsChart b={batch} axis={r.axis} metric={batch.x.outcome === 'half' ? 'informed' : 'opinion'} colors={INK} light /></div></div>
            <p className="mt-2 text-xs text-black/62">Line = the typical town · shaded band = the middle 80% of towns{batch.x.conds.some((c) => c.kind !== 'none') ? ' · dotted line = when the move happens' : ''}</p>
          </div></section>

        <section className="mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">Findings</h2>
          <ul className="mt-3 space-y-4">{r.findings.map((f) => <li key={f.label} className={`avoid border-l-[3px] pl-4 ${f.clear ? 'border-[#1f9d6b]' : 'border-black/20'}`}><p className="text-lg leading-snug">{f.headline}</p><p className="mt-1 text-sm leading-relaxed text-black/62">{f.detail}</p></li>)}</ul></section>

        <section className="avoid mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">The numbers</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b border-black/20 text-left text-[11px] uppercase tracking-wider text-black/62"><th className="py-2 pr-3 font-medium">Option</th><th className="py-2 pr-3 font-medium">Average</th><th className="py-2 pr-3 font-medium">95% range of the average</th><th className="py-2 font-medium">Typical towns (10th–90th)</th></tr></thead>
            <tbody>{r.rows.map((row, i) => <tr key={row.label} className="border-b border-black/10"><td className="py-2.5 pr-3"><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: INK[i] }} />{row.label}</span></td><td className="py-2.5 pr-3 font-mono">{row.mean}</td><td className="py-2.5 pr-3 font-mono text-black/60">{row.ci}</td><td className="py-2.5 font-mono text-black/60">{row.spread}</td></tr>)}</tbody></table></div></section>

        <section className="avoid mt-10"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">What each option was</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{r.setup.map((s, i) => <div key={s.label} className="avoid rounded-lg border border-black/10 p-4"><p className="flex items-center gap-2 font-medium"><i className="size-2.5 rounded-full" style={{ background: INK[i] }} />{s.label}</p><ul className="mt-2 space-y-1 text-sm leading-relaxed text-black/65">{s.lines.map((l) => <li key={l}>{l}</li>)}</ul></div>)}</div></section>

        <section className="avoid mt-10 border-t border-black/15 pt-6"><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-black/62">How to read this</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-black/60">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="mt-5 text-sm text-black/60"><a href={link} className="tap inline-flex items-center font-medium text-[#b9531f] underline underline-offset-4">Re-run this experiment</a> <span className="text-black/62">— the link rebuilds the same towns and gives exactly these numbers.</span></p>
          <p className="mt-2 hidden break-all font-mono text-[10px] text-black/62 print:block">{link.length > 90 ? `${link.slice(0, 90)}…` : link}</p></section>
      </>}
    </article>
  </main>
}
