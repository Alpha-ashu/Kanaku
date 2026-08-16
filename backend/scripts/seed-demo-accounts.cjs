/**
 * Seed 12 Configurable Demo Identities for Kanaku
 * 
 * Cohort:
 * - 5 Demo Users: demouser1..demouser5@kanaku.com (role: user, accountType: DEMO)
 * - 5 Demo Advisors: demoadvisor1..demoadvisor5@kanaku.com (role: advisor, accountType: DEMO)
 * - 1 Demo Manager: demomanager@kanaku.com (role: manager, accountType: DEMO)
 * - 1 Demo Admin: demoadmin@kanaku.com (role: admin, accountType: DEMO)
 * 
 * Password derived securely from SEED_TEST_PASSWORD env variable (fallback: DemoPass@123).
 * Idempotent execution.
 */

const { config } = require('dotenv');
config();

const bcrypt = require('bcrypt');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/prisma');

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL or DIRECT_URL is required to run seed-demo-accounts.cjs');
  process.exit(1);
}

const adapter = new PrismaPg(databaseUrl);
const prisma = new PrismaClient({ adapter });

const DEFAULT_DEMO_PASSWORD = process.env.SEED_TEST_PASSWORD || 'DemoPass@123';

const DEMO_USERS = [
  {
    email: 'demouser1@kanaku.com',
    name: 'Aarav Sharma',
    role: 'user',
    phone: '+919811111111',
    balance: 125000,
    job: 'Senior Software Engineer',
    salary: 2400000,
  },
  {
    email: 'demouser2@kanaku.com',
    name: 'Priya Patel',
    role: 'user',
    phone: '+919822222222',
    balance: 85000,
    job: 'Product Marketing Lead',
    salary: 1800000,
  },
  {
    email: 'demouser3@kanaku.com',
    name: 'Rohan Mehta',
    role: 'user',
    phone: '+919833333333',
    balance: 340000,
    job: 'Operations Consultant',
    salary: 2200000,
  },
  {
    email: 'demouser4@kanaku.com',
    name: 'Ananya Iyer',
    role: 'user',
    phone: '+919844444444',
    balance: 62000,
    job: 'UX Design Architect',
    salary: 1600000,
  },
  {
    email: 'demouser5@kanaku.com',
    name: 'Vikram Sengupta',
    role: 'user',
    phone: '+919855555555',
    balance: 195000,
    job: 'Data Engineering Specialist',
    salary: 2100000,
  },
];

const DEMO_ADVISORS = [
  {
    email: 'demoadvisor1@kanaku.com',
    name: 'Dr. Rajesh Verma, CFP',
    role: 'advisor',
    phone: '+919866666661',
    experience: 12,
    rate: 2000,
    specializations: ['Retirement Planning', 'Estate Planning', 'Tax Structuring'],
    bio: 'SEBI-registered investment advisor with 12+ years optimizing personal balance sheets and long-term retirement portfolios.',
  },
  {
    email: 'demoadvisor2@kanaku.com',
    name: 'Sunita Rao, CFA',
    role: 'advisor',
    phone: '+919866666662',
    experience: 9,
    rate: 1800,
    specializations: ['Equity Portfolios', 'Mutual Funds', 'NRI Wealth Management'],
    bio: 'Chartered Financial Analyst specializing in diversified growth portfolios, index funds, and global asset allocation.',
  },
  {
    email: 'demoadvisor3@kanaku.com',
    name: 'Amitabh Joshi',
    role: 'advisor',
    phone: '+919866666663',
    experience: 15,
    rate: 2500,
    specializations: ['Debt Free Strategies', 'Real Estate Asset Management', 'Tax Optimization'],
    bio: 'Veteran wealth strategist focused on accelerated debt clearance, mortgage refinancing, and real estate ROI.',
  },
  {
    email: 'demoadvisor4@kanaku.com',
    name: 'Kavita Menon, CFP',
    role: 'advisor',
    phone: '+919866666664',
    experience: 7,
    rate: 1500,
    specializations: ['Young Professional Financial Independence', 'FIRE Strategy', 'Budgeting'],
    bio: 'Empowering millennial and Gen-Z earners with disciplined systematic investing, automated savings, and emergency resilience.',
  },
  {
    email: 'demoadvisor5@kanaku.com',
    name: 'Harish Nambiar',
    role: 'advisor',
    phone: '+919866666665',
    experience: 11,
    rate: 2200,
    specializations: ['Small Business Treasury', 'Family Office Consulting', 'Alternative Assets'],
    bio: 'Specialist in cash flow management, startup equity vesting, and generational wealth preservation.',
  },
];

