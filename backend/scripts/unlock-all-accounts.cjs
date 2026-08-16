'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const ROLES_TO_UNLOCK = [
  { email: 'admin@kanaku.com', pin: '847291', role: 'admin' },
  { email: 'manager@kanaku.com', pin: '394827', role: 'manager' },
  { email: 'advisor@kanaku.com', pin: '582039', role: 'advisor' },
  { email: 'user@kanaku.com', pin: '274915', role: 'user' },
];

async function main() {
  console.log('=== UNLOCKING ALL CORE ACCOUNTS AND PINS ===');
  
  for (const item of ROLES_TO_UNLOCK) {
    const user = await prisma.user.findUnique({ where: { email: item.email } });
    if (!user) {
      console.log(`User not found: ${item.email}`);
      continue;
    }

    const sha256Pin = crypto.createHash('sha256').update(item.pin).digest('hex');
    const pinHash = await bcrypt.hash(sha256Pin, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await prisma.userPin.upsert({
      where: { userId: user.id },
      update: {
        pinHash,
        expiresAt,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: user.id,
        pinHash,
        expiresAt,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    // Also ensure user status is active/verified
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'verified', isApproved: true },
    });

    console.log(`[UNLOCKED] ${item.role.padEnd(8)} (${item.email}) -> PIN: ${item.pin}, Lock reset: OK`);
  }
  console.log('=== ALL ACCOUNTS FULLY UNLOCKED AND PIN VERIFIED ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
