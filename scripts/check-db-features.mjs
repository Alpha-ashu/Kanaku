import { PrismaClient } from '../backend/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const platformSettings = await prisma.platformSettings.findUnique({
    where: { id: 'global' }
  });
  console.log('USER ROLE SETTINGS IN DB:');
  console.log(JSON.stringify(platformSettings?.settings?.admin_global_feature_settings?.user, null, 2));
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
