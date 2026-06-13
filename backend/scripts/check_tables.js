const { PrismaClient } = require('./generated/prisma');
const prisma = new PrismaClient();

async function main() {
    const result = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
