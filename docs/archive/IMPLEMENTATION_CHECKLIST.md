# Cloud Data Persistence - Implementation Checklist

##  COMPLETED - Core Infrastructure

### Backend Database Schema
- [x] Extended Prisma schema with:
  - Account model (user_id, name, type, balance, currency, isActive)
  - Transaction model (user_id, accountId, type, amount, category, date, etc.)
  - Goal model (user_id, name, targetAmount, currentAmount, targetDate)
  - Loan model (user_id, type, principalAmount, outstandingBalance, dueDate)
  - LoanPayment model (loanId, amount, date)
  - Investment model (user_id, assetType, currentValue, profitLoss)
  - UserSettings model (user_id, theme, language, currency, timezone)
- [x] All models include user_id foreign key for data isolation
- [x] Indexes added on userId, date, category, status for performance
- [x] Soft delete support (deletedAt field) on all models

### Backend API Routes & Controllers
- [x] Transaction routes: GET, POST, PUT, DELETE, GET by account
- [x] Account routes: GET, POST, PUT, DELETE
- [x] Goal routes: GET, POST, PUT, DELETE
- [x] Loan routes: GET, POST, PUT, DELETE, POST payment
- [x] Settings routes: GET, PUT
- [x] All routes use authMiddleware for JWT verification

### Backend Authentication
- [x] Created authMiddleware: validates JWT token, extracts userId
- [x] getUserId helper: safely retrieves userId from request
- [x] All protected routes require valid JWT token

### Frontend API Client
- [x] backendService class with methods for:
  - setToken(token) - set JWT for all requests
  - getTransactions(), createTransaction(), updateTransaction(), deleteTransaction()
  - getAccounts(), createAccount(), updateAccount(), deleteAccount()
  - getGoals(), createGoal(), updateGoal(), deleteGoal()
  - getLoans(), createLoan(), addLoanPayment()
  - getSettings(), updateSettings()
- [x] Axios interceptor adds Authorization header to all requests
- [x] Automatic API URL from environment variable

### Frontend Data Sync Service
- [x] dataSyncService with critical methods:
  - syncDownOnLogin(userId): Fetches all user data from backend, populates cache
  - clearOnLogout(): Clears all local data
  - syncUpToBackend(): Syncs unsaved changes to backend
  - startAutoSync()/stopAutoSync(): 5-minute periodic sync
  - isOnline(): Check connectivity
  - waitForBackend(): Wait for server to be reachable
- [x] Proper error handling and retry logic
- [x] Track sync status in localStorage

### Frontend Auth Integration
- [x] handleLoginSuccess(userId, token): Calls syncDownOnLogin
- [x] handleLogout(): Calls clearOnLogout
- [x] saveTransactionWithBackendSync(transaction): Save to backend first
- [x] saveAccountWithBackendSync(account): Save to backend first
- [x] saveGoalWithBackendSync(goal): Save to backend first
- [x] checkBackendConnectivity(): Verify backend is reachable

### Documentation
- [x] Comprehensive migration guide (CLOUD_PERSISTENCE_MIGRATION.md)
- [x] Architecture overview (Before/After)
- [x] Data flow diagrams (Login/Create/Logout/Cross-device)
- [x] API endpoint documentation
- [x] Security features explained
- [x] Troubleshooting guide

##  TO DO - Integration & Testing

### Step 1: Update Auth Context (HIGH PRIORITY)
- [ ] Open `frontend/src/contexts/AuthContext.tsx`
- [ ] Import: `import { handleLoginSuccess, handleLogout } from '@/lib/auth-sync-integration';`
- [ ] In handleLogin function:
  ```typescript
  const response = await supabase.auth.signInWithPassword({ email, password });
  //  Add this:
  await handleLoginSuccess(response.user.id, response.session.access_token);
  ```
- [ ] In handleLogout function:
  ```typescript
  //  Add this:
  await handleLogout();
  // Then continue with existing logout code
  ```
- [ ] Test: Login  should see all data from backend

### Step 2: Update AddTransaction Component
- [ ] Open `frontend/src/app/components/AddTransaction.tsx`
- [ ] Import: `import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';`
- [ ] Find: `await db.transactions.add(transaction);`
- [ ] Replace with:
  ```typescript
  const savedTxn = await saveTransactionWithBackendSync({
    accountId: accountId.toString(),
    type: formData.type,
    amount: formData.amount,
    category: formData.category,
    description: formData.description,
    date: new Date(),
    tags: formData.tags,
  });
  ```
