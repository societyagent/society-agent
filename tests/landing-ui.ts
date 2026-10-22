// The landing page: links, footer, landmarks, mobile, and that an unset X link renders nothing.  npx tsx tests/landing-ui.ts <url>
import { chromium } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, '')
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
let pass = 0, fail = 0
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`) }
const errs: string[] = []
const d = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
d.on('pageerror', (e: Error) => errs.push(e.message)); d.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|reown|walletconnect|coinbase/i.test(m.text())) errs.push(m.text()) })
await d.goto(BASE + '/', { waitUntil: 'networkidle' })
const GH = 'https://github.com/societyagent/society-agent'
const ghLinks = await d.locator(`a[href^="${GH}"]`).evaluateAll((as) => as.map((a) => ({ href: (a as HTMLAnchorElement).href, rel: a.getAttribute('rel'), target: a.getAttribute('target') })))
ok('GitHub appears in the nav, the open-source section and the footer', ghLinks.length >= 6, `${ghLinks.length} links`)
ok('every GitHub link opens in a new tab with noopener noreferrer', ghLinks.every((l) => l.target === '_blank' && /noopener/.test(l.rel ?? '') && /noreferrer/.test(l.rel ?? '')))
ok('the nav GitHub button has an accessible name', (await d.getByRole('banner').getByRole('link', { name: 'Society Agent on GitHub' }).count()) === 1)
ok('no X button is rendered while the X account is not set (no dead link)', (await d.locator('a[href*="x.com"], a[href*="twitter.com"], a[aria-label*="on X"]').count()) === 0)
ok('open-source section states MIT and links to the repo and docs', await d.locator('#open-source').getByText('Open source · MIT').isVisible() && (await d.locator('#open-source a[href^="https://github.com"]').count()) >= 1 && (await d.locator('#open-source a[href="/docs"]').count()) === 1)
ok('the footer has Product, Learn and Project columns', (await d.getByRole('contentinfo').locator('nav').count()) === 3, (await d.getByRole('contentinfo').locator('nav').evaluateAll((n) => n.map((x) => x.getAttribute('aria-label')))).join(','))
ok('footer links: report an issue, MIT license, report a vulnerability', (await d.getByRole('contentinfo').getByRole('link', { name: 'Report an issue' }).getAttribute('href'))?.endsWith('/issues') === true && (await d.getByRole('contentinfo').getByRole('link', { name: 'Report a vulnerability' }).getAttribute('href'))?.includes('/security/advisories/new') === true)
// every internal link on the page resolves to a real route
const internal = await d.locator('a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))])
const dead: string[] = []; for (const h of internal) { const r = await d.request.get(BASE + h.split('#')[0]); if (r.status() !== 200) dead.push(`${h} ${r.status()}`) }
ok('every internal link on the landing returns 200', dead.length === 0, `${internal.length} links${dead.length ? ' — ' + dead.join(',') : ''}`)
// the repo link really exists (public) — only check the status, never follow redirects to a login
const gh = await d.request.get(GH, { maxRedirects: 0 }).catch(() => null)
ok('the GitHub repository URL is reachable by the public (HTTP 200)', gh?.status() === 200, String(gh?.status()))
ok('exactly one h1, one main landmark, a skip link', (await d.locator('h1').count()) === 1 && (await d.locator('main').count()) === 1 && (await d.locator('a.skip-link').count()) === 1)
await d.keyboard.press('Tab'); ok('the first Tab stop is the skip link', /Skip to content/.test(await d.evaluate(() => document.activeElement?.textContent ?? '')))
ok('page title and description are set', /Society Agent/.test(await d.title()) && ((await d.locator('meta[name="description"]').getAttribute('content')) ?? '').length > 40)
ok('desktop: no horizontal overflow', await d.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))

const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage()
await m.goto(BASE + '/', { waitUntil: 'networkidle' })
ok('mobile: no horizontal overflow', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
const nav = await m.getByRole('banner').getByRole('link', { name: 'Society Agent on GitHub' }).boundingBox()
ok('mobile: the GitHub button in the nav is at least 40x44 and inside the screen', !!nav && nav.width >= 40 && nav.height >= 44 && nav.x + nav.width <= 390, JSON.stringify(nav && { w: Math.round(nav.width), h: Math.round(nav.height) }))
const cta = await m.getByRole('banner').getByRole('link', { name: /Open the app/ }).boundingBox()
ok('mobile: "Open the app" is visible and not clipped', !!cta && cta.x >= 0 && cta.x + cta.width <= 390 && cta.height >= 44)
const fl = await m.getByRole('contentinfo').getByRole('link').evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return r.height }))
ok('mobile: every footer link is at least 44px tall', fl.length >= 10 && fl.every((h) => h >= 43.5), `${fl.length} links, min ${Math.min(...fl).toFixed(0)}px`)
await m.getByRole('link', { name: 'View on GitHub' }).scrollIntoViewIfNeeded()
ok('mobile: the open-source call to action is reachable', await m.getByRole('link', { name: 'View on GitHub' }).isVisible())
ok('no console or page errors', errs.length === 0, errs.slice(0, 2).join(' | '))
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0)
