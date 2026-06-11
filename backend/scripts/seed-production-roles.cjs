/**
 * seed-production-roles.cjs
 *
 * Creates the four canonical role accounts in the production database.
 * Credentials are read from environment variables — never hardcoded.
 *
 * Usage (Fly.io):
 *   fly ssh console --app kanaku
 *   > node scripts/seed-production-roles.cjs
 *
 * Required env vars (set via `fly secrets set`):
 *   SEED_ADMIN_EMAIL     e.g. admin@kanku.com
 *   SEED_ADMIN_PASSWORD  e.g. Admin@2026!k
 *   SEED_MANAGER_EMAIL   e.g. manager@kanaku.com
 *   SEED_MANAGER_PASSWORD
 *   SEED_ADVISOR_EMAIL   e.g. advisor@kanaku.com
 *   SEED_ADVISOR_PASSWORD
 *   SEED_USER_EMAIL      e.g. user@kanaku.com
 *   SEED_USER_PASSWORD
 *
 * DATABASE_URL must already be set (it is in production via fly secrets).
 */

'use strict';

const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/** Minimum password requirements matching the registration controller */
function validatePassword(password, label) {
  if (!password || password.length < 8) throw new Error(`${label}: password must be ≥ 8 chars`);
  if (!/[A-Z]/.test(password)) throw new Error(`${label}: password needs an uppercase letter`);
  if (!/[a-z]/.test(password)) throw new Error(`${label}: password needs a lowercase letter`);
  if (!/[0-9]/.test(password)) throw new Error(`${label}: password needs a digit`);
}

async function upsertRoleUser({ email, password, name, role, isApproved }) {
  if (!email || !password) {
    console.warn(`[seed] Skipping ${role} — SEED_${role.toUpperCase()}_EMAIL or SEED_${role.toUpperCase()}_PASSWORD not set.`);
    return null;
  }

  validatePassword(password, `${role} (${email})`);

  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashedPassword, role, isApproved, updatedAt: new Date() },
    });
    console.log(`[seed] Updated  ${role.padEnd(8)} → ${email}  (id: ${updated.id})`);
    return updated;
  }

  const created = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      role,
      isApproved,
    },
  });
  console.log(`[seed] Created  ${role.padEnd(8)} → ${email}  (id: ${created.id})`);
  return created;
}

async function main() {
  console.log('[seed] Starting production role seeding...');

  const roles = [
    {
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      name: 'Admin',
      role: 'admin',
      isApproved: true,
    },
    {
      email: process.env.SEED_MANAGER_EMAIL,
      password: process.env.SEED_MANAGER_PASSWORD,
      name: 'Manager',
      role: 'admin',
      isApproved: true,
    },
    {
      email: process.env.SEED_ADVISOR_EMAIL,
      password: process.env.SEED_ADVISOR_PASSWORD,
      name: 'Advisor',
      role: 'advisor',
      isApproved: true,
    },
    {
      email: process.env.SEED_USER_EMAIL,
      password: process.env.SEED_USER_PASSWORD,
      name: 'Demo User',
      role: 'user',
      isApproved: true,
    },
  ];

  for (const roleConfig of roles) {
    await upsertRoleUser(roleConfig);
  }

  console.log('[seed] Done.');
}

main()
  .catch((err) => {
    console.error('[seed] Fatal error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
