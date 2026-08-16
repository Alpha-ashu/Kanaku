'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== USERS IN DATABASE ===');
  const users = await prisma.user.findMany();
  for (const u of users) {
    console.log(`User: ${u.email} | ID: ${u.id} | Role: ${u.role} | Status: ${u.status}`);
  }

  console.log('\n=== USER PINS IN DATABASE ===');
  const pins = await prisma.userPin.findMany();
  for (const p of pins) {
    const user = users.find(u => u.id === p.userId);
    console.log(`\nUserPin for ${user ? user.email : p.userId} (role: ${user ? user.role : 'unknown'}):`);
    console.log(`  failedAttempts: ${p.failedAttempts}`);
    console.log(`  lockedUntil: ${p.lockedUntil}`);
    console.log(`  isActive: ${p.isActive}`);
    console.log(`  expiresAt: ${p.expiresAt}`);
    console.log(`  pinHash: ${p.pinHash}`);
    
    // Check if 847291 matches
    const pin = '847291';
    const sha256 = crypto.createHash('sha256').update(pin).digest('hex');
    const matchPlain = await bcrypt.compare(pin, p.pinHash);
    const matchSha = await bcrypt.compare(sha256, p.pinHash);
    console.log(`  Candidate '847291' -> matches plain: ${matchPlain}, matches sha: ${matchSha}`);
  }

  // Also check if admin exists and reset/set PIN to 847291 properly
  const adminUser = users.find(u => u.email === 'admin@kanaku.com' || u.role === 'admin');
  if (adminUser) {
    console.log(`\nEnsuring admin (${adminUser.email}) PIN is 847291:`);
    const sha256Pin = crypto.createHash('sha256').update('847291').digest('hex');
    const pinHash = await bcrypt.hash(sha256Pin, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await prisma.userPin.upsert({
      where: { userId: adminUser.id },
      update: {
        pinHash,
        expiresAt,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: adminUser.id,
        pinHash,
        expiresAt,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log(`  SUCCESS: Updated PIN for admin (${adminUser.email}) to 847291, failedAttempts reset to 0, unlocked.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
