const path = require('node:path');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient, Prisma } = require('../generated/prisma');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'KANAKU@123';
const DEMO_PIN = process.env.DEMO_USER_PIN || '123456';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const DEMO_USERS = [
  {
    email: 'superadmin@KANAKU.com',
    role: 'admin',
    name: 'Super Admin',
    profile: {
      phone: '+91 9000000001',
      gender: 'male',
      dateOfBirth: '1988-01-15',
      jobType: 'Executive Director',
      monthlyIncome: 350000,
      country: 'India',
      state: 'Telangana',
      city: 'Hyderabad',
      avatarId: 'user-1',
    },
    account: {
      name: 'Admin Operations Account',
      type: 'bank',
      provider: 'HDFC Bank',
      country: 'IN',
      balance: 425000,
      currency: 'INR',
    },
    transaction: {
      type: 'income',
      amount: 125000,
      category: 'salary',
      description: 'Monthly admin operations allocation',
    },
    goal: {
      name: 'Platform Reserve',
      targetAmount: 1000000,
      currentAmount: 425000,
      category: 'business',
    },
  },
  {
    email: 'user@KANAKU.com',
    role: 'user',
    name: 'Demo User',
    profile: {
      phone: '+91 9000000002',
      gender: 'female',
      dateOfBirth: '1995-07-22',
      jobType: 'Product Designer',
      monthlyIncome: 95000,
      country: 'India',
      state: 'Karnataka',
      city: 'Bengaluru',
      avatarId: 'user-2',
    },
    account: {
      name: 'Personal Salary Account',
      type: 'bank',
      provider: 'ICICI Bank',
      country: 'IN',
      balance: 78500,
      currency: 'INR',
    },
    transaction: {
      type: 'expense',
      amount: 2450,
      category: 'groceries',
      description: 'Weekly household groceries',
    },
    goal: {
      name: 'Emergency Savings',
      targetAmount: 300000,
      currentAmount: 78500,
      category: 'savings',
    },
  },
  {
    email: 'advisore@KANAKU.com',
    role: 'advisor',
    name: 'Demo Advisor',
    profile: {
      phone: '+91 9000000003',
      gender: 'male',
      dateOfBirth: '1991-03-10',
      jobType: 'Financial Advisor',
      monthlyIncome: 180000,
      country: 'India',
      state: 'Maharashtra',
      city: 'Mumbai',
      avatarId: 'user-3',
    },
    account: {
      name: 'Advisor Practice Account',
      type: 'bank',
      provider: 'Axis Bank',
      country: 'IN',
      balance: 156000,
      currency: 'INR',
    },
    transaction: {
      type: 'income',
      amount: 18000,
      category: 'consulting',
      description: 'Client advisory session payout',
    },
    goal: {
      name: 'Client Workshop Fund',
      targetAmount: 250000,
      currentAmount: 156000,
      category: 'career',
    },
  },
];

const supabase = (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

const toDate = (value) => new Date(value);
const daysFromNow = (days) => {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
};

const splitName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
};

async function resolveAuthUserId(demoUser) {
  if (!supabase) {
    throw new Error('Supabase auth is not configured in .env. Unable to provision the requested login users.');
  }

  const signInResult = await supabase.auth.signInWithPassword({
    email: demoUser.email,
    password: DEMO_PASSWORD,
  });

  if (signInResult.data.user?.id) {
    await supabase.auth.signOut();
    return signInResult.data.user.id;
  }

  const { firstName, lastName } = splitName(demoUser.name);
  const signUpResult = await supabase.auth.signUp({
    email: demoUser.email,
    password: DEMO_PASSWORD,
    options: {
      data: {
        full_name: demoUser.name,
        first_name: firstName,
        last_name: lastName,
        role: demoUser.role,
      },
    },
  });

  if (signUpResult.error) {
    const message = signUpResult.error.message || 'Unknown Supabase signup error';
    const duplicateUser = /already registered|already exists|duplicate/i.test(message);

    if (duplicateUser) {
      throw new Error(
        `Supabase auth user ${demoUser.email} already exists with a different password. ` +
        'Reset that auth user manually or provide a service-role workflow to reconcile it.',
      );
    }

    throw new Error(`Failed to provision Supabase auth user ${demoUser.email}: ${message}`);
  }

  if (!signUpResult.data.user?.id) {
    throw new Error(`Supabase did not return a user id for ${demoUser.email}.`);
  }

  await supabase.auth.signOut();
  return signUpResult.data.user.id;
}

async function cleanupDatabase() {
  await prisma.payment.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.advisorSession.deleteMany();
  await prisma.bookingRequest.deleteMany();
  await prisma.groupExpenseMember.deleteMany();
  await prisma.goalContribution.deleteMany();
  await prisma.loanPayment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.groupExpense.deleteMany();
  await prisma.syncQueue.deleteMany();
  await prisma.profiles.deleteMany();
  await prisma.user.deleteMany();

  await prisma.$executeRawUnsafe('DELETE FROM public.ai_events;');
  await prisma.$executeRawUnsafe('DELETE FROM public.ai_insights;');
  await prisma.$executeRawUnsafe('DELETE FROM public.ai_model_runs;');
  await prisma.$executeRawUnsafe('DELETE FROM public.user_features;');
}

