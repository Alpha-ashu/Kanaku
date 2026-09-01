require('dotenv').config({ path: 'backend/.env' });
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});
async function go() {
  const txs = await prisma.transaction.findMany({
    where: { description: { startsWith: 'Concurrent write test' } },
    orderBy: { createdAt: 'desc' }
  });
  console.log('Count:', txs.length);
  txs.forEach(t => console.log(t.id, t.description, t.amount.toString(), t.createdAt));
}
go().catch(console.error).finally(() => prisma.$disconnect());
