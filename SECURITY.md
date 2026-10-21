# Security policy

Please report vulnerabilities privately (GitHub “Report a vulnerability”, or the contact in the repository profile) rather than in a public issue. We aim to acknowledge reports within 72 hours.

## Model
- Sign-in is Sign-In with Ethereum (EIP-4361). The server issues a single-use, 5-minute message bound to its own domain; the signature is verified on the server.
- The session credential lives in an `HttpOnly; Secure; SameSite=Strict` `__Host-` cookie. Page scripts cannot read it. State-changing calls also require a same-origin `Origin`.
- Runs are private by default. Stored metrics are always recomputed by the server from the seeded engine, never accepted from the client.
- The API grants no CORS. The page runs under a strict Content-Security-Policy (see `public/_headers`).
- Rate limits: per-IP on sign-in, per-wallet and per-IP on runs and AI calls, plus a global AI cap.

## Verify it yourself
`npx tsx tests/security.ts https://your-deployment` runs 45 checks (auth guards, SIWE format, cookie flags, CSRF, input abuse, headers, secrets in the bundle).
