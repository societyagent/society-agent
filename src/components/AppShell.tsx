import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { BookOpen, FlaskConical, History, LogOut, Play, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/auth'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** The one navigation bar every app screen shares: where am I, where can I go, who am I. */
export function AppShell({ children, tone = 'dark' }: { children: ReactNode; tone?: 'dark' | 'paper' }) {
  const { session, signOut, signIn, busy, error } = useAuth()
  const { pathname } = useLocation()
  const [menu, setMenu] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => { navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [pathname])
  const items: { to: string; label: string; short: string; icon: ReactNode; end?: boolean; match: (p: string) => boolean }[] = [
    { to: '/app', label: 'Simulate', short: 'Simulate', icon: <Play size={15} />, end: true, match: (p) => p === '/app' || p.startsWith('/app/sim') },
    { to: '/app/lab', label: 'Experiment lab', short: 'Lab', icon: <FlaskConical size={15} />, match: (p) => p.startsWith('/app/lab') },
    { to: '/app/runs', label: 'My runs', short: 'Runs', icon: <History size={15} />, match: (p) => p.startsWith('/app/runs') },
    { to: '/docs', label: 'Docs', short: 'Docs', icon: <BookOpen size={15} />, match: (p) => p.startsWith('/docs') },
  ]
  return <div className={tone === 'paper' ? 'min-h-screen bg-[#e9e4da] text-[#1c1814]' : 'min-h-screen bg-[#0c0b0a] text-white'}>
    <a href="#content" className="skip-link">Skip to content</a>
    <header className="no-print sticky top-0 z-40 border-b border-white/[.08] bg-[#0c0b0a]/90 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-1 px-2 sm:gap-2 sm:px-3 md:gap-5 md:px-6">
        <Link to="/" aria-label="Society Agent home" className="tap flex min-w-11 shrink-0 items-center justify-center gap-2 text-[15px] font-semibold tracking-tight sm:justify-start"><img src="/brand/society-mark.jpg" alt="" className="size-7 rounded-lg" /><span className="hidden sm:inline">society agent</span></Link>
        <nav aria-label="Main" ref={navRef} className="no-scrollbar flex min-w-0 flex-1 snap-x items-center gap-0.5 overflow-x-auto scroll-smooth md:gap-1 [mask-image:linear-gradient(90deg,#000_88%,transparent)] md:[mask-image:none]">
          {items.map((it) => <NavLink key={it.to} to={it.to} end={it.end} aria-current={it.match(pathname) ? 'page' : undefined}
            className={`relative inline-flex shrink-0 snap-start items-center gap-2 rounded-lg min-w-11 px-3 py-2 text-[13.5px] transition sm:px-3 sm:text-sm ${it.match(pathname) ? 'bg-white/[.08] text-white' : 'text-white/60 hover:bg-white/[.05] hover:text-white'}`}>
            <span className="hidden sm:inline">{it.icon}</span><span className="sm:hidden">{it.short}</span><span className="hidden sm:inline">{it.label}</span>
            {it.match(pathname) && <span aria-hidden className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-ember-300" />}
          </NavLink>)}
        </nav>
        <div className="relative shrink-0 text-sm">
          {session
            ? <><button onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" className="tap inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 font-mono text-xs text-white/75 hover:border-white/30"><i aria-hidden className="size-2 rounded-full bg-emerald-400" />{short(session.address)}</button>
              {menu && <div role="menu" className="absolute right-0 top-11 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#17130f] p-1 shadow-2xl">
                <Link role="menuitem" to="/app/runs" onClick={() => setMenu(false)} className="tap-auto flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white/80 hover:bg-white/[.06]"><History size={15} /> My saved runs</Link>
                <button role="menuitem" onClick={() => { setMenu(false); void signOut() }} className="tap-auto flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/[.06]"><LogOut size={15} /> Sign out</button>
              </div>}</>
            : <button onClick={signIn} disabled={busy} className="tap inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[13.5px] text-white/85 sm:gap-2 sm:px-3.5 sm:text-sm transition hover:border-ember-400/60 hover:text-white disabled:opacity-60"><Wallet size={14} /><span>{busy ? 'Connecting…' : 'Sign in'}</span></button>}
        </div>
      </div>
      {error && !session && <p role="alert" className="absolute right-3 top-[3.6rem] max-w-xs rounded-xl border border-white/10 bg-[#17130f] px-3 py-2 text-xs leading-relaxed text-white/75 shadow-xl md:right-6">{error}</p>}
    </header>
    <main id="content" tabIndex={-1} className="outline-none">{children}</main>
  </div>
}
