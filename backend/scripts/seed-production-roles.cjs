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
 * Required secrets — NEVER hardcode or commit the real values. Provide them at
 * run time via the environment (local: gitignored `backend/.env`; prod:
 * `fly secrets set KEY=value`):
 *   SEED_ADMIN_EMAIL       SEED_ADMIN_PASSWORD
 *   SEED_MANAGER_EMAIL     SEED_MANAGER_PASSWORD
 *   SEED_ADVISOR_EMAIL     SEED_ADVISOR_PASSWORD
 *   SEED_USER_EMAIL        SEED_USER_PASSWORD
 * (Passwords must satisfy the strength rules in validatePassword below.)
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

    await syncProfileRow(updated, profile);
    await ensureUserPin(updated.id);
    return updated;
  }

  const created = await prisma.user.create({ data });
  console.log(`[seed] Created  ${role.padEnd(8)} → ${email}  (id: ${created.id})`);

  await prisma.userSettings.upsert({
    where:  { userId: created.id },
    update: { currency: 'INR', language: 'en', updatedAt: new Date() },
    create: { userId: created.id, currency: 'INR', language: 'en' },
  }).catch(() => {});

  await syncProfileRow(created, profile);
  await ensureUserPin(created.id);
  return created;
}

// GET /auth/profile reads name/fullName/etc. from public.profiles FIRST,
// falling back to User only if no profiles row exists (see auth.controller.ts
// buildProfilePayload). Without this sync, the API would keep showing
// whatever stale name/contact info was already in profiles, even after
// updating User — exactly the bug found in production this session.
async function syncProfileRow(user, profile) {
  const nameParts = (user.name || '').trim().split(/\s+/).filter(Boolean);
  try {
    await prisma.$executeRaw`
      INSERT INTO public.profiles (
        id, email, first_name, last_name, full_name, phone, gender,
        date_of_birth, job_type, country, state, city, created_at, updated_at
      ) VALUES (
        ${user.id}::uuid, ${user.email}, ${profile?.firstName || nameParts[0] || null},
        ${profile?.lastName || nameParts.slice(1).join(' ') || null}, ${user.name},
        ${profile?.phone || null}, ${profile?.gender || null}, ${profile?.dateOfBirth ? new Date(profile.dateOfBirth) : null},
        ${profile?.jobType || null}, ${profile?.country || null}, ${profile?.state || null}, ${profile?.city || null},
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
        full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, gender = EXCLUDED.gender,
        date_of_birth = EXCLUDED.date_of_birth, job_type = EXCLUDED.job_type,
        country = EXCLUDED.country, state = EXCLUDED.state, city = EXCLUDED.city, updated_at = NOW()
    `;
  } catch (err) {
    console.warn(`[seed] Profile sync failed for ${user.email}:`, err.message);
  }
}

async function ensureUserPin(userId) {
  const pinHash = await bcrypt.hash('123456', 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  await prisma.userPin.upsert({
    where: { userId },
    update: {
      pinHash,
      expiresAt,
      isActive: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
    create: {
      userId,
      pinHash,
      expiresAt,
      isActive: true,
    },
  });
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
