import { prisma } from './prisma';
import { logger } from '../config/logger';

/**
 * Enable Row Level Security on tables the backend creates at runtime.
 *
 * The frontend bundle ships the Supabase anon key by design, so any public table
 * without RLS is readable and writable by anyone through the Supabase REST API.
 * The RLS migrations only touch tables that already exist, so on a fresh
 * database a table created later by `CREATE TABLE IF NOT EXISTS` starts exposed.
 *
 * RLS is enabled, not FORCED: the backend connection owns these tables and keeps
 * full access, while anon/authenticated get only what policies allow (deny-all
 * when there are none). Tables that already have RLS are skipped, so the
 * ACCESS EXCLUSIVE lock of ALTER TABLE is only taken when something changes.
 * Never throws — a failure is logged and the caller carries on.
 */
export async function enableRowLevelSecurity(tables: readonly string[]): Promise<void> {
  try {
    const unprotected = await prisma.$queryRaw<{ name: string }[]>`
      SELECT t AS name
      FROM unnest(${[...tables]}::text[]) AS t
      JOIN pg_class c ON c.oid = to_regclass(quote_ident(t))
      WHERE NOT c.relrowsecurity
    `;
    for (const { name } of unprotected) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${name.replace(/"/g, '""')}" ENABLE ROW LEVEL SECURITY`);
      logger.warn('Enabled RLS on runtime-created table that had it disabled', { table: name });
    }
  } catch (error) {
    logger.error('Failed to enable RLS on runtime-created tables', { tables, error });
  }
}
