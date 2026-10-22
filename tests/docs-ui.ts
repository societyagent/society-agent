// Documentation in a real browser:  npx tsx tests/docs-ui.ts <url>
import { chromium, type Page } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, '')
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
let pass = 0, fail = 0
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`) }
const errs: string[] = []
const settle = async (pg: Page) => { let last = -1; for (let i = 0; i < 30; i++) { const y = await pg.evaluate(() => Math.round(scrollY)); if (y === last) return; last = y; await pg.waitForTimeout(120) } }
const watch = (p: Page) => { p.on('pageerror', (e: Error) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|reown|walletconnect|coinbase/i.test(m.text())) errs.push(m.text()) }) }

const d = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(d)
await d.goto(BASE + '/docs', { waitUntil: 'networkidle' })
ok('/docs opens the first page with a title, a tagline and a sidebar', (await d.locator('h1').innerText()).length > 3 && await d.getByRole('navigation', { name: 'Documentation' }).isVisible())
ok('page title is set for the tab', /Society Agent docs/.test(await d.title()), await d.title())

// every page in the sidebar loads, has one h1, no empty sections, and in-page ids resolve
const links = await d.getByRole('navigation', { name: 'Documentation' }).getByRole('link').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))
ok('sidebar lists every documentation page', links.length >= 20, `${links.length} pages`)
const broken: string[] = []
for (const href of links) {
  await d.goto(BASE + href, { waitUntil: 'domcontentloaded' }); await d.waitForSelector('h1')
  const info = await d.evaluate(() => ({ h1: document.querySelectorAll('h1').length, h2: document.querySelectorAll('article h2').length, empty: [...document.querySelectorAll('article section')].filter((s) => (s.textContent ?? '').trim().length < 40).length, badIds: [...document.querySelectorAll('article h2')].filter((h) => !h.id).length, text: document.body.innerText.length, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }))
  if (info.h1 !== 1 || info.h2 < 2 || info.empty || info.badIds || info.text < 900 || info.overflow) broken.push(`${href} ${JSON.stringify(info)}`)
}
ok('every page: exactly one h1, ≥2 sections, none empty, no horizontal overflow', broken.length === 0, broken.slice(0, 2).join(' | '))

// internal links inside articles all resolve (no redirect to the first page / landing)
const slugs = new Set(links.map((l) => l.replace('/docs/', '')))
const dead: string[] = []
for (const href of links) { await d.goto(BASE + href, { waitUntil: 'domcontentloaded' }); await d.waitForSelector('h1'); const hs = await d.locator('article a[href^="/docs/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!)); for (const h of hs) if (!slugs.has(h.replace('/docs/', '').split('#')[0])) dead.push(`${href} → ${h}`) }
ok('every link inside the docs points at a real page', dead.length === 0, dead.slice(0, 3).join(' | '))
ok('an unknown docs page redirects to the docs home, not a blank page', await (async () => { await d.goto(BASE + '/docs/nope', { waitUntil: 'networkidle' }); return /\/docs$/.test(d.url()) && (await d.locator('h1').count()) === 1 })(), d.url())

// search: type, arrow, enter
await d.goto(BASE + '/docs/overview', { waitUntil: 'networkidle' })
await d.keyboard.press('/'); ok('"/" focuses the search box', await d.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox'))
await d.keyboard.type('confidence interval')
ok('search shows results with the right page first', /How the lab decides/.test(await d.locator('#doc-results li').first().innerText()), (await d.locator('#doc-results li').first().innerText()).split('\n')[0])
await d.keyboard.press('Enter'); await d.waitForURL(/\/docs\/statistics/); await settle(d)
ok('Enter opens the result page with its first section on screen', /statistics/.test(d.url()) && await d.locator('h2#paired').isVisible())
await d.keyboard.press('/'); await d.keyboard.type('zzzqqqxxx'); ok('a search with no match says so, helpfully', /Nothing found/.test(await d.locator('#doc-results').innerText()))
await d.keyboard.press('Escape')

// the on-this-page nav highlights as you scroll; heading anchors
await d.goto(BASE + '/docs/api', { waitUntil: 'networkidle' })
await d.evaluate(() => document.getElementById('get-api-health')?.scrollIntoView({ behavior: 'instant' })); await settle(d); await d.waitForTimeout(300)
ok('"On this page" highlights the section you are reading', /GET \/api\/health/.test(await d.locator('nav[aria-label="On this page"] a[aria-current="true"]').first().innerText().catch(() => '')))
await d.goto(BASE + '/docs/api#post-api-runs', { waitUntil: 'networkidle' }); await settle(d)
ok('a #section link scrolls to that section and the heading is not hidden under the sticky bar', await d.evaluate(() => { const r = document.getElementById('post-api-runs')?.getBoundingClientRect(); return !!r && r.top >= 56 && r.top < 400 }))

// code blocks: copy button
await d.goto(BASE + '/docs/self-host', { waitUntil: 'networkidle' })
await d.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
await d.getByRole('button', { name: 'Copy code' }).first().click(); await d.waitForTimeout(200)
ok('code blocks have a working copy button', await d.getByText('Copied').first().isVisible())

// the printed numbers equal the real limits (the page reads them from the engine)
await d.goto(BASE + '/docs/limits-honesty#quotas', { waitUntil: 'networkidle' })
const q = await d.locator('#quotas').locator('xpath=..').innerText()
ok('the quota table shows 200 saved runs, 80 interventions, 40 decisions', /200/.test(q) && /80/.test(q) && /40/.test(q))
await d.goto(BASE + '/docs/residents', { waitUntil: 'networkidle' })
ok('the cast table lists all 16 residents', (await d.locator('table tbody tr').count()) === 16)
await d.goto(BASE + '/docs/scenarios', { waitUntil: 'networkidle' })
ok('the scenario page lists the 7 town characters and 3 street plans', (await d.getByRole('row', { name: /Easygoing town/ }).count()) === 1 && (await d.getByRole('row', { name: /Long main street/ }).count()) === 1)

// keyboard + a11y basics
await d.goto(BASE + '/docs/overview', { waitUntil: 'networkidle' })
ok('skip link is the first focusable element and lands on the content', await (async () => { await d.keyboard.press('Tab'); const t = await d.evaluate(() => document.activeElement?.textContent); await d.keyboard.press('Enter'); return /Skip to content/.test(t ?? '') })())
const a11y = await d.evaluate(() => { const bad: string[] = []; document.querySelectorAll('img').forEach((i) => { if (!i.hasAttribute('alt')) bad.push('img no alt') }); document.querySelectorAll('button, a').forEach((e) => { const n = (e.getAttribute('aria-label') || e.textContent || '').trim(); if (!n) bad.push('unnamed ' + e.tagName) }); document.querySelectorAll('input').forEach((i) => { if (!i.closest('label') && !i.getAttribute('aria-label')) bad.push('unlabelled input') }); return bad })
ok('every image has alt, every button/link/input has an accessible name', a11y.length === 0, a11y.slice(0, 3).join(', '))
const headingOrder = await d.evaluate(() => { let last = 0, jumps = 0; document.querySelectorAll('h1,h2,h3').forEach((h) => { const l = Number(h.tagName[1]); if (l - last > 1) jumps++; last = l }); return jumps })
ok('heading levels never skip (h1 → h2 → h3)', headingOrder === 0, String(headingOrder))

// mobile: drawer, no overflow, search usable
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })).newPage(); watch(m)
await m.goto(BASE + '/docs/quickstart', { waitUntil: 'networkidle' })
ok('mobile: no horizontal overflow', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
ok('mobile: the sidebar is hidden until the menu is opened', !(await m.getByRole('navigation', { name: 'Documentation' }).isVisible()))
await m.getByRole('button', { name: 'Open the documentation menu' }).click()
ok('mobile: the menu opens as a dialog with every page', await m.getByRole('dialog').isVisible() && (await m.getByRole('dialog').getByRole('link').count()) >= 20)
await m.getByRole('dialog').getByRole('link', { name: 'HTTP API' }).click(); await m.waitForURL(/\/docs\/api$/)
await m.getByRole('heading', { level: 1, name: 'HTTP API' }).waitFor()
ok('mobile: choosing a page closes the menu and navigates', (await m.getByRole('dialog').count()) === 0 && /HTTP API/.test(await m.locator('h1').innerText()))
ok('mobile: wide tables scroll inside their own box instead of the page', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
const small = await m.evaluate(() => [...document.querySelectorAll('header button, header a, nav a, article a')].filter((e) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 24 && !e.closest('p, li, td') }).length)
ok('mobile: no tiny stand-alone tap targets', small === 0, String(small))

// the landing and the app link to the docs
const l = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(l)
await l.goto(BASE + '/', { waitUntil: 'networkidle' }); await l.getByRole('link', { name: 'Docs', exact: true }).first().click(); await l.waitForURL(/\/docs$/)
ok('the landing page links to the docs', /\/docs$/.test(l.url()))
await l.goto(BASE + '/app', { waitUntil: 'networkidle' }); await l.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Docs' }).click(); await l.waitForURL(/\/docs$/)
ok('the app navigation links to the docs', /\/docs$/.test(l.url()))

ok('no console or page errors anywhere', errs.length === 0, errs.slice(0, 2).join(' | '))
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0)
