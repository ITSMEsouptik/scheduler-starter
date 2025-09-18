CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS workflows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  version      INT NOT NULL DEFAULT 1,
  spec_json    JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','paused','cancelled')),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','ready','running','succeeded','failed','dead_letter')),
  attempt      INT NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  result_json  JSONB,
  error_text   TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_run_id ON tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Minimal dependency table: edges task_name -> depends_on_name for a run
CREATE TABLE IF NOT EXISTS task_dependencies (
  run_id         UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  task_name      TEXT NOT NULL,
  depends_on     TEXT NOT NULL,
  PRIMARY KEY (run_id, task_name, depends_on)
);

-- Simple distributed lock table (Postgres-based for M1; Redis in app later)
CREATE TABLE IF NOT EXISTS locks (
  lock_key     TEXT PRIMARY KEY,
  owner        TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL
);
