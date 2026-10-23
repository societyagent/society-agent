// npx tsx tests/lab-compare-ui.ts <base-url>
import { chromium } from 'playwright'
import { defaultExperiment, encodeExperiment } from '../src/engine/lab'
const base = process.argv[2]?.replace(/\/$/, '') ?? 'http://127.0.0.1:4191'
const x = { ...defaultExperiment('water'), n: 10 }
x.conds[0] = { ...x.conds[1], id: 'c1', label: 'Do nothing', stance: 0.7 }
x.conds[2].town = 'trusting'
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined, args: ['--no-sandbox'] })
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } }), errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/app/lab/report?x=${encodeExperiment(x)}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'The short answer' }).waitFor({ timeout: 60000 })
  await page.getByText(/A label in this experiment does not match/).waitFor()
  await page.getByText(/cannot be credited to a single action/).waitFor()
  await page.getByText(/You cannot attribute this result to the whisper alone/).waitFor()
  await page.getByText(/Tone: toward alarmed \(\+0\.7\)/).waitFor()
  await page.screenshot({ path: '/tmp/society-report-mixed.png', fullPage: true })
  await page.getByRole('link', { name: 'Watch a paired town' }).click()
  await page.getByRole('heading', { name: /Watch one town, two outcomes/ }).waitFor()
  if (await page.locator('canvas').count() !== 2 || errors.length) throw new Error(`maps=${await page.locator('canvas').count()} errors=${errors}`)
  console.log('PASS misleading label and mixed-setting report warnings, tone, report-to-replay journey')
} finally { await b.close() }
