// Experiment Lab in a real browser against a deployed instance:  npx tsx tests/lab-ui.ts <url>
import { chromium } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, '')
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })).newPage()
const errs: string[] = []; p.on('pageerror', (e: Error) => errs.push(e.message))
let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }
const text = async () => p.locator('body').innerText()

await p.goto(BASE + '/app', { waitUntil: 'networkidle' })
ok('dashboard links to the lab (no sign-in needed)', (await p.getByRole('link', { name: /Experiment Lab/ }).count()) === 1)
await p.getByRole('link', { name: /Experiment Lab/ }).click(); await p.waitForURL('**/app/lab')
await p.locator('input[aria-label="Name of option 3"]').waitFor()
const names = await p.locator('input[aria-label^="Name of option"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
ok('lab opens with the default experiment (three named options)', names.join('|') === 'Do nothing|Official statement|One quiet reassurance', names.join('|'))
await p.getByRole('button', { name: /Does a town’s social fabric change the spread/ }).click()
await p.getByText('Result · 60 towns per option').waitFor({ timeout: 90000 })
ok('one-click question runs and measures news spread without setup', (await p.locator('section[aria-live="polite"] h2').first().innerText()) === 'Hours until half the town knew' && (await p.locator('table tbody tr').count()) === 3)
await p.getByRole('button', { name: /Reset to the default experiment/ }).click()

const t0 = Date.now()
await p.getByRole('button', { name: /Run 180 simulated days/ }).click()
await p.waitForSelector('text=Result ·', { timeout: 90000 })
ok('180 simulated days finish quickly in the browser', Date.now() - t0 < 30000, `${((Date.now() - t0) / 1000).toFixed(1)}s`)
const body = await text()
ok('a plain-language verdict is shown for each option vs the baseline', (body.match(/CLEAR DIFFERENCE|NO CLEAR DIFFERENCE/gi) ?? []).length === 2)
ok('the statement is reported as calmer than doing nothing', /Official statement: more calm than “Do nothing”/.test(body))
ok('the verdict reports how many towns agree', /Same direction in \d+ of 60 towns/.test(body) || /With 60 towns/.test(body))
ok('a chart (3 median lines + 3 bands) and a results table are drawn', (await p.locator('svg[role="img"] path').count()) >= 6 && (await p.locator('table tbody tr').count()) === 3)
const svgText = async () => (await p.locator('svg[role="img"]').first().textContent()) ?? ''
ok('axis shows no negative-zero label', !/-0\.0/.test(await svgText()))

// hover tooltip
await p.locator('svg[role="img"]').first().scrollIntoViewIfNeeded()
const box = await p.locator('svg[role="img"]').first().boundingBox()
await p.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5); await p.waitForTimeout(250)
const tip = await svgText()
ok('hover tooltip names every option in full', /One quiet reassurance:/.test(tip) && /Official statement:/.test(tip))

// share link round trip reproduces the same numbers
const avg = async () => (await p.locator('table tbody tr td:nth-child(2)').allInnerTexts()).join('|')
const before = await avg()
await p.getByRole('button', { name: /Copy experiment link/ }).click(); await p.waitForTimeout(300)
const link = await p.evaluate(() => navigator.clipboard.readText())
ok('experiment link was copied', /\/app\/lab\?x=[A-Za-z0-9_-]+$/.test(link), link.replace(/^https?:\/\/[^/]+/, '').slice(0, 40) + '…')
const p2 = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await p2.goto(link, { waitUntil: 'networkidle' })
ok('a stranger opening the link does not auto-run a batch', await p2.locator('text=Result ·').count() === 0)
await p2.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await p2.waitForSelector('text=Result ·', { timeout: 90000 })
ok('a stranger can explicitly run the shared link and gets IDENTICAL numbers', (await p2.locator('table tbody tr td:nth-child(2)').allInnerTexts()).join('|') === before, before)

// a hostile link falls back safely
const p3 = await (await b.newContext()).newPage()
await p3.goto(BASE + '/app/lab?x=' + 'A'.repeat(50), { waitUntil: 'networkidle' })
ok('an invalid experiment link shows a notice and loads the default', /link is not valid/i.test(await p3.locator('body').innerText()))
const xss = Buffer.from(JSON.stringify({ template: 'water', text: '<img src=x onerror=window.__pwn=1>', conds: [{ kind: 'none', label: '<b>x</b>' }, { kind: 'announce', label: '<script>window.__pwn=1</script>', text: '<img src=x onerror=window.__pwn=1>', hour: 12, stance: -0.5 }], n: 10 })).toString('base64url')
const p4 = await (await b.newContext()).newPage(); await p4.goto(BASE + '/app/lab?x=' + xss, { waitUntil: 'networkidle' }); await p4.getByRole('button', { name: /Run \d+ simulated days/ }).click(); await p4.waitForSelector('text=Result ·', { timeout: 60000 })
const shownLabel = await p4.locator('input[aria-label^="Name of option"]').nth(1).inputValue()
ok('markup inside a shared link is shown as literal text, never executed', (await p4.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)) === undefined && shownLabel.includes('<script>'), shownLabel.slice(0, 40))
ok('and no element was injected into the page', (await p4.locator('main script, main img[src="x"]').count()) === 0)

// editing: add an option, change outcome, rerun
await p.getByRole('button', { name: /Add another option/ }).click()
ok('a fourth option can be added', (await p.locator('input[aria-label^="Name of option"]').count()) === 4)
await p.getByLabel('Disagreement at the end of the day').check()
await p.getByRole('button', { name: /Run again|Run \d+ simulated days/ }).click()
await p.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 4, null, { timeout: 90000 })
ok('adding an option and changing the measure re-runs and relabels the result', (await p.locator('section[aria-live="polite"] h2').first().innerText()) === 'Disagreement at the end of the day' && (await p.locator('table tbody tr').count()) === 4)

// watch one town from the lab
await p.getByRole('button', { name: 'typical' }).nth(1).click(); await p.waitForURL('**/app/sim')
await p.waitForFunction(() => /Official statement/.test(document.querySelector('h1')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {})
ok('"watch a town" opens the live simulation with that condition\'s move', /Official statement/.test(await p.locator('h1').first().innerText()), (await p.locator('h1').first().innerText()).slice(0, 70))
await p.getByRole('button', { name: 'Got it' }).click().catch(() => {}); await p.getByRole('button', { name: '12×' }).click(); await p.waitForTimeout(4500)
ok('the move is part of that town\'s history (announcement in the log)', /Public announcement/.test(await text()))
ok('no page errors', errs.length === 0, errs[0] ?? '')
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0)
