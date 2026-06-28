/**
 * seed-test-users.cjs
 *
 * Creates a TESTING cohort: 5 user-role accounts + 5 advisor-role accounts,
 * each with comprehensive mock data (accounts, transactions, goals, loans,
 * investments, budgets, recurring transactions, friends, notifications; plus
 * advisor application + availability for advisor accounts).
 *
 * This complements the four CANONICAL accounts created by:
 *   seed-production-roles.cjs  → admin/manager/advisor/user @kanaku.com (identities)
 *   seed-mock-data.cjs         → their full mock data
 *
 * Test cohort emails (the ONLY test logins the project ships):
 *   testuser1@kanaku.com    … testuser5@kanaku.com     (role: user)
 *   testadvisor1@kanaku.com … testadvisor5@kanaku.com  (role: advisor)
 *
 * Shared password: SEED_TEST_PASSWORD  (default: Test@Kanaku#2026)
 *
 * Idempotent — re-running upserts the identity and rebuilds that user's mock
 * data from scratch (cleanup → reseed), so counts never balloon.
 *
 * Usage:
 *   # local (reads DATABASE_URL from backend/.env via your shell)
 *   DATABASE_URL="postgresql://..." node backend/scripts/seed-test-users.cjs
 *   # Fly.io
 *   fly ssh console --app kanaku -C "node scripts/seed-test-users.cjs"
 */

'use strict';

const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD || 'Test@Kanaku#2026';
const COHORT_SIZE = 5;

// ── Helpers ────────────────────────────────────────────────────────────────
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function monthStart(o = 0) { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - o, 1); }
function monthEnd(o = 0) { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - o + 1, 0); }

/** Mirrors the registration-controller strength rules (and seed-production-roles). */
function validatePassword(password) {
  if (!password || password.length < 12) throw new Error('SEED_TEST_PASSWORD must be ≥ 12 chars');
  if (!/[A-Z]/.test(password)) throw new Error('SEED_TEST_PASSWORD needs an uppercase letter');
  if (!/[a-z]/.test(password)) throw new Error('SEED_TEST_PASSWORD needs a lowercase letter');
  if (!/[0-9]/.test(password)) throw new Error('SEED_TEST_PASSWORD needs a digit');
  if (!/[^A-Za-z0-9]/.test(password)) throw new Error('SEED_TEST_PASSWORD needs a special character');
}