const DEMO_MANAGERS = [
  {
    email: 'demomanager@kanaku.com',
    name: 'Meera Deshmukh (Demo Manager)',
    role: 'manager',
    phone: '+919877777771',
    job: 'Regional Compliance & Quality Manager',
    salary: 2800000,
  },
];

const DEMO_ADMINS = [
  {
    email: 'demoadmin@kanaku.com',
    name: 'Siddharth Roy (Demo Admin)',
    role: 'admin',
    phone: '+919888888881',
    job: 'Platform Operations Administrator',
    salary: 3200000,
  },
];

const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income', color: '#10B981', icon: 'wallet' },
  { name: 'Investments', type: 'income', color: '#3B82F6', icon: 'trending-up' },
  { name: 'Housing & Rent', type: 'expense', color: '#EF4444', icon: 'home' },
  { name: 'Groceries & Food', type: 'expense', color: '#F59E0B', icon: 'shopping-cart' },
  { name: 'Utilities & Bills', type: 'expense', color: '#8B5CF6', icon: 'zap' },
  { name: 'Transport & Travel', type: 'expense', color: '#06B6D4', icon: 'truck' },
  { name: 'Healthcare', type: 'expense', color: '#EC4899', icon: 'activity' },
  { name: 'Entertainment & Dining', type: 'expense', color: '#6366F1', icon: 'film' },
];

