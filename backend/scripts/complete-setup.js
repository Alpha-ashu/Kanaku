const sqlite3 = require('sqlite3').verbose();

// Create database file
const db = new sqlite3.Database('./dev.db');

console.log(' Completing database setup...');

// Create all missing tables
const createTables = `
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
CREATE INDEX IF NOT EXISTS idx_transaction_user ON Transactions(userId);
CREATE INDEX IF NOT EXISTS idx_transaction_account ON Transactions(accountId);
CREATE INDEX IF NOT EXISTS idx_transaction_date ON Transactions(date);
CREATE INDEX IF NOT EXISTS idx_transaction_category ON Transactions(category);
CREATE INDEX IF NOT EXISTS idx_goal_user ON Goal(userId);
CREATE INDEX IF NOT EXISTS idx_goal_target_date ON Goal(targetDate);
`;

db.serialize(() => {
  db.run(createTables, (err) => {
    if (err) {
      console.error(' Error creating tables:', err);
      return;
    }
    console.log(' All tables created successfully');
    
    // Add test data
    addCompleteTestData();
  });
});

function addCompleteTestData() {
  console.log(' Adding complete test data...');
  
  // Get admin user
  db.get("SELECT id FROM User WHERE email = 'shaik.job.details@gmail.com'", (err, user) => {
    if (err || !user) {
      console.error(' Error getting admin user:', err);
      return;
    }
    
    const userId = user.id;
    
    // Create test transaction
    const transactionId = 'cl' + Math.random().toString(36).substr(2, 9);
    const transactionStmt = db.prepare("INSERT INTO Transactions (id, userId, accountId, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    transactionStmt.run([transactionId, userId, 'cl65joghvvb', 'income', 500.00, 'salary', 'Test salary income', new Date()], function(err) {
      if (err) {
        console.error(' Error creating test transaction:', err);
        return;
      }
      console.log(' Test transaction created');
      
      // Create test goal
      const goalId = 'cl' + Math.random().toString(36).substr(2, 9);
      const goalStmt = db.prepare("INSERT INTO Goal (id, userId, name, targetAmount, currentAmount, targetDate, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
      goalStmt.run([goalId, userId, 'Test Savings Goal', 1000.00, 200.00, new Date(Date.now() + 30*24*60*60*1000), 'savings'], function(err) {
        if (err) {
          console.error(' Error creating test goal:', err);
          return;
        }
        console.log(' Test goal created');
        console.log(' Complete database setup finished!');
        db.close();
      });
      goalStmt.finalize();
    });
    transactionStmt.finalize();
  });
}

// Handle errors
db.on('error', (err) => {
  console.error(' Database error:', err);
});