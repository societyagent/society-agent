// Links: the project URLs are real and consistent, and an unset X link renders nothing (no dead button).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LINKS } from '../src/lib/links'

const ROOT = new URL('..', import.meta.url).pathname
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })

test('every project link points at the one repository', () => {
  for (const k of ['github', 'license', 'issues', 'security'] as const) assert.match(LINKS[k], /^https:\/\/github\.com\/societyagent\/society-agent(\/|$)/, k)
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.repository.url.replace(/^git\+|\.git$/g, ''), LINKS.github)
  assert.equal(pkg.bugs.url, LINKS.issues)
})

test('the X link is either empty (no button) or a real x.com profile', () => {
  assert.ok(LINKS.x === '' || /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(LINKS.x), LINKS.x)
})

test('landing renders X only behind the LINKS.x check, never a hard-coded profile', () => {
  const src = readFileSync(join(ROOT, 'src/landing/DarkLanding.tsx'), 'utf8')
  assert.ok(/LINKS\.x &&/.test(src), 'the X buttons must be conditional')
  assert.doesNotMatch(src, /https?:\/\/(x|twitter)\.com/i, 'no hard-coded X URL in the landing source')
})

test('no hard-coded repository URL outside LINKS and metadata (one place to change)', () => {
  const bad: string[] = []
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('lib/links.ts'))) if (/github\.com\/societyagent/.test(readFileSync(f, 'utf8'))) bad.push(f.slice(ROOT.length))
  assert.deepEqual(bad, [])
})

test('external links open safely (noopener) wherever they are rendered with target=_blank', () => {
  for (const f of walk(join(ROOT, 'src')).filter((f) => f.endsWith('.tsx'))) for (const m of readFileSync(f, 'utf8').matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.match(m[0], /rel="noopener noreferrer"/, `${f.slice(ROOT.length)}: ${m[0].slice(0, 80)}`)
})

test('the contract address is either empty ("coming soon") or a full 0x address, and the landing never hard-codes one', () => {
  assert.ok(LINKS.ca === '' || /^0x[0-9a-fA-F]{40}$/.test(LINKS.ca), `LINKS.ca must be empty or a 42-character 0x address, got ${LINKS.ca}`)
  const src = readFileSync(join(ROOT, 'src/landing/DarkLanding.tsx'), 'utf8')
  assert.doesNotMatch(src, /0x[0-9a-fA-F]{40}/, 'the address lives only in src/lib/links.ts')
  assert.match(src, /LINKS\.ca/); assert.match(src, /Coming soon/); assert.match(src, /Copy contract address/)
  assert.doesNotMatch(src, /LINKS\.ca\.(slice|substring|substr)|\.\.\.\$\{LINKS\.ca/, 'the address is shown in full, never shortened')
})
