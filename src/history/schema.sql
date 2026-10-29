-- Run history (plan §4.26, I5). user_version tracks migrations.
CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  started_at    INTEGER NOT NULL,           -- epoch ms
  target        TEXT,
  app_commit    TEXT,
  build         TEXT,
  install_mode  TEXT CHECK (install_mode IN ('none','auto') OR install_mode IS NULL),
  flags_source  TEXT,
  result        TEXT CHECK (result IN ('pass','fail','infra','aborted','running') OR result IS NULL)
);
CREATE TABLE IF NOT EXISTS cases (
  run_id       TEXT NOT NULL REFERENCES runs(run_id),
  case_id      TEXT NOT NULL,              -- e.g. EP-03
  device_id    TEXT NOT NULL,
  started_at   INTEGER NOT NULL,           -- epoch ms; added for the A8 flake-report index
  status       TEXT NOT NULL CHECK (status IN ('passed','failed','skipped','broken','infra')),
  duration_ms  INTEGER,
  infra_code   TEXT,
  retried      INTEGER NOT NULL DEFAULT 0 CHECK (retried IN (0,1)),
  skip_reason  TEXT
);
CREATE TABLE IF NOT EXISTS leases (
  run_id          TEXT NOT NULL REFERENCES runs(run_id),
  role            TEXT NOT NULL,
  account_ref     TEXT NOT NULL,           -- op:// reference, never a value
  device_id       TEXT NOT NULL,
  taken_at        INTEGER NOT NULL,
  released_at     INTEGER,
  serial_takeover INTEGER NOT NULL DEFAULT 0 CHECK (serial_takeover IN (0,1))  -- v3.1 A4
);
-- v3.1 A8
CREATE INDEX IF NOT EXISTS cases_case_time ON cases(case_id, started_at DESC);
CREATE INDEX IF NOT EXISTS cases_run ON cases(run_id);
CREATE INDEX IF NOT EXISTS leases_run ON leases(run_id);
