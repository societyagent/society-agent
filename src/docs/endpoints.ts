/**
 * The public API, as data. `tests/docs.test.ts` compares this list with the handler files in `functions/api/`
 * (every handler is documented, every documented endpoint exists with that HTTP method), so the manual cannot drift from the code.
 */
export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export interface EndpointDoc {
  method: Method; path: string; file: string
  who: 'public' | 'session' | 'session + AI configured' | 'operator'
  summary: string
  body?: string; ok: string; errors: string[]
}

export const ENDPOINTS: EndpointDoc[] = [
  { method: 'GET', path: '/api/agent/capabilities', file: 'functions/api/agent/capabilities.ts', who: 'public',
    summary: 'Machine-readable discovery for external agents. Lists only live, non-custodial tools and links to OpenAPI and llms.txt.', ok: '200 { "protocol": "society-agent/v1", "tools": […] }', errors: [] },
  { method: 'POST', path: '/api/agent/simulate', file: 'functions/api/agent/simulate.ts', who: 'public',
    summary: 'Run a bounded deterministic town simulation without saving it or calling an AI model. The result is a model of an invented town, not a forecast.', body: '{ "cfg": { … }, "ticks": 12…144, "interventions": [] }', ok: '200 { "cfg", "ticks", "interventions", "result": { "final", "report", "metrics", "events" } }', errors: ['400 invalid scenario or interventions', '429 per-network or deployment-wide agent simulation limit reached'] },
  { method: 'POST', path: '/api/agent/compare', file: 'functions/api/agent/compare.ts', who: 'public',
    summary: 'Experiment Lab for agents: 2-4 options simulated in the same random towns and compared with a paired test. Bounded to a small number of simulated days, nothing is stored and no AI model is called.', body: '{ "template": "water", "n": 20, "outcome": "final", "conds": [ { "label": "Do nothing", "kind": "none" }, { "label": "Statement", "kind": "announce", "text": "…", "hour": 12, "stance": -0.6 } ] }', ok: '200 { "rows": […], "findings": […], "towns": 20 }', errors: ['400 invalid experiment', '429 per-network or deployment-wide agent limit reached'] },
  { method: 'POST', path: '/api/auth/challenge', file: 'functions/api/auth/challenge.ts', who: 'public',
    summary: 'Ask for a sign-in message (EIP-4361, single use, 5 minutes). Signing it is free: no gas, no transaction.',
    body: '{ "address": "0x…", "chainId": 1 }', ok: '200 { "id": "…", "message": "…" }', errors: ['400 invalid address or chain id', '429 too many attempts from this network'] },
  { method: 'POST', path: '/api/auth/verify', file: 'functions/api/auth/verify.ts', who: 'public',
    summary: 'Exchange the signed message for a session. The server sets the `__Host-sa_session` cookie and also returns the token for non-browser clients.',
    body: `{
  "id": "…",                         // from /api/auth/challenge
  "address": "0x…",
  "signature": "0x…"                 // the wallet's signature of the message
}`, ok: '200 { "token": "…", "address": "0x…", "expiresAt": 1790000000000 } + Set-Cookie', errors: ['400 missing fields, or challenge expired / already used', '401 invalid signature or wrong wallet', '429 too many attempts'] },
  { method: 'GET', path: '/api/auth/me', file: 'functions/api/auth/me.ts', who: 'session',
    summary: 'Who am I? Also the cheapest way to test whether a session is still valid.', ok: '200 { "address": "0x…" }', errors: ['401 not signed in or expired'] },
  { method: 'DELETE', path: '/api/auth/me', file: 'functions/api/auth/me.ts', who: 'public',
    summary: 'Sign out: revokes the session on the server and clears the cookie.', ok: '200 { "ok": true }', errors: [] },
  { method: 'GET', path: '/api/runs', file: 'functions/api/runs/index.ts', who: 'session',
    summary: 'Your saved runs, newest first (summaries only, at most 100).', ok: '200 { "runs": [{ "id", "name", "template", "ticks", "final_informed", "final_mean", "shared", "created_at" }] }', errors: ['401 not signed in'] },
  { method: 'POST', path: '/api/runs', file: 'functions/api/runs/index.ts', who: 'session',
    summary: 'Save a run. You send only the inputs (scenario, length, interventions). The server replays the engine itself and stores its own metrics, events and report, so results cannot be forged.',
    body: `{
  "cfg": { … },                      // see “Run and experiment formats”
  "ticks": 144,                      // 12 to 288
  "interventions": [
    { "tick": 36, "iv": { "type": "announce", "text": "…", "stance": -0.4 } }
  ]
}`, ok: '201 { "id": "16-hex" }',
    errors: ['400 no news text, or invalid interventions', '401 not signed in', '409 you already have the maximum number of saved runs', '429 save limit reached'] },
  { method: 'GET', path: '/api/runs/:id', file: 'functions/api/runs/[id].ts', who: 'public',
    summary: 'A run in full (config, interventions, metrics, events, report). The owner can always read it; everyone else only when it is shared. The owner’s wallet address is never included.',
    ok: '200 { "id", "name", "template", "ticks", "shared", "createdAt", "cfg", "interventions", "metrics", "events", "report", "isOwner" }', errors: ['404 not found, or private and you are not the owner (the two look identical on purpose)'] },
  { method: 'PATCH', path: '/api/runs/:id', file: 'functions/api/runs/[id].ts', who: 'session',
    summary: 'Owner only: turn the public share link on or off.', body: '{ "shared": true }', ok: '200 { "shared": true }', errors: ['400 shared must be true or false', '401 not signed in', '404 not your run'] },
  { method: 'DELETE', path: '/api/runs/:id', file: 'functions/api/runs/[id].ts', who: 'session',
    summary: 'Owner only: delete a run.', ok: '200 { "ok": true }', errors: ['401 not signed in', '404 not your run'] },
  { method: 'POST', path: '/api/ai', file: 'functions/api/ai.ts', who: 'session + AI configured',
    summary: 'The language-model layer. `kind` is one of `interview`, `voices`, `decide`, `analysis`. See “The AI layer”.',
    body: `{
  "kind": "interview",               // interview | voices | decide | analysis
  "agent": 3,
  "question": "…",
  "news": "…"
}                                    // other kinds take other fields; the AI-layer page lists them`, ok: '200 { "answer" } | { "lines" } | { "decisions" } | { "analysis" }',
    errors: ['400 invalid request', '401 not signed in', '429 a per-wallet, per-network or global hourly limit was reached', '502 the model could not answer', '503 AI is not configured on this deployment'] },
  { method: 'GET', path: '/api/health', file: 'functions/api/health.ts', who: 'public',
    summary: 'Liveness plus a database round trip. Reveals nothing beyond up/down and latency.', ok: '200 { "ok": true, "db": "up", "ms": 4 }', errors: ['503 { "ok": false, "db": "down" }'] },
  { method: 'POST', path: '/api/client-error', file: 'functions/api/client-error.ts', who: 'public',
    summary: 'The browser reports uncaught errors and CSP violations. Always answers 202/204, never trusted for anything but triage. Run ids in the route are stripped before storing.',
    body: '{ "kind": "error" | "unhandledrejection" | "csp", "message", "route", "detail" }', ok: '202 { "ok": true } (204 when rate limited)', errors: [] },
  { method: 'GET', path: '/api/ops/summary', file: 'functions/api/ops/summary.ts', who: 'operator',
    summary: 'Operator digest: errors grouped by fingerprint, audit counts for the last 24 hours, totals. Needs the `HEALTH_TOKEN` secret; answers 404 when it is unset or wrong.',
    ok: '200 { "windowHours": 24, "errors": […], "audit": […], "totals": { "users", "runs" } }', errors: ['404 not configured, or wrong token'] },
]

