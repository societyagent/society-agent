import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, BookOpen, Menu, Search, X } from 'lucide-react'
import { DOC_PAGES, searchDocs, type Hit } from './data'
import { GROUPS, type DocPage } from './ui'
import { LINKS } from '../lib/links'

function Sidebar({ slug, onNav }: { slug: string; onNav?: () => void }) {
  return <nav aria-label="Documentation" className="space-y-6 text-sm">
    {GROUPS.map((g) => { const pages = DOC_PAGES.filter((p) => p.group === g); if (!pages.length) return null
      return <div key={g}><p className="px-3 font-mono text-[10px] uppercase tracking-[.2em] text-white/45">{g}</p>
        <ul className="mt-2 space-y-0.5">{pages.map((p) => <li key={p.slug}><Link to={`/docs/${p.slug}`} onClick={onNav} aria-current={p.slug === slug ? 'page' : undefined} className={`tap-auto block rounded-lg px-3 py-1.5 transition ${p.slug === slug ? 'bg-ember-300/12 text-ember-100' : 'text-white/65 hover:bg-white/[.05] hover:text-white'}`}>{p.title}</Link></li>)}</ul></div> })}
  </nav>
}

function SearchBox({ onPick }: { onPick: () => void }) {
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [cur, setCur] = useState(0)
  const nav = useNavigate(), box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const hits = useMemo(() => searchDocs(q), [q])
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); input.current?.focus() } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [])
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const go = (h: Hit) => { setOpen(false); setQ(''); onPick(); nav(`/docs/${h.page.slug}${h.section ? '#' + h.section.id : ''}`) }
  return <div ref={box} className="relative w-full">
    <label className="relative block"><span className="sr-only">Search the documentation</span><Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45" />
      <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setCur(0) }} onFocus={() => setOpen(true)} role="combobox" aria-expanded={open && q.length > 1} aria-controls="doc-results" aria-autocomplete="list" placeholder="Search the docs" autoComplete="off"
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)) } else if (e.key === 'Enter' && hits[cur]) go(hits[cur]); else if (e.key === 'Escape') { setOpen(false); input.current?.blur() } }}
        className="w-full rounded-xl border border-white/10 bg-white/[.04] py-2.5 pl-9 pr-14 text-sm text-white outline-none transition placeholder:text-white/45 focus:border-ember-300/60" />
      <kbd aria-hidden className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/50 sm:block">/</kbd></label>
    {open && q.trim().length > 1 && <ul id="doc-results" role="listbox" className="absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-white/12 bg-[#141110] p-1.5 shadow-2xl">
      {hits.length ? hits.map((h, i) => <li key={`${h.page.slug}#${h.section?.id ?? ''}`} role="option" aria-selected={i === cur}><button onMouseEnter={() => setCur(i)} onClick={() => go(h)} className={`tap-auto block w-full rounded-lg px-3 py-2.5 text-left ${i === cur ? 'bg-white/[.07]' : ''}`}>
        <span className="flex items-center gap-2 text-sm text-white"><BookOpen size={13} className="text-ember-300" />{h.page.title}{h.section && <span className="text-white/50">› {h.section.title}</span>}</span>
        <span className="mt-0.5 block text-xs leading-snug text-white/55">{h.snippet}</span></button></li>)
        : <li className="px-3 py-4 text-center text-sm text-white/55">Nothing found for “{q}”. Try a simpler word, such as “seed”, “lab” or “sign in”.</li>}</ul>}
  </div>
}

function Toc({ page }: { page: DocPage }) {
  const [active, setActive] = useState(page.sections[0]?.id)
  useEffect(() => { const obs = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id) }, { rootMargin: '-80px 0px -65% 0px' }); page.sections.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el) }); return () => obs.disconnect() }, [page])
  return <nav aria-label="On this page" className="text-sm"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-white/45">On this page</p>
    <ul className="mt-3 space-y-1 border-l border-white/10">{page.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined} className={`tap-auto -ml-px block border-l py-1 pl-3 transition ${active === s.id ? 'border-ember-300 text-ember-100' : 'border-transparent text-white/60 hover:text-white'}`}>{s.title}</a></li>)}</ul></nav>
}

