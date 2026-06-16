/**
 * seed-mock-data.cjs
 *
 * Populates comprehensive mock data for all 4 role accounts.
 * Requires seed-production-roles.cjs to have run first.
 *
 * Usage (Fly.io):
 *   fly ssh console --app kanaku
 *   > node scripts/seed-mock-data.cjs
 *
 * Covers: Accounts, Transactions (30+/user), Goals, Loans, Friends,
 *         Investments, GoldAssets, Budgets, RecurringTransactions,
 *         GroupExpenses, TaxCalculations, Notifications, Todos,
 *         AdvisorApplication, AdvisorAvailability, BookingRequest, AdvisorSession
 */

'use strict';

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function monthStart(offset = 0) { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - offset, 1); }
function monthEnd(offset = 0) { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - offset + 1, 0); }

// ── 1. Accounts ───────────────────────────────────────────────────────────────

async function seedAccounts(userId, role) {
  const configs = {
    admin: [
      { key: 'savings', name: 'HDFC Savings – Arjun', type: 'bank',   provider: 'HDFC Bank',             balance: 285000, currency: 'INR', country: 'India' },
      { key: 'credit',  name: 'HDFC Regalia Credit Card',  type: 'credit', provider: 'HDFC Bank',        balance: -18500, currency: 'INR', country: 'India' },
      { key: 'cash',    name: 'Cash on Hand',               type: 'cash',   provider: null,               balance: 5000,   currency: 'INR' },
      { key: 'wallet',  name: 'GPay Wallet',                type: 'wallet', provider: 'Google Pay',       balance: 3200,   currency: 'INR' },
    ],
    manager: [
      { key: 'savings', name: 'SBI Savings – Priya',        type: 'bank',   provider: 'State Bank of India', balance: 142000, currency: 'INR', country: 'India' },
      { key: 'credit',  name: 'SBI SimplyCLICK Card',       type: 'credit', provider: 'State Bank of India', balance: -9200,  currency: 'INR', country: 'India' },
      { key: 'cash',    name: 'Cash Wallet',                 type: 'cash',   provider: null,                  balance: 2500,   currency: 'INR' },
      { key: 'wallet',  name: 'Paytm Wallet',                type: 'wallet', provider: 'Paytm',               balance: 1800,   currency: 'INR' },
    ],
    advisor: [
      { key: 'savings', name: 'Axis Bank Savings – Vikram', type: 'bank',   provider: 'Axis Bank',        balance: 380000, currency: 'INR', country: 'India' },
      { key: 'credit',  name: 'Axis Bank Privilege Card',   type: 'credit', provider: 'Axis Bank',        balance: -24000, currency: 'INR', country: 'India' },
      { key: 'cash',    name: 'Cash on Hand',               type: 'cash',   provider: null,               balance: 8000,   currency: 'INR' },
      { key: 'wallet',  name: 'PhonePe Wallet',             type: 'wallet', provider: 'PhonePe',          balance: 4500,   currency: 'INR' },
    ],
    user: [
      { key: 'savings', name: 'ICICI Savings – Ananya',     type: 'bank',   provider: 'ICICI Bank',       balance: 45000,  currency: 'INR', country: 'India' },
      { key: 'credit',  name: 'ICICI Platinum Card',        type: 'credit', provider: 'ICICI Bank',       balance: -6800,  currency: 'INR', country: 'India' },
      { key: 'cash',    name: 'Cash Wallet',                type: 'cash',   provider: null,               balance: 1500,   currency: 'INR' },
      { key: 'wallet',  name: 'Paytm Wallet',               type: 'wallet', provider: 'Paytm',            balance: 800,    currency: 'INR' },
    ],
  };

  const result = {};
  for (const cfg of (configs[role] || [])) {
    const { key, ...data } = cfg;
    const acc = await prisma.account.create({ data: { userId, ...data } });
    result[key] = acc.id;
  }
  return result;
}

// ── 2. Transactions ───────────────────────────────────────────────────────────