/** Every environment variable / secret the project reads. Checked against the source by `tests/docs.test.ts`. */
export const ENV_VARS: { name: string; where: string; required: string; what: string }[] = [
  { name: 'DB', where: 'Pages binding (D1)', required: 'yes', what: 'The D1 database. Bound as `DB` in `wrangler.toml`.' },
  { name: 'RPC_URLS', where: 'Pages secret / `.dev.vars`', required: 'optional', what: 'JSON object of chain id to https RPC URL, e.g. `{"1":"https://…"}`. Needed only to let smart-contract wallets (Safe and other EIP-1271 accounts) sign in: the server asks the wallet contract whether the signature is valid. Without it, ordinary wallets still work and contract wallets get a clear message. Use a node you have an account with for real traffic: free public nodes rate-limit bursts.' },
  { name: 'AI_BASE_URL', where: 'Pages secret / `.dev.vars`', required: 'for AI features', what: 'Base URL of any API that speaks the chat-completions format. The app calls `{AI_BASE_URL}/chat/completions`.' },
  { name: 'AI_API_KEY', where: 'Pages secret / `.dev.vars`', required: 'for AI features', what: 'Key for that endpoint. Sent only from the server, never to the browser.' },
  { name: 'AI_MODEL', where: 'Pages secret / `.dev.vars`', required: 'for AI features', what: 'Model name to request first.' },
  { name: 'AI_FALLBACK_MODEL', where: 'Pages secret / `.dev.vars`', required: 'optional', what: 'Tried when the first model errors or times out.' },
  { name: 'HEALTH_TOKEN', where: 'Pages secret', required: 'optional', what: 'Enables `/api/ops/summary` (bearer token). Without it the endpoint answers 404.' },
  { name: 'VITE_REOWN_PROJECT_ID', where: 'Build time (`.env.local`)', required: 'optional', what: 'Public Reown project id for the wallet modal. Without it, sign-in falls back to an injected browser wallet.' },
  { name: 'ALERT_WEBHOOK', where: 'Ops worker secret', required: 'optional', what: 'Any https endpoint that accepts JSON; receives uptime and error alerts.' },
]
