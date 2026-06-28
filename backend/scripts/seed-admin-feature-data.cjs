const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'shaik.job.details@gmail.com';
const ADMIN_PASSWORD = '123456789';
const ADMIN_PIN = '123456';

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function ensureAdminUser() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: 'Admin User',
        password: hashedPassword,
        role: 'admin',
        isApproved: true,
      },
    });
    return created;
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      password: hashedPassword,
      role: 'admin',
      isApproved: true,
      updatedAt: new Date(),
    },
  });

  return updated;
}

async function ensurePin(userId) {
  const pinHash = await bcrypt.hash(ADMIN_PIN, 10);
  await prisma.userPin.upsert({
    where: { userId },
    update: {
      pinHash,
      expiresAt: daysFromNow(90),
      isActive: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
    create: {
      userId,
      pinHash,
      expiresAt: daysFromNow(90),
      isActive: true,
    },
  });
}

async function seedAccounts(userId) {
  const accountsSeed = [
    { name: 'Primary Checking', type: 'bank', provider: 'SBI', country: 'IN', balance: 85000, currency: 'INR' },
    { name: 'Emergency Savings', type: 'bank', provider: 'HDFC', country: 'IN', balance: 240000, currency: 'INR' },
    { name: 'Business Wallet', type: 'wallet', provider: 'Paytm', country: 'IN', balance: 19000, currency: 'INR' },
    { name: 'Travel Card', type: 'card', provider: 'ICICI', country: 'IN', balance: 12000, currency: 'INR' },
  ];

  const existing = await prisma.account.findMany({ where: { userId, deletedAt: null } });
  if (existing.length >= accountsSeed.length) {
    return existing;
  }

  const created = [];
  for (const account of accountsSeed) {
    const record = await prisma.account.create({
      data: {
        userId,
        ...account,
        isActive: true,
        syncStatus: 'synced',
      },
    });
    created.push(record);
  }

  return [...existing, ...created];
}

async function seedTransactions(userId, accounts) {
  const existingCount = await prisma.transaction.count({ where: { userId, deletedAt: null } });
  if (existingCount >= 40) return;

  const categoriesExpense = ['groceries', 'rent', 'utilities', 'transport', 'dining', 'subscriptions'];
  const categoriesIncome = ['salary', 'freelance', 'bonus'];

  for (let i = 0; i < 36; i += 1) {
    const isIncome = i % 5 === 0;
    const account = accounts[i % accounts.length];
    await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        type: isIncome ? 'income' : 'expense',
        amount: isIncome ? 30000 + i * 250 : 500 + i * 130,
        category: isIncome ? categoriesIncome[i % categoriesIncome.length] : categoriesExpense[i % categoriesExpense.length],
        description: isIncome ? `Income ${i + 1}` : `Expense ${i + 1}`,
        date: daysAgo(120 - i * 3),
        syncStatus: 'synced',
        synced: true,
      },
    });
  }

  // Future-dated items to surface in calendar widgets.
  for (let i = 1; i <= 4; i += 1) {
    await prisma.transaction.create({
      data: {
        userId,
        accountId: accounts[0].id,
        type: 'expense',
        amount: 1500 + i * 200,
        category: 'bills',
        description: `Upcoming Bill ${i}`,
        date: daysFromNow(i * 7),
        syncStatus: 'synced',
        synced: true,
      },
    });
  }
}

async function seedGoals(userId) {
  const existingCount = await prisma.goal.count({ where: { userId, deletedAt: null } });
  if (existingCount >= 3) return;

  const goals = [
    { name: 'Emergency Corpus', targetAmount: 500000, currentAmount: 195000, targetDate: daysFromNow(220), category: 'savings', isGroupGoal: false },
    { name: 'Family Vacation', targetAmount: 160000, currentAmount: 62000, targetDate: daysFromNow(120), category: 'travel', isGroupGoal: true },
    { name: 'Home Upgrade', targetAmount: 300000, currentAmount: 90000, targetDate: daysFromNow(300), category: 'home', isGroupGoal: false },
  ];

  for (const goal of goals) {
    await prisma.goal.create({ data: { userId, ...goal, syncStatus: 'synced' } });
  }
}

async function seedLoans(userId, accounts) {
  const existingCount = await prisma.loan.count({ where: { userId, deletedAt: null } });
  if (existingCount >= 2) return;

  const loans = [
    {
      type: 'borrowed',
      name: 'Car Loan',
      principalAmount: 900000,
      outstandingBalance: 620000,
      interestRate: 8.4,
      emiAmount: 18200,
      dueDate: daysFromNow(8),
      frequency: 'monthly',
      status: 'active',
      contactPerson: 'City Bank',
    },
    {
      type: 'lent',
      name: 'Family Support Loan',
      principalAmount: 120000,
      outstandingBalance: 45000,
      interestRate: 0,
      emiAmount: 7500,
      dueDate: daysFromNow(15),
      frequency: 'monthly',
      status: 'active',
      contactPerson: 'Relative',
    },
  ];

  const created = [];
  for (const loan of loans) {
    const record = await prisma.loan.create({ data: { userId, ...loan, syncStatus: 'synced' } });
    created.push(record);
  }

  for (const loan of created) {
    await prisma.loanPayment.create({
      data: {
        loanId: loan.id,
        amount: Math.max(4000, (loan.emiAmount || 5000) - 1000),
        accountId: accounts[0].id,
        date: daysAgo(18),
        notes: 'Seeded payment record',
      },
    });
  }
}

