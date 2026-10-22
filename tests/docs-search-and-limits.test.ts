import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { searchDocs, editDistance, correct } from '../src/docs/data'
import { LIMITS } from '../src/engine/limits'
import { onRequestPost as saveRun } from '../functions/api/runs/index'

const ROOT = join(import.meta.dirname, '..')

test('edit distance is exact and stops early on very different words', () => {
  assert.equal(editDistance('seed', 'seed', 2), 0)
  assert.equal(editDistance('sead', 'seed', 2), 1)
  assert.equal(editDistance('abcdef', 'uvwxyz', 2), 3)
})

test('docs search forgives typos and still finds the right page', () => {
  for (const [typo, slug] of [['reproducability', 'reproducibility'], ['confidnce interval', 'statistics'], ['quikstart', 'quickstart']] as const) {
    const top = searchDocs(typo)[0]
    assert.equal(top?.page.slug, slug, `"${typo}" should find ${slug}, got ${top?.page.slug}`)
  }
})

test('typo handling never invents matches for nonsense, and exact words are untouched', () => {
  assert.equal(searchDocs('zzzqqqxxx').length, 0)
  assert.equal(correct('seed'), 'seed')
  assert.equal(correct('ab'), 'ab')
})

test('every docs page links to "Report an issue" through the single LINKS source', () => {
  const src = readFileSync(join(ROOT, 'src/docs/Docs.tsx'), 'utf8')
  assert.match(src, /LINKS\.issues\}\/new/)
  assert.match(src, /Report an issue/)
})

// A minimal fake D1: only what POST /api/runs touches before the quota check.
function fakeEnv(savedRuns: number) {
  const stmt = (sql: string) => ({
    bind: () => ({
      first: async () => (/FROM sessions/.test(sql) ? { address: '0xabc', expires_at: 9e9 } : /COUNT\(\*\)/.test(sql) ? { n: savedRuns } : /rate_limits/.test(sql) ? { count: 1 } : null),
      run: async () => ({}),
    }),
  })
  return { DB: { prepare: stmt, batch: async () => [] } }
}
const post = (env: unknown) => saveRun({
  env,
  params: {},
  request: new Request('https://societyagent.fun/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${'a'.repeat(64)}` },
    body: JSON.stringify({ cfg: { name: 'limit', question: 'q?', template: 'water', axis: ['a', 'b'], population: 12, seed: 1, news: { text: 'A water main broke.', stance: 0.5, startTick: 2, seedRoles: ['official'] } }, ticks: 12, interventions: [] }),
  }),
} as never)

test(`an owner at ${LIMITS.maxRunsPerOwner} saved runs is refused with 409, below it saving works`, async () => {
  const full = await post(fakeEnv(LIMITS.maxRunsPerOwner))
  assert.equal(full.status, 409)
  assert.match(((await full.json()) as { error: string }).error, new RegExp(String(LIMITS.maxRunsPerOwner)))
  const ok = await post(fakeEnv(LIMITS.maxRunsPerOwner - 1))
  assert.equal(ok.status, 201)
})
