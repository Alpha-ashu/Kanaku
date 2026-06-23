/**
 * Redis-free workload stub.
 *
 * Kanaku no longer depends on Redis/Dragonfly. The rate-limit, idle-session and
 * PIN-unlock modules, plus the socket identity cache, used to ask this factory
 * for a purpose-keyed client and fall back to their own in-memory path when it
 * returned null (local dev without Redis). We now make that the only path:
 * `getPurposeClient` always returns null and every workload reports 'disabled',
 * so each caller transparently uses its in-process Map.
 *
 * The exported surface is kept intact so callers compile unchanged.
 */
export type RedisPurpose = 'bullmq' | 'cache' | 'session' | 'ratelimit';

export type PurposeStatus = 'disabled' | 'connecting' | 'connected' | 'error';

/**
 * Minimal Redis-command surface the (now Redis-free) callers still reference
 * inside their `if (client) { … }` guards. The factory always returns null at
 * runtime, so these methods are never actually invoked — the type just keeps the
 * guarded branches compiling without touching every call site.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  pexpire(key: string, ms: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
}

/** No Redis client in single-instance mode — callers fall back to in-memory. */
export function getPurposeClient(_purpose: RedisPurpose): RedisLike | null {
  return null;
}

export function getPurposeStatus(_purpose: RedisPurpose): PurposeStatus {
  return 'disabled';
}

export function isPurposeReady(_purpose: RedisPurpose): boolean {
  return false;
}

export interface WorkloadHealth {
  status: PurposeStatus | 'error';
  latencyMs?: number;
  error?: string;
}

/** Health snapshot — every workload is intentionally disabled (no Redis). */
export async function getRedisHealth(
  purposes: RedisPurpose[] = ['cache', 'session', 'ratelimit'],
): Promise<{
  workloads: Record<string, WorkloadHealth>;
  server?: { usedMemory?: string; connectedClients?: string };
}> {
  const workloads: Record<string, WorkloadHealth> = {};
  for (const purpose of purposes) workloads[purpose] = { status: 'disabled' };
  return { workloads };
}

/** Nothing to close. Kept for the server shutdown wiring. */
export async function closePurposeClients(): Promise<void> {
  /* no-op */
}