async function seedTransactions(userId, role, acc) {
  const salary = { admin: 150000, manager: 100000, advisor: 200000, user: 50000 }[role];
  const txns = [];

  // Salary – last 3 months
  for (let m = 0; m < 3; m++) {
    txns.push({ userId, accountId: acc.savings, type: 'income', amount: salary,
      category: 'Salary', subcategory: 'Monthly Salary',
      description: { admin: 'TechCorp India – Monthly Salary', manager: 'StartupHub – Monthly Salary', advisor: 'Nair Financial Services – Consulting Income', user: 'Freelance – Monthly Income' }[role],
      merchant: { admin: 'TechCorp India', manager: 'StartupHub Pvt Ltd', advisor: null, user: null }[role],
      date: monthStart(m) });
  }

  // Rent – last 3 months
  const rent = { admin: 35000, manager: 20000, advisor: 25000, user: 12000 }[role];
  for (let m = 0; m < 3; m++) {
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: rent,
      category: 'Housing', subcategory: 'Rent',
      description: 'Monthly Rent Payment', merchant: 'Landlord',
      date: new Date(new Date().getFullYear(), new Date().getMonth() - m, 5) });
  }

  // Food & Dining
  const food = [
    { desc: 'Swiggy – Dinner Order',         merchant: 'Swiggy',       acc: 'credit', sub: 'Food Delivery', amt: { admin: 850,  manager: 520, advisor: 780,  user: 380 } },
    { desc: 'Zomato – Weekend Lunch',         merchant: 'Zomato',       acc: 'credit', sub: 'Food Delivery', amt: { admin: 620,  manager: 380, advisor: 540,  user: 280 } },
    { desc: 'D-Mart Grocery Shopping',        merchant: 'D-Mart',       acc: 'savings',sub: 'Groceries',     amt: { admin: 4200, manager: 2400, advisor: 3200, user: 1600 } },
    { desc: 'BigBasket Monthly Grocery',      merchant: 'BigBasket',    acc: 'savings',sub: 'Groceries',     amt: { admin: 3500, manager: 1800, advisor: 2800, user: 1200 } },
    { desc: 'Restaurant – Team Dinner',       merchant: 'Barbeque Nation', acc: 'credit', sub: 'Restaurant', amt: { admin: 3200, manager: 1800, advisor: 2500, user: 1200 } },
    { desc: 'Tea & Snacks – Local Canteen',   merchant: 'Local Canteen',acc: 'cash',   sub: 'Snacks',        amt: { admin: 280,  manager: 200, advisor: 250,  user: 150 } },
    { desc: 'Blinkit – Instant Groceries',   merchant: 'Blinkit',      acc: 'credit', sub: 'Groceries',     amt: { admin: 1200, manager: 650, advisor: 980,  user: 450 } },
  ];
  food.forEach((item, i) => txns.push({
    userId, accountId: acc[item.acc], type: 'expense', amount: item.amt[role],
    category: 'Food & Dining', subcategory: item.sub,
    description: item.desc, merchant: item.merchant, date: daysAgo(i * 4 + 2),
  }));

  // Transportation
  const transport = [
    { desc: 'Uber – Office Commute',         merchant: 'Uber',          acc: 'cash',   sub: 'Ride Hailing',     amt: { admin: 450, manager: 280, advisor: 380, user: 180 } },
    { desc: 'Ola – Weekend Ride',            merchant: 'Ola',           acc: 'cash',   sub: 'Ride Hailing',     amt: { admin: 320, manager: 200, advisor: 280, user: 140 } },
    { desc: 'Metro Card Recharge',           merchant: 'Metro Rail',    acc: 'wallet', sub: 'Public Transport', amt: { admin: 500, manager: 500, advisor: 400, user: 300 } },
    { desc: 'Petrol – Car Refuel',           merchant: 'Indian Oil',    acc: 'credit', sub: 'Fuel',             amt: { admin: 3500, manager: 2200, advisor: 2800, user: 1200 } },
    { desc: 'Vehicle Insurance Premium',     merchant: 'HDFC ERGO',     acc: 'savings',sub: 'Insurance',        amt: { admin: 8500, manager: 4800, advisor: 6500, user: 2400 } },
  ];
  transport.forEach((item, i) => txns.push({
    userId, accountId: acc[item.acc], type: 'expense', amount: item.amt[role],
    category: 'Transportation', subcategory: item.sub,
    description: item.desc, merchant: item.merchant, date: daysAgo(i * 5 + 3),
  }));

  // Bills & Utilities
  const bills = [
    { desc: 'Electricity Bill – BSES',       merchant: 'BSES',                  sub: 'Electricity', amt: { admin: 3200, manager: 1800, advisor: 2400, user: 950 } },
    { desc: 'Jio Fiber Broadband',           merchant: 'Jio Fiber',             sub: 'Internet',    amt: { admin: 999,  manager: 999,  advisor: 1499, user: 599 } },
    { desc: 'Airtel Mobile Recharge',        merchant: 'Airtel',                sub: 'Phone',       amt: { admin: 499,  manager: 299,  advisor: 499,  user: 239 } },
    { desc: 'Water Bill – Municipal Corp',   merchant: 'Municipal Corporation', sub: 'Water',       amt: { admin: 450,  manager: 380,  advisor: 420,  user: 280 } },
    { desc: 'Indane LPG Gas Bill',           merchant: 'Indane Gas',            sub: 'Gas',         amt: { admin: 890,  manager: 890,  advisor: 890,  user: 890 } },
  ];
  bills.forEach((item, i) => txns.push({
    userId, accountId: acc.savings, type: 'expense', amount: item.amt[role],
    category: 'Bills & Utilities', subcategory: item.sub,
    description: item.desc, merchant: item.merchant, date: daysAgo(i * 6 + 4),
  }));

  // Shopping
  const shopping = [
    { desc: 'Amazon – Electronics Order',    merchant: 'Amazon',    sub: 'Electronics', amt: { admin: 12500, manager: 5800, advisor: 9800, user: 3200 } },
    { desc: 'Myntra – Clothing',             merchant: 'Myntra',    sub: 'Clothing',    amt: { admin: 3800,  manager: 1800, advisor: 2800, user: 1100 } },
    { desc: 'Decathlon – Sports Equipment',  merchant: 'Decathlon', sub: 'Sports',      amt: { admin: 2400,  manager: 1400, advisor: 2000, user: 900 } },
    { desc: 'Flipkart – Home Appliances',    merchant: 'Flipkart',  sub: 'Home',        amt: { admin: 8900,  manager: 3800, advisor: 6500, user: 2200 } },
  ];
  shopping.forEach((item, i) => txns.push({
    userId, accountId: acc.credit, type: 'expense', amount: item.amt[role],
    category: 'Shopping', subcategory: item.sub,
    description: item.desc, merchant: item.merchant, date: daysAgo(i * 7 + 5),
  }));

  // Entertainment
  const ent = [
    { desc: 'Netflix Subscription',          merchant: 'Netflix',       sub: 'Streaming', amt: 649 },
    { desc: 'Amazon Prime Video',            merchant: 'Amazon Prime',  sub: 'Streaming', amt: 299 },
    { desc: 'Spotify Premium',               merchant: 'Spotify',       sub: 'Music',     amt: 119 },
    { desc: 'PVR Cinemas – Movie Tickets',   merchant: 'PVR Cinemas',   sub: 'Movies',    amt: { admin: 1200, manager: 800, advisor: 1000, user: 500 } },
    { desc: 'BookMyShow – Weekend Event',    merchant: 'BookMyShow',    sub: 'Events',    amt: { admin: 2500, manager: 1200, advisor: 2000, user: 800 } },
  ];
  ent.forEach((item, i) => txns.push({
    userId, accountId: acc.credit, type: 'expense',
    amount: typeof item.amt === 'object' ? item.amt[role] : item.amt,
    category: 'Entertainment', subcategory: item.sub,
    description: item.desc, merchant: item.merchant, date: daysAgo(i * 8 + 1),
  }));

  // Health
  const health = [
    { desc: 'Apollo Pharmacy – Medicines',   merchant: 'Apollo Pharmacy', sub: 'Medicine', amt: { admin: 1500, manager: 900, advisor: 1200, user: 600 } },
    { desc: 'Gold\'s Gym Monthly Membership',merchant: 'Gold\'s Gym',     sub: 'Fitness',  amt: { admin: 3500, manager: 1800, advisor: 3000, user: 1200 } },
    { desc: 'Fortis – Doctor Consultation',  merchant: 'Fortis Hospital', sub: 'Medical',  amt: { admin: 800,  manager: 600, advisor: 800,  user: 400 } },
  ];
  health.forEach((item, i) => txns.push({
    userId, accountId: acc.savings, type: 'expense', amount: item.amt[role],
    category: 'Health', subcategory: item.sub,
    description: item.desc, merchant: item.merchant, date: daysAgo(i * 9 + 2),
  }));

  // Role-specific extras
  if (role === 'admin') {
    txns.push({ userId, accountId: acc.savings, type: 'income', amount: 50000, category: 'Bonus', subcategory: 'Performance Bonus', description: 'Q1 FY2026 Performance Bonus', merchant: 'TechCorp India', date: daysAgo(45) });
    txns.push({ userId, accountId: acc.credit, type: 'expense', amount: 45000, category: 'Travel', subcategory: 'Flight', description: 'IndiGo – Mumbai–Goa Return', merchant: 'IndiGo Airlines', date: daysAgo(22) });
    txns.push({ userId, accountId: acc.credit, type: 'expense', amount: 28000, category: 'Travel', subcategory: 'Hotel', description: 'Marriott Goa – 3 nights', merchant: 'Marriott Hotels', date: daysAgo(20) });
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: 150000, category: 'Investment', subcategory: 'SIP', description: 'Monthly SIP – HDFC Flexi Cap', merchant: 'HDFC Mutual Fund', date: daysAgo(10) });
  }
  if (role === 'manager') {
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: 12000, category: 'Education', subcategory: 'Online Course', description: 'IIM Online MBA Certification', merchant: 'IIM Online', date: daysAgo(30) });
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: 10000, category: 'Investment', subcategory: 'SIP', description: 'Monthly SIP – Mirae Asset Large Cap', merchant: 'Mirae Asset', date: daysAgo(10) });
  }
  if (role === 'advisor') {
    txns.push({ userId, accountId: acc.savings, type: 'income', amount: 35000, category: 'Income', subcategory: 'Consulting Fee', description: 'Financial Planning – Client Suresh Kumar', date: daysAgo(12) });
    txns.push({ userId, accountId: acc.savings, type: 'income', amount: 25000, category: 'Income', subcategory: 'Consulting Fee', description: 'Portfolio Review – Client Meena Pillai', date: daysAgo(25) });
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: 50000, category: 'Investment', subcategory: 'SIP', description: 'Monthly SIP – ICICI Pru Value Discovery', merchant: 'ICICI Prudential', date: daysAgo(10) });
  }
  if (role === 'user') {
    txns.push({ userId, accountId: acc.savings, type: 'income', amount: 15000, category: 'Income', subcategory: 'Freelance', description: 'Web Design – Invoice #102', date: daysAgo(20) });
    txns.push({ userId, accountId: acc.savings, type: 'income', amount: 8000, category: 'Income', subcategory: 'Freelance', description: 'Graphic Design – Client Brief', date: daysAgo(35) });
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: 4999, category: 'Education', subcategory: 'Online Course', description: 'Udemy – Full Stack Dev Course', merchant: 'Udemy', date: daysAgo(15) });
    txns.push({ userId, accountId: acc.savings, type: 'expense', amount: 2000, category: 'Investment', subcategory: 'SIP', description: 'Monthly SIP – Axis Small Cap', merchant: 'Axis Mutual Fund', date: daysAgo(10) });
  }

  for (const t of txns) await prisma.transaction.create({ data: t });
  return txns.length;
}

