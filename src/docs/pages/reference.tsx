import { ENDPOINTS, ENV_VARS } from '../endpoints'
import { LIMITS } from '@/engine/limits'
import { MIND_ACTIONS, PERSONAS_PUBLIC } from '@/engine/world'
import { B, Callout, Code, D, M, P, Table, UL, type DocPage } from '../ui'

const rl = LIMITS.rate
const win = (s: number) => (s % 3600 === 0 ? `${s / 3600} h` : s % 60 === 0 ? `${s / 60} min` : `${s} s`)
const rate = (r: { limit: number; windowSec: number; per: string }) => `${r.limit} per ${win(r.windowSec)} per ${r.per}`

export const referencePages: DocPage[] = [
  {
    slug: 'residents', title: 'The residents', group: 'Reference',
    tagline: 'The sixteen people who can live in a town: roles, ages and traits, straight from the engine.',
    keywords: ['personas', 'cast', 'people', 'traits', 'roles', 'maya', 'omar', 'leila'],
    sections: [
      { id: 'cast', title: 'The cast', body: <>
        <P>A town of N residents contains the first N people below. Traits run from 0 to 1 (leaning from −1 to 1). Stubbornness is derived: <M>0.25 + (1 − trust) × 0.5</M>, plus 0.15 over 55.</P>
        <Table head={['#', 'Name', 'Age', 'Role', 'Works at', 'Sociable', 'Trusting', 'Leaning', 'Stubborn']} rows={PERSONAS_PUBLIC.map((p, i): string[] => [String(i + 1), p.name, String(p.age), p.role, p.work, p.traits.social.toFixed(2), p.traits.trust.toFixed(2), p.traits.bias.toFixed(2), Math.max(0, Math.min(1, 0.25 + (1 - p.traits.trust) * 0.5 + (p.age > 55 ? 0.15 : 0))).toFixed(2)])} />
        <Callout kind="note">These are invented people written for the model. They are not based on any real person.</Callout></> },
      { id: 'bios', title: 'Bios', body: <UL>{PERSONAS_PUBLIC.map((p) => <li key={p.name}><B>{p.name}</B>: {p.bio}</li>)}</UL> },
    ],
  },
  {
    slug: 'ai-layer', title: 'The AI layer', group: 'Reference',
    tagline: 'Optional language models: spoken lines, interviews, a written analysis, and residents who choose how to react.',
    keywords: ['llm', 'ai', 'voices', 'minds', 'interview', 'analysis', 'decide', 'model', 'chat completions', 'agent minds'],
    sections: [
      { id: 'principle', title: 'The one rule', body: <Callout kind="honest" title="The rule"><B>A language model can change what a resident says. It can never change the simulation by itself.</B> The deterministic engine does not call a model, and a run made without any AI is complete. Where a model does influence what happens (Agent minds), its choice is recorded as an input first.</Callout> },
      { id: 'features', title: 'Four things it can do', body: <Table head={['Feature', 'What it does', 'Changes the outcome?']} rows={[
        ['AI voices', 'Rewrites the lines residents say in conversations so they sound like the person.', 'No'],
        ['Interview', 'Ask any resident a question; they answer in character, grounded in what they heard and remember.', 'No'],
        ['AI analysis', 'Writes a short analysis of the finished run from its metrics and report.', 'No'],
        ['Agent minds', `Informed residents choose to ${MIND_ACTIONS.map((a) => a.replace('_', ' ')).join(', ')} and say it in their own words.`, 'Yes, as a recorded input'],
      ]} /> },
      { id: 'minds', title: 'How Agent minds stays reproducible', body: <>
        <P>Models are not deterministic, so they cannot be part of the engine. Instead, when a resident decides, the choice (action, spoken line and a small stance shift between −0.3 and +0.3) is stored in the run as a <B>decision</B>, in the same list as your announcements and whispers. The engine then applies that decision with fixed rules: a decision from someone who has not heard the news does nothing, <i>warn</i> pushes listeners within {3} cells toward alarm, <i>reassure</i> toward calm, <i>verify</i> pulls the resident’s own opinion toward the middle, <i>stay quiet</i> only records it. Saving, sharing and replaying use the recorded decisions, never the model.</P>
        <P>Limits: up to {LIMITS.ai.residentsPerMindCall} residents per model call, {LIMITS.ai.mindCallsPerRun} calls per run in the browser and {LIMITS.maxDecisionsPerRun} decisions per saved run. A resident id outside the cast is rejected, not corrected.</P></> },
      { id: 'sign-in', title: 'Why it needs a sign-in', body: <P>Model calls cost money and can be abused, so they require a session and are rate limited per wallet, per network address and for the whole deployment (see below). The simulation, the map, the lab and reports do not need one.</P> },
      { id: 'limits', title: 'Quotas', body: <Table head={['Limit', 'Value']} rows={[['Per wallet', rate(rl.aiWallet)], ['Per network address', rate(rl.aiNetwork)], ['Whole deployment', rate(rl.aiGlobal)], ['Voices lines per call', String(LIMITS.ai.linesPerVoicesCall)], ['Interview history sent', `${LIMITS.ai.historyTurns} turns`], ['Memories sent per interview', String(LIMITS.ai.memoryItems)]]} /> },
      { id: 'privacy', title: 'What is sent to the model', body: <P>Only what the call needs: the news text, a resident’s persona, their stance, a few memory lines, and your question. Wallet addresses and saved runs are never sent. Text you type is cleaned of control characters and capped in length on the server before it reaches the model.</P> },
      { id: 'configure', title: 'Configuring it', body: <>
        <P>Any endpoint that speaks the common <M>/chat/completions</M> format works, hosted or self-hosted. Set three variables (and an optional fallback model); without them, <M>/api/ai</M> answers 503 and the app hides nothing else.</P>
        <Code label=".dev.vars">{`AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=…
AI_MODEL=your-model-name
# optional: tried if the first model errors or times out
AI_FALLBACK_MODEL=…`}</Code></> },
    ],
  },
  {
    slug: 'api', title: 'HTTP API', group: 'Reference',
    tagline: 'Every endpoint the app uses, with who may call it, what to send and what comes back.',
    keywords: ['rest', 'endpoints', 'http', 'json', 'curl', 'routes', 'cookie', 'bearer', 'rate limit', 'errors'],
    sections: [
      { id: 'basics', title: 'Basics', body: <>
        <P>The API belongs to the app and is same-origin only: it grants <B>no CORS</B>, a state-changing request that carries an <M>Origin</M> must come from the same origin, and a cross-site browser request is refused with 403. Bodies are JSON and limited to 200 kB. Responses are never cached and carry <M>nosniff</M>.</P>
        <P><B>Authentication.</B> Browsers use the <M>__Host-sa_session</M> cookie that <M>/api/auth/verify</M> sets. Scripts and tests can instead send the returned token as a bearer header. A missing, malformed, expired or forged credential is always <M>401</M>.</P>
        <Callout kind="tip">Because the cookie is <M>SameSite=Strict</M> and the API rejects foreign origins, you cannot call the API from another website. Use a bearer token from a script or a server.</Callout></> },
      ...ENDPOINTS.map((e) => ({ id: `${e.method.toLowerCase()}-${e.path.replace(/[^a-z]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`, title: `${e.method} ${e.path}`, body: <>
        <P>{e.summary} <span className="ml-1 rounded-full border border-white/12 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-white/60">{e.who}</span></P>
        {e.body && <Code label="request body">{e.body}</Code>}
        <Table head={['Result', 'Shape']} mono={[1]} rows={[['Success', e.ok], ...e.errors.map((x) => ['Error', x])]} /></> })),
      { id: 'limits', title: 'Rate limits', body: <>
        <Table head={['Endpoint', 'Limit']} rows={[['POST /api/auth/challenge', rate(rl.challenge)], ['POST /api/auth/verify', rate(rl.verify)], ['POST /api/runs', rate(rl.saveRun)], ['POST /api/ai', `${rate(rl.aiWallet)}; ${rate(rl.aiNetwork)}; ${rate(rl.aiGlobal)}`], ['POST /api/client-error', rate(rl.clientError)]]} />
        <P>Limits are fixed windows kept in the database. A request over the limit gets <M>429</M> and a plain message.</P></> },
      { id: 'inputs', title: 'What the server accepts as input', body: <UL>
        <li><M>cfg.news.text</M>: up to 240 characters, control characters replaced by spaces. Empty means the run is rejected.</li>
        <li><M>cfg.axis</M>: two labels of up to 24 characters each.</li>
        <li><M>cfg.population</M>: {LIMITS.town.minResidents}–{LIMITS.town.maxResidents}. <M>cfg.seed</M>: an integer.</li>
        <li><M>cfg.news.seedRoles</M>: up to 4 roles from the known list; unknown roles are dropped.</li>
        <li><M>cfg.town</M>: trust, social, bias each clamped to ±0.3 and rounded to 2 decimals. <M>cfg.layout</M>: one of the known plans, otherwise ignored.</li>
        <li><M>cfg.residents</M>: tweaks for residents that exist, each value clamped to ±0.5; everything else is dropped.</li>
        <li><M>ticks</M>: 12 to {LIMITS.maxTicks}. <M>interventions</M>: at most {LIMITS.maxInterventions}; a whisper or decision for a resident outside the cast rejects the whole request.</li></UL> },
      { id: 'example', title: 'Example: sign in and save a run from a script', body: <>
        <P>This is exactly what the test suite does, with a throwaway wallet.</P>
        <Code label="TypeScript (Node 20+)">{`import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const BASE = 'https://societyagent.fun'
const account = privateKeyToAccount(generatePrivateKey())
const post = (path: string, body: unknown, token?: string) => fetch(BASE + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body),
}).then((r) => r.json())

const ch = await post('/api/auth/challenge', { address: account.address, chainId: 1 })
const { token } = await post('/api/auth/verify', {
  id: ch.id, address: account.address, signature: await account.signMessage({ message: ch.message }),
})
const { id } = await post('/api/runs', {
  cfg: { name: 'Demo', template: 'water', axis: ['Calm', 'Alarmed'], population: 12, seed: 1, news: { text: 'A water main broke.', stance: 0.6, startTick: 2, seedRoles: ['official'] } },
  ticks: 144, interventions: [{ tick: 36, iv: { type: 'announce', text: 'Water is back at six.', stance: -0.5 } }],
}, token)
console.log('saved', BASE + '/r/' + id) // private until you PATCH { shared: true }`}</Code></> },
    ],
  },
  {
    slug: 'run-format', title: 'Run and experiment formats', group: 'Reference',
    tagline: 'The shapes of a saved run, an intervention, an experiment link and the CSV exports.',
    keywords: ['json', 'csv', 'format', 'schema', 'cfg', 'interventions', 'experiment link', 'encode', 'export'],
    sections: [
      { id: 'cfg', title: 'The scenario (cfg)', body: <Code label="json">{`{
  "name": "Water main break",
  "question": "How does a local infrastructure failure spread…",
  "template": "water",                       // water | rumor | school | custom
  "axis": ["Calm", "Alarmed"],
  "population": 12,                          // 6–16
  "seed": 1234567,
  "news": { "text": "…", "stance": 0.6, "startTick": 2, "seedRoles": ["official", "nurse"] },
  "town": { "trust": -0.25, "social": 0, "bias": 0 },   // optional, each ±0.3
  "layout": "village",                                   // optional: village | mainstreet
  "residents": { "8": { "social": 0.4 } }                // optional, ±0.5
}`}</Code> },
      { id: 'interventions', title: 'Interventions', body: <Code label="json">{`[
  { "tick": 36, "iv": { "type": "announce", "text": "…", "stance": -0.5 } },
  { "tick": 50, "iv": { "type": "whisper",  "agent": 4, "text": "…", "stance": 0.3 } },
  { "tick": 70, "iv": { "type": "decide",   "agent": 1, "action": "warn", "text": "…", "stance": 0.2 } }
]`}</Code> },
      { id: 'compat', title: 'Compatibility promise', body: <P>Optional fields are omitted when they hold their default (<M>layout: classic</M> is stored as no layout at all, an empty <M>residents</M> as nothing). A run saved before a field existed therefore has the same bytes it always had and replays exactly. The compatibility test pins this with 36 full runs recorded from the original engine.</P> },
      { id: 'csv', title: 'CSV exports', body: <>
        <Table head={['Where', 'Columns']} rows={[['Simulation', 'tick, time, informed, mean_opinion, spread, conversations'], ['Lab', 'condition, seed, final_opinion, peak_opinion, final_disagreement, hours_until_half_knew, conversations']]} />
        <P>Text cells that start with <M>=</M>, <M>+</M>, <M>-</M> or <M>@</M> are prefixed so a spreadsheet cannot run them as formulas.</P></> },
      { id: 'experiment-link', title: 'Experiment links', body: <P>The lab page link carries the whole experiment as URL-safe base64 of its JSON, at most 4000 characters, in the <M>x</M> parameter. Anything that fails to decode, or decodes into something invalid, is rejected; values that are merely out of range are clamped. Opening a link re-runs the same seeds (derived from the stored <M>batchSeed</M>), so the numbers are identical for everyone.</P> },
    ],
  },
  {
    slug: 'reproducibility', title: 'Reproducibility', group: 'Reference',
    tagline: 'How a day replays exactly, and the test that stops anyone breaking it by accident.',
    keywords: ['deterministic', 'seed', 'rng', 'mulberry', 'replay', 'golden', 'compatibility', 'fingerprint'],
    sections: [
      { id: 'how', title: 'How it works', body: <P>Every random choice comes from one seeded generator (a small 32-bit generator in <M>src/engine/world.ts</M>) that lives inside the run’s state. The engine never reads the clock, <M>Math.random</M> or anything outside its inputs, and the order of residents each tick comes from a seeded shuffle, so the result does not depend on how a browser implements sorting.</P> },
      { id: 'server', title: 'The server replays too', body: <P>When you save a run the server does not trust any result you send. It runs the same engine from your inputs and stores its own metrics. An end-to-end test saves a run, replays it locally and checks that the server’s final numbers equal the browser’s to nine decimal places.</P> },
      { id: 'golden', title: 'The compatibility test', body: <>
        <P><M>tests/golden.test.ts</M> replays 36 full days (four seeds, three populations, three scenarios, with an announcement, a whisper and a decision) and compares a fingerprint of every metric, event and final resident state with one recorded from the original engine, before towns, street plans and per-resident tweaks existed. If a change alters any of them, saved and shared runs would stop replaying and the test fails.</P>
        <Callout kind="warn" title="If you change the rules on purpose">Re-record the fixture (<M>npx tsx tests/golden.test.ts --record</M>), say so in your change, and understand that older saved runs will no longer replay identically. Prefer adding an optional field that is omitted by default.</Callout></> },
      { id: 'rules', title: 'Rules for contributors', body: <UL><li>No <M>Math.random</M>, <M>Date.now</M> or unseeded sorting inside the engine.</li><li>Every random draw consumes the generator in the same order regardless of input; add new draws at the end of a tick, not in the middle.</li><li>New options must default to “omitted”.</li></UL> },
    ],
  },
  {
    slug: 'limits-honesty', title: 'Limits and honesty', group: 'Reference',
    tagline: 'What this can and cannot tell you, and every quota in one table.',
    keywords: ['limitations', 'quotas', 'caveats', 'accuracy', 'validity', 'forecast', 'limits'],
    sections: [
      { id: 'cannot', title: 'What it cannot tell you', body: <UL>
        <li><B>It does not predict real communities.</B> The rules are simple, invented and not fitted to data.</li>
        <li><B>The cast is small and fixed.</B> At most 16 people from a list of 16, in a 48×28 town with 14 places and three street plans.</li>
        <li><B>One news item, one axis.</B> No competing stories, no media, no memory across days beyond a short log.</li>
        <li><B>Absolute numbers are not the output.</B> Compare options against each other; do not read “0.27” as a real percentage of anything.</li>
        <li><B>Effects depend on the story.</B> A street plan that sped up one scenario made no clear difference in another. Check more than one.</li></UL> },
      { id: 'can', title: 'What it is good for', body: <UL><li>Building intuition for how information, trust and sociability interact.</li><li>Asking “does this change matter, or is it noise?” and getting an honest answer.</li><li>Reproducible demonstrations you can share exactly.</li><li>A readable base to extend with your own rules.</li></UL> },
      { id: 'roadmap', title: 'Not built yet', body: <UL><li>Residents that plan across a day (perceive, remember, decide) rather than choosing one reaction.</li><li>Agent minds inside lab batches (a model call per resident is too slow and costly for hundreds of runs).</li><li>More maps, more residents, competing news.</li><li>EIP-1271 (smart-contract wallet) signatures: sign-in currently verifies ordinary wallet signatures.</li></UL> },
      { id: 'quotas', title: 'Every quota', body: <Table head={['Quota', 'Value']} rows={[
        ['Saved runs per wallet', String(LIMITS.maxRunsPerOwner)], ['Saved run length', `12 to ${LIMITS.maxTicks} ticks`], ['Interventions per run', String(LIMITS.maxInterventions)], ['Agent decisions per run', String(LIMITS.maxDecisionsPerRun)],
        ['Session lifetime', '7 days'], ['Sign-in message lifetime', `${LIMITS.challengeTtlSec / 60} minutes, single use`],
        ['Towns per option in the lab', `${LIMITS.lab.minTowns}–${LIMITS.lab.maxTowns}`], ['Options per experiment', String(LIMITS.lab.maxOptions)], ['Simulated days per lab run', String(LIMITS.lab.maxSimulatedDays)],
        ['Residents per town', `${LIMITS.town.minResidents}–${LIMITS.town.maxResidents}`],
      ]} /> },
    ],
  },
  {
    slug: 'self-host', title: 'Self-hosting', group: 'Run it yourself',
    tagline: 'Run Society Agent on your own Cloudflare account: Pages, Functions and one D1 database.',
    keywords: ['deploy', 'install', 'cloudflare', 'pages', 'wrangler', 'd1', 'migrations', 'environment', 'secrets', 'local', 'dev'],
    sections: [
      { id: 'need', title: 'What you need', body: <UL><li>Node 20 or newer and npm.</li><li>A Cloudflare account (the free plan is enough to start).</li><li>Optionally: a Reown project id for the wallet modal, and a chat-completions endpoint for the AI layer.</li></UL> },
      { id: 'local', title: 'Run it locally', body: <>
        <Code>{`git clone <your copy of the repository> society-agent && cd society-agent
npm install
cp wrangler.example.toml wrangler.toml            # put your own D1 database id in it
npx wrangler d1 create society-agent              # prints the id
npx wrangler d1 migrations apply society-agent --local
cp .dev.vars.example .dev.vars                    # optional: AI_* values
npm run build && npx wrangler pages dev dist`}</Code>
        <P>The simulation, the map, the lab and the reports work without any model. Saved runs need the database; sign-in works with an injected browser wallet if you do not set a Reown id.</P></> },
      { id: 'deploy', title: 'Deploy', body: <>
        <Code>{`npx wrangler d1 migrations apply society-agent --remote
npm run build
npx wrangler pages deploy dist --project-name your-project`}</Code>
        <P>Migrations are in <M>d1/migrations</M>: <M>0001</M> creates users, challenges, sessions, runs and rate limits; <M>0002</M> adds the error log and audit trail; <M>0003</M> adds uptime probes. Apply them in order.</P>
        <P>Security headers (a strict Content-Security-Policy among them) come from <M>public/_headers</M> and are served by Pages. If you add a third-party origin, add it to <M>connect-src</M> there.</P></> },
      { id: 'env', title: 'Configuration', body: <Table head={['Name', 'Where', 'Required', 'What it does']} mono={[0]} rows={ENV_VARS.map((v) => [v.name, v.where, v.required, v.what])} /> },
      { id: 'secrets', title: 'Setting secrets', body: <Code>{`npx wrangler pages secret put AI_API_KEY --project-name your-project
npx wrangler pages secret put AI_BASE_URL --project-name your-project
npx wrangler pages secret put AI_MODEL --project-name your-project
npx wrangler pages secret put HEALTH_TOKEN --project-name your-project   # optional`}</Code> },
      { id: 'wallet', title: 'Wallet sign-in (Reown)', body: <P>Create a free project at the Reown dashboard, copy its <B>public</B> project id into <M>.env.local</M> as <M>VITE_REOWN_PROJECT_ID</M>, rebuild, and add your deployment’s domain to the project’s allowlist. Without an id the modal falls back to an injected wallet such as a browser extension.</P> },
      { id: 'wallet-list', title: 'Which wallets the modal offers', body: <><P>Browser extensions, Coinbase Wallet and Base Account, and any mobile or desktop wallet through WalletConnect.</P><Callout kind="note"><B>Why Coinbase and Base are registered by hand.</B> Their SDKs inject a third-party analytics script as <i>inline</i> code, which the strict Content-Security-Policy (<M>script-src 'self'</M>) refuses. <M>src/lib/web3.ts</M> registers both connectors with <M>telemetry: false</M>, so the script is never created and the policy needs no exception. <M>tests/wallet-ui.ts</M> fails if the modal ever triggers a policy violation.</Callout></> },
      { id: 'custom-domain', title: 'A custom domain', body: <P>Add the domain to the Pages project, then add it to the Reown allowlist. Sign-in messages name the domain the page is served from, so they adapt automatically; nothing else in the code mentions a host.</P> },
    ],
  },
  {
    slug: 'operations', title: 'Operations and monitoring', group: 'Run it yourself',
    tagline: 'Health checks, error reports, the audit trail, uptime probes, backups and restores.',
    keywords: ['monitoring', 'uptime', 'errors', 'audit', 'backup', 'restore', 'cron', 'alerts', 'webhook', 'ops', 'health'],
    sections: [
      { id: 'health', title: 'Health', body: <P><M>GET /api/health</M> returns <M>{'{ "ok": true, "db": "up", "ms": 4 }'}</M> after a real database round trip and answers 503 when the database is down. Point any uptime service at it.</P> },
      { id: 'errors', title: 'Errors', body: <P>The browser reports uncaught errors, unhandled promise rejections and Content-Security-Policy violations to <M>/api/client-error</M>; the server logs its own failures. Both are grouped by a fingerprint in the <M>errors</M> table and kept for 14 days. Run ids and tokens in a route are stripped before storage. With a <M>HEALTH_TOKEN</M> set, <M>GET /api/ops/summary</M> returns the last day grouped by fingerprint.</P> },
      { id: 'audit', title: 'Audit trail', body: <P>Sign-ins, saved runs, share and unshare and deletes are recorded in <M>audit</M> (event, actor, target), kept 90 days. It never stores message contents.</P> },
      { id: 'worker', title: 'The ops worker', body: <>
        <P><M>ops/</M> is a small separate scheduled Worker. Every 15 minutes it probes the health endpoint, the landing page, the app and the auth guard and stores the result; it alerts after <B>two consecutive failures</B> (one blip is noise), alerts again on recovery, and alerts when five or more server errors arrive within 15 minutes. At 03:17 UTC daily it records a restore-point timestamp.</P>
        <Code>{`cd ops
# edit wrangler.toml: your D1 id and TARGET (your deployment URL)
npx wrangler deploy
npx wrangler secret put ALERT_WEBHOOK      # any https endpoint that accepts JSON { text, content }`}</Code></> },
      { id: 'backups', title: 'Backups and restore', body: <>
        <P>D1 Time Travel keeps 30 days of point-in-time history automatically. For a copy you control, <M>scripts/backup-d1.sh</M> writes a SQL dump (mode 600, in the git-ignored <M>backups/</M>). <M>scripts/restore-d1.md</M> lists the restore commands.</P>
        <Callout kind="warn">A backup contains wallet addresses and run data. Store it with the same care as the database.</Callout></> },
    ],
  },
  {
    slug: 'security', title: 'Security model', group: 'Run it yourself',
    tagline: 'How sign-in, sessions, input and the browser are protected, and how to check it yourself.',
    keywords: ['security', 'csp', 'cors', 'csrf', 'cookie', 'siwe', 'rate limit', 'xss', 'vulnerability', 'report'],
    sections: [
      { id: 'auth', title: 'Sign-in and sessions', body: <UL>
        <li>Sign-in is EIP-4361: a single-use, five-minute message bound to this site’s domain. A challenge is burned atomically, so two concurrent requests cannot both succeed.</li>
        <li>The session lives in a <M>__Host-</M> cookie (<M>Secure</M>, <M>HttpOnly</M>, <M>SameSite=Strict</M>, path <M>/</M>, no domain), so page scripts cannot read it and a sibling subdomain cannot set it. Only a hash of the token is stored.</li>
        <li>Signing out revokes the session on the server.</li></UL> },
      { id: 'api', title: 'The API', body: <UL><li>No CORS is granted and cross-origin or cross-site browser requests are refused.</li><li>Results are recomputed by the server; the client cannot submit metrics.</li><li>Every input is clamped, truncated or rejected on the server; see <D to="api">HTTP API → inputs</D>.</li><li>Private and missing runs are indistinguishable.</li><li>Rate limits on sign-in, saving and AI use, plus a deployment-wide AI cap.</li></UL> },
      { id: 'browser', title: 'The browser', body: <UL><li>A strict Content-Security-Policy: scripts only from this origin, no inline script and no <M>eval</M>.</li><li>Fonts are self-hosted. The wallet modal is loaded only when someone signs in.</li><li>No raw HTML injection: residents’ lines, news text and experiment labels are rendered as text. CSV exports neutralise spreadsheet formulas.</li><li>Clickjacking protection (<M>X-Frame-Options: DENY</M>), HSTS and a restrictive Permissions-Policy.</li></UL> },
      { id: 'verify', title: 'Check it yourself', body: <>
        <Code>{`npx tsx tests/security.ts https://societyagent.fun`}</Code>
        <P>45 checks across auth guards, SIWE format, cookie flags, CSRF, input abuse, headers and secrets in the client bundle, each with a severity. A finding of any severity fails the run.</P></> },
      { id: 'contract-wallets', title: 'Smart-contract wallets', body: <><P>An ordinary wallet signs with a key, and the server recovers the address from the signature with no network call. A smart-contract wallet (a Safe, Coinbase Smart Wallet, any EIP-1271 account) has no key: its contract decides whether a signature is valid. So the server asks the contract, on the network named in the sign-in message it issued, through a node the operator configured in <M>RPC_URLS</M>.</P><UL><li>The network is taken from the message the server stored, never from the request, and a client cannot supply a node.</li><li>If the node is down or slow, sign-in fails; it is never treated as valid.</li><li>The answer is trusted only for the address the user named, so one contract cannot vouch for another.</li><li>Tested against real contracts on a local EVM node, including a two-owner wallet that needs both signatures.</li><li>Use a node you have an account with for real traffic. A free public node rate-limits bursts: the server then answers “could not check your contract wallet right now” and the user can simply retry. That outcome is logged on the server (kind <M>wallet-rpc</M>) so you can see it.</li></UL></> },
      { id: 'report', title: 'Reporting a vulnerability', body: <P>Please report privately (the repository’s “Report a vulnerability” form or the contact on the repository profile) rather than in a public issue. We aim to acknowledge reports within 72 hours.</P> },
      { id: 'honest', title: 'Known gaps', body: <Callout kind="honest">Smart-contract wallets (Safe and other EIP-1271 accounts) sign in only on Ethereum mainnet unless the operator configures more networks, and only while the network node the server asks is reachable; if it is not, sign-in fails closed with a clear message. A wallet that is not deployed yet cannot sign in. The session lasts seven days without rotation. The global AI quota can be exhausted by one determined abuser, which fails safe (AI stops, the rest keeps working).</Callout> },
    ],
  },
  {
    slug: 'testing', title: 'Testing and contributing', group: 'Run it yourself',
    tagline: 'One command for the checks that run offline, and a set of live suites for a deployed copy.',
    keywords: ['test', 'ci', 'lint', 'contribute', 'unit', 'playwright', 'e2e', 'engine', 'pull request'],
    sections: [
      { id: 'offline', title: 'Offline checks', body: <>
        <Code>{`npm test      # typecheck + lint + unit tests (no network, no browser)`}</Code>
        <P>The unit tests cover the engine, the lab statistics, custom scenarios, street plans, per-resident tweaks, reports, the documentation and the compatibility fingerprints.</P></> },
      { id: 'live', title: 'Live suites', body: <>
        <Table head={['Command', 'What it proves']} mono={[0]} rows={[
          ['tests/e2e.ts <url>', 'Sign-in, private runs, sharing, reproducibility, the AI endpoints'],
          ['tests/security.ts <url>', '45 security and abuse checks'],
          ['tests/ui.ts <url>', 'The app in a real browser'],
          ['tests/lab-ui.ts <url>', 'The lab: run, verdicts, shareable links, hostile links'],
          ['tests/custom-ui.ts / custom-api.ts <url>', 'Custom scenarios and town character, through the UI and the API'],
          ['tests/layouts-ui.ts / layouts-api.ts <url>', 'Street plans, per-resident tweaks, reports and PDF'],
          ['tests/minds.ts / minds-ui.ts <url>', 'Agent minds against a real model'],
          ['tests/docs-ui.ts <url>', 'Every documentation page, search and navigation'],
        ]} />
        <P>Live suites need Playwright’s Chromium (<M>npx playwright install chromium</M>). The CI workflow <M>Live checks</M> runs them against a URL you give it.</P></> },
      { id: 'rules', title: 'Before you open a pull request', body: <UL><li>Keep the engine deterministic (see <D to="reproducibility">Reproducibility</D>).</li><li>Language-model output may change wording, never simulation state.</li><li>Run <M>npm test</M>; if you touched <M>functions/</M> or sign-in, also run the security and UI suites against a preview deployment.</li><li>Add a test for anything you fix.</li></UL> },
    ],
  },
  {
    slug: 'faq', title: 'FAQ and troubleshooting', group: 'Help',
    tagline: 'Short answers to the questions people actually ask, and what to do when something does not work.',
    keywords: ['faq', 'help', 'troubleshooting', 'problem', 'error', 'wallet', 'not working', 'blank', 'why'],
    sections: [
      { id: 'general', title: 'General', body: <Table head={['Question', 'Answer']} rows={[
        ['Do I need a wallet?', 'No. Only saving, sharing and the AI layer need a sign-in. The simulation, the lab and reports do not.'],
        ['Does signing in cost anything?', 'No. You sign a message; there is no transaction and no gas.'],
        ['Is it a prediction of a real town?', 'No. See Limits and honesty.'],
        ['Why did my run end at a different number than someone else’s?', 'Different seed. Same seed, scenario and interventions give the same result for everyone.'],
        ['Why does the lab say “no clear difference”?', 'The option did not change the outcome by more than chance across these towns. Try more towns, or a different measure.'],
        ['Are my saved runs public?', 'Never, unless you create a share link.'],
      ]} /> },
      { id: 'problems', title: 'When something does not work', body: <Table head={['What you see', 'Why, and what to do']} rows={[
        ['Sign in does nothing, or the wallet list is empty', 'The wallet modal needs a Reown project id and your domain on its allowlist. Without one, only an injected browser wallet works. See Self-hosting → Wallet.'],
        ['“AI is not configured”', 'The deployment has no AI_* variables. The simulation still works; only voices, interviews, analysis and minds need them.'],
        ['“AI limit reached for this hour”', 'You reached a per-wallet, per-network or deployment-wide quota. Wait for the window to pass.'],
        ['“Challenge expired or already used”', 'The sign-in message is valid for five minutes and once. Click Sign in again.'],
        ['“You have 200 saved runs”', 'Delete some under My runs.'],
        ['A shared link says “not found”', 'The run was never shared, was unshared, or was deleted. The three look identical on purpose.'],
        ['Blank page after a deploy', 'A stale cached script. Hard-refresh. If it persists, check the browser console for a Content-Security-Policy violation (a third-party origin missing from connect-src).'],
        ['A lab link opens an empty lab', 'The link was truncated (over 4000 characters) or edited. Re-create it from the lab.'],
      ]} /> },
    ],
  },
]
