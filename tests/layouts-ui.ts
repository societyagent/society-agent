// Street plans, per-resident tweaks and reports in a real browser:  npx tsx tests/layouts-ui.ts <url>
import { chromium } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, '')
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
const errs: string[] = []
const page = async (w = 1440, h = 1000) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage(); p.on('pageerror', (e: Error) => errs.push(e.message)); return p }
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }

/* ── 1. dashboard: street plan + one changed resident ── */
const p = await page()
await p.goto(BASE + '/app', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Village square', exact: true }).click()
await p.getByText('Change one resident (optional)').click()
await p.getByLabel('Who').selectOption({ label: 'Leila Nasser (official)' })
await p.locator('label:has-text("Sociability") input[type=range]').fill('0.4')
await p.getByRole('button', { name: /Start simulation/ }).click(); await p.waitForURL('**/app/sim')
await p.getByRole('button', { name: 'Got it' }).click().catch(() => {})
const head = await p.locator('main').first().innerText()
ok('the simulation header names the street plan and the changed resident', /village square/i.test(head) && /leila changed/i.test(head), (head.match(/VILLAGE[^\n]*/i) ?? [''])[0])
await p.getByRole('button', { name: '12×' }).click(); await p.waitForTimeout(3500)
ok('the village town runs: residents hear the news and talk', /heard the news/.test(await p.locator('main').innerText()))
// the canvas really drew a different map: compare against the classic one by pixel signature of the first row of roads
const sig = async (pg: typeof p) => pg.evaluate(() => { const c = document.querySelector('canvas')!; const g = c.getContext('2d')!; const w = c.width, h = c.height; const d = g.getImageData(0, 0, w, h).data; let s = 0; for (let y = Math.floor(h * 0.45); y < Math.floor(h * 0.55); y += 3) for (let x = 0; x < w; x += 7) s = (s * 31 + d[(y * w + x) * 4]) >>> 0; return s })
const villageSig = await sig(p)
const q = await page(); await q.goto(BASE + '/app', { waitUntil: 'networkidle' }); await q.getByRole('button', { name: /Start simulation/ }).click(); await q.waitForURL('**/app/sim'); await q.waitForTimeout(1200)
ok('the village map is drawn differently from the classic map', villageSig !== (await sig(q)))

/* ── 2. lab: ready-made questions, per-option street plan and per-person tweak ── */
const l = await page()
await l.goto(BASE + '/app/lab', { waitUntil: 'networkidle' })
await l.getByRole('button', { name: /Does the street plan matter/ }).click()
const names = await l.locator('input[aria-label^="Name of option"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
ok('one click sets up "same news, three street plans"', names.join('|') === 'Classic town|Village square|Long main street', names.join('|'))
await l.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await l.waitForSelector('text=Result ·', { timeout: 90000 })
const res = await l.locator('main').innerText()
ok('result: the long main street is reported as faster than the classic town', /Long main street: faster news than “Classic town”/.test(res), (res.match(/Long main street: [^\n]+/) ?? [''])[0].slice(0, 90))

await l.getByRole('button', { name: /What if one person were different/ }).click()
const opts2 = await l.locator('input[aria-label^="Name of option"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
ok('one click sets up "same town, one person changed"', opts2.length === 2 && /Leila/.test(opts2[1]), opts2.join(' | '))
ok('the per-person editor is open with the right person selected', (await l.getByText(/Changing Leila/).count()) === 1)
await l.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await l.waitForSelector('text=Result ·', { timeout: 90000 })
ok('result names the changed person in the verdict', /Leila/.test(await l.locator('main').innerText()))

/* ── 3. report ── */
await l.getByRole('link', { name: /Make a report/ }).click(); await l.waitForURL('**/app/lab/report?x=*')
await l.waitForSelector('text=The short answer', { timeout: 90000 })
const rep = await l.locator('article').innerText()
const heads = (await l.locator('article h2').evaluateAll((e) => e.map((x) => x.textContent))).join('|') // source text: CSS uppercasing is only presentation
ok('the report has a title, the short answer, findings, numbers and setup', /what really changes the outcome/.test(rep) && ['The short answer', 'Findings', 'The numbers', 'What each option was', 'How to read this'].every((h) => heads.includes(h)), heads)
ok('the report describes the changed resident in plain words', /Leila Nasser is more sociable/.test(rep) || /Leila Nasser is less sociable/.test(rep), (rep.match(/Leila Nasser is [^\n]+/) ?? [''])[0])
ok('the report states it is a model, not a forecast', /not a forecast of real people/.test(rep))
ok('the report has a light, printable chart', (await l.locator('article svg[role="img"] path').count()) >= 4)
const reportUrl = l.url()
const md = await (async () => { const [dl] = await Promise.all([l.waitForEvent('download'), l.getByRole('button', { name: 'Markdown' }).click()]); const fs = await import('node:fs'); return fs.readFileSync(await dl.path(), 'utf8') })()
ok('Markdown export contains the same findings', md.startsWith('# ') && md.includes('## Findings') && md.includes('Leila'), `${md.length} chars`)
// a stranger opens the report link and gets the same numbers
const before = (await l.locator('article table tbody tr td:nth-child(2)').allInnerTexts()).join('|')
const s2 = await page(); await s2.goto(reportUrl, { waitUntil: 'networkidle' }); await s2.waitForSelector('text=The short answer', { timeout: 90000 })
ok('a stranger opening the report link sees IDENTICAL numbers', (await s2.locator('article table tbody tr td:nth-child(2)').allInnerTexts()).join('|') === before, before)
// print stylesheet really hides the toolbar and removes the page chrome
await s2.emulateMedia({ media: 'print' })
ok('print view hides the toolbar', !(await s2.locator('.no-print').first().isVisible()))
const pdf = await s2.pdf({ format: 'A4', printBackground: true }); ok('the page renders to a PDF', pdf.length > 15000 && pdf.subarray(0, 4).toString() === '%PDF', `${(pdf.length / 1024).toFixed(0)} KB`)
// bad links
const bad = await page(); await bad.goto(BASE + '/app/lab/report?x=garbage', { waitUntil: 'networkidle' })
ok('an invalid report link explains itself', /report link is not valid/i.test(await bad.locator('body').innerText()))
const none = await page(); await none.goto(BASE + '/app/lab/report', { waitUntil: 'networkidle' })
ok('a missing report link explains itself', /report link is not valid/i.test(await none.locator('body').innerText()))

/* ── 4. mobile ── */
const m = await page(390, 844)
await m.goto(BASE + '/app', { waitUntil: 'networkidle' }); await m.getByText('Change one resident (optional)').click(); await m.waitForTimeout(300)
ok('mobile: no horizontal overflow on the dashboard editor', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)))
await m.goto(reportUrl, { waitUntil: 'networkidle' }); await m.waitForSelector('text=The short answer', { timeout: 90000 })
ok('mobile: the report does not overflow the page', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)))
ok('no page errors', errs.length === 0, errs[0] ?? '')
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0)