// ── 3. Goals + Contributions ──────────────────────────────────────────────────

async function seedGoals(userId, role, acc) {
  const sets = {
    admin: [
      { name: 'Emergency Fund',          targetAmount: 500000, currentAmount: 285000, targetDate: daysFromNow(365),  category: 'Emergency Fund' },
      { name: 'Europe Vacation 2027',    targetAmount: 250000, currentAmount: 65000,  targetDate: daysFromNow(548),  category: 'Travel' },
      { name: 'New Car – BMW 3 Series',  targetAmount: 3500000, currentAmount: 850000, targetDate: daysFromNow(730), category: 'Vehicle' },
      { name: 'Children Education Fund', targetAmount: 2000000, currentAmount: 320000, targetDate: daysFromNow(1825),category: 'Education' },
    ],
    manager: [
      { name: 'Emergency Fund',          targetAmount: 300000, currentAmount: 142000, targetDate: daysFromNow(365),  category: 'Emergency Fund' },
      { name: 'Goa Beach Trip',          targetAmount: 80000,  currentAmount: 35000,  targetDate: daysFromNow(180),  category: 'Travel' },
      { name: 'MacBook Pro',             targetAmount: 200000, currentAmount: 75000,  targetDate: daysFromNow(240),  category: 'Electronics' },
      { name: 'Home Down Payment',       targetAmount: 2000000, currentAmount: 420000, targetDate: daysFromNow(1460),category: 'Housing' },
    ],
    advisor: [
      { name: 'Emergency Fund',          targetAmount: 600000, currentAmount: 380000, targetDate: daysFromNow(180),  category: 'Emergency Fund' },
      { name: 'Office Expansion Fund',   targetAmount: 1000000, currentAmount: 450000, targetDate: daysFromNow(365), category: 'Business' },
      { name: 'Singapore Conference',    targetAmount: 180000, currentAmount: 90000,  targetDate: daysFromNow(120),  category: 'Travel' },
      { name: 'Retirement Corpus',       targetAmount: 10000000, currentAmount: 2800000, targetDate: daysFromNow(3650), category: 'Retirement' },
    ],
    user: [
      { name: 'Emergency Fund',          targetAmount: 150000, currentAmount: 45000,  targetDate: daysFromNow(540),  category: 'Emergency Fund' },
      { name: 'New Laptop',              targetAmount: 80000,  currentAmount: 22000,  targetDate: daysFromNow(180),  category: 'Electronics' },
      { name: 'Himachal Pradesh Trip',   targetAmount: 40000,  currentAmount: 12000,  targetDate: daysFromNow(270),  category: 'Travel' },
    ],
  };

  const created = [];
  for (const g of (sets[role] || [])) {
    const goal = await prisma.goal.create({ data: { userId, ...g } });
    created.push(goal);
    // 3 contributions spread over past 3 months
    for (let i = 0; i < 3; i++) {
      await prisma.goalContribution.create({ data: {
        userId, goalId: goal.id, accountId: acc.savings,
        amount: Math.round(g.currentAmount / 3),
        date: daysAgo(i * 30 + 5),
      }});
    }
  }
  return created;
}

// ── 4. Loans + Payments ───────────────────────────────────────────────────────

async function seedLoans(userId, role, acc) {
  const loanSets = {
    admin: [
      { type: 'home_loan',    name: 'HDFC Home Loan – Andheri West Flat',  principalAmount: 7500000, outstandingBalance: 6820000, interestRate: 8.5, emiAmount: 65000, dueDate: daysFromNow(20), status: 'active', contactPerson: 'HDFC Bank – Andheri Branch' },
      { type: 'car_loan',     name: 'ICICI Car Loan – Honda City',          principalAmount: 800000,  outstandingBalance: 450000,  interestRate: 9.2, emiAmount: 16500, dueDate: daysFromNow(10), status: 'active', contactPerson: 'ICICI Bank Auto Loans' },
      { type: 'borrowed',     name: 'Borrowed from Rahul Gupta',            principalAmount: 50000,   outstandingBalance: 30000,   interestRate: 0,   status: 'active', contactPerson: 'Rahul Gupta (+91-9876543210)' },
    ],
    manager: [
      { type: 'personal_loan',name: 'SBI Personal Loan',                    principalAmount: 500000,  outstandingBalance: 320000,  interestRate: 12.5, emiAmount: 12500, dueDate: daysFromNow(15), status: 'active', contactPerson: 'SBI Bengaluru Branch' },
      { type: 'lent',         name: 'Lent to Kavitha (sister)',             principalAmount: 80000,   outstandingBalance: 50000,   interestRate: 0,   status: 'active', contactPerson: 'Kavitha Sharma (+91-9988776655)' },
    ],
    advisor: [
      { type: 'business_loan',name: 'Axis Bank Business Loan – Office',    principalAmount: 2000000, outstandingBalance: 1400000, interestRate: 10.5, emiAmount: 45000, dueDate: daysFromNow(3), status: 'active', contactPerson: 'Axis Bank Business Banking – Kochi' },
    ],
    user: [
      { type: 'education_loan',name: 'SBI Education Loan',                 principalAmount: 300000,  outstandingBalance: 185000,  interestRate: 8.0, emiAmount: 5500, dueDate: daysFromNow(20), status: 'active', contactPerson: 'SBI Student Services' },
      { type: 'borrowed',      name: 'Borrowed from Pooja – Medical Exp',  principalAmount: 15000,   outstandingBalance: 10000,   interestRate: 0,   status: 'active', contactPerson: 'Pooja Reddy (+91-7654321098)' },
    ],
  };

  const created = [];
  for (const l of (loanSets[role] || [])) {
    const loan = await prisma.loan.create({ data: { userId, ...l } });
    created.push(loan);
    // Add 3 monthly payments for loans with EMI
    if (l.emiAmount) {
      for (let i = 0; i < 3; i++) {
        await prisma.loanPayment.create({ data: {
          loanId: loan.id, amount: l.emiAmount, accountId: acc.savings,
          date: new Date(new Date().getFullYear(), new Date().getMonth() - i, l.dueDate?.getDate() || 5),
        }});
      }
    }
  }
  return created;
}