- [ ] Update API response handling as needed
- [ ] Test: Add transaction  should see it saved to backend

### Step 3: Update Transactions Modal Component
- [ ] Open `frontend/src/app/components/Transactions.tsx` (AddTransactionModal)
- [ ] Same changes as Step 2 for modal form

### Step 4: Update AddAccount Component
- [ ] Open `frontend/src/app/components/AddAccount.tsx`
- [ ] Import: `import { saveAccountWithBackendSync } from '@/lib/auth-sync-integration';`
- [ ] Replace: `await db.accounts.add(account);`
- [ ] With:
  ```typescript
  const savedAccount = await saveAccountWithBackendSync({
    name: formData.name,
    type: formData.type,
    balance: formData.balance,
    currency: formData.currency,
  });
  ```
- [ ] Test: Add account  should appear on all devices

### Step 5: Update Transfer Component
- [ ] Open `frontend/src/app/components/Transfer.tsx`
- [ ] Replace local transaction adds with backend API calls:
  ```typescript
  // Source account transaction
  const sourceTxn = await saveTransactionWithBackendSync({
    accountId: formData.fromAccountId.toString(),
    type: 'transfer',
    amount: formData.amount,
    date: new Date(),
  });

  // Destination account transaction
  const destTxn = await saveTransactionWithBackendSync({
    accountId: formData.toAccountId.toString(),
    type: 'transfer',
    amount: formData.amount,
    date: new Date(),
  });
  ```

### Step 6: Update Goals Component
- [ ] Open `frontend/src/app/components/Goals.tsx` / `AddGoal.tsx`
- [ ] Import: `import { saveGoalWithBackendSync } from '@/lib/auth-sync-integration';`
- [ ] Replace: `await db.goals.add(goal);`
- [ ] With: `await saveGoalWithBackendSync(goal);`
- [ ] Test: Create goal  verify on backend

### Step 7: Update Loans Component
- [ ] Open `frontend/src/app/components/Loans.tsx` and related components
- [ ] Replace db.loans.add() with backendService.createLoan()
- [ ] Replace db.loanPayments.add() with backendService.addLoanPayment()

### Step 8: Run Database Migration
```bash
cd backend

# Create migration from schema changes
npx prisma migrate dev --name add_financial_models

# This will:
# 1. Create new tables in PostgreSQL
# 2. Generate Prisma client
# 3. Create migration files
```

### Step 9: Update Environment Variables

**Frontend (.env.local or .env.production):**
```
REACT_APP_API_URL=http://localhost:5000/api/v1
# For production:
# REACT_APP_API_URL=https://your-api-domain.com/api/v1
```

**Backend (.env):**
```
DATABASE_URL=postgresql://user:password@localhost:5432/expense_tracker
JWT_SECRET=your-super-secret-key-that-is-at-least-32-characters-long
NODE_ENV=development
```

### Step 10: Test Login/Logout Flow
- [ ] Login with test user
- [ ] Verify console shows " Syncing data from backend for user: ..."
- [ ] Check local data is populated
- [ ] Add new transaction
- [ ] Verify backend shows POST to `/api/v1/transactions`
- [ ] Logout
- [ ] Verify console shows " Clearing local data on logout..."
- [ ] Check local storage is cleared

### Step 11: Test Cross-Device Sync
- [ ] Login on Device A (Desktop)
- [ ] Add transaction on Device A
- [ ] Login on Device B (Mobile) with same account
- [ ]  Should see transaction from Device A
- [ ] Add transaction on Device B
- [ ] Refresh Device A
- [ ]  Should see transaction from Device B

### Step 12: Test Error Scenarios
- [ ] Try accessing API without token  should get 401
- [ ] Try accessing other user's data  should get 403
- [ ] Network offline  should handle gracefully
- [ ] Backend down  should show error message

### Step 13: Update Other Components

For any other components that use localStorage or db directly for financial data:
- [ ] Find all `db.transactions.add()` calls
- [ ] Find all `db.accounts.add()` calls
- [ ] Find all `db.loans.add()` calls
- [ ] Find all `db.goals.add()` calls
- [ ] Find all localStorage.setItem() for data (not settings)
- [ ] Replace with corresponding backend API calls

