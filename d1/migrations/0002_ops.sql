-- Operational tables: error monitoring and a minimal security audit trail.
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  source TEXT NOT NULL,          -- 'client' | 'server'
  kind TEXT NOT NULL,            -- 'error' | 'unhandledrejection' | 'api' | 'csp'
  fingerprint TEXT NOT NULL,     -- hash of message+route, to group repeats
  message TEXT NOT NULL,
  route TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_errors_at ON errors(at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_fp ON errors(fingerprint, at DESC);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  event TEXT NOT NULL,           -- 'signin' | 'signout' | 'run_saved' | 'run_deleted' | 'run_shared' | 'run_unshared'
  actor TEXT NOT NULL,           -- wallet address (never exposed publicly)
  target TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC);