// ── 5. Friends ────────────────────────────────────────────────────────────────

async function seedFriends(userId, role) {
  const sets = {
    admin:   [
      { name: 'Rahul Gupta',    email: 'rahul.gupta@gmail.com',       phone: '+91-9876543210' },
      { name: 'Neha Singh',     email: 'neha.singh@yahoo.com',        phone: '+91-8765432109' },
      { name: 'Amit Kumar',     email: 'amit.kumar@outlook.com',      phone: '+91-7654321098' },
      { name: 'Sunita Verma',   email: 'sunita.verma@gmail.com',      phone: '+91-6543210987' },
      { name: 'Rajesh Patel',   email: 'rajesh.patel@techcorp.com',   phone: '+91-9123456789' },
    ],
    manager: [
      { name: 'Kavitha Sharma', email: 'kavitha.sharma@gmail.com',    phone: '+91-9988776655' },
      { name: 'Ravi Krishnan',  email: 'ravi.krishnan@gmail.com',     phone: '+91-8877665544' },
      { name: 'Deepa Naidu',    email: 'deepa.naidu@outlook.com',     phone: '+91-7766554433' },
      { name: 'Sanjay Mehta',   email: 'sanjay.mehta@startup.in',     phone: '+91-6655443322' },
    ],
    advisor: [
      { name: 'Suresh Kumar',   email: 'suresh.k@business.com',       phone: '+91-9900887766' },
      { name: 'Meena Pillai',   email: 'meena.pillai@gmail.com',      phone: '+91-8800776655' },
      { name: 'Dr. Raman CFA',  email: 'raman.cfa@finadvisor.in',     phone: '+91-7700665544' },
      { name: 'Pradeep Nambiar',email: 'pradeep.n@gmail.com',         phone: '+91-9988001122' },
    ],
    user:    [
      { name: 'Pooja Reddy',    email: 'pooja.reddy@gmail.com',       phone: '+91-7654321098' },
      { name: 'Kiran Joshi',    email: 'kiran.joshi@gmail.com',       phone: '+91-8901234567' },
      { name: 'Divya Shah',     email: 'divya.shah@gmail.com',        phone: '+91-7890123456' },
      { name: 'Aryan Mehta',    email: 'aryan.mehta@gmail.com',       phone: '+91-6789012345' },
    ],
  };

  const created = [];
  for (const f of (sets[role] || [])) {
    const friend = await prisma.friend.create({ data: { userId, ...f } });
    created.push(friend);
  }
  return created;
}

// ── 6. Investments ────────────────────────────────────────────────────────────

async function seedInvestments(userId, role) {
  const now = new Date();
  const sets = {
    admin: [
      { assetType: 'STOCK',        assetName: 'Reliance Industries',       quantity: 50,  buyPrice: 2400,    currentPrice: 2890,   purchaseDate: daysAgo(365) },
      { assetType: 'STOCK',        assetName: 'TCS',                       quantity: 30,  buyPrice: 3800,    currentPrice: 4250,   purchaseDate: daysAgo(300) },
      { assetType: 'STOCK',        assetName: 'HDFC Bank',                 quantity: 100, buyPrice: 1450,    currentPrice: 1680,   purchaseDate: daysAgo(250) },
      { assetType: 'MUTUAL_FUND',  assetName: 'HDFC Flexi Cap Fund',       quantity: 500, buyPrice: 45.5,    currentPrice: 58.2,   purchaseDate: daysAgo(500) },
      { assetType: 'MUTUAL_FUND',  assetName: 'SBI Blue Chip Fund',        quantity: 300, buyPrice: 52.0,    currentPrice: 64.5,   purchaseDate: daysAgo(400) },
      { assetType: 'MUTUAL_FUND',  assetName: 'Axis Long Term Equity',     quantity: 200, buyPrice: 38.5,    currentPrice: 48.2,   purchaseDate: daysAgo(600) },
      { assetType: 'CRYPTO',       assetName: 'Bitcoin (BTC)',             quantity: 0.05,buyPrice: 2500000, currentPrice: 5800000,purchaseDate: daysAgo(800) },
      { assetType: 'ETF',          assetName: 'Nippon India ETF Gold BeES',quantity: 100, buyPrice: 450,     currentPrice: 520,    purchaseDate: daysAgo(200) },
    ],
    manager: [
      { assetType: 'STOCK',        assetName: 'Infosys',                   quantity: 25,  buyPrice: 1580,    currentPrice: 1820,   purchaseDate: daysAgo(280) },
      { assetType: 'STOCK',        assetName: 'Wipro',                     quantity: 50,  buyPrice: 420,     currentPrice: 490,    purchaseDate: daysAgo(180) },
      { assetType: 'MUTUAL_FUND',  assetName: 'Mirae Asset Large Cap',     quantity: 400, buyPrice: 68.0,    currentPrice: 84.5,   purchaseDate: daysAgo(450) },
      { assetType: 'MUTUAL_FUND',  assetName: 'Parag Parikh Flexi Cap',    quantity: 150, buyPrice: 42.0,    currentPrice: 58.0,   purchaseDate: daysAgo(350) },
      { assetType: 'CRYPTO',       assetName: 'Ethereum (ETH)',             quantity: 0.5, buyPrice: 180000, currentPrice: 250000, purchaseDate: daysAgo(400) },
    ],
    advisor: [
      { assetType: 'STOCK',        assetName: 'Bajaj Finance',             quantity: 20,  buyPrice: 6800,    currentPrice: 8200,   purchaseDate: daysAgo(400) },
      { assetType: 'STOCK',        assetName: 'Asian Paints',              quantity: 30,  buyPrice: 3200,    currentPrice: 3700,   purchaseDate: daysAgo(350) },
      { assetType: 'STOCK',        assetName: 'Kotak Mahindra Bank',       quantity: 40,  buyPrice: 1800,    currentPrice: 2100,   purchaseDate: daysAgo(290) },
      { assetType: 'STOCK',        assetName: 'Nestle India',              quantity: 10,  buyPrice: 22000,   currentPrice: 26500,  purchaseDate: daysAgo(500) },
      { assetType: 'MUTUAL_FUND',  assetName: 'ICICI Pru Value Discovery', quantity: 800, buyPrice: 210.5,   currentPrice: 285.0,  purchaseDate: daysAgo(700) },
      { assetType: 'MUTUAL_FUND',  assetName: 'Kotak Emerging Equity',     quantity: 500, buyPrice: 85.0,    currentPrice: 112.0,  purchaseDate: daysAgo(550) },
      { assetType: 'CRYPTO',       assetName: 'Bitcoin (BTC)',             quantity: 0.2, buyPrice: 1800000, currentPrice: 5800000,purchaseDate: daysAgo(1200) },
      { assetType: 'CRYPTO',       assetName: 'Ethereum (ETH)',             quantity: 2,   buyPrice: 120000, currentPrice: 250000, purchaseDate: daysAgo(900) },
      { assetType: 'ETF',          assetName: 'Nippon India ETF Gold BeES',quantity: 200, buyPrice: 420,     currentPrice: 520,    purchaseDate: daysAgo(300) },
    ],
    user: [
      { assetType: 'MUTUAL_FUND',  assetName: 'Axis Small Cap Fund',       quantity: 100, buyPrice: 55.0,    currentPrice: 72.5,   purchaseDate: daysAgo(365) },
      { assetType: 'CRYPTO',       assetName: 'Polygon (MATIC)',            quantity: 500, buyPrice: 60,      currentPrice: 85,     purchaseDate: daysAgo(200) },
      { assetType: 'STOCK',        assetName: 'Tata Motors',               quantity: 20,  buyPrice: 580,     currentPrice: 720,    purchaseDate: daysAgo(150) },
    ],
  };

  const created = [];
  for (const inv of (sets[role] || [])) {
    const totalInvested = inv.quantity * inv.buyPrice;
    const currentValue  = inv.quantity * inv.currentPrice;
    const profitLoss    = currentValue - totalInvested;
    const c = await prisma.investment.create({ data: {
      userId, ...inv, totalInvested, currentValue, profitLoss, lastUpdated: now,
    }});
    created.push(c);
  }
  return created;
}

