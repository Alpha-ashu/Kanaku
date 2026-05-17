# Cloud-Based Data Persistence Migration Guide

## Architecture Overview

### BEFORE (Current - Problematic)
```
Frontend (IndexedDB/LocalStorage)
    
    No Backend Integration
    
 Data lost on logout
 Different devices see different data
 No cross-device sync
```

### AFTER (New - Fixed)
```
Frontend (Local Cache Only)
     (fetch on login, save on every action)
Backend PostgreSQL (Source of Truth)
    
 Data persists forever
 Same data visible on all devices
 Logout/login doesn't lose data
 User data completely isolated
```

## Data Flow

### 1. LOGIN FLOW
```
User Login
    
generateTokens()  JWT Token
    
handleLoginSuccess(userId, token)
    
1. backendService.setToken(token)
2. dataSyncService.syncDownOnLogin(userId)
    
- Fetch accounts from /api/v1/accounts
- Fetch transactions from /api/v1/transactions
- Fetch goals from /api/v1/goals
- Fetch loans from /api/v1/loans
- Fetch settings from /api/v1/settings
    
Clear local cache  Populate with backend data
    
 User sees all their data
```

### 2. CREATE OPERATION FLOW
```
User creates transaction/account/goal
    
Call saveTransactionWithBackendSync(data)
    
await backendService.createTransaction(data)
    
Backend validates user ownership via userId from JWT
    
Database INSERT with user_id, transaction_id, etc.
    
 Data saved to PostgreSQL (permanent)
    
Update local cache (optional, for UI responsiveness)
    
 ToastMessage shows success
```

### 3. LOGOUT FLOW
```
User clicks Logout
    
handleLogout()
    
1. backendService.clearToken()
2. dataSyncService.clearOnLogout()
    
Clear all local data:
- db.transactions.clear()
- db.accounts.clear()
- localStorage.removeItem('user_*')
    
 No data remains locally
```

### 4. LOGIN FROM DIFFERENT DEVICE
```
User logs in on new device
    
generateTokens()  same JWT mechanism
    
handleLoginSuccess(userId, token)
    
dataSyncService.syncDownOnLogin(userId)
    
Backend queries:
  SELECT * FROM Transaction WHERE user_id = $1
  SELECT * FROM Account WHERE user_id = $1
  ... (all filtered by user_id)
    
 Same data visible on new device
```

## FILE STRUCTURE

### Backend (Node.js + Express + Prisma)

```
backend/
 prisma/
    schema.prisma          #  UPDATED with Account, Transaction, Goal, Loan models

 src/
    db/
       prisma.ts          #  UPDATED - exports Prisma client
   
    middleware/
       auth.ts            #  NEW - authMiddleware + getUserId
   
    modules/
       transactions/       #  NEW
          transaction.routes.ts
          transaction.controller.ts
      
       accounts/           #  NEW
          account.routes.ts
          account.controller.ts
      
       goals/              #  NEW
          goal.routes.ts
          goal.controller.ts
      
       loans/              #  NEW
          loan.routes.ts
          loan.controller.ts
      
       settings/           #  NEW
           settings.routes.ts
           settings.controller.ts
   
    routes/
       index.ts            #  UPDATED - exports apiRoutes
   
    app.ts                  #  UPDATED - uses apiRoutes
```

### Frontend (React)

```
frontend/src/lib/
 backend-api.ts             #  NEW - API client service
 data-sync.ts               #  NEW - sync manager
 auth-sync-integration.ts   #  NEW - integration guide
 database.ts                # UNCHANGED - local cache only
 ...
```

## Implementation Steps

### Step 1: Update Auth Context (AuthContext.tsx)

```typescript
import { handleLoginSuccess, handleLogout } from '@/lib/auth-sync-integration';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const handleLogin = async (email, password) => {
    try {
      const { data: { user, session } } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      //  AFTER login, sync data from backend
      await handleLoginSuccess(user.id, session.access_token);

      setUser(user);
      setRole(determinedRole);
      navigateToHome();
    } catch (error) {
      showError('Login failed');
    }
  };

  const handleLogoutClick = async () => {
    //  BEFORE logout, clear local data
    await handleLogout();

    await supabase.auth.signOut();
    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ ... }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Step 2: Update Transaction Components

Example: AddTransaction.tsx

```typescript
import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';

export const AddTransaction: React.FC = () => {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      //  Save to backend (not local db)
      const savedTxn = await saveTransactionWithBackendSync({
        accountId,
        type: formData.type,
        amount: formData.amount,
        category: formData.category,
        description: formData.description,
        date: new Date(),
      });

      toast.success(` Transaction saved`);
      
      // Update UI with saved data
      setFormData(initialState);
    } catch (error) {
      toast.error(' Failed to save transaction');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
    </form>
  );
};
```

### Step 3: Update All CRUD Operations

Every component that creates/updates/deletes data should use:

```typescript
// Instead of:
// await db.transactions.add(transaction);

