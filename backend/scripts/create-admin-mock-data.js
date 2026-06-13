const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// Create comprehensive mock data for admin role only
const db = new sqlite3.Database('./dev.db');

console.log(' Creating comprehensive mock data for admin role only...');

// Admin user details
const adminEmail = 'shaik.job.details@gmail.com';
const adminPassword = '123456789';
const adminName = 'Admin User';

async function createAdminMockData() {
  try {
    // Get admin user
    const admin = await new Promise((resolve, reject) => {
      db.get("SELECT id FROM User WHERE email = ?", [adminEmail], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    if (!admin) {
      console.error(' Admin user not found in database');
      return;
    }

    const adminId = admin.id;
    console.log(' Admin user found:', adminEmail);

    // Create comprehensive mock data for admin
    await createAdminAccounts(adminId);
    await createAdminTransactions(adminId);
    await createAdminGoals(adminId);
    await createAdminLoans(adminId);
    await createAdminInvestments(adminId);

    console.log(' Comprehensive admin mock data created successfully!');
    console.log(' Mock Data Summary:');
    console.log('   - 5 bank accounts with different currencies');
    console.log('   - 50+ transactions (income, expenses, transfers)');
    console.log('   - 3 savings and investment goals');
    console.log('   - 2 active loans (personal and car)');
    console.log('   - 4 investment portfolios');
    console.log('   - All data linked to admin user only');

    db.close();
  } catch (error) {
    console.error(' Error creating admin mock data:', error);
    db.close();
  }
}

async function createAdminAccounts(adminId) {
  console.log(' Creating admin accounts...');
  
  const accounts = [
    {
      name: 'Primary Checking Account',
      type: 'bank',
      balance: 5000.00,
      currency: 'USD',
      isActive: true
    },
    {
      name: 'Savings Account',
      type: 'bank',
      balance: 15000.00,
      currency: 'USD',
      isActive: true
    },
    {
      name: 'Credit Card',
      type: 'card',
      balance: -2500.00,
      currency: 'USD',
      isActive: true
    },
    {
      name: 'Business Account',
      type: 'bank',
      balance: 25000.00,
      currency: 'USD',
      isActive: true
    },
    {
      name: 'Emergency Fund',
      type: 'bank',
      balance: 10000.00,
      currency: 'EUR',
      isActive: true
    }
  ];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const accountId = 'cl' + Math.random().toString(36).substr(2, 9);
    
    const stmt = db.prepare("INSERT INTO Account (id, userId, name, type, balance, currency, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)");
    await new Promise((resolve, reject) => {
      stmt.run([accountId, adminId, account.name, account.type, account.balance, account.currency, account.isActive], function(err) {
        if (err) reject(err);
        else {
          console.log(`    Created account: ${account.name} - $${account.balance} ${account.currency}`);
          resolve();
        }
      });
    });
    stmt.finalize();
  }
}

async function createAdminTransactions(adminId) {
  console.log(' Creating admin transactions...');
  
  // Get all admin account IDs
  const accounts = await new Promise((resolve, reject) => {
    db.all("SELECT id, name, type FROM Account WHERE userId = ?", [adminId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const accountIds = accounts.map(acc => acc.id);
  
  // Define transaction categories
  const incomeCategories = ['salary', 'freelance', 'investment', 'bonus', 'gift'];
  const expenseCategories = ['groceries', 'rent', 'utilities', 'transportation', 'dining', 'entertainment', 'shopping', 'healthcare', 'education', 'travel'];
  const transferTypes = ['self-transfer', 'other-transfer'];

  // Create 50 transactions
  for (let i = 0; i < 50; i++) {
    const transactionId = 'cl' + Math.random().toString(36).substr(2, 9);
    const accountId = accountIds[Math.floor(Math.random() * accountIds.length)];
    
    // 60% income, 40% expenses
    const isIncome = Math.random() > 0.4;
    
    let type, amount, category, description;
    
    if (isIncome) {
      type = 'income';
      category = incomeCategories[Math.floor(Math.random() * incomeCategories.length)];
      amount = Math.floor(Math.random() * 5000) + 100;
      description = `Income from ${category} - Transaction #${i + 1}`;
    } else {
      type = 'expense';
      category = expenseCategories[Math.floor(Math.random() * expenseCategories.length)];
      amount = Math.floor(Math.random() * 2000) + 10;
      description = `Expense for ${category} - Transaction #${i + 1}`;
    }

    // Random date in last 6 months
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 180));

    const stmt = db.prepare("INSERT INTO Transactions (id, userId, accountId, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    await new Promise((resolve, reject) => {
      stmt.run([transactionId, adminId, accountId, type, amount, category, description, date], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    stmt.finalize();
  }

  console.log(`    Created 50 transactions for admin`);
}

async function createAdminGoals(adminId) {
  console.log(' Creating admin goals...');
  
  const goals = [
    {
      name: 'Emergency Fund Goal',
      targetAmount: 20000.00,
      currentAmount: 12000.00,
      category: 'savings',
      daysToAdd: 90
    },
    {
      name: 'Vacation Fund',
      targetAmount: 5000.00,
      currentAmount: 2500.00,
      category: 'travel',
      daysToAdd: 60
    },
    {
      name: 'Home Down Payment',
      targetAmount: 50000.00,
      currentAmount: 15000.00,
      category: 'investment',
      daysToAdd: 365
    }
  ];

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i];
    const goalId = 'cl' + Math.random().toString(36).substr(2, 9);
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + goal.daysToAdd);

    const stmt = db.prepare("INSERT INTO Goal (id, userId, name, targetAmount, currentAmount, targetDate, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
    await new Promise((resolve, reject) => {
      stmt.run([goalId, adminId, goal.name, goal.targetAmount, goal.currentAmount, targetDate, goal.category], function(err) {
        if (err) reject(err);
        else {
          console.log(`    Created goal: ${goal.name} - $${goal.currentAmount}/${goal.targetAmount}`);
          resolve();
        }
      });
    });
    stmt.finalize();
  }
}

async function createAdminLoans(adminId) {
  console.log(' Creating admin loans...');
  
  const loans = [
    {
      name: 'Personal Loan',
      type: 'borrowed',
      principalAmount: 10000.00,
      outstandingBalance: 7500.00,
      interestRate: 8.5,
      emiAmount: 250.00,
      frequency: 'monthly',
      status: 'active'
    },
    {
      name: 'Car Loan',
      type: 'borrowed',
      principalAmount: 25000.00,
      outstandingBalance: 18000.00,
      interestRate: 6.2,
      emiAmount: 450.00,
      frequency: 'monthly',
      status: 'active'
    }
  ];

  for (let i = 0; i < loans.length; i++) {
    const loan = loans[i];
    const loanId = 'cl' + Math.random().toString(36).substr(2, 9);
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // Next payment due in 30 days

    const stmt = db.prepare("INSERT INTO Goal (id, userId, name, targetAmount, currentAmount, targetDate, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
    await new Promise((resolve, reject) => {
      stmt.run([loanId, adminId, loan.name, loan.principalAmount, loan.outstandingBalance, dueDate, loan.type], function(err) {
        if (err) reject(err);
        else {
          console.log(`    Created loan: ${loan.name} - Outstanding: $${loan.outstandingBalance}`);
          resolve();
        }
      });
    });
    stmt.finalize();
  }
}

async function createAdminInvestments(adminId) {
  console.log(' Creating admin investments...');
  
  const investments = [
    {
      assetType: 'stock',
      assetName: 'Technology Stocks Portfolio',
      quantity: 100,
      buyPrice: 50.00,
      currentPrice: 75.00
    },
    {
      assetType: 'crypto',
      assetName: 'Bitcoin Investment',
      quantity: 0.5,
      buyPrice: 30000.00,
      currentPrice: 45000.00
    },
    {
      assetType: 'gold',
      assetName: 'Gold Bullion',
      quantity: 10,
      buyPrice: 1800.00,
      currentPrice: 2100.00
    },
    {
      assetType: 'forex',
      assetName: 'EUR/USD Forex',
      quantity: 5000,
      buyPrice: 1.10,
      currentPrice: 1.12
    }
  ];

  for (let i = 0; i < investments.length; i++) {
    const inv = investments[i];
    const investmentId = 'cl' + Math.random().toString(36).substr(2, 9);
    
    const totalInvested = inv.quantity * inv.buyPrice;
    const currentValue = inv.quantity * inv.currentPrice;
    const profitLoss = currentValue - totalInvested;

    const purchaseDate = new Date();
    purchaseDate.setDate(purchaseDate.getDate() - Math.floor(Math.random() * 365));

    const stmt = db.prepare("INSERT INTO Goal (id, userId, name, targetAmount, currentAmount, targetDate, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
    await new Promise((resolve, reject) => {
      stmt.run([investmentId, adminId, inv.assetName, totalInvested, currentValue, purchaseDate, inv.assetType], function(err) {
        if (err) reject(err);
        else {
          console.log(`    Created investment: ${inv.assetName} - P/L: $${profitLoss.toFixed(2)}`);
          resolve();
        }
      });
    });
    stmt.finalize();
  }
}

// Handle errors
db.on('error', (err) => {
  console.error(' Database error:', err);
});

// Run the mock data creation
createAdminMockData();