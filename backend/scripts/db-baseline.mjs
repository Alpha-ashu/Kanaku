#!/usr/bin/env node
/**
 * Guided Prisma migration baseline.
 *
 * Context: this project's databases were provisioned with `prisma db push`, so
 * they carry the right schema but no `_prisma_migrations` history. `migrate
 * deploy` therefore refuses to run (P3005), and deploy-migrate.mjs correctly
 * skips with a warning. Baselining writes the existing migrations into the
 * history table as "already applied", which unlocks automated migrations from
 * that point on WITHOUT re-running any DDL.
 *
 * Usage:
 *   npm --prefix backend run db:baseline            # inspect only, changes nothing
 *   npm --prefix backend run db:baseline -- --apply # perform the baseline
 *
 * Safety:
 *   - Dry run by default. `--apply` is required to write anything.
 *   - `migrate resolve --applied` only inserts history rows. It executes no
 *     schema DDL, so it cannot alter or drop data.
 *   - Refuses to act if the database already has migration history, so running
 *     it twice is harmless.
 *   - Reads DIRECT_URL (not the pooled DATABASE_URL) because migration commands
 *     must not go through pgBouncer.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = './prisma/schema.prisma';
const APPLY = process.argv.includes('--apply');
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'prisma', 'migrations');

const prisma = (args) =>
  execFileSync('npx', ['prisma', ...args, '--schema', SCHEMA], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const heading = (t) => console.log(`\n[36m${t}[0m\n${'─'.repeat(t.length)}`);

// ── 1. Which migrations exist on disk? ───────────────────────────────────────
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

if (migrations.length === 0) {
  console.error('No migration folders found under prisma/migrations — nothing to baseline.');
  process.exit(1);
}

heading('Migrations on disk');
migrations.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m}`));

// ── 2. What does the database think? ─────────────────────────────────────────
heading('Database migration status');
let status = '';
let statusFailed = false;
try {
  status = prisma(['migrate', 'status']);
} catch (err) {
  status = `${err.stdout || ''}${err.stderr || ''}`;
  statusFailed = true;
}
console.log(status.trim() || '(no output)');

const needsBaseline =
  /P3005/.test(status) || /database schema is not empty/i.test(status);
const alreadyBaselined = /Database schema is up to date/i.test(status) ||
  /migrations? (have|has) already been applied/i.test(status);

if (alreadyBaselined && !needsBaseline) {
  heading('Result');
  console.log('✓ This database already has migration history. No baseline needed.');
  console.log('  Automated migrations via `npm run db:deploy` are already active.');
  process.exit(0);
}

if (!needsBaseline) {
  heading('Result');
  console.log(
    statusFailed
      ? '⚠ Could not read migration status, and it is not the known P3005 case.\n' +
        '  Check DIRECT_URL connectivity before baselining — do NOT force it.'
      : '⚠ Status did not report P3005. Nothing done; re-read the output above.',
  );
  process.exit(statusFailed ? 1 : 0);
}

// ── 3. Baseline ──────────────────────────────────────────────────────────────
heading('Baseline required (P3005)');
console.log('The schema exists but has no migration history, which is expected for a');
console.log('`db push`-managed database. Marking each migration as already applied will');
console.log('record the history WITHOUT executing any DDL.\n');

if (!APPLY) {
  console.log('DRY RUN — nothing has been changed. Commands that would run:\n');
  migrations.forEach((m) =>
    console.log(`  npx prisma migrate resolve --applied ${m} --schema ${SCHEMA}`),
  );
  console.log('\nRe-run with --apply to perform the baseline:');
  console.log('  npm --prefix backend run db:baseline -- --apply');
  process.exit(0);
}

console.log('Applying…\n');
for (const name of migrations) {
  process.stdout.write(`  ${name} … `);
  try {
    prisma(['migrate', 'resolve', '--applied', name]);
    console.log('recorded');
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`;
    if (/already recorded|already applied/i.test(out)) {
      console.log('already recorded (skipped)');
      continue;
    }
    console.log('FAILED');
    console.error(`\n${out}`);
    console.error('Baseline aborted. The database is unchanged apart from any rows');
    console.error('recorded above, which are safe to leave in place — re-running this');
    console.error('command will skip them.');
    process.exit(1);
  }
}

heading('Verifying');
try {
  console.log(prisma(['migrate', 'status']).trim());
} catch (err) {
  console.log(`${err.stdout || ''}${err.stderr || ''}`.trim());
}

heading('Done');
console.log('✓ Baseline complete. `npm run db:deploy` will now apply future migrations');
console.log('  automatically on deploy instead of warning and skipping.');
