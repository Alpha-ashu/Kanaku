const { PrismaClient } = require('./generated/prisma');
const prisma = new PrismaClient();

async function main() {
    const result = await prisma.$queryRaw`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles'`;
    console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