// ── Per-index variation pools (so the 5+5 accounts are distinguishable) ──────
const LOCATIONS = [
  { city: 'Mumbai', state: 'Maharashtra' },
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'New Delhi', state: 'Delhi' },
  { city: 'Chennai', state: 'Tamil Nadu' },
  { city: 'Pune', state: 'Maharashtra' },
];
const USER_NAMES = [
  { first: 'Rohan', last: 'Verma', gender: 'male' },
  { first: 'Sneha', last: 'Iyer', gender: 'female' },
  { first: 'Karan', last: 'Malhotra', gender: 'male' },
  { first: 'Isha', last: 'Banerjee', gender: 'female' },
  { first: 'Aditya', last: 'Rao', gender: 'male' },
];
const ADVISOR_NAMES = [
  { first: 'Nikhil', last: 'Desai', gender: 'male' },
  { first: 'Pooja', last: 'Krishnan', gender: 'female' },
  { first: 'Sameer', last: 'Khan', gender: 'male' },
  { first: 'Lakshmi', last: 'Menon', gender: 'female' },
  { first: 'Arvind', last: 'Reddy', gender: 'male' },
];
const BANKS = ['HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'State Bank of India'];
const WALLETS = ['Google Pay', 'Paytm', 'PhonePe', 'Amazon Pay', 'Mobikwik'];

/** Builds the identity + profile descriptor for one test account. */
function buildSpec(role, idx) {
  const n = role === 'advisor' ? ADVISOR_NAMES[idx] : USER_NAMES[idx];
  const loc = LOCATIONS[idx];
  const label = role === 'advisor' ? 'testadvisor' : 'testuser';
  // Advisors earn more than plain users; vary a little per index.
  const baseSalary = role === 'advisor' ? 1500000 : 550000;
  return {
    email: `${label}${idx + 1}@kanaku.com`,
    role,
    name: `${n.first} ${n.last}`,
    firstName: n.first,
    lastName: n.last,
    gender: n.gender,
    dateOfBirth: new Date(1990 + idx, (idx * 2) % 12, 10 + idx),
    jobType: role === 'advisor' ? 'Self-employed' : 'Full-time Employment',
    salary: baseSalary + idx * 100000,
    country: 'India',
    state: loc.state,
    city: loc.city,
    avatarId: `new-${(idx % 14) + 1}`,
    isApproved: true,
    advisorStatus: role === 'advisor' ? 'AVAILABLE' : 'NOT_AVAILABLE',
    bank: BANKS[idx],
    wallet: WALLETS[idx],
    idx,
  };
}

// ── Identity (User + settings + profiles row) ────────────────────────────────
async function upsertIdentity(spec, hashedPassword) {
  const data = {
    email: spec.email,
    name: spec.name,
    password: hashedPassword,
    role: spec.role,
    isApproved: spec.isApproved,
    advisorStatus: spec.advisorStatus,
    firstName: spec.firstName,
    lastName: spec.lastName,
    gender: spec.gender,
    dateOfBirth: spec.dateOfBirth,
    jobType: spec.jobType,
    salary: spec.salary,
    country: spec.country,
    state: spec.state,
    city: spec.city,
    avatarId: spec.avatarId,
    status: 'active',
    updatedAt: new Date(),
  };

  const existing = await prisma.user.findUnique({ where: { email: spec.email } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data })
    : await prisma.user.create({ data });

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { currency: 'INR', language: 'en', updatedAt: new Date() },
    create: { userId: user.id, currency: 'INR', language: 'en' },
  }).catch(() => {});

  // Keep public.profiles in sync — GET /auth/profile reads it first.
  await prisma.$executeRaw`
    INSERT INTO public.profiles (
      id, email, first_name, last_name, full_name, gender,
      date_of_birth, job_type, country, state, city, created_at, updated_at
    ) VALUES (
      ${user.id}::uuid, ${spec.email}, ${spec.firstName}, ${spec.lastName}, ${spec.name}, ${spec.gender},
      ${spec.dateOfBirth}, ${spec.jobType}, ${spec.country}, ${spec.state}, ${spec.city}, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
      full_name = EXCLUDED.full_name, gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth,
      job_type = EXCLUDED.job_type, country = EXCLUDED.country, state = EXCLUDED.state,
      city = EXCLUDED.city, updated_at = NOW()
  `.catch((err) => console.warn(`[test-users] profile sync failed for ${spec.email}: ${err.message}`));

  const pinHash = await bcrypt.hash('123456', 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);
  await prisma.userPin.upsert({
    where: { userId: user.id },
    update: { pinHash, expiresAt, isActive: true, failedAttempts: 0, lockedUntil: null },
    create: { userId: user.id, pinHash, expiresAt, isActive: true }
  }).catch((err) => console.warn(`[test-users] PIN seeding failed for ${spec.email}: ${err.message}`));

  return user;
}

// ── Mock data ────────────────────────────────────────────────────────────────
async function seedAccounts(userId, spec) {
  const savings = await prisma.account.create({ data: {
    userId, name: `${spec.bank} Savings – ${spec.firstName}`, type: 'bank',
    provider: spec.bank, country: 'India', balance: 60000 + spec.idx * 25000, currency: 'INR', isActive: true,
  }});
  const credit = await prisma.account.create({ data: {
    userId, name: `${spec.bank} Credit Card`, type: 'credit',
    provider: spec.bank, country: 'India', balance: -(5000 + spec.idx * 2000), currency: 'INR', isActive: true,
  }});
  const cash = await prisma.account.create({ data: {
    userId, name: 'Cash on Hand', type: 'cash', balance: 2000 + spec.idx * 500, currency: 'INR', isActive: true,
  }});
  const wallet = await prisma.account.create({ data: {
    userId, name: `${spec.wallet} Wallet`, type: 'wallet', provider: spec.wallet,
    balance: 1000 + spec.idx * 300, currency: 'INR', isActive: true,
  }});
  return { savings: savings.id, credit: credit.id, cash: cash.id, wallet: wallet.id };
}

