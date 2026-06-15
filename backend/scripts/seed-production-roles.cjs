/**
 * seed-production-roles.cjs
 *
 * Creates / refreshes the four canonical role accounts in the production database.
 * Credentials are read from environment variables — never hardcoded here.
 *
 * Usage (Fly.io):
 *   fly ssh console --app kanaku
 *   > node scripts/seed-production-roles.cjs
 *
 * Required secrets (set via `fly secrets set KEY=value`):
 *   SEED_ADMIN_EMAIL       admin@kanku.com
 *   SEED_ADMIN_PASSWORD    K@n4ku_Adm!n#2Xz9$
 *   SEED_MANAGER_EMAIL     manager@kanku.com
 *   SEED_MANAGER_PASSWORD  K@n4ku_M4n4g3r#7Qw8$
 *   SEED_ADVISOR_EMAIL     advisor@kanku.com
 *   SEED_ADVISOR_PASSWORD  K@n4ku_Adv!s0r#5Tz6^
 *   SEED_USER_EMAIL        user@kanku.com
 *   SEED_USER_PASSWORD     K@n4ku_Us3r#3Pm2*Wy
 *
 * DATABASE_URL must already be set (it is in production via fly secrets).
 */

'use strict';

const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/** Enforces password strength rules matching the registration controller */
function validatePassword(password, label) {
  if (!password || password.length < 12)
    throw new Error(`${label}: password must be ≥ 12 chars`);
  if (!/[A-Z]/.test(password))
    throw new Error(`${label}: password needs an uppercase letter`);
  if (!/[a-z]/.test(password))
    throw new Error(`${label}: password needs a lowercase letter`);
  if (!/[0-9]/.test(password))
    throw new Error(`${label}: password needs a digit`);
  if (!/[^A-Za-z0-9]/.test(password))
    throw new Error(`${label}: password needs a special character`);
}

// ---------------------------------------------------------------------------
// Role-specific profile defaults (non-sensitive — generic demo data)
// ---------------------------------------------------------------------------
const ROLE_PROFILES = {
  admin: {
    name:          'Arjun Mehta',
    firstName:     'Arjun',
    lastName:      'Mehta',
    gender:        'male',
    dateOfBirth:   new Date('1985-03-15'),
    jobType:       'Full-time Employment',
    salary:        1800000,
    country:       'India',
    state:         'Maharashtra',
    city:          'Mumbai',
    avatarId:      'new-7',
    isApproved:    true,
    advisorStatus: 'NOT_AVAILABLE',
  },
  manager: {
    name:          'Priya Sharma',
    firstName:     'Priya',
    lastName:      'Sharma',
    gender:        'female',
    dateOfBirth:   new Date('1990-07-22'),
    jobType:       'Full-time Employment',
    salary:        1200000,
    country:       'India',
    state:         'Karnataka',
    city:          'Bengaluru',
    avatarId:      'new-10',
    isApproved:    true,
    advisorStatus: 'NOT_AVAILABLE',
  },
  advisor: {
    name:          'Vikram Nair',
    firstName:     'Vikram',
    lastName:      'Nair',
    gender:        'male',
    dateOfBirth:   new Date('1988-11-05'),
    jobType:       'Self-employed',
    salary:        2400000,
    country:       'India',
    state:         'Kerala',
    city:          'Kochi',
    avatarId:      'new-13',
    isApproved:    true,
    advisorStatus: 'AVAILABLE',
  },
  user: {
    name:          'Ananya Patel',
    firstName:     'Ananya',
    lastName:      'Patel',
    gender:        'female',
    dateOfBirth:   new Date('1995-05-30'),
    jobType:       'Freelance',
    salary:        600000,
    country:       'India',
    state:         'Gujarat',
    city:          'Ahmedabad',
    avatarId:      'new-6',
    isApproved:    true,
    advisorStatus: 'NOT_AVAILABLE',
  },
};

async function upsertRoleUser({ email, password, role }) {
  if (!email || !password) {
    console.warn(`[seed] Skipping ${role} — env vars not set.`);
    return null;
  }

  validatePassword(password, `${role} (${email})`);

  const profile = ROLE_PROFILES[role] || {};
  const hashedPassword = await bcrypt.hash(password, 12);

  const data = {
    email,
    name:          profile.name || role,
    password:      hashedPassword,
    role,
    isApproved:    profile.isApproved ?? false,
    advisorStatus: profile.advisorStatus ?? 'NOT_AVAILABLE',
    firstName:     profile.firstName ?? null,
    lastName:      profile.lastName  ?? null,
    gender:        profile.gender    ?? null,
    dateOfBirth:   profile.dateOfBirth ?? null,
    jobType:       profile.jobType   ?? null,
    salary:        profile.salary    ?? null,
    country:       profile.country   ?? null,
    state:         profile.state     ?? null,
    city:          profile.city      ?? null,
    avatarId:      profile.avatarId  ?? null,
    status:        'active',
    updatedAt:     new Date(),
  };

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
    });
    console.log(`[seed] Updated  ${role.padEnd(8)} → ${email}  (id: ${updated.id})`);

    // Upsert settings for currency + language
    await prisma.userSettings.upsert({
      where:  { userId: updated.id },
      update: { currency: 'INR', language: 'en', updatedAt: new Date() },
      create: { userId: updated.id, currency: 'INR', language: 'en' },
    }).catch(() => {});

    return updated;
  }

  const created = await prisma.user.create({ data });
  console.log(`[seed] Created  ${role.padEnd(8)} → ${email}  (id: ${created.id})`);

  await prisma.userSettings.upsert({
    where:  { userId: created.id },
    update: { currency: 'INR', language: 'en', updatedAt: new Date() },
    create: { userId: created.id, currency: 'INR', language: 'en' },
  }).catch(() => {});

  return created;
}

async function main() {
  console.log('[seed] Starting production role seeding...');

  const roles = [
    { email: process.env.SEED_ADMIN_EMAIL,   password: process.env.SEED_ADMIN_PASSWORD,   role: 'admin'   },
    { email: process.env.SEED_MANAGER_EMAIL, password: process.env.SEED_MANAGER_PASSWORD, role: 'manager' },
    { email: process.env.SEED_ADVISOR_EMAIL, password: process.env.SEED_ADVISOR_PASSWORD, role: 'advisor' },
    { email: process.env.SEED_USER_EMAIL,    password: process.env.SEED_USER_PASSWORD,    role: 'user'    },
  ];

  for (const r of roles) {
    await upsertRoleUser(r);
  }

  console.log('[seed] Done.');
}

main()
  .catch(err => {
    console.error('[seed] Fatal error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
