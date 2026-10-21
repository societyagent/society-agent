import { useSyncExternalStore } from 'react'

/** The signed-in wallet. The session credential itself lives in an HttpOnly cookie that page scripts cannot read. */
export interface Session { address: string; expiresAt: number }
const KEY = 'society-agent-session-v2' // non-secret hint only: which wallet, until when
const ERR = 'Request failed'
const REOWN = !!(import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined)?.trim()

export function loadSession(): Session | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Session | null; return s && s.address && s.expiresAt > Date.now() ? s : null } catch { return null }
}
const persist = (s: Session | null) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* storage blocked */ } }
// Tokens from older builds were stored in localStorage; remove them.
try { localStorage.removeItem('society-agent-session-v1') } catch { /* storage blocked */ }

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, { method: opts.method ?? 'GET', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) { const e = new Error(data.error || ERR) as Error & { status?: number }; e.status = res.status; throw e }
  return data as T
}

/* One shared auth store, so the header, the simulation and every page see the same session. */
interface AuthState { session: Session | null; busy: boolean; error: string }
let state: AuthState = { session: loadSession(), busy: false, error: '' }
const listeners = new Set<() => void>()
const set = (patch: Partial<AuthState>) => { state = { ...state, ...patch }; listeners.forEach((f) => f()) }
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }

interface Eth { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: () => void) => void }
const injected = (): Eth | undefined => (window as unknown as { ethereum?: Eth }).ethereum

let started = false
function boot() {
  if (started) return; started = true
  // The cookie is the source of truth: ask the server who we are instead of trusting local storage.
  api<{ address: string }>('/api/auth/me')
    .then((r) => { const hint = loadSession(); if (!hint || hint.address !== r.address) { const s = { address: r.address, expiresAt: Date.now() + 6 * 864e5 }; persist(s); set({ session: s }) } })
    .catch((e: { status?: number }) => { if (e.status === 401 && state.session) { persist(null); set({ session: null }) } })
  injected()?.on?.('accountsChanged', () => { void signOut() })
}

export async function signOut() {
  persist(null); set({ session: null })
  api('/api/auth/me', { method: 'DELETE' }).catch(() => {})
  if (REOWN) import('./web3').then((m) => m.disconnectWallet()).catch(() => {})
}

export async function signIn() {
  if (state.busy) return
  set({ error: '', busy: true })
  try {
    let provider: { request: Eth['request'] }, address: string, chainId = 1
    if (REOWN) ({ provider, address, chainId } = await (await import('./web3')).connectWallet())
    else {
      const p = injected()
      if (!p) throw new Error('No browser wallet found. Install MetaMask, Rabby or Coinbase Wallet to sign in.')
      provider = p; address = ((await p.request({ method: 'eth_requestAccounts' })) as string[])[0]
      const id = Number(await p.request({ method: 'eth_chainId' })); if (Number.isInteger(id) && id > 0) chainId = id
    }
    const ch = await api<{ id: string; message: string }>('/api/auth/challenge', { method: 'POST', body: { address, chainId } })
    const signature = (await provider.request({ method: 'personal_sign', params: [ch.message, address] })) as string
    const s = await api<Session>('/api/auth/verify', { method: 'POST', body: { id: ch.id, address, signature } })
    const hint = { address: s.address, expiresAt: s.expiresAt }
    persist(hint); set({ session: hint })
  } catch (e) {
    const err = e as { code?: number; message?: string }
    set({ error: err.code === 4001 || /reject|denied|cancel/i.test(err.message || '') ? 'Signature cancelled. Nothing was sent.' : err.message || 'Sign-in failed' })
  } finally { set({ busy: false }) }
}

export function useAuth() {
  boot()
  const s = useSyncExternalStore(subscribe, () => state)
  return { ...s, signIn, signOut }
}