async function seedTransactions(userId, spec, acc) {
  const monthlyIncome = Math.round(spec.salary / 12);
  const txns = [];

  // Income — last 3 months
  for (let m = 0; m < 3; m++) {
    txns.push({ userId, accountId: acc.savings, type: 'income', amount: monthlyIncome,
      category: spec.role === 'advisor' ? 'Income' : 'Salary',
      subcategory: spec.role === 'advisor' ? 'Consulting Fee' : 'Monthly Salary',
      description: spec.role === 'advisor' ? 'Advisory retainer' : 'Monthly Salary',
      merchant: spec.role === 'advisor' ? null : 'Employer Payroll', date: monthStart(m) });
  }
  // Rent — last 3 months
  const rent = 12000 + spec.idx * 2000;
  for (let m = 0; m < 3; m++) {
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: rent,
      category: 'Housing', subcategory: 'Rent', description: 'Monthly Rent', merchant: 'Landlord',
      date: new Date(new Date().getFullYear(), new Date().getMonth() - m, 5) });
  }
  // Spread of everyday expenses
  const everyday = [
    { acc: 'credit',  cat: 'Food & Dining',     sub: 'Food Delivery', desc: 'Swiggy – Dinner',        merchant: 'Swiggy',     amt: 380 + spec.idx * 40 },
    { acc: 'savings', cat: 'Food & Dining',     sub: 'Groceries',     desc: 'D-Mart Groceries',       merchant: 'D-Mart',     amt: 1600 + spec.idx * 200 },
    { acc: 'cash',    cat: 'Transportation',    sub: 'Ride Hailing',  desc: 'Uber – Commute',         merchant: 'Uber',       amt: 180 + spec.idx * 30 },
    { acc: 'credit',  cat: 'Transportation',    sub: 'Fuel',          desc: 'Petrol – Refuel',        merchant: 'Indian Oil', amt: 1200 + spec.idx * 150 },
    { acc: 'savings', cat: 'Bills & Utilities', sub: 'Electricity',   desc: 'Electricity Bill',       merchant: 'State Power', amt: 950 + spec.idx * 120 },
    { acc: 'savings', cat: 'Bills & Utilities', sub: 'Internet',      desc: 'Broadband',              merchant: 'Jio Fiber',  amt: 599 },
    { acc: 'credit',  cat: 'Shopping',          sub: 'Electronics',   desc: 'Amazon Order',           merchant: 'Amazon',     amt: 3200 + spec.idx * 400 },
    { acc: 'credit',  cat: 'Entertainment',     sub: 'Streaming',     desc: 'Netflix',                merchant: 'Netflix',    amt: 649 },
    { acc: 'savings', cat: 'Health',            sub: 'Fitness',       desc: 'Gym Membership',         merchant: "Gold's Gym", amt: 1200 + spec.idx * 200 },
  ];
  everyday.forEach((e, i) => txns.push({
    userId, accountId: acc[e.acc], type: 'expense', amount: e.amt,
    category: e.cat, subcategory: e.sub, description: e.desc, merchant: e.merchant, date: daysAgo(i * 3 + 2),
  }));
  // A side income
  txns.push({ userId, accountId: acc.savings, type: 'income', amount: 8000 + spec.idx * 1000,
    category: 'Income', subcategory: 'Freelance', description: 'Side project payout', date: daysAgo(18) });

  for (const t of txns) await prisma.transaction.create({ data: t });
  return txns.length;
}

async function seedGoals(userId, spec, acc) {
  const goals = [
    { name: 'Emergency Fund', targetAmount: 200000 + spec.idx * 50000, currentAmount: 60000 + spec.idx * 15000, targetDate: daysFromNow(365), category: 'Emergency Fund' },
    { name: 'Vacation Fund',  targetAmount: 80000,  currentAmount: 22000 + spec.idx * 4000, targetDate: daysFromNow(240), category: 'Travel' },
    { name: spec.role === 'advisor' ? 'Office Upgrade' : 'New Gadget', targetAmount: 120000, currentAmount: 35000, targetDate: daysFromNow(180), category: spec.role === 'advisor' ? 'Business' : 'Electronics' },
  ];
  let count = 0;
  for (const g of goals) {
    const goal = await prisma.goal.create({ data: { userId, ...g } });
    for (let i = 0; i < 2; i++) {
      await prisma.goalContribution.create({ data: {
        userId, goalId: goal.id, accountId: acc.savings,
        amount: Math.round(g.currentAmount / 2), date: daysAgo(i * 30 + 5),
      }});
    }
    count++;
  }
  return count;
}

