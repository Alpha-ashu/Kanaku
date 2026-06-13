const sqlite3 = require('sqlite3').verbose();

// Create database file
const db = new sqlite3.Database('./dev.db');

console.log(' Final database setup...');

// Create Goal table
const createGoalTable = `
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
CREATE INDEX IF NOT EXISTS idx_goal_user ON Goal(userId);
CREATE INDEX IF NOT EXISTS idx_goal_target_date ON Goal(targetDate);
`;

db.serialize(() => {
  db.run(createGoalTable, (err) => {
    if (err) {
      console.error(' Error creating Goal table:', err);
      return;
    }
    console.log(' Goal table created successfully');
    
    // Add final test data
    addFinalTestData();
  });
});

function addFinalTestData() {
  console.log(' Adding final test data...');
  
  // Get admin user
  db.get("SELECT id FROM User WHERE email = 'shaik.job.details@gmail.com'", (err, user) => {
    if (err || !user) {
      console.error(' Error getting admin user:', err);
      return;
    }
    
    const userId = user.id;
    
    // Create test goal
    const goalId = 'cl' + Math.random().toString(36).substr(2, 9);
    const goalStmt = db.prepare("INSERT INTO Goal (id, userId, name, targetAmount, currentAmount, targetDate, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
    goalStmt.run([goalId, userId, 'Test Savings Goal', 1000.00, 200.00, new Date(Date.now() + 30*24*60*60*1000), 'savings'], function(err) {
      if (err) {
        console.error(' Error creating test goal:', err);
        return;
      }
      console.log(' Test goal created');
      console.log(' Final database setup completed!');
      db.close();
    });
    goalStmt.finalize();
  });
}

// Handle errors
db.on('error', (err) => {
  console.error(' Database error:', err);
});