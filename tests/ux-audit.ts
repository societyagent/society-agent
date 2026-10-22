// UX audit: measurable accessibility + layout metrics for every screen, desktop and mobile.  npx tsx tests/ux-audit.ts <url> [--shots dir]
import { chromium, type Page } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, ''), SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : ''
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })

const PROBE = `(() => {
  const lum = (c) => { const [r,g,b] = c.map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) }); return .2126*r + .7152*g + .0722*b }
  // Normalise ANY css colour (rgb, oklab, color-mix, color(srgb ...)) to rgba through a canvas, so modern colour syntax is measured too.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true })
  const parse = (s) => { if (!s || s === 'transparent') return { rgb: [0,0,0], a: 0 }; cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data; if (d[3] === 0) { cx.clearRect(0,0,1,1); cx.fillStyle = '#fff'; cx.fillStyle = s; cx.fillRect(0,0,1,1); const e = cx.getImageData(0,0,1,1).data; return { rgb: [e[0],e[1],e[2]], a: e[3] / 255 } } return { rgb: [d[0],d[1],d[2]], a: d[3] / 255 } }
  const bgOf = (el) => { let e = el; const stack = []; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a >= .99) break; e = e.parentElement } let base = [12,11,10]; for (const c of stack.reverse()) base = base.map((v, i) => v * (1 - c.a) + c.rgb[i] * c.a); return base }
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > .05 && r.bottom > 0 && r.right > 0 }
  const low = [], seen = new Set()
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    if (!own) continue
    const cs = getComputedStyle(el), fg = parse(cs.color); if (!fg) continue
    const bg = bgOf(el), blended = fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a))
    const L1 = lum(blended), L2 = lum(bg), ratio = (Math.max(L1,L2) + .05) / (Math.min(L1,L2) + .05)
    const px = parseFloat(cs.fontSize), big = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700)
    if (ratio < (big ? 3 : 4.5)) { const k = el.textContent.trim().slice(0, 40) + '|' + ratio.toFixed(1); if (!seen.has(k)) { seen.add(k); low.push({ t: el.textContent.trim().slice(0, 40), r: +ratio.toFixed(2), px }) } }
  }
  const small = []
  for (const el of document.querySelectorAll('a[href], button, input, select, summary, [role=button]')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect()
    if (el.tagName === 'INPUT' && el.type === 'range') { if (r.height < 20) small.push({ t: 'range', w: Math.round(r.width), h: Math.round(r.height) }); continue }
    // a radio/checkbox inside a <label> is operated by clicking the label: judge the label's box, which is what a finger hits
    if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox') && el.closest('label')) { const lr = el.closest('label').getBoundingClientRect(); if (lr.width < 44 || lr.height < 36) small.push({ t: 'label for ' + el.type, w: Math.round(lr.width), h: Math.round(lr.height) }); continue }
    if (r.width < 44 || r.height < 36) small.push({ t: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) })
  }
  const noName = [...document.querySelectorAll('button, a[href], input, select')].filter((el) => vis(el) && !(el.getAttribute('aria-label') || el.textContent.trim() || el.labels?.length || el.getAttribute('title'))).length
  const h1 = document.querySelectorAll('h1').length, landmarks = { main: document.querySelectorAll('main').length, nav: document.querySelectorAll('nav').length, header: document.querySelectorAll('header').length }
  return { overflowX: document.documentElement.scrollWidth - window.innerWidth, low, small, noName, h1, landmarks, title: document.title, lang: document.documentElement.lang }
})()`

const focusProbe = async (p: Page) => {
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); let visible = 0, total = 0
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press('Tab'); total++
    const ring = await p.evaluate(() => { const el = document.activeElement as HTMLElement | null; if (!el || el === document.body) return null; const cs = getComputedStyle(el); const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1; const shadow = cs.boxShadow !== 'none' && /rgb/.test(cs.boxShadow); return outline || shadow })
    if (ring) visible++
  }
  return `${visible}/${total}`
}