// ── 7. Gold Assets ────────────────────────────────────────────────────────────

async function seedGoldAssets(userId, role) {
  const sets = {
    admin: [
      { type: 'jewelry', quantity: 50, unit: 'gram', purchasePrice: 4800, currentPrice: 6200, purchaseDate: daysAgo(730), purityPercentage: 91.6, location: 'Bank Locker – HDFC Andheri' },
      { type: 'coin',    quantity: 20, unit: 'gram', purchasePrice: 5000, currentPrice: 6200, purchaseDate: daysAgo(365), purityPercentage: 99.9, location: 'Home Safe – Mumbai' },
    ],
    manager: [
      { type: 'jewelry', quantity: 25, unit: 'gram', purchasePrice: 4500, currentPrice: 6200, purchaseDate: daysAgo(500), purityPercentage: 91.6, location: 'Bank Locker – SBI Bengaluru' },
    ],
    advisor: [
      { type: 'coin',    quantity: 50,  unit: 'gram', purchasePrice: 4200, currentPrice: 6200, purchaseDate: daysAgo(900),  purityPercentage: 99.9, location: 'Bank Locker – Axis Bank Kochi', certificateNumber: 'GOLD-KCH-2024-0018' },
      { type: 'jewelry', quantity: 100, unit: 'gram', purchasePrice: 3800, currentPrice: 6200, purchaseDate: daysAgo(1500), purityPercentage: 91.6, location: 'Family – Kochi Home' },
    ],
    user: [],
  };

  const created = [];
  for (const g of (sets[role] || [])) {
    const c = await prisma.goldAsset.create({ data: { userId, ...g } });
    created.push(c);
  }
  return created;
}

// ── 8. Budgets ────────────────────────────────────────────────────────────────

async function seedBudgets(userId, role) {
  const cats = [
    { category: 'Food & Dining',   amount: { admin: 25000, manager: 15000, advisor: 20000, user: 8000 }, spent: { admin: 18500, manager: 9800, advisor: 14200, user: 5200 } },
    { category: 'Transportation',  amount: { admin: 15000, manager: 8000,  advisor: 10000, user: 4000 }, spent: { admin: 12800, manager: 6500, advisor: 8200,  user: 2800 } },
    { category: 'Shopping',        amount: { admin: 30000, manager: 15000, advisor: 20000, user: 6000 }, spent: { admin: 25200, manager: 10500, advisor: 16800, user: 4900 } },
    { category: 'Entertainment',   amount: { admin: 10000, manager: 5000,  advisor: 8000,  user: 2000 }, spent: { admin: 5067,  manager: 3200, advisor: 4500,  user: 1067 } },
    { category: 'Bills & Utilities',amount: { admin: 10000, manager: 6000, advisor: 8000,  user: 3000 }, spent: { admin: 6038,  manager: 4500, advisor: 5800,  user: 2838 } },
    { category: 'Health',          amount: { admin: 8000,  manager: 4000,  advisor: 6000,  user: 2000 }, spent: { admin: 5800,  manager: 2200, advisor: 3800,  user: 1500 } },
  ];

  const created = [];
  for (const b of cats) {
    try {
      const c = await prisma.budget.create({ data: {
        userId, category: b.category,
        amount: b.amount[role], spent: b.spent[role],
        period: 'monthly', threshold: 80, alertEnabled: true,
        startDate: monthStart(), endDate: monthEnd(),
      }});
      created.push(c);
    } catch (e) { /* skip duplicate */ }
  }
  return created;
}

// ── 9. Recurring Transactions ─────────────────────────────────────────────────

async function seedRecurring(userId, role, acc) {
  const items = [
    { title: 'Netflix Subscription',   amount: 649,   category: 'Entertainment', subcategory: 'Streaming',   merchant: 'Netflix',     interval: 'monthly', nextDueDate: daysFromNow(15) },
    { title: 'Jio Fiber Broadband',    amount: 999,   category: 'Bills & Utilities', subcategory: 'Internet',merchant: 'Jio Fiber',   interval: 'monthly', nextDueDate: daysFromNow(10) },
    { title: 'Spotify Premium',        amount: 119,   category: 'Entertainment', subcategory: 'Music',        merchant: 'Spotify',     interval: 'monthly', nextDueDate: daysFromNow(20) },
    { title: 'Gym Membership',         amount: { admin: 3500, manager: 1800, advisor: 3000, user: 1200 }[role], category: 'Health', subcategory: 'Fitness', merchant: "Gold's Gym", interval: 'monthly', nextDueDate: daysFromNow(5) },
    { title: 'Monthly SIP',            amount: { admin: 25000, manager: 10000, advisor: 50000, user: 2000 }[role], category: 'Investment', subcategory: 'SIP', merchant: null, interval: 'monthly', nextDueDate: daysFromNow(7) },
  ];
  if (role === 'admin' || role === 'advisor') {
    items.push({ title: 'Amazon Prime Annual', amount: 1499, category: 'Entertainment', subcategory: 'Streaming', merchant: 'Amazon Prime', interval: 'yearly', nextDueDate: daysFromNow(120) });
  }

  const created = [];
  for (const item of items) {
    const c = await prisma.recurringTransaction.create({ data: {
      userId, accountId: acc.savings, ...item, status: 'active', autoProcess: false,
    }});
    created.push(c);
  }
  return created;
}

