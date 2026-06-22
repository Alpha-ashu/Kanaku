/**
 * Queue monitoring snapshot (§13).
 *
 * Aggregates, for every primary queue: job counts (waiting/active/completed/
 * failed/delayed), queue depth, worker health + concurrency, average processing
 * time, and the size of the paired dead-letter queue. Exposed to admins via
 * GET /api/v1/health/queues so queue health is observable in production.
 */
import { getQueue, PRIMARY_QUEUE_NAMES, dlqName } from '../config/queue';
import { getWorkerRuntimeStats } from './index';

export interface QueueSnapshot {
  name: string;
  depth: number;
  counts: Record<string, number>;
  worker: {
    running: boolean;
    concurrency: number;
    completed: number;
    failed: number;
    avgProcessingMs: number;
  };
  deadLetter: { name: string; size: number };
}

export interface QueueMonitoringSnapshot {
  timestamp: string;
  queues: QueueSnapshot[];
}

export async function getQueueMonitoringSnapshot(): Promise<QueueMonitoringSnapshot> {
  const queues: QueueSnapshot[] = [];

  for (const name of PRIMARY_QUEUE_NAMES) {
    const queue = getQueue(name);
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );

    const dlq = getQueue(dlqName(name));
    const dlqCounts = await dlq.getJobCounts('waiting', 'active', 'completed', 'failed');
    const dlqSize =
      (dlqCounts.waiting || 0) +
      (dlqCounts.active || 0) +
      (dlqCounts.completed || 0) +
      (dlqCounts.failed || 0);

    const stats = getWorkerRuntimeStats(name);

    queues.push({
      name,
      depth: (counts.waiting || 0) + (counts.delayed || 0),
      counts,
      worker: {
        running: stats?.running ?? false,
        concurrency: stats?.concurrency ?? 0,
        completed: stats?.completed ?? 0,
        failed: stats?.failed ?? 0,
        avgProcessingMs: stats?.avgProcessingMs ?? 0,
      },
      deadLetter: { name: dlqName(name), size: dlqSize },
    });
  }

  return { timestamp: new Date().toISOString(), queues };
}
