<p align="center">
  <img src="public/brand/society-mark.jpg" alt="Society Agent" width="72" />
</p>

<h1 align="center">Society Agent</h1>

<p align="center">
  An open-source <b>agent-based town simulation</b>.<br/>
  Residents with personalities, routines and memories react to news. You step in, then find out what <i>really</i> changes the outcome.
</p>

<p align="center">
  <a href="https://github.com/societyagent/society-agent/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/societyagent/society-agent/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%E2%89%A520-green.svg" />
</p>

---

**Live:** [societyagent.fun](https://societyagent.fun) · [App](https://societyagent.fun/app) · [Docs](https://societyagent.fun/docs)

## What it is

A small invented town. At 07:20 a piece of news breaks and two residents hear it first. Everyone then walks the streets, meets people and talks, and the news moves from person to person, changing minds as it goes. You can watch it, step in with an announcement or a whisper, interview any resident, and read a plain-language account of what happened.

What sets it apart is the **Experiment Lab**. One run can be luck, so the lab repeats the same day across dozens of random towns, the *same towns for every option*, and tells you whether a change made a difference bigger than chance, and by how much.

It is a model of one invented town with simple, readable rules. It is **not** a forecast of any real community.

## Features

| | |
|---|---|
| **Live 2D town** | Pixel-art map, residents who walk the streets, talk and remember. Three street plans. |
| **Opinion dynamics** | Bounded-confidence model. Trust, sociability, stubbornness and role weight decide who changes their mind. |
| **Experiment Lab** | Paired multi-town comparisons, 95% ranges, effect sizes, plain-language verdicts, shareable links, CSV. |
| **Your own scenario** | Write the news, name the two sides of the debate, choose who hears first, the kind of town and the street plan. Change one resident. |
| **Reports** | A printable write-up of any experiment, as a page, Markdown or PDF, rebuilt from its link. |
| **Reproducible** | Same seed, scenario and interventions give an identical day in any browser and on the server. |
| **Agent minds** *(optional)* | Residents choose to warn, reassure, verify or stay quiet. The choice is recorded as a run input, so runs still replay exactly. |
| **Save and share** | Wallet sign-in (a free signature, no transaction), private by default, share links, JSON/CSV export. |

The simulation, the lab and reports need **no account and no language model**. Models only add a voice (spoken lines, interviews, an analysis) and, if you turn it on, Agent minds.

## Documentation

The full manual lives in the app at **`/docs`** (quick start, concepts, the maths, every screen, the HTTP API, self-hosting, operations, security, FAQ). Several pages are generated from the code (limits, towns, street plans, endpoints, the cast), and a test fails if they drift.

## For agents

Agents can read [`SKILL.md`](SKILL.md), then discover the live contract at [`/api/agent/capabilities`](https://societyagent.fun/api/agent/capabilities), [`/openapi.json`](https://societyagent.fun/openapi.json), and [`/llms.txt`](https://societyagent.fun/llms.txt). The public `POST /api/agent/simulate` endpoint runs one bounded deterministic simulation, and `POST /api/agent/compare` tests 2–4 options in the same random towns with a paired test; neither stores anything, calls a model, or accepts wallet secrets. `mcp/` packages both as an MCP server (`npx -y @societyagent/mcp`).

## Run it locally

```bash
npm install
cp wrangler.example.toml wrangler.toml          # then put your own D1 database id in it
npx wrangler d1 create society-agent             # prints the id
npx wrangler d1 migrations apply society-agent --local
cp .dev.vars.example .dev.vars                   # optional: enables the AI features
npm run build && npx wrangler pages dev dist
```

Optional: set `VITE_REOWN_PROJECT_ID` in `.env.local` for the wallet modal (without it, sign-in falls back to an injected browser wallet). Deploying to your own Cloudflare account is covered in the docs under *Self-hosting*.

## Tests

```bash
npm test                          # typecheck + lint + unit tests (offline)
npx tsx tests/security.ts <url>   # 45 security and abuse checks against a deployment
npx tsx tests/e2e.ts <url>        # sign-in, privacy, sharing, reproducibility
npx tsx tests/lab-ui.ts <url>     # the lab in a real browser (also: ui, docs-ui, custom-ui, layouts-ui, ...)
```

`tests/golden.test.ts` replays 36 full days against fingerprints recorded from the original engine, so saved and shared runs can never silently stop replaying. See *Testing and contributing* in the docs for every suite.

## Project layout

| Path | What it is |
|---|---|
| `src/engine/world.ts` | The deterministic simulation: agents, street plans, routing, conversations, opinion dynamics |
| `src/engine/lab.ts` | Batch experiments and the statistics behind the verdicts |
| `src/engine/limits.ts` | Every quota in one place; the API enforces it and the docs print it |
| `src/engine/report.ts` | Pure function that turns a batch into a report (page and Markdown share it) |
| `src/pages/`, `src/components/`, `src/landing/` | App, lab, report, dashboard, landing |
| `src/docs/` | The documentation site |
| `functions/` | Cloudflare Pages Functions: auth, runs, AI layer, health, monitoring |
| `d1/migrations/` | Database schema |
| `ops/` | Scheduled worker: uptime probes, error alerts, quota and abuse alerts |
| `mcp/` | MCP server (`@societyagent/mcp`): simulate and compare, read-only |
| `tests/` | Unit tests and live suites |

## Roadmap

- [ ] Residents that plan across a day (perceive, remember, decide) instead of choosing one reaction
- [ ] Agent minds inside lab batches
- [ ] More maps, larger populations, competing news items
- [ ] Smart-contract wallet (EIP-1271) sign-in
- [ ] A self-hostable Node + SQLite backend alongside Cloudflare

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; the one hard rule is that the engine stays deterministic. Please report security problems privately, see [SECURITY.md](SECURITY.md). This project follows a [code of conduct](CODE_OF_CONDUCT.md).

## License and credits

MIT, see [LICENSE](LICENSE). Map art is derived from Kenney's *RPG Urban Pack* (CC0); see [NOTICE.md](NOTICE.md).
