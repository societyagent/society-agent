// The wallet modal: opens, lists wallets, and triggers ZERO Content-Security-Policy violations.  npx tsx tests/wallet-ui.ts <url>
import { chromium } from 'playwright'
const BASE = process.argv[2].replace(/\/$/, '')
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
let pass = 0, fail = 0
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`) }
const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
const csp: string[] = [], errs: string[] = [], reown: { status: number; url: string }[] = []
await p.addInitScript(`(() => { window.__inline = 0; for (const name of ['appendChild', 'insertBefore']) { const o = Node.prototype[name]; Node.prototype[name] = function (n) { if (n && n.tagName === 'SCRIPT' && !n.src) window.__inline++; return o.apply(this, arguments) } } })()`)
await p.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { const w = window as unknown as { __csp?: string[] }; (w.__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`) }) })
p.on('pageerror', (e: Error) => errs.push(e.message))
p.on('console', (m) => { const t = m.text(); if (/Content Security Policy/i.test(t)) csp.push(t.slice(0, 160)); else if (m.type() === 'error' && !/Failed to load resource|reown|walletconnect|web3modal/i.test(t)) errs.push(t.slice(0, 160)) })
p.on('response', (r) => { if (/web3modal|reown|walletconnect/i.test(r.url())) reown.push({ status: r.status(), url: r.url().replace(/(projectId=)[a-f0-9]+/i, '$1<id>') }) })
await p.goto(BASE + '/app', { waitUntil: 'networkidle' })
const before = await p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /appkit|reown|walletconnect/i.test(n)).length)
ok('the wallet code is not loaded until someone signs in (landing stays light)', before === 0, `${before} wallet resources before click`)
await p.getByRole('button', { name: /^Sign in$/ }).first().click()
await p.waitForFunction(() => !!document.querySelector('w3m-modal, appkit-modal'), null, { timeout: 15000 }).catch(() => {})
await p.waitForTimeout(6000)
ok('the sign-in modal opens', await p.evaluate(() => !!document.querySelector('w3m-modal, appkit-modal')))
const text = await p.evaluate(`(() => { const out = []; const stack = [document.body]; while (stack.length) { const n = stack.pop(); if (n.nodeType === 3) out.push((n.textContent || '').trim()); if (n.shadowRoot) stack.push(...n.shadowRoot.childNodes); stack.push(...n.childNodes) } return out.join(' ').replace(/\\s+/g, ' ') })()`) as string
ok('the modal lists real ways to connect (WalletConnect / wallets)', /WalletConnect|MetaMask|Trust|Rainbow|All Wallets|Browser/i.test(text), text.match(/WalletConnect|MetaMask|Trust Wallet|Rainbow|All Wallets/gi)?.slice(0, 4).join(', '))
ok('the telemetry script is never injected (the wallet code creates no inline <script>)', ((await p.evaluate('window.__inline')) as number) === 0)
const events = await p.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
ok('ZERO Content-Security-Policy violations while the modal is open', events.length === 0 && csp.length === 0, [...events, ...csp].slice(0, 2).join(' | '))
const bad = reown.filter((r) => r.status >= 400 && r.status !== 403 && !/relay|\/v1\/(json|log)|pulse|analytics|verify/i.test(r.url))
ok('Reown answers for this origin (no 4xx on its config endpoints)', bad.length === 0, bad.slice(0, 2).map((r) => `${r.status} ${r.url.slice(0, 70)}`).join(' | '))
ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '))
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0)
