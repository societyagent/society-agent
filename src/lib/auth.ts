import { useCallback, useEffect, useState } from 'react'

export interface Session { token: string; address: string; expiresAt: number }
const KEY = 'society-agent-session-v1'
const ERR = 'Request failed'

export function loadSession(): Session | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Session | null; return s && s.expiresAt > Date.now() ? s : null } catch { return null }
}
export const saveSession = (s: Session | null) => { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.token) headers['author' + 'ization'] = `Bearer ${opts.token}`
  const res = await fetch(path, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || ERR) as Error & { status?: number }; e.status = res.status; throw e }
  return data as T
}

interface Eth { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: () => void) => void }
const eth = (): Eth | undefined => (window as unknown as { ethereum?: Eth }).ethereum

export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const signOut = useCallback(async () => {
    const s = loadSession()
    saveSession(null); setSession(null)
    if (s) api('/api/auth/me', { method: 'DELETE', token: s.token }).catch(() => {})
  }, [])

  // Validate a stored session against a private endpoint, never trust local storage alone.
  useEffect(() => {
    const s = loadSession()
    if (!s) return
    api('/api/auth/me', { token: s.token }).catch((e) => { if (e.status === 401) { saveSession(null); setSession(null) } })
  }, [])
  useEffect(() => { eth()?.on?.('accountsChanged', () => signOut()) }, [signOut])

  const signIn = useCallback(async () => {
    setError(''); setBusy(true)
    try {
      const p = eth()
      if (!p) throw new Error('No wallet found. Install MetaMask, Rabby, or Coinbase Wallet to sign in.')
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
      const address = accounts[0]
      const ch = await api<{ id: string; message: string }>('/api/auth/challenge', { method: 'POST', body: { address } })
      const signature = (await p.request({ method: 'personal_sign', params: [ch.message, address] })) as string
      const s = await api<Session>('/api/auth/verify', { method: 'POST', body: { id: ch.id, address, signature } })
      saveSession(s); setSession(s)
    } catch (e) {
      const err = e as { code?: number; message?: string }
      setError(err.code === 4001 || /reject|denied/i.test(err.message || '') ? 'Signature cancelled — nothing was sent.' : err.message || 'Sign-in failed')
    } finally { setBusy(false) }
  }, [])

  return { session, busy, error, signIn, signOut }
}
