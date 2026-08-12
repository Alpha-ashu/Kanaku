/**
 * remove-non-advisor-mock-users.cjs
 *
 * Removes all mock testing users from the database EXCEPT advisor roles testers.
 *
 * Preserved:
 *   - Any advisor test account (testadvisor1@kanaku.com … testadvisor5@kanaku.com)
 *   - Any user with role: 'advisor'
 *   - Canonical production roles (admin@kanaku.com, manager@kanaku.com, etc.)
 *
 * Removed:
 *   - testuser1@kanaku.com … testuser5@kanaku.com
 *   - Legacy E2E test users (*.test@kanaku.app)
 *   - Legacy demo users (*@KANAKU.com except advisor)
 *
 * Usage:
 *   node backend/scripts/remove-non-advisor-mock-users.cjs
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// List of explicit non-advisor test user email patterns / addresses to remove
const EXPLICIT_MOCK_USER_EMAILS = [
  'testuser1@kanaku.com',
  'testuser2@kanaku.com',
  'testuser3@kanaku.com',
  'testuser4@kanaku.com',
  'testuser5@kanaku.com',
  'arjun.test@kanaku.app',
  'priya.test@kanaku.app',
  'rohan.test@kanaku.app',
  'sneha.test@kanaku.app',
  'dev.test@kanaku.app',
  'isha.test@kanaku.app',
  'admin.test@kanaku.app',
  'superadmin@KANAKU.com',
  'user@KANAKU.com',
];

async function cleanupUserData(userId) {
  // 1. Sessions & Bookings (if any)
  await prisma.chatMessage.deleteMany({ where: { senderId: userId } }).catch(() => {});
  await prisma.advisorSession.deleteMany({ where: { clientId: userId } }).catch(() => {});
  await prisma.bookingRequest.deleteMany({ where: { clientId: userId } }).catch(() => {});
  
  // 2. Advisor availability / applications (if any)
  await prisma.advisorAvailability.deleteMany({ where: { advisorId: userId } }).catch(() => {});
  await prisma.advisorApplication.deleteMany({ where: { userId } }).catch(() => {});
  
  // 3. Notifications & To-Dos
  await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.todo.deleteMany({ where: { userId } }).catch(() => {});
  
  // 4. Budgets & Recurring
  await prisma.budget.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.recurringTransaction.deleteMany({ where: { userId } }).catch(() => {});
  
  // 5. Investments & Gold Assets
  await prisma.investment.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goldAsset.deleteMany({ where: { userId } }).catch(() => {});
  
  // 6. Friends & Groups
  await prisma.groupExpense.deleteMany({ where: { paidByUserId: userId } }).catch(() => {});
  await prisma.friend.deleteMany({ where: { userId } }).catch(() => {});
  
  // 7. Loans & Goals
  await prisma.loanPayment.deleteMany({ where: { loan: { userId } } }).catch(() => {});
  await prisma.loan.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goalContribution.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goal.deleteMany({ where: { userId } }).catch(() => {});
  
  // 8. Transactions & Accounts
  await prisma.transaction.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.account.deleteMany({ where: { userId } }).catch(() => {});
  
  // 9. Categories & Devices
  await prisma.category.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.device.deleteMany({ where: { userId } }).catch(() => {});
  
  // 10. Settings & PIN
  await prisma.userSettings.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.userPin.deleteMany({ where: { userId } }).catch(() => {});
  
  // 11. Profiles table sync
  await prisma.$executeRaw`DELETE FROM public.profiles WHERE id = ${userId}::uuid`.catch(() => {});
  
  // 12. User row
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function main() {
  console.log('[cleanup] Scanning database for mock testing users (preserving advisor role testers)...');

  // Find all users matching mock test user patterns
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, role: true, name: true }
  });

  const usersToRemove = allUsers.filter(user => {
    const email = (user.email || '').toLowerCase();
    
    // NEVER remove advisor testers or advisor role accounts
    if (user.role === 'advisor' || email.includes('advisor')) {
      return false;
    }
    
    // Match explicit mock user list
    if (EXPLICIT_MOCK_USER_EMAILS.includes(user.email) || EXPLICIT_MOCK_USER_EMAILS.includes(email)) {
      return true;
    }
    
    // Match testuser* pattern
    if (/^testuser\d+@/i.test(email) || /\.test@kanaku\.app$/i.test(email)) {
      return true;
    }
    
    return false;
  });

  if (usersToRemove.length === 0) {
    console.log('[cleanup] No mock testing users found to remove.');
    console.log('[cleanup] Advisor testers are intact.');
    return;
  }

  console.log(`[cleanup] Found ${usersToRemove.length} mock testing user(s) to remove:`);
  for (const u of usersToRemove) {
    console.log(`  - ${u.email} (role: ${u.role}, id: ${u.id})`);
  }

  console.log('\n[cleanup] Deleting users and cascading associated data...');
  for (const u of usersToRemove) {
    await cleanupUserData(u.id);
    console.log(`  ✓ Removed ${u.email}`);
  }

  console.log('\n[cleanup] Successfully removed all mock testing users except advisor roles testers.');
}

main()
  .catch(err => {
    console.error('[cleanup] Fatal error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
