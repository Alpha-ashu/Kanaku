import { prisma } from '../backend/src/db/prisma';

async function main() {
  const users = await prisma.user.findMany();
  console.log("=== USERS ===");
  console.log(users.map(u => ({ id: u.id, email: u.email, role: u.role, isApproved: u.isApproved, status: u.status })));

  const settings = await prisma.userSettings.findMany();
  console.log("=== SETTINGS ===");
  settings.forEach(s => {
    console.log(`User ID: ${s.userId}`);
    try {
      const parsed = JSON.parse(s.settings);
      console.log("Admin Global Feature Settings:", parsed.admin_global_feature_settings);
      console.log("Admin AI Feature Settings:", parsed.admin_ai_feature_settings);
    } catch (e) {
      console.log("Raw settings:", s.settings);
    }
  });
}

main().catch(console.error);