// ── 10. Group Expenses ────────────────────────────────────────────────────────

async function seedGroupExpenses(userId, role, acc, friends) {
  const friendByName = new Map((friends || []).map(f => [f.name.toLowerCase(), f]));
  const sets = {
    admin: [
      {
        name: 'Goa Trip – College Friends', totalAmount: 85000, category: 'Travel', date: daysAgo(30),
        description: 'Annual Goa trip – flights, hotel, food',
        members: [
          { name: 'Arjun Mehta', shareAmount: 21250, hasPaid: true,  isOwner: true },
          { name: 'Rahul Gupta', shareAmount: 21250, hasPaid: true },
          { name: 'Neha Singh',  shareAmount: 21250, hasPaid: false },
          { name: 'Amit Kumar',  shareAmount: 21250, hasPaid: false },
        ],
      },
      {
        name: 'Office Team Lunch – Taj',     totalAmount: 8500,  category: 'Food & Dining', date: daysAgo(7),
        description: 'Team celebration lunch at Taj Hotels',
        members: [
          { name: 'Arjun Mehta',  shareAmount: 2125, hasPaid: true,  isOwner: true },
          { name: 'Priya Sharma', shareAmount: 2125, hasPaid: false },
          { name: 'Rahul Gupta',  shareAmount: 2125, hasPaid: true },
          { name: 'Neha Singh',   shareAmount: 2125, hasPaid: false },
        ],
      },
    ],
    manager: [
      {
        name: 'Bengaluru Weekend Outing',    totalAmount: 12000, category: 'Entertainment', date: daysAgo(10),
        description: 'Cubbon Park + dinner with colleagues',
        members: [
          { name: 'Priya Sharma', shareAmount: 3000, hasPaid: true, isOwner: true },
          { name: 'Ravi Krishnan',shareAmount: 3000, hasPaid: true },
          { name: 'Deepa Naidu', shareAmount: 3000, hasPaid: false },
          { name: 'Sanjay Mehta',shareAmount: 3000, hasPaid: false },
        ],
      },
    ],
    advisor: [],
    user: [
      {
        name: 'Flat Sharing – Monthly',      totalAmount: 42000, category: 'Housing', date: daysAgo(1),
        description: 'Monthly shared apartment – rent + utilities',
        members: [
          { name: 'Ananya Patel', shareAmount: 14000, hasPaid: true, isOwner: true },
          { name: 'Pooja Reddy',  shareAmount: 14000, hasPaid: true },
          { name: 'Kiran Joshi',  shareAmount: 14000, hasPaid: false },
        ],
      },
      {
        name: 'Lonavala Trip – Friends',     totalAmount: 18000, category: 'Travel', date: daysAgo(14),
        description: 'College friends weekend getaway – Lonavala',
        members: [
          { name: 'Ananya Patel', shareAmount: 4500, hasPaid: true, isOwner: true },
          { name: 'Pooja Reddy',  shareAmount: 4500, hasPaid: true },
          { name: 'Divya Shah',   shareAmount: 4500, hasPaid: false },
          { name: 'Aryan Mehta',  shareAmount: 4500, hasPaid: false },
        ],
      },
    ],
  };

  const created = [];
  for (const g of (sets[role] || [])) {
    const { members, ...groupData } = g;
    const ge = await prisma.groupExpense.create({ data: {
      userId, paidBy: acc.savings, ...groupData, syncStatus: 'synced',
    }});
    for (const m of members) {
      const matchedFriend = m.isOwner ? null : friendByName.get(m.name.toLowerCase());
      await prisma.groupExpenseMember.create({ data: {
        groupExpenseId: ge.id,
        name: m.name,
        userId: m.isOwner ? userId : null,
        friendId: matchedFriend?.id || null,
        email: matchedFriend?.email || null,
        phone: matchedFriend?.phone || null,
        shareAmount: m.shareAmount,
        hasPaid: m.hasPaid,
        paidAt: m.hasPaid ? new Date() : null,
      }});
    }
    created.push(ge);
  }
  return created;
}

// ── 11. Tax Calculations ──────────────────────────────────────────────────────

async function seedTaxCalcs(userId, role) {
  const annualSalary = { admin: 1800000, manager: 1200000, advisor: 2400000, user: 600000 }[role];
  const deductions   = { admin: 250000, manager: 150000, advisor: 350000, user: 75000 }[role];
  const created = [];

  for (const year of [2024, 2025]) {
    const taxableIncome = Math.max(0, annualSalary - deductions);
    let tax = 0;
    if (taxableIncome > 1500000) tax = (taxableIncome - 1500000) * 0.30 + 187500;
    else if (taxableIncome > 1200000) tax = (taxableIncome - 1200000) * 0.20 + 127500;
    else if (taxableIncome > 900000)  tax = (taxableIncome - 900000)  * 0.15 + 82500;
    else if (taxableIncome > 600000)  tax = (taxableIncome - 600000)  * 0.10 + 52500;
    else if (taxableIncome > 300000)  tax = (taxableIncome - 300000)  * 0.05;
    const taxRate = taxableIncome > 0 ? Math.round(tax / taxableIncome * 10000) / 100 : 0;
    const expenses = Math.round(annualSalary * 0.45);
    try {
      const t = await prisma.taxCalculation.create({ data: {
        userId, year, regime: 'new', country: 'India', currency: 'INR',
        totalIncome: annualSalary, totalExpense: expenses, netProfit: annualSalary - expenses,
        taxableIncome, estimatedTax: Math.round(tax), taxRate, deductions,
        notes: `FY ${year}-${(year + 1).toString().slice(-2)} – New Tax Regime`,
      }});
      created.push(t);
    } catch (e) { /* skip duplicates */ }
  }
  return created;
}

// ── 12. Notifications ─────────────────────────────────────────────────────────

