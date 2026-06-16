const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const prisma = new PrismaClient();

const USERS = [
  { firstName: 'Arjun',  lastName: 'Sharma',  email: 'arjun.test@finora.app',  mobile: '+91 9000000001', password: 'TestFinora@2026', persona: 'Debt Manager', role: 'user' },
  { firstName: 'Priya',  lastName: 'Mehta',   email: 'priya.test@finora.app',   mobile: '+91 9000000002', password: 'TestFinora@2026', persona: 'Group Splitter', role: 'user' },
  { firstName: 'Rohan',  lastName: 'Verma',   email: 'rohan.test@finora.app',   mobile: '+91 9000000003', password: 'TestFinora@2026', persona: 'Investor', role: 'user' },
  { firstName: 'Sneha',  lastName: 'Kapoor',  email: 'sneha.test@finora.app',   mobile: '+91 9000000004', password: 'TestFinora@2026', persona: 'Goal Setter', role: 'user' },
  { firstName: 'Dev',    lastName: 'Nair',    email: 'dev.test@finora.app',     mobile: '+91 9000000005', password: 'TestFinora@2026', persona: 'Portfolio Builder', role: 'user' },
  { firstName: 'Isha',   lastName: 'Patel',   email: 'isha.test@finora.app',    mobile: '+91 9000000006', password: 'TestFinora@2026', persona: 'Planner', role: 'user' },
  { firstName: 'Power',  lastName: 'User',    email: 'admin.test@finora.app',   mobile: '+91 9000000007', password: 'TestFinora@2026', persona: 'Power User', role: 'admin' },
];

async function seed() {
  console.log('Starting E2E users seeding...');
  
  const { data: authList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('Cannot list auth users:', listErr.message);
    process.exit(1);
  }

  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 10);

  for (const u of USERS) {
    console.log(`Processing: ${u.email}`);
    
    try {
      // 1. Supabase Auth
      let authUser = authList.users.find(a => a.email?.toLowerCase() === u.email.toLowerCase());
      const metadata = {
        role: u.role,
        full_name: `${u.firstName} ${u.lastName}`,
        first_name: u.firstName,
        last_name: u.lastName,
        onboarding_completed: true,
      };

      if (!authUser) {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: metadata,
        });
        if (createErr) throw createErr;
        authUser = created.user;
        console.log(`  Created auth user -> ${authUser.id}`);
      } else {
        await supabase.auth.admin.updateUserById(authUser.id, {
          password: u.password,
          user_metadata: metadata,
        });
        console.log(`  Updated auth user -> ${authUser.id}`);
      }

      // 2. Prisma Database
      const hashedPassword = await bcrypt.hash(u.password, 10);
      const name = `${u.firstName} ${u.lastName}`;
      
      const userRow = await prisma.user.upsert({
        where: { email: u.email },
        update: {
          id: authUser.id,
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

      // 3. UserSettings
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
      console.log(`  Upserted UserSettings -> INR / en`);

      // 4. UserPin
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
      console.log(`  Upserted UserPin -> 142536`);

    } catch (err) {
      console.error(`  Error processing ${u.email}:`, err.message);
    }
  }

  await prisma.$disconnect();
  console.log('Seeding complete!');
}

seed();
