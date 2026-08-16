import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

/**
 * Shared Prisma singleton used across modules.
 * Prevents multiple PrismaClient instances during development hot-reloads.
 */
declare global {
  var __prisma: PrismaClient | undefined;
}

// Prisma 7 requires a driver adapter — schema.prisma no longer carries a url
// (see db/prisma.ts for the full explanation).
const connectionString = process.env.NODE_ENV === 'test'
  ? process.env.DIRECT_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[Prisma] No database connection string resolved (DATABASE_URL unset).');
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    adapter: new PrismaPg(connectionString),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