type Row = { screen: string; vp: string; overflow: number; lowContrast: number; small: number; noName: number; h1: number; main: number; focus: string; worst: string }
const rows: Row[] = [], details: string[] = []
const screens: [string, string, (p: Page) => Promise<void>][] = [
  ['landing', '/', async (p) => { await p.waitForTimeout(1500) }],
  ['dashboard', '/app', async () => {}],
  ['simulation', '/app/sim', async (p) => { await p.getByRole('button', { name: 'Got it' }).click().catch(() => {}); await p.waitForTimeout(1500) }],
  ['lab', '/app/lab', async () => {}],
  ['lab result', '/app/lab', async (p) => { await p.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await p.waitForSelector('text=Result ·', { timeout: 90000 }) }],
  ['report', '/app/lab', async (p) => { await p.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await p.waitForSelector('text=Result ·', { timeout: 90000 }); await p.getByRole('link', { name: /Make a report/ }).click(); await p.waitForSelector('text=Findings', { timeout: 90000 }) }],
  ['docs', '/docs', async () => {}],
]
for (const [vpName, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
  for (const [name, path, prep] of screens) {
    const p = await (await b.newContext({ viewport: vp, deviceScaleFactor: vpName === 'mobile' ? 2 : 1 })).newPage()
    const errs: string[] = []; p.on('pageerror', (e: Error) => errs.push(e.message))
    await p.goto(BASE + path, { waitUntil: 'networkidle' })
    if (name === 'docs' && (await p.locator('h1').count()) === 0) { rows.push({ screen: name, vp: vpName, overflow: 0, lowContrast: -1, small: -1, noName: -1, h1: 0, main: 0, focus: 'n/a (route missing)', worst: '' }); continue }
    await prep(p); await p.waitForTimeout(400)
    const r = await p.evaluate(PROBE) as { overflowX: number; low: { t: string; r: number; px: number }[]; small: { t: string; w: number; h: number }[]; noName: number; h1: number; landmarks: { main: number } }
    const focus = await focusProbe(p)
    rows.push({ screen: name, vp: vpName, overflow: Math.max(0, r.overflowX), lowContrast: r.low.length, small: r.small.length, noName: r.noName, h1: r.h1, main: r.landmarks.main, focus, worst: r.low.sort((a, c) => a.r - c.r)[0] ? `${r.low[0].r}:${r.low[0].t}` : '' })
    if (r.low.length) details.push(`  [${vpName} ${name}] low contrast: ${r.low.slice(0, 4).map((x) => `${x.r} "${x.t}"`).join(' | ')}`)
    if (r.small.length && vpName === 'mobile') details.push(`  [${vpName} ${name}] small targets: ${r.small.slice(0, 5).map((x) => `${x.w}x${x.h} "${x.t}"`).join(' | ')}`)
    if (errs.length) details.push(`  [${vpName} ${name}] PAGE ERRORS: ${errs[0]}`)
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/ux-${name.replace(/ /g, '-')}-${vpName}.png`, fullPage: true })
    await p.context().close()
  }
}
console.log('screen'.padEnd(12), 'vp'.padEnd(8), 'overflow lowContrast smallTargets unnamed h1 main focusRing')
for (const r of rows) console.log(r.screen.padEnd(12), r.vp.padEnd(8), String(r.overflow).padStart(8), String(r.lowContrast).padStart(10), String(r.small).padStart(12), String(r.noName).padStart(7), String(r.h1).padStart(2), String(r.main).padStart(4), r.focus.padStart(9))
console.log(details.join('\n'))
const tot = (k: 'overflow' | 'lowContrast' | 'small' | 'noName') => rows.reduce((a, r) => a + Math.max(0, r[k]), 0)
console.log(`\nTOTAL overflow ${tot('overflow')} | low-contrast ${tot('lowContrast')} | small targets ${tot('small')} | unnamed controls ${tot('noName')}`)
await b.close()
