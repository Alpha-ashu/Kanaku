/**
 * Purpose-keyed Redis (Dragonfly) connection factory.
 *
 * Each backend workload runs on its own *logical database* so they cannot
 * interfere with one another (a `FLUSHDB` or a `cacheDeleteByPrefix` SCAN on the
 * cache must never touch BullMQ's keyspace, and vice-versa):
 *
 *   DB0 → BullMQ queues / workers   (BULLMQ_REDIS_URL)
 *   DB1 → response / profile cache  (CACHE_REDIS_URL)
 *   DB2 → sessions (idle + PIN gate)(SESSION_REDIS_URL)
 *   DB3 → rate limiting             (RATE_LIMIT_REDIS_URL)
 *
 * URL resolution precedence per workload:
 *   1. The workload's own env var (operator controls host AND db index).
 *   2. REDIS_URL with the workload's logical db index appended (/0../3).
 *   3. null  → caller falls open to its in-memory path.
 *
 * This indirection is what lets the same code run against a single shared
 * Dragonfly today and split workloads across dedicated instances later WITHOUT
 * code changes — you just point the per-workload env vars at different hosts.
 */
import Redis, { RedisOptions } from 'ioredis';
import { logger } from './logger';

export type RedisPurpose = 'bullmq' | 'cache' | 'session' | 'ratelimit';

export type PurposeStatus = 'disabled' | 'connecting' | 'connected' | 'error';

const PURPOSE_ENV: Record<RedisPurpose, string> = {
  bullmq: 'BULLMQ_REDIS_URL',
  cache: 'CACHE_REDIS_URL',
  session: 'SESSION_REDIS_URL',
  ratelimit: 'RATE_LIMIT_REDIS_URL',
};

/** Logical DB index per workload (see file header). */
const PURPOSE_DB: Record<RedisPurpose, number> = {
  bullmq: 0,
  cache: 1,
  session: 2,
  ratelimit: 3,
};

/**
 * Resolve the connection URL for a workload, or null when Redis is not
 * configured at all (local dev without Dragonfly → callers use in-memory).
 */
export function resolveRedisUrl(purpose: RedisPurpose): string | null {
  const explicit = process.env[PURPOSE_ENV[purpose]]?.trim();
  if (explicit) return explicit;

  const base = process.env.REDIS_URL?.trim();
  if (!base) return null;

  // Derive a per-workload URL by swapping in the logical db index. Preserves
  // scheme (redis/rediss), auth, host and port from REDIS_URL.
  try {
    const url = new URL(base);
    url.pathname = `/${PURPOSE_DB[purpose]}`;
    return url.toString();
  } catch {
    // Not a parseable URL — hand it to ioredis unchanged and let it report.
    return base;
  }
}

export function buildRedisOptions(purpose: RedisPurpose): RedisOptions {
  const url = resolveRedisUrl(purpose);
  const useTls = !!url && url.startsWith('rediss://');

  return {
    lazyConnect: true,
    enableReadyCheck: purpose !== 'bullmq',
    // BullMQ REQUIRES maxRetriesPerRequest=null on its (blocking) connection;
    // everything else fails fast so a Redis hiccup can't stall a request.
    maxRetriesPerRequest: purpose === 'bullmq' ? null : 0,
    connectTimeout: 3000,
    // No command timeout on BullMQ — its blocking pops are expected to wait.
    commandTimeout: purpose === 'bullmq' ? undefined : 2000,
    tls: useTls ? {} : undefined,
  };
}

// ── Shared singleton clients for the non-BullMQ workloads ───────────────────
// (BullMQ owns its own connection lifecycle in config/queue.ts.)
const clients = new Map<RedisPurpose, Redis | null>();
const statuses = new Map<RedisPurpose, PurposeStatus>();

/**
 * Lazily create (once) and return the singleton client for a workload, or null
 * when Redis is not configured. Status is tracked so callers can fall open to
 * their in-memory path while a connection is unhealthy.
 */
export function getPurposeClient(purpose: RedisPurpose): Redis | null {
  if (clients.has(purpose)) return clients.get(purpose) ?? null;

  const url = resolveRedisUrl(purpose);
  if (!url) {
    clients.set(purpose, null);
    statuses.set(purpose, 'disabled');
    return null;
  }

  const client = new Redis(url, buildRedisOptions(purpose));
  statuses.set(purpose, 'connecting');

  client.on('connect', () => {
    statuses.set(purpose, 'connected');
    logger.info(`Redis[${purpose}] connected (db ${PURPOSE_DB[purpose]})`);
  });
  client.on('error', (error) => {
    statuses.set(purpose, 'error');
    logger.warn(`Redis[${purpose}] error`, { error: error.message });
  });
  client.on('close', () => {
    if (statuses.get(purpose) !== 'disabled') statuses.set(purpose, 'connecting');
  });

  // Kick off the connection; failures surface via the 'error' handler above.
  client.connect().catch(() => statuses.set(purpose, 'error'));

  clients.set(purpose, client);
  return client;
}

export function getPurposeStatus(purpose: RedisPurpose): PurposeStatus {
  return statuses.get(purpose) ?? 'disabled';
}

/** True only when the workload's client is configured AND currently healthy. */
export function isPurposeReady(purpose: RedisPurpose): boolean {
  return getPurposeStatus(purpose) === 'connected' && !!getPurposeClient(purpose);
}

export interface WorkloadHealth {
  status: PurposeStatus | 'error';
  latencyMs?: number;
  error?: string;
}

/**
 * Health snapshot for the purpose-managed workloads (cache/session/rate-limit).
 * Pings each client (bounded by the 2s command timeout) and reads server-level
 * memory / client stats from the cache connection. BullMQ uses its own
 * connection (config/queue.ts) and is pinged separately by the health route.
 */
export async function getRedisHealth(
  purposes: RedisPurpose[] = ['cache', 'session', 'ratelimit'],
): Promise<{
  workloads: Record<string, WorkloadHealth>;
  server?: { usedMemory?: string; connectedClients?: string };
}> {
  const workloads: Record<string, WorkloadHealth> = {};

  for (const purpose of purposes) {
    const client = getPurposeClient(purpose);
    if (!client) {
      workloads[purpose] = { status: 'disabled' };
      continue;
    }
    const start = Date.now();
    try {
      await client.ping();
      workloads[purpose] = { status: getPurposeStatus(purpose), latencyMs: Date.now() - start };
    } catch (e) {
      workloads[purpose] = { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  let server: { usedMemory?: string; connectedClients?: string } | undefined;
  const cache = getPurposeClient('cache');
  if (cache) {
    try {
      const info = await cache.info();
      server = {
        usedMemory: /used_memory_human:(.+)/.exec(info)?.[1]?.trim(),
        connectedClients: /connected_clients:(\d+)/.exec(info)?.[1],
      };
    } catch {
      /* INFO unsupported / unavailable — omit server stats */
    }
  }

  return { workloads, server };
}

/** Gracefully close all purpose clients (called on shutdown). */
export async function closePurposeClients(): Promise<void> {
  for (const [purpose, client] of clients) {
    if (!client) continue;
    try {
      await client.quit();
    } catch {
      try { client.disconnect(); } catch { /* ignore */ }
    }
    clients.set(purpose, null);
    statuses.set(purpose, 'disabled');
  }
  clients.clear();
  statuses.clear();
}
