# Restoring the database

D1 Time Travel keeps 30 days of point-in-time history automatically.

```bash
npx wrangler d1 time-travel info society-agent                       # current bookmark
npx wrangler d1 time-travel info society-agent --timestamp=2026-10-21T03:17:00Z   # bookmark at a moment
npx wrangler d1 time-travel restore society-agent --bookmark=<bookmark>
```

For an off-platform copy, run `scripts/backup-d1.sh` (a plain SQL dump) from a scheduled job you control.
Backups contain wallet addresses and run data: store them with the same care as the database itself (`backups/` is git-ignored).
