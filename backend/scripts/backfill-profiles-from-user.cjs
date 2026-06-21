/**
 * Phase D, step 1 (NON-destructive): backfill the `profiles` table from `User`.
 *
 * `User` and `profiles` currently hold the same identity/PII fields (email,
 * names, address, gender, dob, income). Before we can make `profiles` the single
 * source of truth and drop the overlapping columns from `User`, every user's PII
 * must exist in `profiles`. This script copies it across.
 *
 * Safety:
 *   - Only FILLS a `profiles` field when it is currently null/empty AND `User`
 *     has a value — it never overwrites richer data already in `profiles`.
 *   - Creates a `profiles` row when one is missing.
 *   - Dry-run by default; pass --apply to write.
 *
 *   node ./scripts/backfill-profiles-from-user.cjs            # dry run
 *   node ./scripts/backfill-profiles-from-user.cjs --apply    # persist
 *
 * This is the FIRST step. The destructive column-drop migration on `User` is a
 * separate, reviewed step (see quality/reports/2026-06-21-schema-dedup-and-role-trust-audit.md,
 * Finding #6). Do NOT drop columns until this has been applied and verified.
 */
const path = require('node:path');
const { PrismaClient } = require('../generated/prisma');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const isEmpty = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Map User → profiles column names (snake_case). */
function buildProfilePatch(user, profile) {
  const patch = {};
  const consider = (profileCol, userVal) => {
    if (!isEmpty(userVal) && isEmpty(profile?.[profileCol])) patch[profileCol] = userVal;
  };

  consider('email', user.email);
  consider('full_name', user.name);
  consider('first_name', user.firstName);
  consider('last_name', user.lastName);
  consider('gender', user.gender);
  consider('date_of_birth', user.dateOfBirth);
  consider('job_type', user.jobType);
  consider('country', user.country);
  consider('state', user.state);
  consider('city', user.city);
  consider('avatar_id', user.avatarId);

  // salary on User is an annual figure; profiles has both annual & monthly.
  if (!isEmpty(user.salary)) {
    const annual = Number(user.salary);
    if (Number.isFinite(annual)) {
      if (isEmpty(profile?.annual_income)) patch.annual_income = annual;
      if (isEmpty(profile?.monthly_income)) patch.monthly_income = Math.round(annual / 12);
    }
  }

  return patch;
}

async function main() {
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} user(s). Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  let created = 0;
  let updated = 0;

  for (const user of users) {
    const profile = await prisma.profiles.findUnique({ where: { id: user.id } }).catch(() => null);
    const patch = buildProfilePatch(user, profile);

    if (!profile) {
      created++;
      console.log(`  + create profiles for ${user.id} (${user.email}) ${JSON.stringify(patch)}`);
      if (APPLY) {
        await prisma.profiles.create({ data: { id: user.id, ...patch } });
      }
      continue;
    }

    if (Object.keys(patch).length === 0) continue;
    updated++;
    console.log(`  ~ fill profiles ${user.id}: ${JSON.stringify(patch)}`);
    if (APPLY) {
      await prisma.profiles.update({ where: { id: user.id }, data: patch });
    }
  }

  console.log(`\n${APPLY ? 'Created' : 'Would create'} ${created}, ${APPLY ? 'updated' : 'would update'} ${updated} profiles row(s).`);
  if (!APPLY && created + updated > 0) console.log('Re-run with --apply to persist.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
