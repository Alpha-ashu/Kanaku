#!/usr/bin/env node
/**
 * Safe LOCAL test-database reset.
 *
 * Rebuilds the test DB to match prisma/schema.prisma using the squashed baseline
 * migration. It uses Prisma's explicit `--url` flag (which bypasses `.env`
 * entirely) and HARD-REFUSES any non-local URL, so it can never reach a remote /
 * production database. This closes the footgun where `prisma db push` / `migrate`
 * silently used the production DATABASE_URL from `.env`.
 *
 * Usage: npm run db:test:reset   (reads DATABASE_URL from backend/.env.test)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This script was relocated to quality/diagnostics/backend/; `root` must still
// resolve to the backend/ package (where .env.test and prisma/ live).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend');
const envTestPath = path.join(root, '.env.test');
if (!existsSync(envTestPath)) {
  console.error('✗ backend/.env.test not found. Create it with a LOCAL DATABASE_URL.');
  process.exit(1);
}

const readVar = (name) => {
  const line = readFileSync(envTestPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : '';
};

const url = readVar('DATABASE_URL');
const masked = url.replace(/:[^:@/]*@/, ':***@');

// Safety guard: this script only ever operates on a local database.
const host = (url.match(/@([^/:?]+)/) || [])[1] || '';
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
const looksRemote = /supabase|amazonaws|rds\.|\.cloud|\.net|\.io|\.com/i.test(url);
if (!url || !isLocal || looksRemote) {
  console.error(`✗ Refusing: test DATABASE_URL is not a local database (${masked || 'empty'}).`);
  console.error('  This script only operates on localhost to protect production data.');
  process.exit(1);
}

const baseline = path.join(root, 'prisma', 'migrations', '00000000000000_init', 'migration.sql');
if (!existsSync(baseline)) {
  console.error(`✗ Baseline migration not found: ${baseline}`);
  process.exit(1);
}

const prisma = (args, input) => {
  // shell:true is required for `npx` on Windows. Safe here: the only interpolated
  // value is `url`, already hard-validated to be a localhost address above.
  const r = spawnSync('npx', ['prisma', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) {
    if (r.stderr) process.stderr.write(r.stderr);
    process.exit(r.status || 1);
  }
  return r;
};

console.log(`▶ Resetting LOCAL test DB: ${masked}`);
console.log('  • dropping & recreating public schema');
prisma(['db', 'execute', '--url', url, '--stdin'], 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
console.log('  • applying baseline migration');
prisma(['db', 'execute', '--url', url, '--file', baseline]);
console.log('✓ Test DB reset to schema baseline. Run `npm test` to verify.');
