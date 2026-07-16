const path = require('path');
if (process.argv.includes('--test')) {
  console.log('[Locks] Running in TEST mode. Loading .env.test...');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });
} else {
  require('dotenv').config();
}

const { PrismaClient } = require('../generated/prisma');

async function main() {
  const prisma = new PrismaClient();
  console.log('[Locks] Connecting to database...');
  await prisma.$connect();
  console.log('[Locks] Terminating other active database sessions to clear locks...');
  try {
    const terminated = await prisma.$queryRawUnsafe(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = current_database() AND pid <> pg_backend_pid();
    `);
    console.log('[Locks] Terminated other sessions:', terminated);
  } catch (err) {
    console.error('[Locks] Failed to terminate backends (possibly insufficient permissions, skipping):', err.message);
  }
  await prisma.$disconnect();
  console.log('[Locks] Completed.');
}

main().catch((err) => {
  console.error('[Locks] Clear failed:', err);
  process.exit(1);
});
