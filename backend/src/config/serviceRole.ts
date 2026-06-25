/**
 * Service-role resolution for the API / Worker split (Infrastructure Part 1).
 *
 * A single Docker image powers two Fly.io process groups:
 *   - `app`    → `node dist/server.js`  — the only public-facing service
 *                (Express API, auth, Socket.IO). Runs NO background jobs.
 *   - `worker` → `node dist/worker.js`  — background jobs only
 *                (notification outbox, AI tasks, cleanup). No public port.
 *
 * Behaviour-preserving default
 * ----------------------------
 * `RUN_WORKERS_IN_API` is UNSET in local dev and on a single-machine prod, so
 * `runWorkersInApiProcess()` returns `true` and the API process keeps running
 * the background jobs in-process exactly as before — zero behaviour change.
 *
 * To activate the split, set `RUN_WORKERS_IN_API=false` on the API process
 * group (see fly.toml `[env]`). The jobs then run ONLY on the dedicated worker
 * machine, so a slow/failing job can never affect API responsiveness.
 *
 * The worker entrypoint (`worker.ts`) ALWAYS runs the jobs and ignores this
 * flag — that is its sole job.
 */

/** True when the API process should also run background jobs in-process. */
export const runWorkersInApiProcess = (): boolean =>
  process.env.RUN_WORKERS_IN_API !== 'false';

/**
 * Human-readable name for the current process — stamped on every structured log
 * line. Resolved from SERVICE_NAME when set, else inferred from the entrypoint
 * (dist/worker.js vs dist/server.js) so the worker self-identifies without any
 * env needing to be set before imports are hoisted.
 */
export const serviceName = (): 'api' | 'worker' => {
  if (process.env.SERVICE_NAME === 'worker' || process.env.SERVICE_NAME === 'api') {
    return process.env.SERVICE_NAME;
  }
  return (process.argv[1] || '').includes('worker') ? 'worker' : 'api';
};
