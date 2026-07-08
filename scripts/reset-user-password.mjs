/**
 * One-off account recovery: set a user's password to a known value.
 *
 * Fixes the "Incorrect email or password" lockout for accounts whose stored
 * password is a Supabase-managed placeholder (or otherwise won't verify) by
 * writing a fresh local bcrypt hash — after which login uses bcrypt directly
 * (no external-provider dependency).
 *
 * Runs on YOUR machine against whatever DATABASE_URL is in backend/.env
 * (production Supabase by default). Nothing is sent anywhere.
 *
 * Usage (from repo root):
 *   node scripts/reset-user-password.mjs "you@example.com" "YourNewStrongPass123!"
 *
 * Password rules enforced by the app: >= 8 chars, upper + lower + digit + special.
 */
import { config } from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const [, , emailArg, newPassword] = process.argv;
if (!emailArg || !newPassword) {
  console.error('Usage: node scripts/reset-user-password.mjs "<email>" "<newPassword>"');
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();

const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
if (!strong.test(newPassword)) {
  console.error('❌ Password too weak. Need >= 8 chars with upper, lower, digit, and a special character.');
  process.exit(1);
}

const { PrismaClient } = await import('../backend/generated/prisma/index.js');
const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, status: true } });
  if (!user) {
    console.error(`❌ No account found for ${email}. (Check the exact email; it may live only in Supabase and need registration first.)`);
    process.exit(2);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed, updatedAt: new Date() } });

  console.log(`✅ Password reset for ${user.email} (role=${user.role}, status=${user.status}).`);
  console.log('   You can now log in with the new password. Change it from Settings afterwards if you like.');
  if (user.status && ['blocked', 'suspended'].includes(user.status)) {
    console.log(`   ⚠️  NOTE: this account status is "${user.status}" — login will still be refused until an admin re-activates it.`);
  }
} catch (err) {
  console.error('❌ Reset failed:', err?.message || String(err));
  process.exit(3);
} finally {
  await prisma.$disconnect();
}
