---
name: society-agent
description: Run bounded deterministic town simulations for agent research.
version: 1.0.0
author: Society Agent, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [simulation, agents, research, deterministic]
    related_skills: []
---

# Society Agent

Use Society Agent to compare interventions in an invented town. It is a deterministic model for generating hypotheses, never a forecast about real people.

## When to Use

- Compare a public statement, whisper, or no action under the same simulated conditions.
- Produce reproducible metrics and a plain-language report for a proposed scenario.
- Do not use it for real-world predictions, diagnosis, surveillance, or deciding outcomes that affect people.

## Quick Start

1. Fetch `https://societyagent.fun/api/agent/capabilities`; require `protocol` to equal `society-agent/v1`.
2. Read `https://societyagent.fun/openapi.json` before constructing a request.
3. POST a bounded scenario to `https://societyagent.fun/api/agent/simulate`.
4. State that the result models one invented town and record the returned config, seed, and interventions for reproducibility.

## Request

Use the `terminal` tool or an HTTP client. The public endpoint stores nothing, does not call an AI model, and never accepts wallet secrets.

```json
{
  "cfg": {
    "name": "Water notice",
    "question": "Does a public notice reduce alarm?",
    "template": "water",
    "axis": ["Calm", "Alarmed"],
    "population": 12,
    "seed": 42,
    "news": { "text": "A water main broke.", "stance": 0.5, "startTick": 2, "seedRoles": ["official"] }
  },
  "ticks": 144,
  "interventions": [
    { "tick": 12, "iv": { "type": "announce", "text": "Water will be restored by 6pm.", "stance": -0.6 } }
  ]
}
```

## Interpretation

- Compare runs using the same config and seed; change only the intervention.
- `final.informed`, `final.mean`, `final.spread`, and `final.talks` are model outputs, not measurements of people.
- For uncertainty across towns, use the human-facing Experiment Lab at `https://societyagent.fun/app/lab` or run multiple seeds yourself.

## Limits

- One call permits 12–144 ticks and up to the validated intervention limit.
- The public endpoint is rate-limited per network and globally. On `429`, stop and retry later; never rotate identities to bypass it.
- Saved runs and AI features require a human-owned wallet session. Do not ask for, store, or transmit private keys, seed phrases, or signing secrets.

## Verification

- `GET /api/health` must return `{ "ok": true, "db": "up" }` before relying on a live call.
- Preserve the complete returned configuration and compare identical inputs twice when reproducibility matters.
- Read `https://societyagent.fun/llms.txt` for the current public contract.