async function seedNotifications(userId, role) {
  const emi = { admin: '65,000', manager: '12,500', advisor: '45,000', user: '5,500' }[role];
  const items = [
    { title: 'Budget Alert',        message: `Your Shopping budget is 84% used this month.`,         type: 'warning',  priority: 'high',   isRead: false },
    { title: 'EMI Reminder',        message: `Loan EMI of ₹${emi} is due in 3 days.`,                type: 'reminder', priority: 'high',   isRead: false },
    { title: 'Goal Milestone',      message: `You are 57% of the way to your Emergency Fund goal.`,  type: 'success',  priority: 'medium', isRead: false },
    { title: 'Portfolio Update',    message: `Your investment portfolio is up 12.5% this quarter.`,  type: 'info',     priority: 'low',    isRead: true  },
    { title: 'Transaction Alert',   message: `₹${role === 'admin' ? '850' : '450'} debited via Swiggy.`, type: 'info', priority: 'low', isRead: true },
    { title: 'Sync Complete',       message: 'All accounts synced successfully.',                     type: 'success',  priority: 'low',    isRead: true  },
  ];
  if (role === 'advisor') {
    items.push({ title: 'New Booking Request', message: 'Ananya Patel has requested a financial planning session.', type: 'info', priority: 'high', isRead: false });
    items.push({ title: 'Session Review Received', message: 'You received a 5-star rating from a recent session.', type: 'success', priority: 'medium', isRead: false });
  }
  if (role === 'user') {
    items.push({ title: 'Advisor Session Confirmed', message: 'Your session with Vikram Nair is confirmed for tomorrow at 10:00 AM.', type: 'success', priority: 'high', isRead: false });
  }
  if (role === 'admin') {
    items.push({ title: 'Advisor Application', message: 'New advisor application submitted – Vikram Nair. Review pending.', type: 'info', priority: 'medium', isRead: false });
  }

  const created = [];
  for (const n of items) {
    const c = await prisma.notification.create({ data: { userId, ...n } });
    created.push(c);
  }
  return created;
}

// ── 13. Todos ─────────────────────────────────────────────────────────────────

// NOTE: the real "To-Do Lists" feature (frontend ToDoLists/ToDoListDetail/ToDoListShare)
// reads from the raw public.todo_lists / todo_items / todo_list_shares tables, NOT the
// legacy Prisma `Todo` model (which nothing in the app actually displays). Seeding only
// `Todo` here used to mean this section produced data invisible to the real feature.
async function seedTodos(userId, role, shareWithUserId) {
  const individualItems = {
    admin:   ['Review Q2 budget allocations', 'Schedule quarterly investment review', 'Renew vehicle insurance policy', 'File ITR before July 31 deadline'],
    manager: ['Pay SBI credit card bill by 25th', 'Set up automatic EMI debit', 'Research 3 best ELSS funds for tax saving'],
    advisor: ['Prepare financial plan for Suresh Kumar', 'Review Meena Pillai portfolio – quarterly update', 'Renew SEBI RIA certificate'],
    user:    ['Pay electricity bill this week', 'Transfer SIP amount to savings account', 'Apply for health insurance'],
  };
  const togetherItems = {
    admin:   ['Plan team offsite budget', 'Collect expense receipts from team'],
    manager: ['Coordinate office lunch RSVPs', 'Split outing cab fare'],
    advisor: ['Schedule joint client review call', 'Share updated financial plan PDF'],
    user:    ['Buy groceries for the flat', 'Pay shared electricity bill'],
  };
  const listNames = {
    admin:   { individual: 'My Admin Tasks', together: 'Team Offsite Planning' },
    manager: { individual: 'My Manager Tasks', together: 'Office Outing' },
    advisor: { individual: 'My Advisor Tasks', together: 'Client Review Prep' },
    user:    { individual: 'My Personal Tasks', together: 'Flat Sharing' },
  };

  const created = [];

  const [individualList] = await prisma.$queryRaw`
    INSERT INTO public.todo_lists (user_id, name, description)
    VALUES (${userId}::uuid, ${listNames[role].individual}, 'Individual list')
    RETURNING id::int AS id
  `;
  for (let i = 0; i < individualItems[role].length; i++) {
    await prisma.$executeRaw`
      INSERT INTO public.todo_items (list_id, user_id, title, completed, created_by)
      VALUES (${individualList.id}::bigint, ${userId}::uuid, ${individualItems[role][i]}, ${i === 0}, ${userId}::uuid)
    `;
  }
  created.push({ id: individualList.id, kind: 'individual' });

  if (shareWithUserId) {
    const [togetherList] = await prisma.$queryRaw`
      INSERT INTO public.todo_lists (user_id, name, description)
      VALUES (${userId}::uuid, ${listNames[role].together}, 'Together (shared) list')
      RETURNING id::int AS id
    `;
    for (let i = 0; i < togetherItems[role].length; i++) {
      await prisma.$executeRaw`
        INSERT INTO public.todo_items (list_id, user_id, title, completed, created_by)
        VALUES (${togetherList.id}::bigint, ${userId}::uuid, ${togetherItems[role][i]}, false, ${userId}::uuid)
      `;
    }
    await prisma.$executeRaw`
      INSERT INTO public.todo_list_shares (list_id, shared_with_user_id, shared_by, permission)
      VALUES (${togetherList.id}::bigint, ${shareWithUserId}::uuid, ${userId}::uuid, 'edit')
      ON CONFLICT (list_id, shared_with_user_id) DO NOTHING
    `;
    created.push({ id: togetherList.id, kind: 'together', sharedWith: shareWithUserId });
  }

  return created;
}

// ── 14. Advisor Feature ───────────────────────────────────────────────────────

