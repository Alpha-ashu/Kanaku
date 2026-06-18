/**
 * Migrate local bcrypt users into Supabase Auth (Option A), preserving user ids.
 *
 *   DRY-RUN (default): reports what WOULD be migrated. Changes nothing.
 *   APPLY:  node backend/scripts/migrate-users-to-supabase-auth.cjs --apply
 *
 * Why SQL (not admin.createUser): the app keys every FK on User.id, so migrated
 * users MUST keep their id. supabase-js admin.createUser mints a NEW id, so we
 * insert directly into auth.users + auth.identities (same Postgres Prisma already
 * connects to), preserving id + the bcrypt hash (GoTrue verifies bcrypt natively).
 *
 * SAFETY:
 *   - Idempotent: skips users already present in auth.users.
 *   - Additive only: never touches the local User row (bcrypt login keeps working
 *     during the compatibility window).
 *   - VALIDATE FIRST on a local Supabase stack (`supabase start`, free, Docker) or
 *     against ONE throwaway prod user before batch-applying. GoTrue's auth schema
 *     varies by version — confirm column names on your instance before --apply.
 */
const path = require('node:path');
const { PrismaClient } = require('../generated/prisma');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
// `--email <addr>` limits the run to a single user (staged rollout / validation).
const EMAIL_ARG = (() => {
  const i = process.argv.indexOf('--email');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
const SUPABASE_MANAGED = 'supabase-managed-account';

async function alreadyInAuth(id, email) {
  const rows = await prisma.$queryRaw`
    SELECT 1 FROM auth.users WHERE id = ${id}::uuid OR lower(email) = lower(${email}) LIMIT 1
  `;
  return rows.length > 0;
}

async function migrateUser(u) {
  const appMeta = JSON.stringify({ provider: 'email', providers: ['email'] });
  const userMeta = JSON.stringify({ name: u.name, role: u.role, email_verified: true });
  const identityData = JSON.stringify({ sub: u.id, email: u.email, email_verified: true });

  // auth.users — preserve id + bcrypt hash; mark email confirmed.
  // The token columns are nullable in the DB but GoTrue scans them as non-null
  // strings, so they MUST be '' (NULL -> "Database error querying schema" on login).
  await prisma.$executeRaw`
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) VALUES (
      ${u.id}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
      ${u.email}, ${u.password}, NOW(),
      ${appMeta}::jsonb, ${userMeta}::jsonb, NOW(), NOW(),
      '', '', '', '', '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // auth.identities — required for email sign-in to resolve.
  await prisma.$executeRaw`
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${u.id}::uuid, ${identityData}::jsonb, 'email', ${u.id}, NOW(), NOW(), NOW()
    )
    ON CONFLICT DO NOTHING
  `;
}

async function main() {
  const where = { password: { not: SUPABASE_MANAGED } };
  if (EMAIL_ARG) where.email = EMAIL_ARG;
  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true, password: true, name: true, role: true },
  });

  console.log(`\n=== Migrate local users -> Supabase Auth (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log(`Local bcrypt users found: ${users.length}\n`);

  let migrated = 0;
  let skipped = 0;
  for (const u of users) {
    if (!u.email) { skipped++; continue; }
    // Only migrate real bcrypt hashes (skip empty / non-bcrypt sentinels).
    if (!u.password || !/^\$2[aby]\$/.test(u.password)) {
      skipped++;
      console.log(`  skip   ${u.email} (no bcrypt password)`);
      continue;
    }
    const exists = await alreadyInAuth(u.id, u.email);
    if (exists) {
      skipped++;
      console.log(`  skip   ${u.email} (already in auth.users)`);
      continue;
    }
    if (APPLY) {
      try {
        await migrateUser(u);
        migrated++;
        console.log(`  migrate ${u.email}`);
      } catch (err) {
        console.error(`  FAILED  ${u.email}: ${err.message}`);
      }
    } else {
      migrated++;
      console.log(`  would migrate ${u.email}`);
    }
  }

  console.log(`\n${APPLY ? 'Migrated' : 'Would migrate'}: ${migrated}  |  Skipped: ${skipped}`);
  if (!APPLY) console.log('Dry-run only. Re-run with --apply after validating on local Supabase or one test user.');
  console.log('');
}

main()
  .catch((err) => { console.error('migration failed:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
