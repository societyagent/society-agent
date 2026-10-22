# Changelog

All notable changes. The project is early; versions follow `0.x`, so anything can still change.

## 0.1.0

**Simulation**
- Deterministic, seeded town engine: residents with roles, traits and memories, daily routines, conversations and a bounded-confidence opinion model.
- Three ready-made scenarios and *Your own scenario* (news, two sides of the debate, who hears first).
- Seven kinds of town (trusting, suspicious, tight-knit, isolated, nervous, easygoing, everyday), three street plans, changing one resident.
- Everything that was added later is optional and omitted by default, so a run made with the original settings stays byte-identical (pinned by `tests/golden.test.ts`).

**Experiment Lab**
- Paired comparisons over dozens of random towns, 95% ranges, effect sizes, plain-language verdicts, charts with bands, CSV, shareable links.
- Printable reports as a page, Markdown and PDF.

**AI layer (optional)**
- Spoken lines, resident interviews, a written analysis, and *Agent minds* (residents choose how to react; choices are recorded as run inputs so runs replay exactly).
- Works with any chat-completions compatible endpoint.

**App and docs**
- Guided three-step dashboard with a live map preview, shared navigation, sticky simulation controls and a legend.
- A documentation site at `/docs` (20 pages) with search; parts are generated from the code and tested against it.
- Accessibility: focus rings, 44px touch targets, skip links, AA contrast.

**Platform**
- Cloudflare Pages Functions and D1. Wallet sign-in (EIP-4361) with an `HttpOnly` `__Host-` session cookie, same-origin API, strict Content-Security-Policy, per-wallet, per-network and global rate limits.
- Results are recomputed by the server; the client cannot submit metrics.
- Health endpoint, error and CSP reporting, audit trail, an uptime worker, backups and restore notes.
- Tests: unit suites, a compatibility fixture, and live suites for security (45 checks), end-to-end, UI, lab, docs and the AI layer.

Map art: Kenney's *RPG Urban Pack* (CC0), recoloured.
