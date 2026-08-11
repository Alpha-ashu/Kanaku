#!/usr/bin/env node
/**
 * Deploy-time schema application.
 *
 * Nothing applied migrations on deploy: backend/Dockerfile copies prisma/ (schema
 * + migration folders) into the image but its CMD is `node dist/server.js`. So a
 * release whose code expected a new column failed at runtime, on a user request,
 * rather than at deploy time.
 *
 * Wiring `prisma migrate deploy` in blind is not safe here either: CI provisions
 * with `prisma db push` (.github/workflows/ci.yml), and `migrate deploy` against
 * a push-managed database fails with P3005 ("database schema is not empty").
 * That would block every deploy.
 *
 * So this checks first and picks the correct action:
 *
 *   • migrations pending + history intact  → apply them, fail the deploy if they error
 *   • already up to date                   → no-op
 *   • P3005 / no migration history         → LOUD warning, exit 0 (deploy proceeds)
 *                                            because the schema is managed by db push
 *
 * The last case is deliberately non-fatal: it is the current production reality,
 * and turning it into a hard failure would take the service down to fix a
 * process problem. Baseline the database (`prisma migrate resolve --applied`)
 * to convert it into the first case.
 */
import { execFileSync } from 'node:child_process';

const SCHEMA = './prisma/schema.prisma';

const run = (args) =>
  execFileSync('npx', ['prisma', ...args, '--schema', SCHEMA], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const fail = (msg) => {
  console.error(`\n[deploy-migrate] ${msg}\n`);
  process.exit(1);
};

let status = '';
let statusFailed = false;
try {
  status = run(['migrate', 'status']);
} catch (err) {
  status = `${err.stdout || ''}${err.stderr || ''}`;
  statusFailed = true;
}

const notBaselined =
  /P3005/.test(status) ||
  /database schema is not empty/i.test(status) ||
  /No migration found in prisma\/migrations/i.test(status);

if (notBaselined) {
  console.warn(
    '\n[deploy-migrate] ⚠  This database has no Prisma migration history (P3005).\n' +
    '   It is managed by `prisma db push`, so `migrate deploy` cannot run and\n' +
    '   SCHEMA CHANGES ARE NOT BEING APPLIED AUTOMATICALLY on deploy.\n' +
    '   Apply them manually, or baseline once with:\n' +
    '     npx prisma migrate resolve --applied <migration_name> --schema ./prisma/schema.prisma\n' +
    '   Deploy is continuing.\n',
  );
  process.exit(0);
}

if (statusFailed) {
  fail(
    'Could not determine migration status (and it is not the known P3005 case).\n' +
    'Refusing to continue rather than deploying against an unknown schema.\n' +
    `Output:\n${status}`,
  );
}

if (/Database schema is up to date/i.test(status)) {
  console.log('[deploy-migrate] Schema already up to date — nothing to apply.');
  process.exit(0);
}

console.log('[deploy-migrate] Pending migrations detected — applying.');
try {
  console.log(run(['migrate', 'deploy']));
  console.log('[deploy-migrate] Migrations applied.');
} catch (err) {
  fail(
    'migrate deploy FAILED — deploy aborted so the old version keeps serving.\n' +
    `${err.stdout || ''}${err.stderr || ''}`,
  );
}
