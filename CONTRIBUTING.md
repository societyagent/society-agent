# Contributing

```bash
npm install
npm test          # typecheck + lint + 12 engine unit tests (no network)
```
- The simulation engine (`src/engine/world.ts`) must stay deterministic: same config + seed + interventions → identical output. Never use `Math.random`, `Date.now`, or an unseeded sort inside it.
- LLM output may only change *wording*, never simulation state.
- Run `tests/security.ts` and `tests/ui.ts` against a preview deployment before opening a PR that touches `functions/` or auth.
