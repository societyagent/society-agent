# @societyagent/mcp

An MCP server for [Society Agent](https://societyagent.fun): a deterministic simulation of how news spreads through an invented town.
Give your agent three read-only tools and it can run a scenario, or test whether an intervention makes a **clear** difference instead of guessing from one run.

- **No keys, no wallet, no spending.** It only calls the public agent API.
- **You cannot give it a URL, a header or a secret.** The tools accept a scenario and a list of interventions, nothing else.
- Results are a **model of an invented town, not a forecast of real people.**

## Install

```json
{
  "mcpServers": {
    "society-agent": { "command": "npx", "args": ["-y", "@societyagent/mcp"] }
  }
}
```

Or run from this repository: `cd mcp && npm install && node src/index.js`.

## Tools

| Tool | What it does |
|---|---|
| `society_status` | Live health and the tools the service offers. Call first. |
| `society_simulate` | One deterministic run (12–144 ten-minute steps) with optional announcements and whispers. Returns the final state, written findings, a short curve and key events. |
| `society_compare` | 2–4 options simulated in the **same random towns**, compared with a paired test. Says, per option versus the first, whether the difference is clear or could be chance. |

`society_compare` is bounded (10–30 towns, at most 60 simulated days per call) and counts against the service's hourly limit. On a rate-limit error, stop and report it.

## Configuration

| Variable | Default | |
|---|---|---|
| `SOCIETY_AGENT_URL` | `https://societyagent.fun` | Point it at your own deployment. Must be `https` (plain `http` only for localhost). |
| `SOCIETY_AGENT_TIMEOUT_MS` | `60000` | Clamped to 5 000–120 000. |

## Test

```bash
npm test                                            # config, request shaping, real stdio protocol
SOCIETY_AGENT_URL=https://societyagent.fun npm test # also runs a real simulation and comparison against the live service
```

MIT licensed.
