// Custom scenario + town character in a real browser:  npx tsx tests/custom-ui.ts <url>
import { chromium } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, '')
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
const errs: string[] = []
const page = async (w = 1440, h = 1000) => { const p = await (await b.newContext({ viewport: { width: w, height: h }, permissions: ['clipboard-read', 'clipboard-write'] })).newPage(); p.on('pageerror', (e: Error) => errs.push(e.message)); return p }
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }

/* ── 1. dashboard: write your own scenario, pick a town, start ── */
const p = await page()
await p.goto(BASE + '/app', { waitUntil: 'networkidle' })
ok('four scenario choices, including "Your own scenario", exposed as a radio group', (await p.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio').count()) === 4 && await p.getByRole('radio', { name: /Your own scenario/ }).isVisible())
await p.getByRole('radio', { name: /Your own scenario/ }).click()
ok('the scenario editor opens by itself for a custom scenario', await p.getByText('One side of the debate').isVisible())
const NEWS = 'The council will turn the old cinema into a night market.'
await p.getByLabel('News text').fill(NEWS)
await p.getByLabel('One side of the debate').fill('Keep the cinema'); await p.getByLabel('The other side').fill('Night market')
await p.getByRole('button', { name: 'student', exact: true }).click()   // adds student to the defaults (official, organizer) -> 3
await p.getByRole('button', { name: 'official', exact: true }).click()  // removes official
await p.getByRole('button', { name: 'Suspicious', exact: true }).click()
await p.getByRole('button', { name: /Start simulation/ }).first().click(); await p.waitForURL('**/app/sim')
await p.getByRole('button', { name: 'Got it' }).click().catch(() => {})
const head = await p.locator('main').first().innerText()
ok('the simulation shows the author\'s own news', head.includes(NEWS))
ok('the simulation names the kind of town', /SUSPICIOUS TOWN/i.test(head))
ok('the opinion axis uses the author\'s words', /Keep the cinema/.test(head) && /Night market/.test(head))
await p.getByRole('button', { name: '12×' }).click(); await p.waitForTimeout(3500)
const log = await p.locator('main').innerText()
const firstHeard = [...log.matchAll(/(\w+) heard the news[^\n]*first to hear/g)].length
ok('the run is alive: residents hear the news and talk', /heard the news/.test(log) && /Conversations\s*\d+/.test(log), `first-to-hear lines: ${firstHeard}`)

/* ── 2. a saved custom run replays identically for a stranger (needs sign-in; covered by e2e with the server) ── */

/* ── 3. lab: custom scenario + per-option town + the one-click town comparison ── */
const l = await page()
await l.goto(BASE + '/app/lab', { waitUntil: 'networkidle' })
await l.getByRole('button', { name: 'Your own scenario' }).click()
ok('lab custom editor appears', await l.getByText('Opinion axis: one side').isVisible())
await l.getByRole('textbox', { name: 'The news', exact: true }).fill('The park will charge a small entry fee.')
await l.locator('label:has-text("Opinion axis: one side") input').fill('Free park'); await l.locator('label:has-text("…and the other side") input').fill('Fee is fine')
await l.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await l.waitForSelector('text=Result ·', { timeout: 90000 })
const chartText = (await l.locator('svg[role="img"]').first().textContent()) ?? ''
ok('the chart is labelled with the author\'s axis', /fee is fine/i.test(chartText) && /free park/i.test(chartText))
ok('verdicts use the author\'s axis words', /more (free park|fee is fine)/i.test(await l.locator('main').innerText()) || /no clear difference/i.test(await l.locator('main').innerText()))

await l.getByRole('button', { name: 'Water main break' }).click()
await l.getByRole('button', { name: /Does the kind of town matter/ }).click()
const opts = await l.locator('input[aria-label^="Name of option"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
ok('one click sets up "same news, three kinds of town"', opts.join('|') === 'Everyday town|Tight-knit town|Isolated town', opts.join('|'))
ok('it measures what towns actually change (how fast news travels)', await l.getByLabel('Hours until half the town knew').isChecked())
await l.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await l.waitForSelector('text=Result ·', { timeout: 90000 })
const res = await l.locator('main').innerText()
ok('result: a tight-knit town is reported as faster than an isolated one', /Tight-knit town: faster news than “Everyday town”/.test(res) && /Isolated town: slower news than “Everyday town”/.test(res), (res.match(/(Tight-knit|Isolated) town: [^\n]+/g) ?? []).join(' || ').slice(0, 170))
const link = await (async () => { await l.getByRole('button', { name: /Copy experiment link/ }).click(); return l.evaluate(() => navigator.clipboard.readText()) })()
const before = (await l.locator('table tbody tr td:nth-child(2)').allInnerTexts()).join('|')
const l2 = await page(); await l2.goto(link, { waitUntil: 'networkidle' }); await l2.waitForSelector('text=Result ·', { timeout: 90000 })
ok('a stranger opening the link gets IDENTICAL numbers (towns travel in the link)', (await l2.locator('table tbody tr td:nth-child(2)').allInnerTexts()).join('|') === before, before)

// watch a town from the isolated condition: the simulation must run THAT town
await l.getByRole('button', { name: 'typical' }).nth(2).click(); await l.waitForURL('**/app/sim')
await l.waitForFunction(() => /ISOLATED TOWN/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
ok('"watch a town" opens the simulation in that option\'s kind of town', /ISOLATED TOWN/i.test(await l.locator('main').innerText()))

/* ── 4. mobile ── */
const m = await page(390, 844)
await m.goto(BASE + '/app', { waitUntil: 'networkidle' }); await m.getByRole('radio', { name: /Your own scenario/ }).click(); await m.waitForTimeout(300)
ok('mobile: no horizontal overflow on the scenario editor', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)))
await m.goto(BASE + '/app/lab', { waitUntil: 'networkidle' }); await m.getByRole('button', { name: 'Your own scenario' }).click(); await m.waitForTimeout(300)
ok('mobile: no horizontal overflow in the lab editor', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)))
ok('no page errors', errs.length === 0, errs[0] ?? '')
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0)