async function seedUser(demoUser, authUserId, passwordHash, pinHash) {
  const { firstName, lastName } = splitName(demoUser.name);
  const annualIncome = demoUser.profile.monthlyIncome * 12;

  await prisma.user.create({
    data: {
      id: authUserId,
      email: demoUser.email,
      name: demoUser.name,
      password: passwordHash,
      role: demoUser.role,
      isApproved: true,
      firstName,
      lastName,
      salary: annualIncome,
      dateOfBirth: toDate(demoUser.profile.dateOfBirth),
      jobType: demoUser.profile.jobType,
      gender: demoUser.profile.gender,
      country: demoUser.profile.country,
      state: demoUser.profile.state,
      city: demoUser.profile.city,
      avatarId: demoUser.profile.avatarId,
      status: 'verified',
    },
  });

  await prisma.profiles.create({
    data: {
      id: authUserId,
      email: demoUser.email,
      full_name: demoUser.name,
      first_name: firstName,
      last_name: lastName,
      phone: demoUser.profile.phone,
      gender: demoUser.profile.gender,
      date_of_birth: toDate(demoUser.profile.dateOfBirth),
      monthly_income: new Prisma.Decimal(demoUser.profile.monthlyIncome),
      annual_income: new Prisma.Decimal(annualIncome),
      job_type: demoUser.profile.jobType,
      country: demoUser.profile.country,
      state: demoUser.profile.state,
      city: demoUser.profile.city,
      avatar_id: demoUser.profile.avatarId,
      avatar_url: null,
      visible_features: {
        dashboard: true,
        accounts: true,
        transactions: true,
        advisorPanel: demoUser.role === 'advisor' || demoUser.role === 'admin',
        adminPanel: demoUser.role === 'admin',
      },
    },
  });

  await prisma.userSettings.create({
    data: {
      userId: authUserId,
      theme: 'light',
      language: 'en',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      settings: JSON.stringify({
        role: demoUser.role,
        notifications: true,
        demo: true,
      }),
    },
  });

  await prisma.userPin.create({
    data: {
      userId: authUserId,
      pinHash,
      expiresAt: daysFromNow(90),
      isActive: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  const account = await prisma.account.create({
    data: {
      userId: authUserId,
      name: demoUser.account.name,
      type: demoUser.account.type,
      provider: demoUser.account.provider,
      country: demoUser.account.country,
      balance: demoUser.account.balance,
      currency: demoUser.account.currency,
      isActive: true,
      syncStatus: 'synced',
    },
  });

  await prisma.transaction.create({
    data: {
      userId: authUserId,
      accountId: account.id,
      type: demoUser.transaction.type,
      amount: demoUser.transaction.amount,
      category: demoUser.transaction.category,
      description: demoUser.transaction.description,
      date: new Date(),
      syncStatus: 'synced',
      synced: true,
    },
  });

  await prisma.goal.create({
    data: {
      userId: authUserId,
      name: demoUser.goal.name,
      targetAmount: demoUser.goal.targetAmount,
      currentAmount: demoUser.goal.currentAmount,
      targetDate: daysFromNow(180),
      category: demoUser.goal.category,
      syncStatus: 'synced',
    },
  });

  await prisma.todo.create({
    data: {
      userId: authUserId,
      title: `${demoUser.role.toUpperCase()}: review demo workspace`,
      completed: false,
    },
  });

  await prisma.notification.create({
    data: {
      userId: authUserId,
      title: 'Demo account ready',
      message: `Your ${demoUser.role} workspace has been reset and seeded.`,
      type: 'info',
      category: 'system',
    },
  });

  if (demoUser.role === 'advisor') {
    await prisma.advisorAvailability.create({
      data: {
        advisorId: authUserId,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isActive: true,
      },
    });
  }
}

async function main() {
  console.log('Resolving Supabase auth users for demo accounts...');
  const authUsers = [];

  for (const demoUser of DEMO_USERS) {
    const authUserId = await resolveAuthUserId(demoUser);
    authUsers.push({ ...demoUser, authUserId });
    console.log(`  ${demoUser.email} -> ${authUserId}`);
  }

  console.log('Cleaning application database...');
  await cleanupDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const pinHash = await bcrypt.hash(DEMO_PIN, 10);

  console.log('Seeding demo users and mock data...');
  for (const demoUser of authUsers) {
    await seedUser(demoUser, demoUser.authUserId, passwordHash, pinHash);
  }

  const summary = await Promise.all(
    authUsers.map(async (demoUser) => ({
      email: demoUser.email,
      role: demoUser.role,
      accounts: await prisma.account.count({ where: { userId: demoUser.authUserId, deletedAt: null } }),
      transactions: await prisma.transaction.count({ where: { userId: demoUser.authUserId, deletedAt: null } }),
      goals: await prisma.goal.count({ where: { userId: demoUser.authUserId, deletedAt: null } }),
      todos: await prisma.todo.count({ where: { userId: demoUser.authUserId } }),
      notifications: await prisma.notification.count({ where: { userId: demoUser.authUserId, deletedAt: null } }),
      hasPin: await prisma.userPin.count({ where: { userId: demoUser.authUserId, isActive: true } }),
    })),
  );

  console.log('Demo reset complete.');
  console.log(JSON.stringify({
    loginPassword: DEMO_PASSWORD,
    pin: DEMO_PIN,
    users: summary,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Demo reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