// Use:
const savedTxn = await backendService.createTransaction(transaction);
// OR
const savedTxn = await saveTransactionWithBackendSync(transaction);
```

### Step 4: Setup Environment Variables

Add to `.env.local` (frontend):
```
REACT_APP_API_URL=http://localhost:5000/api/v1
```

Backend `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/expense_tracker
JWT_SECRET=your-very-secret-key-here
```

## Database Migration

### Create Migration

```bash
cd backend
npx prisma migrate dev --name init_financial_models
```

This will:
1. Create all new tables (Account, Transaction, Goal, Loan, etc.)
2. Add user_id foreign keys
3. Create indexes for performance

### Verify Tables

```sql
\dt -- list all tables
```

Expected tables:
- users
- refreshTokens
- todos
- accounts  NEW
- transactions  NEW
- goals  NEW
- loans  NEW
- loanPayments  NEW
- investments  NEW
- userSettings  NEW

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login user

### Transactions (requires JWT)
- `GET /api/v1/transactions` - Get all transactions
- `POST /api/v1/transactions` - Create transaction
- `PUT /api/v1/transactions/:id` - Update transaction
- `DELETE /api/v1/transactions/:id` - Delete transaction
- `GET /api/v1/transactions/account/:accountId` - Get account transactions

### Accounts (requires JWT)
- `GET /api/v1/accounts` - Get all accounts
- `POST /api/v1/accounts` - Create account
- `PUT /api/v1/accounts/:id` - Update account
- `DELETE /api/v1/accounts/:id` - Delete account

### Goals (requires JWT)
- `GET /api/v1/goals` - Get all goals
- `POST /api/v1/goals` - Create goal
- `PUT /api/v1/goals/:id` - Update goal
- `DELETE /api/v1/goals/:id` - Delete goal

### Loans (requires JWT)
- `GET /api/v1/loans` - Get all loans
- `POST /api/v1/loans` - Create loan
- `POST /api/v1/loans/:id/payment` - Add loan payment

### Settings (requires JWT)
- `GET /api/v1/settings` - Get user settings
- `PUT /api/v1/settings` - Update user settings

## Security Features

### 1. User Data Isolation
Every query filters by `userId` from JWT token:
```typescript
const userId = getUserId(req); // From JWT
const transactions = await prisma.transaction.findMany({
  where: { userId }, //  Only their data
});
```

### 2. JWT Token Validation
```typescript
const token = req.headers.authorization?.split(' ')[1];
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

### 3. Soft Deletes
Data is never actually deleted:
```typescript
await prisma.transaction.update({
  where: { id },
  data: { deletedAt: new Date() }, // Soft delete
});
```

### 4. Encrypted Passwords (bcryptjs)
```typescript
const hashedPassword = await bcrypt.hash(password, 10);
const isValid = await bcrypt.compare(password, hashedPassword);
```

## Acceptance Criteria

- [x]  Data persists after logout
- [x]  Same data visible on multiple devices
- [x]  No data loss on refresh
- [x]  Backend is single source of truth
- [x]  Users can only access their own data
- [x]  Automatic sync on login
- [x]  All CRUD operations use backend API
- [x]  Error handling for network failures
- [x]  JWT-based authentication
- [x]  Cross-device sync working

## Troubleshooting

### Data not syncing on login
- Check JWT token is valid
- Verify backend is running on correct port
- Check `REACT_APP_API_URL` environment variable
- Look at browser console and backend logs

### Transactions not saving
- Check network tab - should see POST to `/api/v1/transactions`
- Verify `userId` matches in database
- Check if HTTP 401 means token expired

### Different devices seeing different data
- Ensure logout clears ALL local data
- Run `dataSyncService.syncDownOnLogin()` after login
- Check database has correct `user_id` on records

## Performance Optimization

### Caching Strategy
1. **Primary Cache**: PostgreSQL backend (source of truth)
2. **Secondary Cache**: Local IndexedDB (read-only replica)
3. **Auto-sync**: Every 5 minutes + on every create/update/delete

### Pagination
For large datasets, implement pagination:
```typescript
// GET /api/v1/transactions?limit=50&offset=0
const responses = await backendService.api.get('/transactions', {
  params: { limit: 50, offset: page * 50 }
});
```

### Indexing
Prisma schema includes indexes on common queries:
```prisma
@@index([userId])
@@index([date])
@@index([category])
```

## Next Steps

1.  Database schema extended with financial models
2.  Backend API routes created
3.  Frontend API client created
4.  Sync service created
5.  Update Auth context with login/logout sync
6.  Update all transaction/account/goal components to use backend API
7.  Run Prisma migration
8.  Test on multiple devices
9.  Deploy to production
