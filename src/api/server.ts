import Fastify from 'fastify';
import { parseWorkflowYAML } from '../domain/yaml.js';
import { query } from '../common/db.js';

const app = Fastify({ logger: process.env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } } : true });

app.get('/health', async () => ({ ok: true }));

// Create/update workflow with YAML spec in body { yaml: string }
app.post('/workflows', async (req, reply) => {
  const body = req.body as any;
  const spec = parseWorkflowYAML(body?.yaml || '');
  const res = await query<{id: string}>(
    `INSERT INTO workflows(name, version, spec_json) VALUES ($1,$2,$3)
     ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, spec_json = EXCLUDED.spec_json
     RETURNING id`,
    [spec.name, spec.version, JSON.stringify(spec)]
  );
  reply.code(201).send({ id: res[0].id, name: spec.name, version: spec.version });
});

// Manual trigger: create run + seed tasks and dependencies
app.post('/workflows/:id/trigger', async (req, reply) => {
  const { id } = req.params as any;
  const wfRows = await query<any>('SELECT * FROM workflows WHERE id=$1', [id]);
  if (wfRows.length === 0) return reply.code(404).send({ error: 'not_found' });
  const wf = wfRows[0];
  const spec = wf.spec_json as any;

  const runRows = await query<{id:string}>(
    "INSERT INTO workflow_runs(workflow_id, status, started_at) VALUES ($1,'running', now()) RETURNING id",
    [id]
  );
  const runId = runRows[0].id;

  // seed tasks
  for (const t of spec.tasks) {
    await query("INSERT INTO tasks(run_id,name,type,status) VALUES ($1,$2,$3,'pending')",
      [runId, t.name, t.type]);
    for (const dep of (t.dependsOn || [])) {
      await query("INSERT INTO task_dependencies(run_id, task_name, depends_on) VALUES ($1,$2,$3)",
        [runId, t.name, dep]);
    }
  }

  reply.code(201).send({ runId });
});

// Get runs with optional filters
app.get('/runs', async (req, reply) => {
  const { workflowId, status } = (req.query as any) || {};
  const conds = [];
  const vals: any[] = [];
  if (workflowId) { vals.push(workflowId); conds.push(`workflow_id=$${vals.length}`); }
  if (status) { vals.push(status); conds.push(`status=$${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await query(`SELECT * FROM workflow_runs ${where} ORDER BY created_at DESC LIMIT 100`, vals);
  reply.send(rows);
});

// Get run detail (simple join)
app.get('/runs/:runId', async (req, reply) => {
  const { runId } = req.params as any;
  const run = (await query('SELECT * FROM workflow_runs WHERE id=$1', [runId]))[0];
  if (!run) return reply.code(404).send({ error: 'not_found' });
  const tasks = await query('SELECT * FROM tasks WHERE run_id=$1 ORDER BY created_at', [runId]).catch(async () => {
    return await query('SELECT * FROM tasks WHERE run_id=$1', [runId]);
  });
  reply.send({ run, tasks });
});

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  app.log.info(`API listening on :${port}`);
});