async function seedAdvisorFeature(advisorId, clientId) {
  // Application (upsert — safe to re-run)
  await prisma.advisorApplication.upsert({
    where:  { userId: advisorId },
    update: { status: 'APPROVED' },
    create: {
      userId:          advisorId,
      fullName:        'Vikram Nair',
      email:           'advisor@kanaku.com',
      phone:           '+91-9876012345',
      experienceYears: 12,
      expertise:       'Wealth Management, Tax Planning, Retirement Planning, Portfolio Advisory',
      organizationName:'Nair Financial Services',
      bio:             'SEBI registered investment advisor (RIA) with 12+ years in wealth management. Specialised in retirement planning, tax optimisation, and equity portfolio construction for HNI clients. CFA charterholder, CFP certified.',
      status:          'APPROVED',
      reviewedAt:      daysAgo(30),
    },
  });

  // Availability – Mon(1) to Fri(5) 9 AM–6 PM; Sat(6) 10 AM–1 PM
  const existingAvail = await prisma.advisorAvailability.findMany({ where: { advisorId } });
  if (existingAvail.length === 0) {
    for (let day = 1; day <= 5; day++) {
      await prisma.advisorAvailability.create({ data: { advisorId, dayOfWeek: day, startTime: '09:00', endTime: '18:00', isActive: true } });
    }
    await prisma.advisorAvailability.create({ data: { advisorId, dayOfWeek: 6, startTime: '10:00', endTime: '13:00', isActive: true } });
  }

  // Past completed session (30 days ago)
  const pastBooking = await prisma.bookingRequest.create({ data: {
    clientId, advisorId,
    sessionType:   'video',
    description:   'Initial consultation – financial health assessment and goal mapping',
    proposedDate:  daysAgo(30),
    proposedTime:  '11:00',
    duration:      60,
    amount:        2500,
    status:        'confirmed',
  }});
  await prisma.advisorSession.create({ data: {
    bookingId:   pastBooking.id,
    advisorId,   clientId,
    startTime:   daysAgo(30),
    endTime:     new Date(daysAgo(30).getTime() + 60 * 60 * 1000),
    sessionType: 'video',
    status:      'completed',
    rating:      5.0,
    feedback:    'Vikram gave very clear, actionable advice. Highly recommend!',
    notes:       'Completed initial assessment. Recommended: SIP in Axis Bluechip, review insurance coverage, set 6-month emergency fund target.',
  }});

  // Upcoming scheduled session (tomorrow)
  const upcomingBooking = await prisma.bookingRequest.create({ data: {
    clientId, advisorId,
    sessionType:   'video',
    description:   'Q2 portfolio review, FY2026 tax optimisation, and retirement roadmap discussion',
    proposedDate:  daysFromNow(1),
    proposedTime:  '10:00',
    duration:      60,
    amount:        2500,
    status:        'confirmed',
  }});
  await prisma.advisorSession.create({ data: {
    bookingId:   upcomingBooking.id,
    advisorId,   clientId,
    startTime:   daysFromNow(1),
    endTime:     new Date(daysFromNow(1).getTime() + 60 * 60 * 1000),
    sessionType: 'video',
    status:      'scheduled',
    notes:       'Client wants to rebalance portfolio – currently overweight in crypto; also wants to know about ELSS for FY2026 tax saving.',
  }});
}

// ── Cleanup (idempotent) ──────────────────────────────────────────────────────

async function cleanupUser(userId) {
  // Order matters — delete dependents before parents
  await prisma.advisorSession.deleteMany({ where: { OR: [{ advisorId: userId }, { clientId: userId }] } }).catch(() => {});
  await prisma.bookingRequest.deleteMany({ where: { OR: [{ advisorId: userId }, { clientId: userId }] } }).catch(() => {});
  await prisma.advisorAvailability.deleteMany({ where: { advisorId: userId } }).catch(() => {});
  await prisma.advisorApplication.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.todo.deleteMany({ where: { userId } }).catch(() => {});
  // Real to-do feature tables (raw SQL, not Prisma-managed) — cascades to items/shares.
  await prisma.$executeRaw`DELETE FROM public.todo_lists WHERE user_id = ${userId}::uuid`
    .catch((err) => console.warn(`[mock-data] todo_lists cleanup failed for ${userId}:`, err.message));
  await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.taxCalculation.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goldAsset.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.recurringTransaction.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.budget.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.groupExpenseMember.deleteMany({ where: { groupExpense: { userId } } }).catch(() => {});
  await prisma.groupExpense.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.investment.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.friend.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.loanPayment.deleteMany({ where: { loan: { userId } } }).catch(() => {});
  await prisma.loan.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goalContribution.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.goal.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.account.deleteMany({ where: { userId } }).catch(() => {});
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[mock-data] Starting comprehensive mock data seeding...\n');

  const ROLES = ['admin', 'manager', 'advisor', 'user'];
  const EMAILS = {
    admin:   'admin@kanaku.com',
    manager: 'manager@kanaku.com',
    advisor: 'advisor@kanaku.com',
    user:    'user@kanaku.com',
  };

  // Look up users dynamically
  const userMap = {};
  for (const role of ROLES) {
    const u = await prisma.user.findUnique({ where: { email: EMAILS[role] } });
    if (!u) {
      console.warn(`[mock-data] WARNING: ${EMAILS[role]} not found – run seed-production-roles.cjs first`);
      continue;
    }
    userMap[role] = u;
    console.log(`[mock-data] Found ${role.padEnd(8)} → ${u.email} (${u.id})`);
  }

  for (const role of ROLES) {
    const user = userMap[role];
    if (!user) continue;
    const { id: userId } = user;

    console.log(`\n[mock-data] ── ${role.toUpperCase()} (${user.email}) ──`);

    process.stdout.write('  Cleaning existing mock data...');
    await cleanupUser(userId);
    console.log(' done');

    const acc = await seedAccounts(userId, role);
    console.log(`  ✓ Accounts:              4 created`);

    const txCount = await seedTransactions(userId, role, acc);
    console.log(`  ✓ Transactions:          ${txCount} created`);

    const goals = await seedGoals(userId, role, acc);
    console.log(`  ✓ Goals:                 ${goals.length} created (with contributions)`);

    const loans = await seedLoans(userId, role, acc);
    console.log(`  ✓ Loans:                 ${loans.length} created`);

    const friends = await seedFriends(userId, role);
    console.log(`  ✓ Friends:               ${friends.length} created`);

    const investments = await seedInvestments(userId, role);
    console.log(`  ✓ Investments:           ${investments.length} created`);

    const gold = await seedGoldAssets(userId, role);
    console.log(`  ✓ Gold Assets:           ${gold.length} created`);

    const budgets = await seedBudgets(userId, role);
    console.log(`  ✓ Budgets:               ${budgets.length} created`);

    const recurring = await seedRecurring(userId, role, acc);
    console.log(`  ✓ Recurring Txns:        ${recurring.length} created`);

    const groups = await seedGroupExpenses(userId, role, acc, friends);
    console.log(`  ✓ Group Expenses:        ${groups.length} created`);

    const taxes = await seedTaxCalcs(userId, role);
    console.log(`  ✓ Tax Calculations:      ${taxes.length} created`);

    const notifs = await seedNotifications(userId, role);
    console.log(`  ✓ Notifications:         ${notifs.length} created`);

    const nextRole = ROLES[(ROLES.indexOf(role) + 1) % ROLES.length];
    const shareWithUserId = userMap[nextRole]?.id;
    const todos = await seedTodos(userId, role, shareWithUserId);
    console.log(`  ✓ Todos:                 ${todos.length} created (1 individual${shareWithUserId ? ' + 1 together, shared with ' + nextRole : ''})`);
  }

  // Advisor feature – needs both advisor and user
  if (userMap.advisor && userMap.user) {
    console.log('\n[mock-data] ── Advisor Feature ──');
    await seedAdvisorFeature(userMap.advisor.id, userMap.user.id);
    console.log('  ✓ AdvisorApplication:    APPROVED');
    console.log('  ✓ AdvisorAvailability:   6 time slots (Mon–Sat)');
    console.log('  ✓ BookingRequest+Session: 1 completed (30 days ago) + 1 upcoming (tomorrow)');
  }

  console.log('\n[mock-data] ══════════════════════════════════════════════');
  console.log('[mock-data] Done! All 4 role accounts have full mock data.');
}

main()
  .catch(err => {
    console.error('[mock-data] Fatal error:', err.message);
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
