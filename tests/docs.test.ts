// The documentation cannot drift from the code. Everything here runs offline.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ENDPOINTS, ENV_VARS } from '../src/docs/endpoints'
import { DOC_PAGES, searchDocs } from '../src/docs/data'
import { GROUPS } from '../src/docs/ui'
import { LIMITS } from '../src/engine/limits'
import { PERSONAS_PUBLIC, LAYOUT_IDS } from '../src/engine/world'

const ROOT = new URL('..', import.meta.url).pathname
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })

test('every API handler file is documented, and every documented endpoint exists with that exact HTTP method', () => {
  const files = walk(join(ROOT, 'functions/api')).filter((f) => !f.endsWith('_middleware.ts'))
  const METHOD = { onRequestGet: 'GET', onRequestPost: 'POST', onRequestPatch: 'PATCH', onRequestDelete: 'DELETE', onRequestPut: 'PUT' } as const
  const real = new Set<string>()
  for (const f of files) {
    const src = readFileSync(f, 'utf8'), rel = f.slice(ROOT.length)
    for (const [fn, m] of Object.entries(METHOD)) if (new RegExp(`export const ${fn}\\b`).test(src)) real.add(`${m} ${rel}`)
  }
  const documented = new Set(ENDPOINTS.map((e) => `${e.method} ${e.file}`))
  assert.deepEqual([...real].filter((r) => !documented.has(r)).sort(), [], 'a handler exists that the docs do not mention')
  assert.deepEqual([...documented].filter((d) => !real.has(d)).sort(), [], 'the docs describe an endpoint that does not exist')
  // the URL path must also match the file path (Pages Functions routing)
  for (const e of ENDPOINTS) {
    const fromFile = '/' + e.file.replace(/^functions\//, '').replace(/\.ts$/, '').replace(/\/index$/, '').replace(/\[id\]/, ':id')
    assert.equal(e.path, fromFile, `path for ${e.file}`)
  }
})

test('every environment variable the code reads is documented, and every documented one is read somewhere', () => {
  const src = [...walk(join(ROOT, 'functions')), ...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'ops'))].filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
  const read = new Set<string>(); for (const m of src.matchAll(/\b(?:env|ctx\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]+)/g)) read.add(m[1])
  for (const m of src.matchAll(/interface Env \{([^}]*)\}/g)) for (const n of m[1].matchAll(/\b([A-Z][A-Z0-9_]+)\??:/g)) read.add(n[1])
  const docs = new Set(ENV_VARS.map((v) => v.name))
  assert.deepEqual([...read].filter((n) => !docs.has(n) && n !== 'TARGET' && n !== 'DEV' && n !== 'PROD' && n !== 'MODE' && n !== 'BASE_URL' && n !== 'SSR').sort(), [], 'a variable is read but not documented')
  assert.deepEqual([...docs].filter((n) => !read.has(n) && n !== 'DB').sort(), [], 'a documented variable is never read')
})

test('the quotas the docs print are the quotas the server enforces (one source of truth)', () => {
  const pairs: [string, string][] = [['functions/api/auth/verify.ts', 'LIMITS.rate.verify'], ['functions/api/auth/challenge.ts', 'LIMITS.rate.challenge'], ['functions/api/runs/index.ts', 'LIMITS.rate.saveRun'], ['functions/api/client-error.ts', 'LIMITS.rate.clientError']]
  for (const [f, ref] of pairs) assert.ok(readFileSync(join(ROOT, f), 'utf8').includes(ref), `${f} must read ${ref}`)
  const ai = readFileSync(join(ROOT, 'functions/api/ai.ts'), 'utf8')
  for (const k of ['aiWallet', 'aiNetwork', 'aiGlobal']) assert.ok(ai.includes(`LIMITS.rate.${k}`))
  const lib = readFileSync(join(ROOT, 'functions/_lib.ts'), 'utf8')
  for (const k of ['maxTicks', 'maxInterventions', 'maxDecisionsPerRun', 'maxRunsPerOwner', 'sessionTtlSec']) assert.ok(lib.includes(`LIMITS.${k}`), `_lib.ts must read LIMITS.${k}`)
  // no bare numeric literal left in an allow(...) call
  for (const f of walk(join(ROOT, 'functions'))) for (const line of readFileSync(f, 'utf8').split('\n')) if (/allow\(ctx\.env/.test(line)) assert.doesNotMatch(line, /,\s*\d+\s*,\s*\d+\s*\)/, `hard-coded limit in ${f}`)
  assert.equal(LIMITS.rate.aiWallet.limit, 80); assert.equal(LIMITS.maxRunsPerOwner, 200)
})

