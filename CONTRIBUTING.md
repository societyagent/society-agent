# Contributing

Thanks for helping. This is a small project with one hard rule and a few habits.

## Set up

```bash
npm install
npm test          # typecheck + lint + unit tests (offline, no browser)
```

Node 20 or newer. The live suites (`tests/*-ui.ts`, `security.ts`, `e2e.ts`) need a deployment URL and, for the UI ones, `npx playwright install chromium`. The docs list every suite under *Testing and contributing*.

## The hard rule: the engine is deterministic

Same configuration + seed + interventions must give an identical day, in every browser and on the server. That is what lets runs be saved, shared and verified.

- No `Math.random`, `Date.now` or unseeded sorting inside `src/engine/world.ts`.
- Every random draw consumes the generator in the same order regardless of input. Add new draws at the **end** of a tick, not in the middle.
- New options must default to "omitted", so older saved runs keep the same bytes.
- `tests/golden.test.ts` pins 36 full runs recorded from the original engine. If it fails, saved runs would stop replaying. Do not re-record it to make a change pass. If you change the rules on purpose, say so in your pull request.

## Other habits

- **Language-model output may change wording, never simulation state.** Where a model influences a run (Agent minds), its choice is recorded as an input first.
- **Numbers live in one place.** Quotas belong in `src/engine/limits.ts`. The API enforces them and the docs print them; `tests/docs.test.ts` fails if the two disagree.
- **The docs are tested.** Add an endpoint, an environment variable or a limit and the docs test will tell you what to document.
- **Inputs are validated on the server.** Clamp, truncate or reject; never trust the browser.
- Touching `functions/` or sign-in? Also run `tests/security.ts` and `tests/ui.ts` against a preview deployment.
- Add a test for anything you fix.

## Pull requests

Keep them focused, describe what you ran, and attach a screenshot for visual changes. CI must be green (typecheck, lint, unit tests, audit, build, and a scan that no secret value or provider name ships in the client bundle).
