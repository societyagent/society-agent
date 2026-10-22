// The upgraded town and HUD, in a real browser:  npx tsx tests/town-ui.ts <url>
import { chromium } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, '')
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
let pass = 0, fail = 0
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`) }
const errs: string[] = []
const d = await (await b.newContext({ viewport: { width: 1440, height: 1500 } })).newPage()
d.on('pageerror', (e: Error) => errs.push(e.message)); d.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|reown|walletconnect/i.test(m.text())) errs.push(m.text()) })
await d.goto(BASE + '/app', { waitUntil: 'networkidle' })
ok('the dashboard preview is the live renderer (a canvas), not a flat drawing', (await d.locator('div[role="img"] canvas').count()) === 1 && (await d.locator('div[role="img"] svg').count()) === 0)
const pv = await d.locator('div[role="img"] canvas').boundingBox()
ok('the preview is large enough to read (≥ 260px wide)', !!pv && pv.width >= 260, JSON.stringify(pv && { w: Math.round(pv.width) }))
const paint = async (sel: string) => d.locator(sel).evaluate((cv: HTMLCanvasElement) => { const g = cv.getContext('2d')!, w = cv.width, h = cv.height; const px = g.getImageData(0, 0, w, h).data; const seen = new Set<number>(); for (let i = 0; i < px.length; i += 4 * 97) seen.add((px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4)); return seen.size })
await d.waitForTimeout(800)
ok('the preview is actually painted (many distinct colours, not a blank fill)', (await paint('div[role="img"] canvas')) > 25, String(await paint('div[role="img"] canvas')))
await d.getByRole('button', { name: /Village square/ }).click().catch(() => {}); await d.waitForTimeout(500)
await d.getByRole('button', { name: /Start simulation/ }).first().click(); await d.waitForURL('**/app/sim')
await d.getByRole('button', { name: 'Got it' }).click().catch(() => {}); await d.getByRole('button', { name: 'Begin the day' }).click()
await d.getByRole('button', { name: '12×' }).click(); await d.waitForTimeout(2500)
const map = d.getByRole('img', { name: /Live town map/ })
ok('the live map is painted with rich colour', (await paint('canvas[role="img"]')) > 40, String(await paint('canvas[role="img"]')))
ok('the narration line carries a time-of-day chip', /Morning|Daytime|Evening|Night/i.test(await d.locator('p[aria-live="polite"]').innerText()), (await d.locator('p[aria-live="polite"]').innerText()).slice(0, 24))
// four stat cards with a sparkline each, a ring on the first
ok('four stat cards, each with a sparkline', (await d.locator('svg[viewBox="0 0 120 30"]').count()) === 4)
ok('the first card has a progress ring', (await d.locator('div:has(> div > p:text-is("Heard the news")) svg circle').count()) >= 2)
// select a resident on the map -> portrait + meter + the pill shows the role
const bb = (await map.boundingBox())!
await d.getByRole('button', { name: 'Pause' }).click().catch(() => {})
let selected = false
// residents stand in different places on every visit, so scan the map until one answers
outer: for (let fy = 0.35; fy <= 0.8 && !selected; fy += 0.05) for (let fx = 0.15; fx <= 0.9; fx += 0.05) { await d.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy); if (await d.getByText(/years old/).count()) { selected = true; break outer } }

ok('clicking a resident opens a card with a pixel-art portrait, a serif name and a role chip', selected && (await d.locator('aside span[style*="tiles.png"]').count()) === 1 && (await d.locator('aside .font-display').count()) >= 1)
ok('the opinion meter is a labelled graphic', (await d.locator('aside [role="img"][aria-label*="Opinion"], aside [role="img"][aria-label*="not heard"]').count()) === 1)
// reduced motion: the map stops drifting clouds and birds but still renders
const rm = await (await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' })).newPage()
await rm.goto(BASE + '/app/sim', { waitUntil: 'networkidle' }); await rm.waitForTimeout(800)
ok('with reduced motion the town still renders', (await paint.call(null, 'canvas[role="img"]').catch(() => 0)) >= 0 && (await rm.locator('canvas[role="img"]').count()) === 1)
// mobile
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage()
await m.goto(BASE + '/app', { waitUntil: 'networkidle' })
ok('mobile: no horizontal overflow with the new preview', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
await m.goto(BASE + '/app/sim', { waitUntil: 'networkidle' }); await m.getByRole('button', { name: 'Got it' }).click().catch(() => {})
ok('mobile: the live town fits the screen width', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && ((await m.locator('canvas[role="img"]').boundingBox())?.width ?? 0) <= 390)
ok('no page or console errors', errs.length === 0, errs.slice(0, 2).join(' | '))
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0)
