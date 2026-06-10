import { prisma } from './prisma';

async function run() {
  try {
    console.log('Querying users via Prisma...');
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, isApproved: true }
    });
    console.log('Users in database:', users);

    console.log('Querying UserPin for user@KANAKU.com...');
    const userPin = await prisma.userPin.findFirst({
      where: { userId: '17fec621-f481-44ae-8597-97e127c0f9a2' }
    });
    console.log('UserPin in database:', userPin);

    console.log('Querying Accounts...');
    const accounts = await prisma.account.findMany();
    console.log('Accounts in database:', accounts.length);
  } catch (err) {
    console.error('Prisma query failed:', err);
  }
}

run();
