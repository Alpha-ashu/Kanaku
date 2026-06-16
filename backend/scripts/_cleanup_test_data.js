const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();
(async () => {
  await prisma.collaborationParticipant.deleteMany({ where: { email: 'sheikh.ashraf.demo@example.com' } });
  await prisma.groupExpenseMember.deleteMany({ where: { email: 'sheikh.ashraf.demo@example.com' } });
  await prisma.groupExpense.deleteMany({ where: { name: { in: ['Lifecycle Logging Test', 'Lifecycle Logging Test 2'] } } });
  await prisma.friend.deleteMany({ where: { name: 'Sheikh Ashraf', email: 'sheikh.ashraf.demo@example.com' } });
  console.log('Cleaned up lifecycle test data.');
  await prisma.$disconnect();
})();