async function seedIdentity(identity, passwordHash) {
  const isAdvisor = identity.role === 'advisor';
  const isApproved = isAdvisor || identity.role === 'user' || identity.role === 'manager' || identity.role === 'admin';

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email: identity.email },
    update: {
      name: identity.name,
      password: passwordHash,
      role: identity.role,
      isApproved: isApproved,
      accountType: 'DEMO',
      demoStatus: 'ENABLED',
      status: 'verified',
      emailVerified: true,
    },
    create: {
      email: identity.email,
      name: identity.name,
      password: passwordHash,
      role: identity.role,
      isApproved: isApproved,
      accountType: 'DEMO',
      demoStatus: 'ENABLED',
      status: 'verified',
      emailVerified: true,
    },
  });

  // Profiles
  const nameParts = identity.name.split(' ');
  const firstName = nameParts[0] || 'Demo';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  await prisma.$executeRaw`
    INSERT INTO public.profiles (
      id, email, first_name, last_name, full_name, phone,
      job_type, monthly_income, annual_income, created_at, updated_at
    ) VALUES (
      ${user.id}::uuid, ${user.email}, ${firstName}, ${lastName},
      ${user.name}, ${identity.phone || null},
      ${identity.job || (isAdvisor ? 'Certified Financial Advisor' : 'Professional')},
      ${identity.salary ? Math.round(identity.salary / 12) : 150000},
      ${identity.salary || 1800000},
      NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      job_type = EXCLUDED.job_type,
      updated_at = NOW();
  `;

  // Settings
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      currency: 'INR',
      language: 'en-IN',
      timezone: 'Asia/Kolkata',
    },
    create: {
      userId: user.id,
      currency: 'INR',
      language: 'en-IN',
      timezone: 'Asia/Kolkata',
      settings: { notifications: { email: true, push: true, inApp: true } },
    },
  });

  // Categories
  for (const cat of DEFAULT_CATEGORIES) {
    const existingCat = await prisma.category.findFirst({
      where: { userId: user.id, name: cat.name },
    });
    if (!existingCat) {
      await prisma.category.create({
        data: {
          userId: user.id,
          name: cat.name,
          type: cat.type,
          color: cat.color,
          icon: cat.icon,
        },
      });
    }
  }

  // Baseline Primary Bank Account
  const existingAcc = await prisma.account.findFirst({
    where: { userId: user.id, name: 'HDFC Salary Account' },
  });

  let primaryAcc = existingAcc;
  if (!existingAcc) {
    primaryAcc = await prisma.account.create({
      data: {
        userId: user.id,
        name: 'HDFC Salary Account',
        type: 'savings',
        balance: identity.balance || 75000,
        openingBalance: identity.balance || 75000,
        currency: 'INR',
        provider: 'HDFC Bank',
      },
    });
  }

  // Advisor Profile
  if (isAdvisor) {
    const expertiseStr = Array.isArray(identity.specializations)
      ? identity.specializations.join(', ')
      : 'Wealth Management, Retirement Planning';

    await prisma.advisorApplication.upsert({
      where: { userId: user.id },
      update: {
        fullName: identity.name,
        phone: identity.phone,
        status: 'APPROVED',
        experienceYears: identity.experience || 8,
        expertise: expertiseStr,
        bio: identity.bio || 'Professional advisor',
        hourlyRate: identity.rate || 1800,
      },
      create: {
        userId: user.id,
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone,
        status: 'APPROVED',
        experienceYears: identity.experience || 8,
        expertise: expertiseStr,
        bio: identity.bio || 'Professional advisor',
        hourlyRate: identity.rate || 1800,
      },
    });

    // Seed Availability
    const days = [1, 2, 3, 4, 5]; // Mon-Fri
    for (const day of days) {
      const existingAvail = await prisma.advisorAvailability.findFirst({
        where: { advisorId: user.id, dayOfWeek: day },
      });
      if (!existingAvail) {
        await prisma.advisorAvailability.create({
          data: {
            advisorId: user.id,
            dayOfWeek: day,
            startTime: '10:00',
            endTime: '18:00',
            isActive: true,
          },
        });
      }
    }
  }

  // Seed sample transactions if user has no transactions
  if (primaryAcc && identity.role === 'user') {
    const txCount = await prisma.transaction.count({ where: { userId: user.id } });
    if (txCount === 0) {
      const now = new Date();
      await prisma.transaction.createMany({
        data: [
          {
            userId: user.id,
            accountId: primaryAcc.id,
            amount: 150000,
            type: 'income',
            category: 'Salary',
            description: 'Monthly Salary Credit',
            date: new Date(now.getFullYear(), now.getMonth(), 1),
            status: 'POSTED',
          },
          {
            userId: user.id,
            accountId: primaryAcc.id,
            amount: 28000,
            type: 'expense',
            category: 'Housing & Rent',
            description: 'Apartment Monthly Rent',
            date: new Date(now.getFullYear(), now.getMonth(), 5),
            status: 'POSTED',
          },
          {
            userId: user.id,
            accountId: primaryAcc.id,
            amount: 6450,
            type: 'expense',
            category: 'Groceries & Food',
            description: 'Supermarket weekly groceries',
            date: new Date(now.getFullYear(), now.getMonth(), 8),
            status: 'POSTED',
          },
          {
            userId: user.id,
            accountId: primaryAcc.id,
            amount: 25000,
            type: 'expense',
            category: 'Investments',
            description: 'Nifty 50 Index SIP',
            date: new Date(now.getFullYear(), now.getMonth(), 10),
            status: 'POSTED',
          },
        ],
      });

      // Sample Goal
      await prisma.goal.create({
        data: {
          userId: user.id,
          name: 'Emergency Fund',
          targetAmount: 500000,
          currentAmount: 120000,
          targetDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
        },
      });

      // Sample Investment
      await prisma.investment.create({
        data: {
          userId: user.id,
          assetType: 'mutual_fund',
          assetName: 'HDFC Balanced Advantage Fund',
          quantity: 100,
          buyPrice: 1000,
          currentPrice: 1145,
          totalInvested: 100000,
          currentValue: 114500,
          profitLoss: 14500,
          purchaseDate: new Date(now.getFullYear() - 1, now.getMonth(), 15),
          lastUpdated: new Date(),
        },
      });
    }
  }

  return user;
}

async function main() {
  console.log('🚀 Starting demo accounts seeding...');
  const passwordHash = await bcrypt.hash(DEFAULT_DEMO_PASSWORD, 12);

  const allIdentities = [
    ...DEMO_USERS,
    ...DEMO_ADVISORS,
    ...DEMO_MANAGERS,
    ...DEMO_ADMINS,
  ];

  console.log(`📋 Seeding ${allIdentities.length} demo identities (5 Users, 5 Advisors, 1 Manager, 1 Admin)...`);

  for (const identity of allIdentities) {
    const user = await seedIdentity(identity, passwordHash);
    console.log(`  ✅ [${identity.role.toUpperCase()}] ${identity.name} (${identity.email}) -> ID: ${user.id}`);
  }

  console.log('\n✨ Demo accounts seeding complete!');
  console.log('--------------------------------------------------');
  console.log('Account Type: DEMO | Demo Status: ENABLED | Email: Verified');
  console.log(`Default Demo Password: ${DEFAULT_DEMO_PASSWORD}`);
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding demo accounts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
