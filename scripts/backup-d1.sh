#!/usr/bin/env bash
# Full logical backup of the D1 database to a local file (schema + data). Run from the repo root with Cloudflare credentials in the environment.
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/backup-d1.sh [database-name]
set -euo pipefail
DB="${1:-society-agent}"
OUT="backups/${DB}-$(date -u +%Y%m%dT%H%M%SZ).sql"
mkdir -p backups && chmod 700 backups
npx wrangler d1 export "$DB" --remote --output "$OUT"
chmod 600 "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
