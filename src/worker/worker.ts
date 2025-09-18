import { initAmqp } from '../queue/amqp.js';
import { query } from '../common/db.js';

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672/';
const EXCHANGE = process.env.AMQP_EXCHANGE || 'scheduler.tasks';
const QUEUE = process.env.AMQP_QUEUE || 'tasks.all';
const BINDING = process.env.AMQP_BINDING || 'task.*'; // consume all types
const PREFETCH = Number(process.env.WORKER_PREFETCH || 20);

async function claimTask(taskId: string): Promise<boolean> {
  const res = await query<any>(
    "UPDATE tasks SET status='running', started_at=now(), attempt=attempt+1 WHERE id=$1 AND status IN ('ready','pending') RETURNING id",
    [taskId]
  );
  return res.length > 0;
}

async function finishTask(taskId: string, ok: boolean, errText?: string) {
  if (ok) {
    await query("UPDATE tasks SET status='succeeded', finished_at=now() WHERE id=$1", [taskId]);
  } else {
    await query("UPDATE tasks SET status='failed', finished_at=now(), error_text=$2 WHERE id=$1", [taskId, errText || 'error']);
  }
  // If all tasks terminal, set run status
  const run = await query<any>("SELECT run_id FROM tasks WHERE id=$1", [taskId]);
  const runId = run[0].run_id;
  const remaining = await query<{cnt:number}>(
    "SELECT count(*)::int as cnt FROM tasks WHERE run_id=$1 AND status IN ('pending','ready','running')",
    [runId]
  );
  if (remaining[0].cnt === 0) {
    const anyFailed = await query<{cnt:number}>(
      "SELECT count(*)::int as cnt FROM tasks WHERE run_id=$1 AND status='failed'",
      [runId]
    );
    const status = anyFailed[0].cnt > 0 ? 'failed' : 'succeeded';
    await query("UPDATE workflow_runs SET status=$1, finished_at=now() WHERE id=$2", [status, runId]);
  }
}

async function execute(taskId: string, type: string) {
  // Simulation of handlers
  try {
    if (type === 'echo') {
      await new Promise(r => setTimeout(r, 120));
    } else if (type === 'http') {
      await new Promise(r => setTimeout(r, 180));
    } else if (type === 'shell') {
      await new Promise(r => setTimeout(r, 220));
    } else {
      throw new Error('Unknown task type ' + type);
    }
    await finishTask(taskId, true);
  } catch (e: any) {
    await finishTask(taskId, false, e?.message || String(e));
  }
}

async function main() {
  const { conn, ch } = await initAmqp({ url: AMQP_URL, exchange: EXCHANGE });
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(QUEUE, EXCHANGE, BINDING);
  await ch.prefetch(PREFETCH);
  console.log('[Worker] waiting for tasks...');

  ch.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      const { taskId, type } = data;
      // Idempotency: only one worker can claim; otherwise ack and drop duplicate
      const claimed = await claimTask(taskId);
      if (!claimed) {
        ch.ack(msg);
        return;
      }
      await execute(taskId, String(type));
      ch.ack(msg);
    } catch (e) {
      console.error('Worker message error', e);
      // Requeue once (basic), otherwise ack to avoid tight loop (could DLQ in M3)
      ch.nack(msg, false, true);
    }
  });
}

main().catch(err => {
  console.error('Worker fatal', err);
  process.exit(1);
});
