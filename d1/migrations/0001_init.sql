CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_challenges_address ON challenges(address);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  ticks INTEGER NOT NULL,
  cfg_json TEXT NOT NULL,
  ivs_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  events_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  final_informed REAL NOT NULL,
  final_mean REAL NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_owner ON runs(owner, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