test('the docs are complete: every group has pages, every page has the required shape, slugs and section ids are unique', () => {
  assert.ok(DOC_PAGES.length >= 20, `only ${DOC_PAGES.length} pages`)
  const slugs = new Set<string>()
  for (const p of DOC_PAGES) {
    assert.match(p.slug, /^[a-z0-9-]+$/); assert.ok(!slugs.has(p.slug), `duplicate slug ${p.slug}`); slugs.add(p.slug)
    assert.ok(p.title && p.tagline.length > 20 && p.keywords.length >= 3 && p.sections.length >= 2, p.slug)
    assert.ok((GROUPS as readonly string[]).includes(p.group), `${p.slug} has unknown group ${p.group}`)
    const ids = new Set<string>(); for (const s of p.sections) { assert.match(s.id, /^[a-z0-9-]+$/, `${p.slug}#${s.id}`); assert.ok(!ids.has(s.id), `duplicate section id ${p.slug}#${s.id}`); ids.add(s.id) }
  }
  for (const g of GROUPS) assert.ok(DOC_PAGES.some((p) => p.group === g), `empty group ${g}`)
})

test('every internal docs link points at a page that exists', () => {
  const files = walk(join(ROOT, 'src/docs')).filter((f) => f.endsWith('.tsx'))
  const slugs = new Set(DOC_PAGES.map((p) => p.slug)), bad: string[] = []
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/<D to="([^"]+)"/g)) { const t = m[1].replace(/^\/docs\//, ''); if (!m[1].startsWith('/') && !slugs.has(t)) bad.push(`${f.slice(ROOT.length)} → ${m[1]}`); if (m[1].startsWith('/docs/') && !slugs.has(t)) bad.push(`${f.slice(ROOT.length)} → ${m[1]}`) }
  assert.deepEqual(bad, [])
})

test('the cast table is the real cast, and the layouts the docs mention are the real layouts', () => {
  assert.equal(PERSONAS_PUBLIC.length, 16)
  assert.deepEqual([...LAYOUT_IDS], ['classic', 'village', 'mainstreet'])
})

test('search finds the right page for real questions', () => {
  const top = (q: string) => searchDocs(q)[0]
  assert.equal(top('seed')?.page.slug, 'reproducibility')
  assert.equal(top('confidence interval')?.page.slug, 'statistics')
  assert.equal(top('rate limit')?.page.slug, 'api')
  assert.match(top('backup')?.page.slug ?? '', /operations|self-host/)
  assert.equal(top('quick start')?.page.slug, 'quickstart')
  assert.equal(top('agent minds')?.page.slug, 'ai-layer')
  assert.ok(searchDocs('zzzqqqxxx').length === 0)
  assert.ok(searchDocs('a').length === 0, 'one-letter queries return nothing')
})

test('no leaked internals: no vendor, provider, local path, secret, or placeholder in the docs source', () => {
  const src = walk(join(ROOT, 'src/docs')).map((f) => readFileSync(f, 'utf8')).join('\n')
  for (const re of [/\/root\//, /vikey/i, /routers9/i, /cluster/i, /finch/i, /totalum/i, /sk-[A-Za-z0-9]{16,}/, /openai/i, /anthropic/i, /lorem ipsum/i, /\bTODO\b/, /\bFIXME\b/, /github\.com\/search/]) assert.doesNotMatch(src, re, String(re))
})