export function Docs() {
  const { slug = DOC_PAGES[0].slug } = useParams()
  const idx = DOC_PAGES.findIndex((p) => p.slug === slug)
  const [drawer, setDrawer] = useState(false)
  useEffect(() => { document.title = idx >= 0 ? `${DOC_PAGES[idx].title} · Society Agent docs` : 'Society Agent docs'; return () => { document.title = 'Society Agent' } }, [idx])
  if (idx < 0) return <Navigate to="/docs" replace />
  const page = DOC_PAGES[idx], prev = DOC_PAGES[idx - 1], next = DOC_PAGES[idx + 1]
  return <div className="min-h-screen bg-[#0c0b0a] text-white">
    <a href="#doc-content" className="skip-link">Skip to content</a>
    <header className="sticky top-0 z-40 border-b border-white/[.08] bg-[#0c0b0a]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 md:gap-5 md:px-6">
        <button onClick={() => setDrawer(true)} aria-label="Open the documentation menu" className="tap-auto -ml-1 grid size-10 place-items-center rounded-lg text-white/70 hover:bg-white/[.06] lg:hidden"><Menu size={19} /></button>
        <Link to="/" className="tap flex min-w-11 shrink-0 items-center justify-center gap-2 text-[15px] font-semibold tracking-tight sm:justify-start"><img src="/brand/society-mark.jpg" alt="" className="size-7 rounded-lg" /><span className="hidden sm:inline">society agent</span></Link>
        <span aria-hidden className="hidden text-white/25 sm:inline">/</span><Link to="/docs" className="tap-auto hidden text-sm text-white/70 hover:text-white sm:inline">Docs</Link>
        <div className="mx-auto w-full max-w-md"><SearchBox onPick={() => setDrawer(false)} /></div>
        <Link to="/app" className="tap-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-[#f3ead9] px-4 py-2 text-sm font-semibold text-black transition hover:bg-white sm:inline-flex">Open the app <ArrowRight size={14} /></Link>
      </div>
    </header>
    {drawer && <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Documentation menu"><button aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/70" /><div className="absolute inset-y-0 left-0 w-[84%] max-w-xs overflow-y-auto border-r border-white/10 bg-[#0f0d0b] p-4"><div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold">Documentation</span><button onClick={() => setDrawer(false)} aria-label="Close" className="tap-auto grid size-10 place-items-center rounded-lg hover:bg-white/[.06]"><X size={18} /></button></div><Sidebar slug={slug} onNav={() => setDrawer(false)} /></div></div>}
    <div className="mx-auto grid max-w-[1400px] gap-10 px-4 md:px-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_220px]">
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-2 lg:block"><Sidebar slug={slug} /></aside>
      <main id="doc-content" tabIndex={-1} className="min-w-0 py-10 outline-none md:py-14">
        <article className="mx-auto max-w-[760px]">
          <p className="font-mono text-[11px] uppercase tracking-[.2em] text-ember-200/80">{page.group}</p>
          <h1 className="mt-3 font-display text-[40px] leading-[1.05] tracking-[-.02em] md:text-[56px]">{page.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-white/60">{page.tagline}</p>
          {page.sections.map((s) => <section key={s.id} aria-labelledby={s.id} className="mt-12 scroll-mt-28"><h2 id={s.id} className="group flex items-baseline gap-2 text-[26px] leading-tight tracking-[-.01em]"><a href={`#${s.id}`} aria-label={`Link to ${s.title}`} className="tap-auto order-2 text-base text-white/0 transition group-hover:text-white/40 focus-visible:text-white/60">#</a><span>{s.title}</span></h2>{s.body}</section>)}
          <nav aria-label="Previous and next page" className="mt-20 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-2">
            {prev ? <Link to={`/docs/${prev.slug}`} className="tap-auto group rounded-xl border border-white/10 p-4 transition hover:border-white/25"><span className="flex items-center gap-1.5 text-xs text-white/50"><ArrowLeft size={13} /> Previous</span><span className="mt-1 block text-white">{prev.title}</span></Link> : <span />}
            {next && <Link to={`/docs/${next.slug}`} className="tap-auto group rounded-xl border border-white/10 p-4 text-right transition hover:border-white/25 sm:col-start-2"><span className="flex items-center justify-end gap-1.5 text-xs text-white/50">Next <ArrowRight size={13} /></span><span className="mt-1 block text-white">{next.title}</span></Link>}
          </nav>
          <p className="mt-10 flex flex-wrap items-center gap-x-4 text-sm text-white/55"><a href={`${LINKS.issues}/new`} target="_blank" rel="noopener noreferrer" className="tap inline-flex underline decoration-white/30 underline-offset-4 hover:text-white">Report an issue with this page</a><a href={`${LINKS.github}/tree/main/src/docs`} target="_blank" rel="noopener noreferrer" className="tap inline-flex underline decoration-white/30 underline-offset-4 hover:text-white">Edit these docs on GitHub</a></p>
          <p className="mt-4 text-sm text-white/45">Parts of these pages are generated from the code itself (limits, towns, street plans, endpoints, the cast), and a test fails if they drift. If a number here disagrees with what you see in the app, the app is right and the page needs fixing.</p>
        </article>
      </main>
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] overflow-y-auto py-10 xl:block"><Toc key={page.slug} page={page} /></aside>
    </div>
  </div>
}
