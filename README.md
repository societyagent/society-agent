# Society Agent

An open-source **agent-based town simulation**. Residents with personas, routines and memories react to news,
talk to each other, and change their minds. You step in with announcements, compare runs, and read what changed.

> Status: early. The simulation engine is a transparent, seeded model; language models give residents a *voice*
> (spoken lines, interviews, a written analysis) but never change the outcome. Making agents reason with an LLM
> is the main roadmap item — see below.

## Features
- **Live 2D town** — pixel-art map, residents who walk the streets, talk, and carry memories
- **Opinion dynamics** — news spreads through conversations; trust, sociability and stubbornness shape who changes their mind
- **Step in** — public announcements or a whisper to one person; compare against a run with no intervention
- **Reproducible runs** — same seed + same interventions = identical result (verified in `tests/e2e.ts`)
- **Interviews** — talk to any resident, in character, grounded in what they heard and remember
- **Save, share, export** — wallet sign-in (no gas, no transactions), private-by-default runs, share links, JSON/CSV export

## Stack
React + Vite + Tailwind · Cloudflare Pages Functions · D1 (SQLite) · viem (signature verification) · any OpenAI-compatible LLM endpoint

## Run it locally
```bash
npm install
cp wrangler.example.toml wrangler.toml          # then put your own D1 database id in it
npx wrangler d1 create society-agent             # copy the id into wrangler.toml
npx wrangler d1 migrations apply society-agent --local
cp .dev.vars.example .dev.vars                   # optional: enables interviews / spoken lines / analysis
npm run build && npx wrangler pages dev dist
```
The simulation, map and saved runs work without any LLM configured; only the AI features need `AI_*` variables.

## Project layout
| Path | What it is |
|---|---|
| `src/engine/world.ts` | The deterministic simulation (agents, routing, conversations, opinion dynamics, report) |
| `src/engine/templates.ts` | Scenario templates |
| `src/components/Town.tsx` | Canvas renderer (tiles, sprites, bubbles) |
| `src/pages/Workspace.tsx` | App: dashboard, simulation, saved runs, replay |
| `functions/` | API: wallet auth, runs, LLM layer |
| `d1/migrations/` | Database schema |
| `tests/` | Engine determinism check and an end-to-end suite |

## Tests
```bash
npx tsx tests/engine-check.ts                         # engine: determinism, spread, intervention effect
npx tsx tests/e2e.ts https://your-deployment.pages.dev   # API: auth, privacy, sharing, reproducibility, AI
```

## Roadmap
- [ ] LLM-driven agents (perceive → remember → decide), with the rule-based engine as the deterministic baseline
- [ ] Pluggable environments (more than one town; custom maps via Tiled)
- [ ] Larger populations and multiple news items
- [ ] Batch experiments and run-vs-run comparison
- [ ] Self-hostable backend (Node + SQLite) alongside Cloudflare

## License
MIT — see [LICENSE](LICENSE). Map art notice in [NOTICE.md](NOTICE.md).

## Agent minds

Turn on **Agent minds** and residents who have heard the news decide for themselves whether to *warn*, *reassure*, *check the facts* or *stay quiet*, and say it in their own words (any OpenAI-compatible model).

The engine never calls a model. Each decision is **recorded as a run input**, validated by the server (known action, real resident, bounded effect, at most 40 per run) and applied deterministically. That is why a saved or shared run replays to the identical result for everyone.

## Experiment Lab

`/app/lab` runs one scenario across dozens of random towns under up to four options and compares them. Every option is run on the **same** towns (paired design), so each comparison is "this town with and without your move". Results include a plain-language verdict, the number of towns that agree, a 95% interval, an uncertainty-band chart, a CSV export and a share link that reproduces the exact numbers. It runs in the browser, needs no sign-in, and uses the same deterministic engine as the app (`src/engine/lab.ts`).
