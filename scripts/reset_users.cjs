const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('../backend/generated/prisma');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const prisma = new PrismaClient();

const testPassword = process.env.SEED_TEST_PASSWORD || 'example-Test-password-123!';

const TARGET_USERS = [
  { email: 'arjun.test@kanaku.app', password: testPassword, firstName: 'Arjun', lastName: 'Sharma', mobile: '+91 9000000001', role: 'user' },
  { email: 'priya.test@kanaku.app', password: testPassword, firstName: 'Priya', lastName: 'Mehta', mobile: '+91 9000000002', role: 'user' }
];

async function main() {
  console.log('Resetting specific users in Supabase Auth & Prisma DB...');
  
  // 1. Get all pages of users from Supabase Auth to find the users
  let allUsers = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      console.error('Error listing users:', error);
      break;
    }
    if (users.length === 0) break;
    allUsers = allUsers.concat(users);
    page++;
  }
  
  console.log(`Found ${allUsers.length} users in Supabase Auth.`);
  
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 10);
  
  for (const u of TARGET_USERS) {
    console.log(`Processing: ${u.email}`);
    let authUser = allUsers.find(a => a.email?.toLowerCase() === u.email.toLowerCase());
    const metadata = {
      role: u.role,
      full_name: `${u.firstName} ${u.lastName}`,
      first_name: u.firstName,
      last_name: u.lastName,
      onboarding_completed: true,
    };
    
    if (!authUser) {
      console.log(`User ${u.email} not found in listing, creating...`);
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (createErr) {
        console.error(`Failed to create ${u.email}:`, createErr.message);
        continue;
      }
      authUser = created.user;
    } else {
      console.log(`User ${u.email} found with ID ${authUser.id}. Updating password...`);
      const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: u.password,
        user_metadata: metadata,
      });
      if (updateErr) {
        console.error(`Failed to update ${u.email}:`, updateErr.message);
        continue;
      }
      authUser = updated.user;
    }
    
    // Update Prisma DB
    const hashedPassword = await bcrypt.hash(u.password, 10);
    const name = `${u.firstName} ${u.lastName}`;
    
    const userRow = await prisma.user.upsert({
      where: { id: authUser.id },
      update: {
        email: u.email,
        name: name,
        password: hashedPassword,
        role: u.role,
        status: 'verified',
        isApproved: true,
        firstName: u.firstName,
        lastName: u.lastName,
        gender: 'male',
        dateOfBirth: new Date('1990-01-01'),
        jobType: 'Full-time Employment',
        salary: 80000,
        country: 'India',
        state: 'Maharashtra',
        city: 'Mumbai',
        avatarId: 'new-7',
        updatedAt: new Date(),
      },
      create: {
        id: authUser.id,
        email: u.email,
        name: name,
        password: hashedPassword,
        role: u.role,
        status: 'verified',
        isApproved: true,
        firstName: u.firstName,
        lastName: u.lastName,
        gender: 'male',
        dateOfBirth: new Date('1990-01-01'),
        jobType: 'Full-time Employment',
        salary: 80000,
        country: 'India',
        state: 'Maharashtra',
        city: 'Mumbai',
        avatarId: 'new-7',
      },
    });
    console.log(`  Upserted User table row -> id=${userRow.id}`);
    
    // UserSettings
    await prisma.userSettings.upsert({
      where: { userId: authUser.id },
      update: {
        currency: 'INR',
        language: 'en',
        updatedAt: new Date(),
      },
      create: {
        userId: authUser.id,
        currency: 'INR',
        language: 'en',
      },
    });
    
    // UserPin
    const hashedPin = await bcrypt.hash('142536', 10);
    await prisma.userPin.upsert({
      where: { userId: authUser.id },
      update: {
        pinHash: hashedPin,
        expiresAt: farFuture,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId: authUser.id,
        pinHash: hashedPin,
        expiresAt: farFuture,
        isActive: true,
      },
    });
    console.log(`  UserPin setup completed for ${u.email}`);
  }
  
  await prisma.$disconnect();
  console.log('Prisma disconnected, done!');
}

main();
