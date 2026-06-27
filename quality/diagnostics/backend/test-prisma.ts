import { prisma } from '../../../backend/src/db/prisma';

async function main() {
  try {
    console.log('Testing Prisma connection...');
    const usersCount = await prisma.user.count();
    console.log(`Users count: ${usersCount}`);
    
    console.log('Fetching first user...');
    const user = await prisma.user.findFirst({ select: { id: true, email: true } });
    console.log('First user:', user);
  } catch (error) {
    console.error('Prisma query failed:', error);
  } finally {
    // We don't have to disconnect here for a simple test
  }
}

main();
