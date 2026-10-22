import { startPages } from './pages/start'
import { usePages } from './pages/use'
import { referencePages } from './pages/reference'
import type { DocPage } from './ui'

/** One list drives the sidebar, search, previous/next and the sitemap. Order here is the reading order. */
export const DOC_PAGES: DocPage[] = [...startPages, ...usePages, ...referencePages]

const text = (n: unknown): string => {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(text).join(' ')
  const el = n as { props?: { children?: unknown }; type?: unknown }
  if (typeof el.type === 'function' && !el.props?.children) return ''
  return text(el.props?.children)
}
export interface Hit { page: DocPage; section?: DocPage['sections'][number]; score: number; snippet: string }
const INDEX = DOC_PAGES.map((p) => { const secs = p.sections.map((s) => ({ s, title: s.title.toLowerCase(), body: text(s.body).replace(/\s+/g, ' ') })); return { page: p, hay: `${p.title} ${p.slug} ${p.tagline} ${p.keywords.join(' ')}`.toLowerCase(), secs, all: (p.sections.map((s) => s.title).join(' ') + ' ' + secs.map((x) => x.body).join(' ')).toLowerCase() } })
const count = (hay: string, t: string) => hay.split(t).length - 1

/** Levenshtein distance, capped: returns max+1 as soon as the words are too different. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let low = i
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); low = Math.min(low, cur[j]) }
    if (low > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** Every word the docs use, so a misspelt query word can be mapped to the nearest real one. */
const VOCAB = Array.from(new Set(INDEX.flatMap((i) => `${i.page.slug} ${i.hay} ${i.all}`.match(/[a-z][a-z0-9-]{3,}/g) ?? [])))
const fixed = new Map<string, string>()
/** One typo is forgiven in words of 4-7 letters, two in longer ones; the nearest real word wins, ties go to the shorter one. */
export function correct(term: string): string {
  if (term.length < 4) return term
  const hit = fixed.get(term)
  if (hit) return hit
  if (VOCAB.includes(term)) { fixed.set(term, term); return term }
  const max = term.length > 7 ? 2 : 1
  let best = term, bestD = max + 1
  for (const w of VOCAB) { const d = editDistance(term, w, max); if (d <= max && (d < bestD || (d === bestD && w.length < best.length))) { best = w; bestD = d } }
  fixed.set(term, best)
  return best
}

export function searchDocs(q: string): Hit[] {
  const hits = rank(q)
  if (hits.length) return hits
  // nothing matched: retry once with each word replaced by the closest real word (so "reproducability" finds Reproducibility)
  const fixedQ = q.toLowerCase().split(/\s+/).map(correct).join(' ')
  return fixedQ === q.toLowerCase().trim().replace(/\s+/g, ' ') ? [] : rank(fixedQ)
}

function rank(q: string): Hit[] {
  const all = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
  // two-letter words ("in", "to") match almost every page; ignore them unless they are all the user typed
  const terms = all.some((t) => t.length > 2) ? all.filter((t) => t.length > 2) : all
  if (!terms.length) return []
  const hits: Hit[] = []
  for (const { page, hay, secs, all } of INDEX) {
    const ptitle = page.title.toLowerCase(), kw = page.keywords.map((k) => k.toLowerCase())
    // a page about a word mentions it often; one that merely uses it does not. Density breaks ties between pages that both list the keyword.
    const density = Math.min(40, terms.reduce((n, t) => n + count(all, t), 0))
    if (terms.every((t) => hay.includes(t))) hits.push({ page, score: 100 + density + (terms.every((t) => ptitle.includes(t)) ? 60 : 0) + (terms.every((t) => kw.includes(t)) || kw.includes(terms.join(' ')) ? 20 : 0), snippet: page.tagline })
    for (const { s, title, body } of secs) {
      const b = body.toLowerCase()
      if (!terms.every((t) => title.includes(t) || b.includes(t) || hay.includes(t))) continue
      const at = Math.max(0, b.indexOf(terms[0])), snip = body.slice(Math.max(0, at - 50), at + 130).trim()
      hits.push({ page, section: s, score: (terms.every((t) => title.includes(t)) ? 70 : 20) + terms.filter((t) => b.includes(t)).length, snippet: (at > 50 ? '…' : '') + snip + '…' })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12)
}

