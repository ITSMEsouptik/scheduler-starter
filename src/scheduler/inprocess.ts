import { query } from '../common/db.js';

type TaskRow = {
  id: string;
  name: string;
  type: string;
  status: string;
};

async function getReadyTasks(runId: string): Promise<TaskRow[]> {
  // A task is ready if all its dependencies succeeded and it's still pending
  const sql = `
    SELECT t.*
    FROM tasks t
    WHERE t.run_id = $1
      AND t.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM task_dependencies d
        JOIN tasks dep ON dep.run_id = d.run_id AND dep.name = d.depends_on
        WHERE d.run_id = t.run_id AND d.task_name = t.name AND dep.status <> 'succeeded'
      )
  `;
  return await query<TaskRow>(sql, [runId]);
}

async function markStatus(taskId: string, status: string, errorText?: string) {
  if (errorText) {
    await query('UPDATE tasks SET status=$1, finished_at=now(), error_text=$2 WHERE id=$3', [status, errorText, taskId]);
  } else {
    await query('UPDATE tasks SET status=$1, finished_at=now() WHERE id=$2', [status, taskId]);
  }
}

async function executeTask(task: TaskRow) {
  // M1: stub handlers by type
  await query('UPDATE tasks SET status=$1, started_at=now(), attempt=attempt+1 WHERE id=$2', ['running', task.id]);
  try {
    if (task.type === 'echo') {
      await new Promise(r => setTimeout(r, 100)); // simulate work
    } else if (task.type === 'http') {
      // TODO: implement simple fetch call (skipped offline)
      await new Promise(r => setTimeout(r, 150));
    } else if (task.type === 'shell') {
      await new Promise(r => setTimeout(r, 200));
    } else {
      throw new Error('Unknown task type ' + task.type);
    }
    await markStatus(task.id, 'succeeded');
  } catch (e: any) {
    await markStatus(task.id, 'failed', e?.message || String(e));
  }
}

export async function runInProcess(runId: string) {
  console.log('[Scheduler] Starting in-process execution for run', runId);
  while (true) {
    const ready = await getReadyTasks(runId);
    if (ready.length === 0) {
      // Check if all tasks are terminal
      const remain = await query<{cnt:number}>(
        "SELECT count(*)::int as cnt FROM tasks WHERE run_id=$1 AND status IN ('pending','running','ready')",
        [runId]
      );
      if (remain[0].cnt === 0) break;
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    // Run ready tasks concurrently (basic fan-out for M1)
    await Promise.all(ready.map(executeTask));
  }

  // Update run status
  const anyFailed = await query<{cnt:number}>("SELECT count(*)::int as cnt FROM tasks WHERE run_id=$1 AND status='failed'", [runId]);
  const status = anyFailed[0].cnt > 0 ? 'failed' : 'succeeded';
  await query("UPDATE workflow_runs SET status=$1, finished_at=now() WHERE id=$2", [status, runId]);
  console.log('[Scheduler] Run completed with status', status);
}

// Allow manual run via CLI: tsx src/scheduler/inprocess.ts <runId>
if (process.argv[2]) {
  runInProcess(process.argv[2]).then(() => process.exit(0));
}
