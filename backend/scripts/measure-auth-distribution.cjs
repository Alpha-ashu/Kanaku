/**
 * Auth distribution measurement (read-only).
 *
 * Step 1 of the Supabase-Auth consolidation (docs/AUTH_CONSOLIDATION_PLAN.md,
 * Option A): how many users are local bcrypt-password accounts (must be migrated
 * into Supabase Auth) vs already Supabase-managed (no migration needed).
 *
 * Usage:  node backend/scripts/measure-auth-distribution.cjs
 *         (or `npm --prefix backend run measure:auth`)
 *
 * Does NOT modify any data.
 */
const path = require('node:path');
const { PrismaClient } = require('../generated/prisma');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const SUPABASE_MANAGED = 'supabase-managed-account';

async function main() {
  const [total, supabaseManaged, emptyPassword] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { password: SUPABASE_MANAGED } }),
    prisma.user.count({ where: { password: '' } }),
  ]);

  const local = total - supabaseManaged - emptyPassword;
  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0');

  console.log('\n=== Auth distribution (read-only) ===');
  console.log(`Total users:            ${total}`);
  console.log(`Supabase-managed:       ${supabaseManaged} (${pct(supabaseManaged)}%)`);
  console.log(`Empty password:         ${emptyPassword} (${pct(emptyPassword)}%)`);
  console.log(`Local bcrypt password:  ${local} (${pct(local)}%)  <-- need migration into Supabase Auth (Option A)`);
  console.log('\nInterpretation:');
  console.log('  - High "Supabase-managed" share  -> Option A migration is small; proceed with cutover.');
  console.log('  - High "Local bcrypt" share      -> plan a bcrypt-hash import into Supabase auth.users,');
  console.log('    or a staged password-reset campaign, before removing the custom login path.');
  console.log('');
}

main()
  .catch((err) => {
    console.error('measure-auth-distribution failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