async function seedLoans(userId, spec, acc) {
  const loans = [
    { type: spec.role === 'advisor' ? 'business_loan' : 'personal_loan',
      name: spec.role === 'advisor' ? `${spec.bank} Business Loan` : `${spec.bank} Personal Loan`,
      principalAmount: 500000 + spec.idx * 100000, outstandingBalance: 320000 + spec.idx * 60000,
      interestRate: 11.5, emiAmount: 12500 + spec.idx * 1500, dueDate: daysFromNow(12 + spec.idx),
      status: 'active', contactPerson: `${spec.bank} Loans` },
    { type: 'borrowed', name: 'Borrowed from a friend', principalAmount: 20000, outstandingBalance: 12000,
      interestRate: 0, status: 'active', contactPerson: 'Friend' },
  ];
  let count = 0;
  for (const l of loans) {
    const loan = await prisma.loan.create({ data: { userId, ...l } });
    if (l.emiAmount) {
      for (let i = 0; i < 2; i++) {
        await prisma.loanPayment.create({ data: {
          loanId: loan.id, amount: l.emiAmount, accountId: acc.savings,
          date: new Date(new Date().getFullYear(), new Date().getMonth() - i, 5),
        }});
      }
    }
    count++;
  }
  return count;
}

async function seedInvestments(userId, spec) {
  const now = new Date();
  const sets = [
    { assetType: 'STOCK',       assetName: 'Tata Motors',          quantity: 20 + spec.idx, buyPrice: 580,  currentPrice: 720,  purchaseDate: daysAgo(200) },
    { assetType: 'MUTUAL_FUND', assetName: 'Axis Small Cap Fund',  quantity: 100,           buyPrice: 55,   currentPrice: 72.5, purchaseDate: daysAgo(365) },
    { assetType: 'CRYPTO',      assetName: 'Ethereum (ETH)',       quantity: 0.2 + spec.idx * 0.1, buyPrice: 180000, currentPrice: 250000, purchaseDate: daysAgo(300) },
  ];
  if (spec.role === 'advisor') {
    sets.push({ assetType: 'STOCK', assetName: 'Bajaj Finance', quantity: 10, buyPrice: 6800, currentPrice: 8200, purchaseDate: daysAgo(400) });
  }
  let count = 0;
  for (const inv of sets) {
    const totalInvested = inv.quantity * inv.buyPrice;
    const currentValue = inv.quantity * inv.currentPrice;
    await prisma.investment.create({ data: {
      userId, ...inv, totalInvested, currentValue, profitLoss: currentValue - totalInvested, lastUpdated: now,
    }});
    count++;
  }
  return count;
}

async function seedBudgets(userId, spec) {
  const cats = [
    { category: 'Food & Dining', amount: 8000, spent: 5200 },
    { category: 'Transportation', amount: 4000, spent: 2800 },
    { category: 'Shopping', amount: 6000, spent: 4900 },
    { category: 'Entertainment', amount: 2000, spent: 1067 },
  ];
  let count = 0;
  for (const b of cats) {
    try {
      await prisma.budget.create({ data: {
        userId, category: b.category, amount: b.amount, spent: b.spent,
        period: 'monthly', threshold: 80, alertEnabled: true, startDate: monthStart(), endDate: monthEnd(),
      }});
      count++;
    } catch (e) { /* skip dup */ }
  }
  return count;
}

async function seedRecurring(userId, acc) {
  const items = [
    { title: 'Netflix Subscription', amount: 649, category: 'Entertainment', subcategory: 'Streaming', merchant: 'Netflix', interval: 'monthly', nextDueDate: daysFromNow(15) },
    { title: 'Broadband', amount: 599, category: 'Bills & Utilities', subcategory: 'Internet', merchant: 'Jio Fiber', interval: 'monthly', nextDueDate: daysFromNow(10) },
    { title: 'Monthly SIP', amount: 2000, category: 'Investment', subcategory: 'SIP', merchant: null, interval: 'monthly', nextDueDate: daysFromNow(7) },
  ];
  let count = 0;
  for (const item of items) {
    await prisma.recurringTransaction.create({ data: { userId, accountId: acc.savings, ...item, status: 'active', autoProcess: false } });
    count++;
  }
  return count;
}

