const sqlite3 = require('sqlite3').verbose();

// Create database file
const db = new sqlite3.Database('./dev.db');

console.log(' Creating missing tables...');

// Create missing tables
const createTables = `
-- Accounts table
CREATE TABLE IF NOT EXISTS Account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'bank',
  balance REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  isActive BOOLEAN DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  deletedAt DATETIME,
  FOREIGN KEY (userId) REFERENCES User (id) ON DELETE CASCADE
);

-- Transactions table
CREATE TABLE IF NOT EXISTS Transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  accountId TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  merchant TEXT,
  date DATETIME NOT NULL,
  tags TEXT,
  attachment TEXT,
  transferToAccountId TEXT,
  transferType TEXT,
  synced BOOLEAN DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  deletedAt DATETIME,
  FOREIGN KEY (userId) REFERENCES User (id) ON DELETE CASCADE,
  FOREIGN KEY (accountId) REFERENCES Account (id) ON DELETE CASCADE
);

-- Goals table
CREATE TABLE IF NOT EXISTS Goal (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  targetAmount REAL NOT NULL,
  currentAmount REAL DEFAULT 0,
  targetDate DATETIME NOT NULL,
  category TEXT,
  isGroupGoal BOOLEAN DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  deletedAt DATETIME,
  FOREIGN KEY (userId) REFERENCES User (id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_account_user ON Account(userId);
CREATE INDEX IF NOT EXISTS idx_transaction_user ON Transaction(userId);
CREATE INDEX IF NOT EXISTS idx_transaction_account ON Transaction(accountId);
CREATE INDEX IF NOT EXISTS idx_transaction_date ON Transaction(date);
CREATE INDEX IF NOT EXISTS idx_transaction_category ON Transaction(category);
CREATE INDEX IF NOT EXISTS idx_goal_user ON Goal(userId);
CREATE INDEX IF NOT EXISTS idx_goal_target_date ON Goal(targetDate);
`;

db.serialize(() => {
  db.run(createTables, (err) => {
    if (err) {
      console.error(' Error creating tables:', err);
      return;
    }
    console.log(' Missing tables created successfully');
    
    // Add test data
    addTestData();
  });
});

function addTestData() {
  console.log(' Adding test data...');
  
  // Get admin user
  db.get("SELECT id FROM User WHERE email = 'shaik.job.details@gmail.com'", (err, user) => {
    if (err || !user) {
      console.error(' Error getting admin user:', err);
      return;
    }
    
    const userId = user.id;
    
    // Create test account
    const accountId = 'cl' + Math.random().toString(36).substr(2, 9);
    const accountStmt = db.prepare("INSERT INTO Account (id, userId, name, type, balance, currency) VALUES (?, ?, ?, ?, ?, ?)");
    accountStmt.run([accountId, userId, 'Test Account', 'bank', 1000.00, 'USD'], function(err) {
      if (err) {
        console.error(' Error creating test account:', err);
        return;
      }
      console.log(' Test account created');
      
      // Create test transaction
      const transactionId = 'cl' + Math.random().toString(36).substr(2, 9);
      const transactionStmt = db.prepare("INSERT INTO Transactions (id, userId, accountId, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      transactionStmt.run([transactionId, userId, accountId, 'income', 500.00, 'salary', 'Test salary income', new Date()], function(err) {
        if (err) {
          console.error(' Error creating test transaction:', err);
          return;
        }
        console.log(' Test transaction created');
        console.log(' Database setup completed successfully!');
        db.close();
      });
      transactionStmt.finalize();
    });
    accountStmt.finalize();
  });
}

// Handle errors
db.on('error', (err) => {
  console.error(' Database error:', err);
});