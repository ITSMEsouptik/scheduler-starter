# Distributed Job Scheduler (Temporal‑lite) — M1 Starter

This is a minimal starter to ship **M1**:
- Define a workflow (YAML) of tasks with dependencies
- Store workflow spec in Postgres
- Trigger a **run**, seed tasks & edges
- Execute the run **in-process** in topological order (fan-out where possible)
- Inspect runs & tasks via API

## Stack
- TypeScript + Fastify
- Postgres (data), Redis (lock stub for future), RabbitMQ/Kafka (M2+ later)
- No ORM: raw SQL via `pg` for simplicity

## Quickstart

1) Start infra (Postgres, Redis):
```bash
docker compose up -d
```

2) Install deps & set env:
```bash
npm i
cp .env.example .env
export $(grep -v '^#' .env | xargs)
```

3) Create tables:
```bash
npm run db:setup
```

4) Run API (port 3000):
```bash
npm run dev:api
# health: GET http://localhost:3000/health
```

5) Create a workflow from YAML:
```bash
curl -X POST http://localhost:3000/workflows     -H 'content-type: application/json'     --data-binary @- <<'JSON'
{ "yaml": "$(sed -e 's/"/\"/g' sample/workflows/example.yml | tr -d '\n')" }
JSON
```

6) Trigger a run:
```bash
WORKFLOW_ID=$(psql "$DATABASE_URL" -t -A -c "SELECT id FROM workflows WHERE name='example-hello' ORDER BY created_at DESC LIMIT 1")
curl -X POST http://localhost:3000/workflows/$WORKFLOW_ID/trigger
# => { "runId": "..." }
```

7) Execute the run in-process (M1 acceptance):
```bash
RUN_ID=<from above>
npm run dev:scheduler -- src/scheduler/inprocess.ts $RUN_ID
```

8) Inspect:
```bash
curl "http://localhost:3000/runs/$RUN_ID"
```

## Next (M2 outline)
- Introduce MQ (RabbitMQ): enqueue `ready` tasks; workers consume & execute
- Add idempotency keys per (run_id, task_name, attempt)
- Implement retry policy + exponential backoff; DLQ table + metrics
- Redis lock for leader scheduler (cron), `acquireLock('scheduler:leader', ...)`

## Tables
See `db/schema.sql` for DDL. `task_dependencies` encodes DAG edges for each run.

## Notes
- This starter focuses on correctness & clarity. It is not production-hardened.
- Keep all design docs / ADRs in `/docs` (create the folder).


---
## M2 (Queue + Workers) Quickstart

1) Start RabbitMQ:
```bash
docker compose up -d rabbitmq
```

2) Run the dispatcher (scans DB and enqueues ready tasks):
```bash
npm run dev:dispatcher
```

3) Run one or more workers:
```bash
npm run dev:worker
# In another terminal, start more workers to scale out
```

4) Trigger a run as in M1. You should see dispatcher enqueue tasks and workers process them.
- Kill a worker process mid-run and verify tasks continue processing (at-least-once + idempotent claim).


---
## Developer Tooling (M1)

### Requirements
- Node.js LTS (>= 20.x) — recommended via `nvm`
- Docker Desktop (or Docker Engine) + Docker Compose v2
- `psql` client, `curl`, and `jq` (optional but handy)
- VS Code with extensions: Prettier, ESLint, YAML, Docker, REST Client

### Setup
```bash
npm i
npm run prepare                 # sets up Husky
npx husky add .husky/pre-commit "npx lint-staged"
```

### Useful Scripts
- `npm run lint` / `npm run format`
- `npm test` / `npm run test:watch`
- `make up` / `make down` / `make logs` / `make api` / `make scheduler RUN=<runId>`

### Pretty Logs in Dev
Fastify uses `pino-pretty` automatically when `NODE_ENV !== 'production'`.
