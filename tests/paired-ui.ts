// npx tsx tests/paired-ui.ts <base-url>
import { chromium } from 'playwright'
import { defaultExperiment, encodeExperiment } from '../src/engine/lab'
const base = process.argv[2]?.replace(/\/$/, '') ?? 'http://127.0.0.1:4189'
const x = { ...defaultExperiment('water'), n: 10 }
const url = `${base}/app/lab/watch?x=${encodeExperiment(x)}&option=1&seed=0`
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined, args: ['--no-sandbox'] })
try {
  for (const [label, width] of [['desktop', 1440], ['mobile', 390]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: /Watch one town, two outcomes/i }).waitFor({ timeout: 30000 })
    if (await page.locator('canvas[aria-label="Live town map with moving residents"]').count() !== 2) throw new Error('expected two live town maps')
    const range = page.getByRole('slider', { name: 'Time in the town' })
    await range.fill('36')
    await page.getByText(/Water will be restored by 6pm/).first().waitFor()
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('horizontal overflow')
    await page.screenshot({ path: `/tmp/society-paired-${label}.png`, fullPage: true })
    if (errors.length) throw new Error(errors.join('; '))
    console.log(`PASS ${label}: two maps, shared clock, statement event, no overflow`)
    await page.close()
  }
} finally { await browser.close() }