async function seedFriends(userId, spec) {
  const friends = [
    { name: 'Anita Roy', email: `anita.roy${spec.idx}@example.com`, phone: `+91-90000${10000 + spec.idx}` },
    { name: 'Vivek Shah', email: `vivek.shah${spec.idx}@example.com`, phone: `+91-90000${20000 + spec.idx}` },
    { name: 'Meera Joshi', email: `meera.joshi${spec.idx}@example.com`, phone: `+91-90000${30000 + spec.idx}` },
  ];
  let count = 0;
  for (const f of friends) { await prisma.friend.create({ data: { userId, ...f } }); count++; }
  return count;
}

async function seedNotifications(userId, spec) {
  const items = [
    { title: 'Budget Alert', message: 'Your Shopping budget is 82% used this month.', type: 'warning', priority: 'high', isRead: false },
    { title: 'Goal Milestone', message: 'You crossed 50% of your Emergency Fund goal.', type: 'success', priority: 'medium', isRead: false },
    { title: 'Portfolio Update', message: 'Your investments are up this quarter.', type: 'info', priority: 'low', isRead: true },
  ];
  if (spec.role === 'advisor') {
    items.push({ title: 'New Booking Request', message: 'A client requested a session.', type: 'info', priority: 'high', isRead: false });
  }
  let count = 0;
  for (const n of items) { await prisma.notification.create({ data: { userId, ...n } }); count++; }
  return count;
}

async function seedAdvisorProfile(spec, advisorId) {
  await prisma.advisorApplication.upsert({
    where: { userId: advisorId },
    update: { status: 'APPROVED' },
    create: {
      userId: advisorId, fullName: spec.name, email: spec.email, phone: `+91-98765${10000 + spec.idx}`,
      experienceYears: 5 + spec.idx, expertise: 'Wealth Management, Tax Planning, Portfolio Advisory',
      organizationName: `${spec.lastName} Advisory`, bio: `SEBI-registered advisor based in ${spec.city}. Test cohort account.`,
      status: 'APPROVED', reviewedAt: daysAgo(20),
    },
  });
  const existing = await prisma.advisorAvailability.findMany({ where: { advisorId } });
  if (existing.length === 0) {
    for (let day = 1; day <= 5; day++) {
      await prisma.advisorAvailability.create({ data: { advisorId, dayOfWeek: day, startTime: '09:00', endTime: '18:00', isActive: true } });
    }
  }
}

// ── Cleanup (idempotent) ─────────────────────────────────────────────────────
async function cleanupUser(userId) {
  await prisma.advisorAvailability.deleteMany({ where: { advisorId: userId } }).catch(() => {});
  await prisma.advisorApplication.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.recurringTransaction.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.budget.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.investment.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.friend.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.loanPayment.deleteMany({ where: { loan: { userId } } }).catch(() => {});
  await prisma.loan.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goalContribution.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goal.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.account.deleteMany({ where: { userId } }).catch(() => {});
}

async function seedOne(spec, hashedPassword) {
  const user = await upsertIdentity(spec, hashedPassword);
  await cleanupUser(user.id);
  const acc = await seedAccounts(user.id, spec);
  const tx = await seedTransactions(user.id, spec, acc);
  const goals = await seedGoals(user.id, spec, acc);
  const loans = await seedLoans(user.id, spec, acc);
  const inv = await seedInvestments(user.id, spec);
  const budgets = await seedBudgets(user.id, spec);
  const recurring = await seedRecurring(user.id, acc);
  const friends = await seedFriends(user.id, spec);
  const notifs = await seedNotifications(user.id, spec);
  if (spec.role === 'advisor') await seedAdvisorProfile(spec, user.id);
  console.log(`  ✓ ${spec.role.padEnd(7)} ${spec.email.padEnd(26)} → accts 4, tx ${tx}, goals ${goals}, loans ${loans}, inv ${inv}, budgets ${budgets}, recurring ${recurring}, friends ${friends}, notifs ${notifs}`);
}

async function main() {
  validatePassword(TEST_PASSWORD);
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);

  console.log(`[test-users] Seeding ${COHORT_SIZE} user + ${COHORT_SIZE} advisor test accounts (password from SEED_TEST_PASSWORD)…\n`);

  for (let i = 0; i < COHORT_SIZE; i++) await seedOne(buildSpec('user', i), hashedPassword);
  for (let i = 0; i < COHORT_SIZE; i++) await seedOne(buildSpec('advisor', i), hashedPassword);

  console.log('\n[test-users] Done. Login with the SEED_TEST_PASSWORD value for every test account.');
}

main()
  .catch((err) => { console.error('[test-users] Fatal:', err.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
