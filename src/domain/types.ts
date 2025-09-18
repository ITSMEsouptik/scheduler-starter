import { z } from 'zod';

export const RetryPolicy = z.object({
  maxAttempts: z.number().int().min(0).default(0),
  backoff: z.object({
    initialMs: z.number().int().min(0).default(1000),
    factor: z.number().min(1).default(2),
    jitter: z.number().min(0).max(1).default(0.1),
  }).default({ initialMs: 1000, factor: 2, jitter: 0.1 })
});

export const TaskSpec = z.object({
  name: z.string(),
  type: z.enum(['echo','http','shell']).default('echo'),
  params: z.record(z.any()).default({}),
  dependsOn: z.array(z.string()).default([]),
  retry: RetryPolicy.default({ maxAttempts: 0, backoff: { initialMs: 1000, factor: 2, jitter: 0.1 } })
});

export const WorkflowSpec = z.object({
  name: z.string(),
  version: z.number().int().min(1).default(1),
  tasks: z.array(TaskSpec).min(1),
  schedule: z.string().optional() // cron (M3)
});

export type WorkflowSpecT = z.infer<typeof WorkflowSpec>;
export type TaskSpecT = z.infer<typeof TaskSpec>;
