'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }

async function main() {
  console.log('Locating user mohammedsha27@gmail.com...');
  const user = await prisma.user.findUnique({
    where: { email: 'mohammedsha27@gmail.com' },
  });

  if (!user) {
    console.error('ERROR: User mohammedsha27@gmail.com not found!');
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found user ID: ${userId}`);

  // 1. Ensure PIN is 010203
  const pinHash = await bcrypt.hash('010203', 10);
  await prisma.userPin.upsert({
    where: { userId },
    create: {
      userId,
      pinHash,
      isActive: true,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    update: {
      pinHash,
      isActive: true,
    },
  });
  console.log('User PIN configured to 010203');

  // 2. Clear existing user data to ensure clean seed
  console.log('Cleaning prior user records for fresh data populating...');
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.loan.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.investment.deleteMany({ where: { userId } });
  await prisma.goldAsset.deleteMany({ where: { userId } });
  await prisma.friend.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });
  await prisma.recurringTransaction.deleteMany({ where: { userId } });

  // 3. Accounts
  console.log('Seeding Accounts...');
  const canaraBank = await prisma.account.create({
    data: {
      userId,
      name: 'Canara Bank Savings',
      type: 'bank',
      provider: 'Canara Bank',
      balance: 145000,
      currency: 'INR',
      country: 'India',
    },
  });

  const hdfcCredit = await prisma.account.create({
    data: {
      userId,
      name: 'HDFC Regalia Credit Card',
      type: 'credit',
      provider: 'HDFC Bank',
      balance: -14500,
      currency: 'INR',
      country: 'India',
    },
  });

  const cashWallet = await prisma.account.create({
    data: {
      userId,
      name: 'Cash Wallet',
      type: 'cash',
      balance: 4500,
      currency: 'INR',
      country: 'India',
    },
  });

  const paytmWallet = await prisma.account.create({
    data: {
      userId,
      name: 'Paytm Wallet',
      type: 'wallet',
      provider: 'Paytm',
      balance: 3200,
      currency: 'INR',
      country: 'India',
    },
  });

  // 4. Transactions
  console.log('Seeding Transactions...');
  const txns = [
    // Income
    {
      userId,
      accountId: canaraBank.id,
      type: 'income',
      amount: 120000,
      category: 'Salary',
      subcategory: 'Monthly Salary',
      description: 'Tech Solutions – Monthly Salary Credit',
      merchant: 'Tech Solutions Pvt Ltd',
      date: daysAgo(2),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'income',
      amount: 25000,
      category: 'Freelance',
      subcategory: 'Consulting',
      description: 'Web Architecture Consulting Project',
      merchant: 'Global Tech Inc',
      date: daysAgo(5),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'income',
      amount: 18000,
      category: 'Rental Income',
      subcategory: 'Property Rent',
      description: 'Monthly Rent from Mysuru Flat Tenant',
      merchant: 'Tenant',
      date: daysAgo(7),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'income',
      amount: 2450,
      category: 'Interest Income',
      subcategory: 'Savings Interest',
      description: 'Quarterly Savings Account Interest Credit',
      merchant: 'Canara Bank',
      date: daysAgo(12),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'income',
      amount: 1200,
      category: 'Dividend',
      subcategory: 'Stock Dividend',
      description: 'TCS Final Dividend Payout FY26',
      merchant: 'Tata Consultancy Services',
      date: daysAgo(15),
      currency: 'INR',
    },
    {
      userId,
      accountId: paytmWallet.id,
      type: 'income',
      amount: 350,
      category: 'Cashback',
      subcategory: 'App Reward',
      description: 'Paytm UPI Cashback Rewards',
      merchant: 'Paytm',
      date: daysAgo(1),
      currency: 'INR',
    },
    {
      userId,
      accountId: hdfcCredit.id,
      type: 'income',
      amount: 899,
      category: 'Refund',
      subcategory: 'Order Refund',
      description: 'Amazon Returned Item Refund',
      merchant: 'Amazon',
      date: daysAgo(8),
      currency: 'INR',
    },
    // Expenses
    {
      userId,
      accountId: canaraBank.id,
      type: 'expense',
      amount: 22000,
      category: 'Housing',
      subcategory: 'Rent',
      description: 'Monthly Apartment Rent',
      merchant: 'Apartment Owner',
      date: daysAgo(4),
      currency: 'INR',
    },
    {
      userId,
      accountId: hdfcCredit.id,
      type: 'expense',
      amount: 1250,
      category: 'Food',
      subcategory: 'Food Delivery',
      description: 'Swiggy Weekend Dinner Order',
      merchant: 'Swiggy',
      date: daysAgo(1),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'expense',
      amount: 5400,
      category: 'Food',
      subcategory: 'Groceries',
      description: 'D-Mart Supermarket Monthly Grocery',
      merchant: 'D-Mart',
      date: daysAgo(3),
      currency: 'INR',
    },
    {
      userId,
      accountId: hdfcCredit.id,
      type: 'expense',
      amount: 2800,
      category: 'Transportation',
      subcategory: 'Fuel',
      description: 'Shell Petrol Pump Refill',
      merchant: 'Shell Petrol',
      date: daysAgo(2),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'expense',
      amount: 1850,
      category: 'Bills',
      subcategory: 'Electricity',
      description: 'BESCOM Monthly Electricity Bill',
      merchant: 'BESCOM',
      date: daysAgo(6),
      currency: 'INR',
    },
    {
      userId,
      accountId: hdfcCredit.id,
      type: 'expense',
      amount: 14500,
      category: 'Health',
      subcategory: 'Insurance',
      description: 'Star Health Family Floater Policy Renewal',
      merchant: 'Star Health Insurance',
      date: daysAgo(10),
      currency: 'INR',
    },
    {
      userId,
      accountId: hdfcCredit.id,
      type: 'expense',
      amount: 6200,
      category: 'Shopping',
      subcategory: 'Apparel',
      description: 'Myntra Fashion Shopping Sale',
      merchant: 'Myntra',
      date: daysAgo(9),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'expense',
      amount: 4999,
      category: 'Education',
      subcategory: 'Online Course',
      description: 'Udemy Full Stack Architecture Masterclass',
      merchant: 'Udemy',
      date: daysAgo(14),
      currency: 'INR',
    },
    // Transfers
    {
      userId,
      accountId: canaraBank.id,
      type: 'transfer',
      amount: 2000,
      category: 'Transfer',
      subcategory: 'Bank to Wallet',
      description: 'Add Funds to Paytm Wallet',
      merchant: 'Paytm',
      date: daysAgo(5),
      currency: 'INR',
    },
    {
      userId,
      accountId: canaraBank.id,
      type: 'transfer',
      amount: 14500,
      category: 'Transfer',
      subcategory: 'Credit Card Payment',
      description: 'HDFC Credit Card Full Outstanding Payment',
      merchant: 'HDFC Bank',
      date: daysAgo(11),
      currency: 'INR',
    },
  ];
  for (const t of txns) {
    await prisma.transaction.create({ data: t });
  }

  // 5. Loans
  console.log('Seeding Loans...');
  const loans = [
    {
      userId,
      type: 'home_loan',
      name: 'SBI Home Loan',
      principalAmount: 3500000,
      outstandingBalance: 2840000,
      interestRate: 8.5,
      emiAmount: 30200,
      status: 'active',
      contactPerson: 'State Bank of India',
    },
    {
      userId,
      type: 'car_loan',
      name: 'HDFC Car Loan',
      principalAmount: 800000,
      outstandingBalance: 420000,
      interestRate: 9.1,
      emiAmount: 14800,
      status: 'active',
      contactPerson: 'HDFC Bank',
    },
    {
      userId,
      type: 'gold_loan',
      name: 'Muthoot Gold Loan',
      principalAmount: 200000,
      outstandingBalance: 120000,
      interestRate: 9.5,
      emiAmount: 4500,
      status: 'active',
      contactPerson: 'Muthoot Finance',
    },
    {
      userId,
      type: 'personal_loan',
      name: 'ICICI Personal Loan',
      principalAmount: 300000,
      outstandingBalance: 180000,
      interestRate: 11.5,
      emiAmount: 8200,
      status: 'active',
      contactPerson: 'ICICI Bank',
    },
    {
      userId,
      type: 'education_loan',
      name: 'SBI Education Loan',
      principalAmount: 500000,
      outstandingBalance: 310000,
      interestRate: 8.2,
      emiAmount: 6400,
      status: 'active',
      contactPerson: 'SBI Student Cell',
    },
  ];
  for (const l of loans) {
    await prisma.loan.create({ data: l });
  }

  // 6. Goals
  console.log('Seeding Goals...');
  const goals = [
    {
      userId,
      name: 'Emergency Fund',
      targetAmount: 300000,
      currentAmount: 185000,
      category: 'Emergency Fund',
      targetDate: daysFromNow(180),
    },
    {
      userId,
      name: 'Japan Vacation Trip',
      targetAmount: 250000,
      currentAmount: 95000,
      category: 'Travel',
      targetDate: daysFromNow(90),
    },
    {
      userId,
      name: 'New Electric Scooter',
      targetAmount: 140000,
      currentAmount: 60000,
      category: 'Vehicle',
      targetDate: daysFromNow(120),
    },
    {
      userId,
      name: 'House Down Payment',
      targetAmount: 1500000,
      currentAmount: 450000,
      category: 'Housing',
      targetDate: daysFromNow(730),
    },
    {
      userId,
      name: "Master's Education Fund",
      targetAmount: 800000,
      currentAmount: 220000,
      category: 'Education',
      targetDate: daysFromNow(365),
    },
  ];

  for (const g of goals) {
    await prisma.goal.create({ data: g });
  }


  // 7. Investments
  console.log('Seeding Investments V2...');
  const investments = [
    {
      userId,
      assetType: 'market_assets',
      assetName: 'Reliance Industries',
      quantity: 15,
      buyPrice: 2820,
      currentPrice: 2950,
      totalInvested: 42300,
      currentValue: 44250,
      profitLoss: 1950,
      purchaseDate: daysAgo(60),
      lastUpdated: new Date(),
      metadata: { symbol: 'RELIANCE.NS', category: 'stocks' },
    },
    {
      userId,
      assetType: 'market_assets',
      assetName: 'Tata Consultancy Services',
      quantity: 10,
      buyPrice: 3980,
      currentPrice: 4120,
      totalInvested: 39800,
      currentValue: 41200,
      profitLoss: 1400,
      purchaseDate: daysAgo(45),
      lastUpdated: new Date(),
      metadata: { symbol: 'TCS.NS', category: 'stocks' },
    },
    {
      userId,
      assetType: 'market_assets',
      assetName: 'Infosys Limited',
      quantity: 20,
      buyPrice: 1650,
      currentPrice: 1780,
      totalInvested: 33000,
      currentValue: 35600,
      profitLoss: 2600,
      purchaseDate: daysAgo(30),
      lastUpdated: new Date(),
      metadata: { symbol: 'INFY.NS', category: 'stocks' },
    },
    {
      userId,
      assetType: 'market_assets',
      assetName: 'Apple Inc.',
      quantity: 5,
      buyPrice: 210,
      currentPrice: 225.5,
      totalInvested: 1050,
      currentValue: 1127.5,
      profitLoss: 77.5,
      purchaseDate: daysAgo(90),
      lastUpdated: new Date(),
      metadata: { symbol: 'AAPL.US', category: 'stocks' },
    },
    {
      userId,
      assetType: 'market_assets',
      assetName: 'HDFC Top 100 Mutual Fund',
      quantity: 450,
      buyPrice: 180,
      currentPrice: 215,
      totalInvested: 81000,
      currentValue: 96750,
      profitLoss: 15750,
      purchaseDate: daysAgo(120),
      lastUpdated: new Date(),
      metadata: { symbol: 'HDFC-TOP100', category: 'mutual_fund' },
    },
    {
      userId,
      assetType: 'other_investments',
      assetName: 'SBI 3-Year Fixed Deposit',
      quantity: 1,
      buyPrice: 200000,
      currentPrice: 214500,
      totalInvested: 200000,
      currentValue: 214500,
      profitLoss: 14500,
      purchaseDate: daysAgo(180),
      lastUpdated: new Date(),
      metadata: { symbol: 'SBI-FD-2026', category: 'fd' },
    },
    {
      userId,
      assetType: 'physical_assets',
      assetName: '22K Gold Jewels & Coins (50g)',
      quantity: 50,
      buyPrice: 6400,
      currentPrice: 7250,
      totalInvested: 320000,
      currentValue: 362500,
      profitLoss: 42500,
      purchaseDate: daysAgo(60),
      lastUpdated: new Date(),
      metadata: { category: 'physical_gold', purityPercentage: 91.6, unit: 'gram', weightGrams: 50 },
    },
    {
      userId,
      assetType: 'physical_assets',
      assetName: '999 Fine Silver Bars (1kg)',
      quantity: 1000,
      buyPrice: 75,
      currentPrice: 88,
      totalInvested: 75000,
      currentValue: 88000,
      profitLoss: 13000,
      purchaseDate: daysAgo(90),
      lastUpdated: new Date(),
      metadata: { category: 'physical_silver', purityPercentage: 99.9, unit: 'gram', weightGrams: 1000 },
    },
  ];










  for (const inv of investments) {
    await prisma.investment.create({ data: inv });
  }

  // 8. Gold Asset
  console.log('Seeding Physical Gold Asset...');
  await prisma.goldAsset.create({
    data: {
      userId,
      type: 'physical_gold',
      quantity: 50,
      purityPercentage: 91.6,
      purchasePrice: 320000,
      currentPrice: 362500,
      purchaseDate: daysAgo(60),
    },
  });










  // 9. Friends
  console.log('Seeding Friends...');
  await prisma.friend.create({
    data: {
      userId,
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '+919876543210',
    },
  });
  await prisma.friend.create({
    data: {
      userId,
      name: 'Ananya Verma',
      email: 'ananya.v@example.com',
      phone: '+919876543211',
    },
  });

  // 10. To-Dos
  console.log('Seeding To-Dos...');
  await prisma.todo.createMany({
    data: [
      {
        userId,
        title: 'File ITR Returns for FY 2025-26',
        completed: false,
      },
      {
        userId,
        title: 'Review Mutual Fund SIP Performance',
        completed: false,
      },
      {
        userId,
        title: 'Renew Health Insurance Policy',
        completed: false,
      },
      {
        userId,
        title: 'Purchase Smart LED Ceiling Lights',
        completed: true,
      },
    ],
  });




  // 11. Budgets
  console.log('Seeding Budgets...');
  await prisma.budget.createMany({
    data: [
      { userId, category: 'Food', amount: 15000, period: 'monthly' },
      { userId, category: 'Transportation', amount: 8000, period: 'monthly' },
      { userId, category: 'Entertainment', amount: 5000, period: 'monthly' },
    ],
  });

  // 12. Recurring Transactions
  console.log('Seeding Recurring Transactions...');
  await prisma.recurringTransaction.createMany({
    data: [
      {
        userId,
        accountId: hdfcCredit.id,
        title: 'Netflix Premium 4K Plan',
        type: 'expense',
        amount: 649,
        category: 'Entertainment',
        description: 'Netflix Premium 4K Plan',
        nextDueDate: daysAgo(-10),
      },
      {
        userId,
        accountId: canaraBank.id,
        title: 'Airtel Xstream Fiber Broadband',
        type: 'expense',
        amount: 999,
        category: 'Bills',
        description: 'Airtel Xstream Fiber Broadband',
        nextDueDate: daysAgo(-5),
      },
    ],
  });


  console.log('\n================================================================');
  console.log(' MOCK DATA POPULATED SUCCESSFULLY FOR USER mohammedsha27@gmail.com!');
  console.log(' Credentials:');
  console.log(' - Email:    mohammedsha27@gmail.com');
  console.log(' - Password: Alpha_Ashu@1');
  console.log(' - PIN:      010203');
  console.log('================================================================\n');
}

main()
  .catch((err) => {
    console.error('Fatal error during seed execution:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
