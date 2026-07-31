import { prisma } from '../src/db/prisma';
import { todoRepository } from '../src/features/todos/todo.repository';

async function populateMohammedData() {
  console.log('Finding user mohammedsha27@gmail.com...');
  const user = await prisma.user.findUnique({
    where: { email: 'mohammedsha27@gmail.com' },
  });

  if (!user) {
    console.error('User mohammedsha27@gmail.com not found!');
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found user ID: ${userId}`);

  // 1. Ensure user pin is set to 010203
  const bcrypt = require('bcryptjs');
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
  console.log('User PIN verified/updated to 010203');

  // 2. Create Accounts
  console.log('Seeding Accounts...');
  const canaraBank = await prisma.account.create({
    data: {
      userId,
      name: 'Canara Bank Savings',
      type: 'bank',
      provider: 'Canara Bank',
      accountNumber: '••••4892',
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
      accountNumber: '••••9124',
      balance: -14500,
      creditLimit: 250000,
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

  // 3. Transactions
  console.log('Seeding Transactions...');
  const today = new Date();
  const daysAgo = (d: number) => new Date(today.getTime() - d * 24 * 60 * 60 * 1000);

  await prisma.transaction.createMany({
    data: [
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
    ],
  });

  // 4. Loans & Debt
  console.log('Seeding Loans...');
  await prisma.loan.createMany({
    data: [
      {
        userId,
        name: 'SBI Home Loan',
        lender: 'State Bank of India',
        loanType: 'home',
        principalAmount: 3500000,
        remainingAmount: 2840000,
        interestRate: 8.5,
        emiAmount: 30200,
        startDate: daysAgo(365),
        endDate: new Date(today.getFullYear() + 15, today.getMonth(), today.getDate()),
        status: 'active',
      },
      {
        userId,
        name: 'HDFC Car Loan',
        lender: 'HDFC Bank',
        loanType: 'car',
        principalAmount: 800000,
        remainingAmount: 420000,
        interestRate: 9.1,
        emiAmount: 14800,
        startDate: daysAgo(180),
        endDate: new Date(today.getFullYear() + 3, today.getMonth(), today.getDate()),
        status: 'active',
      },
    ],
  });

  // 5. Goals
  console.log('Seeding Savings Goals...');
  await prisma.goal.createMany({
    data: [
      {
        userId,
        name: 'Emergency Fund',
        description: '6 Months Expenses Reserve',
        targetAmount: 300000,
        currentAmount: 185000,
        category: 'Emergency',
        targetDate: new Date(today.getFullYear(), 11, 31),
      },
      {
        userId,
        name: 'Japan Vacation Trip',
        description: 'Tokyo & Kyoto 10-day trip fund',
        targetAmount: 250000,
        currentAmount: 95000,
        category: 'Travel',
        targetDate: new Date(today.getFullYear(), 9, 15),
      },
      {
        userId,
        name: 'New Electric Scooter',
        description: 'Ather 450X Purchase',
        targetAmount: 140000,
        currentAmount: 60000,
        category: 'Vehicle',
        targetDate: new Date(today.getFullYear(), 10, 30),
      },
    ],
  });

  // 6. Investments
  console.log('Seeding Investments V2...');
  await prisma.investment.createMany({
    data: [
      {
        userId,
        name: 'Reliance Industries',
        symbol: 'RELIANCE.NS',
        type: 'stocks',
        quantity: 15,
        buyPrice: 2820,
        currentPrice: 2950,
        totalValue: 44250,
      },
      {
        userId,
        name: 'Tata Consultancy Services',
        symbol: 'TCS.NS',
        type: 'stocks',
        quantity: 10,
        buyPrice: 3980,
        currentPrice: 4120,
        totalValue: 41200,
      },
      {
        userId,
        name: 'Infosys Limited',
        symbol: 'INFY.NS',
        type: 'stocks',
        quantity: 20,
        buyPrice: 1650,
        currentPrice: 1780,
        totalValue: 35600,
      },
      {
        userId,
        name: 'Apple Inc.',
        symbol: 'AAPL.US',
        type: 'stocks',
        quantity: 5,
        buyPrice: 210,
        currentPrice: 225.5,
        totalValue: 1127.5,
      },
      {
        userId,
        name: 'HDFC Top 100 Mutual Fund',
        symbol: 'HDFC-TOP100',
        type: 'mutual_fund',
        quantity: 450,
        buyPrice: 180,
        currentPrice: 215,
        totalValue: 96750,
      },
      {
        userId,
        name: 'SBI 3-Year Fixed Deposit',
        symbol: 'SBI-FD-2026',
        type: 'fd',
        quantity: 1,
        buyPrice: 200000,
        currentPrice: 214500,
        totalValue: 214500,
      },
    ],
  });

  // Gold Assets
  await prisma.goldAsset.create({
    data: {
      userId,
      assetName: '22K Gold Jewels & Coins',
      assetType: 'physical_gold',
      weightGrams: 50,
      karat: 22,
      purchasePricePerGram: 6400,
      currentPricePerGram: 7250,
      totalValue: 362500,
    },
  });

  // 7. Friends & Group Expenses
  console.log('Seeding Friends & Group Expenses...');
  const friendRahul = await prisma.friend.create({
    data: {
      userId,
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '+919876543210',
    },
  });

  const friendAnanya = await prisma.friend.create({
    data: {
      userId,
      name: 'Ananya Verma',
      email: 'ananya.v@example.com',
      phone: '+919876543211',
    },
  });

  const groupExpense = await prisma.groupExpense.create({
    data: {
      userId,
      name: 'Goa Weekend Trip',
      totalAmount: 24000,
      splitType: 'equal',
    },
  });

  await prisma.groupExpenseMember.createMany({
    data: [
      {
        groupExpenseId: groupExpense.id,
        friendId: friendRahul.id,
        shareAmount: 6000,
        paidAmount: 6000,
        hasPaid: true,
      },
      {
        groupExpenseId: groupExpense.id,
        friendId: friendAnanya.id,
        shareAmount: 6000,
        paidAmount: 0,
        hasPaid: false,
      },
    ],
  });

  // 8. To-Do Lists & Items
  console.log('Seeding To-Do Lists...');
  const list1 = await todoRepository.createList(
    userId,
    'Financial Planning Q3 2026',
    'Quarterly investments & tax audit checklist'
  );

  if (list1 && list1.id) {
    await todoRepository.createItem(
      list1.id,
      userId,
      'File ITR Returns for FY 2025-26',
      'Submit Form 16 and verify tax computations',
      'high'
    );
    await todoRepository.createItem(
      list1.id,
      userId,
      'Review Mutual Fund SIP Performance',
      'Rebalance equity vs debt allocation',
      'medium'
    );
    await todoRepository.createItem(
      list1.id,
      userId,
      'Renew Health Insurance Policy',
      'Pay annual premium for Star Health Family Floater',
      'high'
    );
  }

  const list2 = await todoRepository.createList(
    userId,
    'Home Maintenance & Shopping',
    'Pending household tasks'
  );

  if (list2 && list2.id) {
    await todoRepository.createItem(
      list2.id,
      userId,
      'Get Kitchen Plumbing Quotation',
      'Fix kitchen sink drainage tap',
      'medium'
    );
    await todoRepository.createItem(
      list2.id,
      userId,
      'Purchase Smart LED Ceiling Lights',
      'Order 3x Philips Smart WIZ Bulbs from Amazon',
      'low'
    );
  }

  // 9. Budgets & Recurring Transactions
  console.log('Seeding Budgets & Recurring Transactions...');
  await prisma.budget.createMany({
    data: [
      {
        userId,
        category: 'Food',
        amount: 15000,
        period: 'monthly',
      },
      {
        userId,
        category: 'Transportation',
        amount: 8000,
        period: 'monthly',
      },
      {
        userId,
        category: 'Entertainment',
        amount: 5000,
        period: 'monthly',
      },
    ],
  });

  await prisma.recurringTransaction.createMany({
    data: [
      {
        userId,
        accountId: hdfcCredit.id,
        type: 'expense',
        amount: 649,
        category: 'Entertainment',
        description: 'Netflix Premium 4K Plan',
        frequency: 'monthly',
        nextDueDate: daysAgo(-10),
      },
      {
        userId,
        accountId: canaraBank.id,
        type: 'expense',
        amount: 999,
        category: 'Bills',
        description: 'Airtel Xstream Fiber Broadband',
        frequency: 'monthly',
        nextDueDate: daysAgo(-5),
      },
    ],
  });

  console.log('\n======================================================');
  console.log(' SUCCESS: All mock data successfully populated!');
  console.log(' User Credentials:');
  console.log(' Email:    mohammedsha27@gmail.com');
  console.log(' Password: Alpha_Ashu@1');
  console.log(' PIN:      010203');
  console.log('======================================================\n');
}

populateMohammedData()
  .catch((err) => {
    console.error('Error populating mock data:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
