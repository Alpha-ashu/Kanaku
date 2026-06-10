import { config } from 'dotenv';

// Load .env before PrismaClient instantiation — Prisma reads DATABASE_URL at import time.
config();

import { PrismaClient } from './prisma-client';
import { logger } from '../config/logger';

const QUERY_TIMEOUT_MS = 30_000;
const SLOW_QUERY_MS    = 2_000;

// READ_REPLICA_URL — set this in production to route reads to a replica.
// Falls back to DATABASE_URL if not configured (e.g. local dev).
const READ_REPLICA_URL = process.env.READ_REPLICA_URL;

function buildClient(datasourceUrl?: string): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'warn'  },
      { emit: 'event', level: 'error' },
    ],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  (client as any).$on('warn',  (e: any) => logger.warn('[Prisma]',  e));
  (client as any).$on('error', (e: any) => logger.error('[Prisma]', e));

  // Query timeout + slow-query logging
  (client as any).$use(async (params: any, next: any) => {
    const start   = Date.now();
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(
          `[Prisma] Query timeout: ${params.model}.${params.action} exceeded ${QUERY_TIMEOUT_MS}ms`
        )),
        QUERY_TIMEOUT_MS
      )
    );

    const result   = await Promise.race([next(params), timeout]);
    const duration = Date.now() - start;

    if (duration > SLOW_QUERY_MS) {
      logger.warn(`[Prisma] Slow query (${duration}ms): ${params.model}.${params.action}`);
    }

    return result;
  });

  return client;
}

// Write client — always hits primary DB
let _writer: PrismaClient | null = null;
const getWriteClient = (): PrismaClient => {
  if (!_writer) {
    try { _writer = buildClient(); }
    catch (err) { logger.error('[Prisma] Failed to init write client:', err); throw err; }
  }
  return _writer;
};

// Read client — hits replica if READ_REPLICA_URL is set, otherwise primary
let _reader: PrismaClient | null = null;
const getReadClient = (): PrismaClient => {
  if (!_reader) {
    try { _reader = buildClient(READ_REPLICA_URL); }
    catch (err) { logger.error('[Prisma] Failed to init read client:', err); throw err; }
  }
  return _reader;
};

/**
 * Primary write client — use for INSERT / UPDATE / DELETE and any
 * strongly-consistent reads that must reflect the latest write.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getWriteClient();
    const value  = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * Read-only client — routes to the read replica when READ_REPLICA_URL is set.
 * Use for dashboard summaries, reports, and any query that can tolerate
 * a few seconds of replication lag.
 *
 * Usage:  import { prismaRead } from '../db/prisma';
 *         const rows = await prismaRead.transaction.findMany(...);
 */
export const prismaRead = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getReadClient();
    const value  = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