async function seedInvestments(userId) {
  const existingCount = await prisma.investment.count({ where: { userId, deletedAt: null } });
  if (existingCount >= 4) return;

  const investments = [
    { assetType: 'stock', assetName: 'TCS', quantity: 20, buyPrice: 3400, currentPrice: 3950 },
    { assetType: 'crypto', assetName: 'BTC', quantity: 0.08, buyPrice: 3200000, currentPrice: 3900000 },
    { assetType: 'gold', assetName: 'Gold ETF', quantity: 12, buyPrice: 5800, currentPrice: 6400 },
    { assetType: 'forex', assetName: 'USDINR Position', quantity: 1500, buyPrice: 82.4, currentPrice: 83.1 },
  ];

  for (const inv of investments) {
    const totalInvested = inv.quantity * inv.buyPrice;
    const currentValue = inv.quantity * inv.currentPrice;
    await prisma.investment.create({
      data: {
        userId,
        ...inv,
        totalInvested,
        currentValue,
        profitLoss: currentValue - totalInvested,
        purchaseDate: daysAgo(200),
        lastUpdated: new Date(),
      },
    });
  }
}

async function seedTodos(userId) {
  // Clear any existing todo lists for this user
  await prisma.$executeRaw`DELETE FROM public.todo_lists WHERE user_id = ${userId}::uuid`.catch(() => {});

  const todos = [
    { title: 'Review monthly budget', completed: false },
    { title: 'Pay electricity bill', completed: false },
    { title: 'Update investment log', completed: true },
    { title: 'Plan next quarter savings', completed: false },
    { title: 'Check loan amortization', completed: true },
    { title: 'Export tax report draft', completed: false },
  ];

  // Populate prisma.todo for compatibility
  const existingCount = await prisma.todo.count({ where: { userId } });
  if (existingCount < todos.length) {
    for (const todo of todos) {
      await prisma.todo.create({ data: { userId, ...todo } }).catch(() => {});
    }
  }

  // Populate actual public.todo_lists / public.todo_items used by frontend
  const [individualList] = await prisma.$queryRaw`
    INSERT INTO public.todo_lists (user_id, name, description)
    VALUES (${userId}::uuid, 'Admin Checklist', 'Individual list')
    RETURNING id::int AS id
  `;

  for (const todo of todos) {
    await prisma.$executeRaw`
      INSERT INTO public.todo_items (list_id, user_id, title, completed, created_by)
      VALUES (${individualList.id}::bigint, ${userId}::uuid, ${todo.title}, ${todo.completed}, ${userId}::uuid)
    `;
  }
}

async function seedSettings(userId) {
  await prisma.userSettings.upsert({
    where: { userId },
    update: {
      theme: 'light',
      language: 'en',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      settings: JSON.stringify({
        notifications: true,
        reportPeriod: 'monthly',
        quickActions: ['add-transaction', 'add-account', 'add-goal'],
      }),
    },
    create: {
      userId,
      theme: 'light',
      language: 'en',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      settings: JSON.stringify({
        notifications: true,
        reportPeriod: 'monthly',
        quickActions: ['add-transaction', 'add-account', 'add-goal'],
      }),
    },
  });
}

async function main() {
  console.log('Starting admin feature data seeding...');

  const admin = await ensureAdminUser();
  await ensurePin(admin.id);

  const accounts = await seedAccounts(admin.id);
  await seedTransactions(admin.id, accounts);
  await seedGoals(admin.id);
  await seedLoans(admin.id, accounts);
  await seedInvestments(admin.id);
  await seedTodos(admin.id);
  await seedSettings(admin.id);

  const summary = {
    email: ADMIN_EMAIL,
    role: 'admin',
    pinSeeded: true,
    accounts: await prisma.account.count({ where: { userId: admin.id, deletedAt: null } }),
    transactions: await prisma.transaction.count({ where: { userId: admin.id, deletedAt: null } }),
    goals: await prisma.goal.count({ where: { userId: admin.id, deletedAt: null } }),
    loans: await prisma.loan.count({ where: { userId: admin.id, deletedAt: null } }),
    investments: await prisma.investment.count({ where: { userId: admin.id, deletedAt: null } }),
    todos: await prisma.todo.count({ where: { userId: admin.id } }),
    settings: await prisma.userSettings.count({ where: { userId: admin.id } }),
  };

  console.log('Seeding complete:', summary);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