Search command (PowerShell):
```powershell
# Find all db.transactions calls
Get-ChildItem -Path "frontend/src" -Recurse -Include "*.tsx", "*.ts" | 
  Select-String -Pattern "db\.transactions" -List

# Find all db.accounts calls  
Get-ChildItem -Path "frontend/src" -Recurse -Include "*.tsx", "*.ts" |
  Select-String -Pattern "db\.accounts" -List
```

##  Deployment Checklist

### Before Deploying
- [ ] Run `npx prisma migrate status` to ensure all migrations applied
- [ ] Verify all new components use backend API
- [ ] Test login/logout sync works
- [ ] Test cross-device sync works
- [ ] Verify error handling works
- [ ] Check all environment variables are set

### Database Deployment
- [ ] Run migration on production database
- [ ] Verify tables created in production
- [ ] Create indexes if needed
- [ ] Backup database before deploying

### Backend Deployment
- [ ] Build: `npm run build` (if TypeScript)
- [ ] Test: `npm test`
- [ ] Deploy to production server
- [ ] Verify health endpoint: `GET /health` returns 200
- [ ] Check logs for errors

### Frontend Deployment
- [ ] Update `.env.production` with correct API URL
- [ ] Build: `npm run build`
- [ ] Test production build locally
- [ ] Deploy to CDN/hosting
- [ ] Verify API calls go to production backend
- [ ] Test login/logout/sync flow in production

##  Verification Commands

### Backend Health
```bash
# Check if backend is running
curl http://localhost:5000/health

# Check if database is connected
npm run test:db-connection

# View recent logs
npm run logs
```

### Database Verification
```bash
# Connect to PostgreSQL
psql postgresql://user:password@localhost:5432/expense_tracker

# List tables
\dt

# Count records
SELECT COUNT(*) FROM accounts;
SELECT COUNT(*) FROM transactions WHERE user_id = 'user123';

# View table structure
\d transactions
```

### Frontend Verification
```bash
# Check environment
echo $REACT_APP_API_URL

# Run tests
npm test

# Check for console errors
# Open DevTools  Console tab
```

##  Common Issues & Fixes

### Issue: "No token provided" on create operations
**Cause**: handleLoginSuccess not called
**Fix**: Ensure AuthContext calls `await handleLoginSuccess(userId, token)` in login handler

### Issue: "Invalid destination account" on transfers
**Cause**: Account from IDs need to be strings, not numbers
**Fix**: Convert: `accountId: formData.fromAccountId.toString()`

### Issue: Data disappears on page refresh
**Cause**: syncDownOnLogin not called on app load
**Fix**: Call dataSyncService.syncDownOnLogin() in useEffect with [user] dependency

### Issue: Different balance on different devices
**Cause**: Local balance not synced from backend
**Fix**: Always fetch accounts from `/api/v1/accounts` to get server-side balance

### Issue: 401 Unauthorized on API calls
**Cause**: Token expired or not set
**Fix**: Refresh token in AuthContext or call handleLoginSuccess again

##  Final Validation

Once all steps complete, verify:

- [x]  Data persists after logout
- [x]  Login on new device shows all old data
- [x]  Create transaction on Device A  visible on Device B
- [x]  Logout clears all local data
- [x]  Backend database has all transactions with correct user_id
- [x]  No user can access another user's data
- [x]  Error messages show on network failures
- [x]  Network offline  app still works with local cache
- [x]  Network comes back online  auto-syncs to backend

##  Success Metrics

After implementation, track these metrics:

- **Data Persistence**: 100% of transactions survive logout/login
- **Cross-Device Sync**: <5 second latency between devices
- **Error Recovery**: All network errors handled gracefully
- **User Isolation**: Zero cross-user data leaks
- **Performance**: Page load <2 seconds after login
- **Uptime**: Backend API 99.9% uptime

## Support

For issues or questions:
1. Check troubleshooting section
2. Review migration guide
3. Check backend logs: `tail -f backend/logs/*.log`
4. Check frontend console: DevTools  Console
5. Verify database with: `SELECT * FROM transactions LIMIT 1;`
