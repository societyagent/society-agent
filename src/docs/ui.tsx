import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, Copy } from 'lucide-react'

export interface Section { id: string; title: string; body: ReactNode }
export interface DocPage { slug: string; title: string; tagline: string; group: string; keywords: string[]; sections: Section[] }

export const GROUPS = ['Start here', 'Using the app', 'Experiments', 'Reference', 'Run it yourself', 'Help'] as const

export const P = ({ children }: { children: ReactNode }) => <p className="mt-4 text-[16.5px] leading-[1.75] text-white/75">{children}</p>
export const UL = ({ children }: { children: ReactNode }) => <ul className="mt-4 list-disc space-y-2 pl-6 text-[16.5px] leading-[1.7] text-white/75 marker:text-white/30">{children}</ul>
export const OL = ({ children }: { children: ReactNode }) => <ol className="mt-4 list-decimal space-y-2.5 pl-6 text-[16.5px] leading-[1.7] text-white/75 marker:font-mono marker:text-ember-300">{children}</ol>
export const M = ({ children }: { children: ReactNode }) => <code className="rounded-md border border-white/10 bg-white/[.06] px-1.5 py-0.5 font-mono text-[.86em] text-ember-100">{children}</code>
export const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-white">{children}</b>

/** Link to another docs page (client-side navigation, never a full reload). */
export const D = ({ to, children }: { to: string; children: ReactNode }) => <Link to={to.startsWith('/') ? to : `/docs/${to}`} className="tap-auto text-ember-200 underline decoration-ember-300/40 underline-offset-4 hover:decoration-ember-300">{children}</Link>

export function Code({ children, label }: { children: string; label?: string }) {
  const [done, setDone] = useState(false)
  return <figure className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#0f0d0b]">
    <figcaption className="flex items-center justify-between border-b border-white/[.07] px-4 py-2 font-mono text-[11px] uppercase tracking-[.14em] text-white/50">
      <span>{label ?? 'shell'}</span>
      <button onClick={() => { void navigator.clipboard?.writeText(children).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500) }} aria-label="Copy code" className="tap-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-white/55 hover:text-white">{done ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
    </figcaption>
    <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-[#e9dfcf]"><code>{children}</code></pre>
  </figure>
}

const KIND = {
  note: { label: 'Note', cls: 'border-white/12 bg-white/[.04]', tag: 'text-white/60' },
  tip: { label: 'Tip', cls: 'border-emerald-300/25 bg-emerald-300/[.06]', tag: 'text-emerald-200' },
  warn: { label: 'Heads up', cls: 'border-amber-300/30 bg-amber-300/[.07]', tag: 'text-amber-200' },
  honest: { label: 'Honest limit', cls: 'border-ember-300/30 bg-ember-300/[.06]', tag: 'text-ember-200' },
} as const
export const Callout = ({ kind = 'note', title, children }: { kind?: keyof typeof KIND; title?: string; children: ReactNode }) => {
  const k = KIND[kind]
  return <aside className={`mt-5 rounded-xl border px-5 py-4 ${k.cls}`}><p className={`font-mono text-[11px] uppercase tracking-[.16em] ${k.tag}`}>{title ?? k.label}</p><div className="mt-1.5 text-[15.5px] leading-relaxed text-white/80">{children}</div></aside>
}

export function Table({ head, rows, mono = [] }: { head: string[]; rows: ReactNode[][]; mono?: number[] }) {
  return <div className="mt-5 overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[520px] text-left text-[14.5px]">
    <thead><tr className="border-b border-white/10 bg-white/[.03] text-[11px] uppercase tracking-wider text-white/55">{head.map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-white/[.06] last:border-0 align-top">{r.map((c, j) => <td key={j} className={`px-4 py-2.5 leading-relaxed ${mono.includes(j) ? 'font-mono text-[13px] text-ember-100' : 'text-white/75'} ${j === 0 ? 'text-white' : ''}`}>{c}</td>)}</tr>)}</tbody></table></div>
}

export const STEP = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => <li className="relative mt-6 list-none pl-12"><span aria-hidden className="absolute left-0 top-0 grid size-8 place-items-center rounded-full border border-white/15 bg-[#14110f] font-mono text-xs text-ember-200">{n}</span><p className="text-[17px] leading-8 text-white">{title}</p><div className="text-white/75">{children}</div></li>
