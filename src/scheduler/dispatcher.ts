import { initAmqp, publishTask } from '../queue/amqp.js';
import { query } from '../common/db.js';
import { acquireLock, releaseLock } from '../common/lock.js';

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672/';
const EXCHANGE = process.env.AMQP_EXCHANGE || 'scheduler.tasks';
const OWNER = `dispatcher-${Math.random().toString(36).slice(2)}`;

async function scanAndEnqueue() {
  // Find all tasks whose deps have succeeded and still pending
  const rows = await query<any>(`
    SELECT t.id, t.name, t.type, t.run_id, wr.workflow_id, wf.spec_json
    FROM tasks t
    JOIN workflow_runs wr ON wr.id = t.run_id
    JOIN workflows wf ON wf.id = wr.workflow_id
    WHERE t.status = 'pending'
      AND wr.status = 'running'
      AND NOT EXISTS (
        SELECT 1 FROM task_dependencies d
        JOIN tasks dep ON dep.run_id = d.run_id AND dep.name = d.depends_on
        WHERE d.run_id = t.run_id AND d.task_name = t.name AND dep.status <> 'succeeded'
      )
    LIMIT 200
  `);

  if (rows.length === 0) return 0;

  const { conn, ch } = await initAmqp({ url: AMQP_URL, exchange: EXCHANGE });
  try {
    for (const r of rows) {
      // publish first (allow duplicates), then try to flip to 'ready'
      const payload = { taskId: r.id, runId: r.run_id, name: r.name, type: r.type };
      const routingKey = `task.${r.type}`;
      await publishTask(ch, EXCHANGE, routingKey, payload);
      await query("UPDATE tasks SET status='ready' WHERE id=$1 AND status='pending'", [r.id]);
    }
  } finally {
    await ch.close().catch(()=>{});
    await conn.close().catch(()=>{});
  }
  return rows.length;
}

async function main() {
  console.log('[Dispatcher] starting...');
  while (true) {
    const got = await acquireLock('scheduler:leader', OWNER, 2000);
    if (got) {
      try {
        const n = await scanAndEnqueue();
        if (n > 0) console.log(`[Dispatcher] enqueued ${n} tasks`);
      } finally {
        await releaseLock('scheduler:leader', OWNER).catch(()=>{});
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(err => {
  console.error('Dispatcher error', err);
  process.exit(1);
});
