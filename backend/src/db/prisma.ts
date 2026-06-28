import { config } from 'dotenv';

// Load .env before PrismaClient instantiation — Prisma reads DATABASE_URL at import time.
config();

import { PrismaClient } from './prisma-client';
import { logger } from '../config/logger';
import { getRequestActor } from '../middleware/requestContext';
import { redact } from '../utils/redact';

// ── Audit interceptor config ────────────────────────────────────────────────
// Every create/update/delete on these (financial) models is recorded in the
// AuditLog table — covering ALL write paths (API, sync, scripts), not just
// controllers. Append-only immutability is enforced at the DB level
// (see backend/scripts/harden-financial-constraints.sql).
export const AUDIT_MODELS = new Set([
  'Account', 'Transaction', 'Loan', 'LoanPayment', 'Goal', 'GoalContribution',
  'GoalMember', 'Investment', 'GoldAsset', 'Budget', 'GroupExpense',
  'GroupExpenseMember', 'RecurringTransaction',
  // Phase 2 — complete coverage for the remaining financial / collaboration entities
  'CollaborationParticipant', 'ExpenseBill', 'Friend', 'AaTransaction',
]);
const WRITE_OPS = new Set(['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany']);
const BULK_OPS = new Set(['createMany', 'updateMany', 'deleteMany']);
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const auditAction = (op: string) =>
  op.startsWith('create') ? 'data.create' : op.startsWith('delete') ? 'data.delete' : 'data.update';

const QUERY_TIMEOUT_MS = 30_000;
const SLOW_QUERY_MS    = 2_000;

// READ_REPLICA_URL — set this in production to route reads to a replica.
// Falls back to DATABASE_URL if not configured (e.g. local dev).
const READ_REPLICA_URL = process.env.READ_REPLICA_URL;

function buildClient(datasourceUrl?: string, opts?: { audit?: boolean }): PrismaClient {
  const base = new PrismaClient({
    log: [
      { emit: 'event', level: 'warn'  },
      { emit: 'event', level: 'error' },
    ],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  (base as any).$on('warn',  (e: any) => logger.warn('[Prisma]',  e));
  (base as any).$on('error', (e: any) => logger.error('[Prisma]', e));

  // Query timeout + slow-query logging via $extends (Prisma v5+)
  const timed = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const start = Date.now();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`[Prisma] Query timeout exceeded ${QUERY_TIMEOUT_MS}ms`)),
              QUERY_TIMEOUT_MS,
            )
          );
          const result = await Promise.race([query(args), timeoutPromise]);
          const duration = Date.now() - start;
          if (duration > SLOW_QUERY_MS) {
            logger.warn(`[Prisma] Slow query (${duration}ms)`);
          }
          return result;
        },
      },
    },
  });

<<<<<<< HEAD
  // Auto-stamp the originating request's correlation ID onto Notification rows
  // so the worker (a separate process with no request context) can tie a
  // delivery back to the API request that produced it. Done centrally here so
  // every create path (dispatcher, service, controllers) is covered.
  const stampReqId = (data: any) => {
    if (data && data.requestId == null) {
      const rid = getRequestActor().requestId;
      if (rid) data.requestId = rid;
    }
  };
  const withReqId = timed.$extends({
    query: {
      notification: {
        async create({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          stampReqId(args?.data);
          return query(args);
        },
        async createMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          if (Array.isArray(args?.data)) args.data.forEach(stampReqId);
          else stampReqId(args?.data);
          return query(args);
        },
      },
    },
  });

  if (!opts?.audit) return withReqId as unknown as PrismaClient;

  // Audit interceptor — records every financial mutation. Best-effort: a failed
  // audit write is logged but never blocks the user operation. `timed` (the
  // pre-audit client) is used for the before-read and the AuditLog insert so the
  // audit path can never recurse through this interceptor.
  const audited = withReqId.$extends({
    query: {
      $allModels: {
        async $allOperations(
          { model, operation, args, query }:
          { model?: string; operation: string; args: any; query: (args: any) => Promise<any> },
        ) {
          if (!model || !AUDIT_MODELS.has(model) || !WRITE_OPS.has(operation)) return query(args);

          let before: unknown;
          if ((operation === 'update' || operation === 'delete' || operation === 'upsert') && args?.where) {
            try { before = await (timed as any)[lcFirst(model)].findFirst({ where: args.where }); } catch { /* ignore */ }
          }

          const result = await query(args);

          try {
            const actor = getRequestActor();
            const bulk = BULK_OPS.has(operation);
            const resourceId = !bulk ? ((result as any)?.id ?? args?.where?.id ?? null) : null;
            const resource = resourceId ? `${model}:${resourceId}` : model;
            // Phase 4: emit a compact structured audit log line so financial
            // mutations also reach the centralized log store (Loki) — letting the
            // audit dashboard read from logs WITHOUT Grafana ever touching the DB.
            // The full before/after stays in the immutable AuditLog table below.
            logger.info('[AUDIT]', {
              audit: true, event: auditAction(operation),
              userId: actor.userId ?? 'system', resource, status: 'success',
            });
            await (timed as any).auditLog.create({
              data: {
                userId: actor.userId ?? 'system',
                action: auditAction(operation),
                resource,
                status: 'success',
                ip: actor.ip ?? null,
                userAgent: actor.userAgent ?? null,
                requestId: actor.requestId ?? null,
                // JSON round-trip first: Prisma Decimal/Date values are not valid
                // inputs for a Json column and would make auditLog.create throw.
                details: redact(JSON.parse(JSON.stringify({
                  model, operation,
                  before: before ?? null,
                  after: bulk ? { count: (result as any)?.count } : result,
                }))) as any,
              },
            });
          } catch (e) {
            logger.warn('[audit] mutation audit failed', { model, operation, error: e instanceof Error ? e.message : String(e) });
          }
          return result;
        },
      },
    },
  });

  return audited as unknown as PrismaClient;
}

// Write client — always hits primary DB
let _writer: PrismaClient | null = null;
const getWriteClient = (): PrismaClient => {
  if (!_writer) {
    try { _writer = buildClient(undefined, { audit: true }); }
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
