# Expense Tracker Integration Test Scenario

## Test Overview
This test scenario validates the complete frontend-backend integration including API connectivity and database persistence.

## Test Environment Setup

### Backend Configuration
- Server URL: http://localhost:3000
- Database: PostgreSQL (configured via DATABASE_URL)
- Authentication: JWT with bcrypt
- API Endpoints: /api/v1/auth/*

### Frontend Configuration
- Development Server: http://localhost:5174
- Database: Dexie.js (IndexedDB)
- API Base URL: http://localhost:3000

## Test Scenarios

### 1. User Registration and Authentication Test

**Objective**: Verify user registration, login, and JWT token generation

**Steps**:
1. Register a new user via POST /api/v1/auth/register
2. Verify user creation in database
3. Login with registered credentials
4. Verify JWT token generation
5. Test token validation

**Expected Results**:
- User successfully registered in PostgreSQL database
- JWT tokens (access and refresh) generated
- User data persisted with encrypted password
- Token validation successful

**Test Data**:
```json
{
  "email": "integration.test@example.com",
  "name": "Integration Test User",
  "password": "testpassword123"
}
```

### 2. Database Schema Validation Test

**Objective**: Verify database schema and table structure

**Steps**:
1. Check if 'public.users' table exists
2. Verify table columns and constraints
3. Test foreign key relationships
4. Validate data types and indexes

**Expected Results**:
- Users table exists with proper schema
- All required columns present (id, email, name, password, createdAt, updatedAt)
- Unique constraint on email field
- Proper foreign key relationships for refresh tokens and todos

### 3. API Endpoint Connectivity Test

**Objective**: Verify all API endpoints are accessible and responding

**Endpoints to Test**:
- GET /health (Server health check)
- POST /api/v1/auth/register (User registration)
- POST /api/v1/auth/login (User authentication)

**Expected Results**:
- All endpoints return proper HTTP status codes
- JSON responses formatted correctly
- Error handling works for invalid requests
- CORS headers properly configured

### 4. Data Persistence Test

**Objective**: Verify data is properly stored and retrieved from database

**Steps**:
1. Register user via API
2. Query database directly to verify user exists
3. Login and verify session data
4. Test data integrity and consistency

**Expected Results**:
- User data persisted in PostgreSQL
- Password properly hashed with bcrypt
- Timestamps correctly set
- No data corruption or loss

### 5. Frontend-Backend Communication Test

**Objective**: Verify frontend can successfully communicate with backend

**Steps**:
1. Frontend makes API call to register user
2. Backend processes request and returns response
3. Frontend handles response appropriately
4. Verify data flows correctly both ways

**Expected Results**:
- HTTP requests successful
- Response data properly parsed
- Error states handled gracefully
- Loading states displayed appropriately

## Test Execution Commands

### Backend Tests
```bash
# Start backend server
cd backend && npm run dev

# Test health endpoint
curl http://localhost:3000/health

# Test user registration
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User","password":"password123"}'

# Test user login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Frontend Tests
```bash
# Start frontend development server
cd frontend && npm run dev

# Test via browser at http://localhost:5174
# Navigate to registration/login forms
# Submit test data and verify responses
```

## Database Verification Queries

### Check Users Table
```sql
-- Verify table exists
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'users';

-- Check table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' ORDER BY ordinal_position;

-- Verify test user exists
SELECT id, email, name, created_at FROM users 
WHERE email = 'integration.test@example.com';
```

### Check Data Integrity
```sql
-- Verify password is hashed
SELECT id, email, password FROM users 
WHERE email = 'integration.test@example.com';

-- Check for duplicate emails
SELECT email, COUNT(*) FROM users 
GROUP BY email HAVING COUNT(*) > 1;
```

## Success Criteria

###  Integration Tests Pass
- [ ] User registration API works correctly
- [ ] User login API works correctly
- [ ] JWT token generation and validation works
- [ ] Database schema is properly configured
- [ ] Data persistence is verified
- [ ] Frontend-backend communication is successful
- [ ] Error handling works as expected
- [ ] CORS configuration is correct

###  Database Validation
- [ ] Users table exists with correct schema
- [ ] Test user data is properly stored
- [ ] Password hashing is working
- [ ] Timestamps are correctly set
- [ ] No data corruption or integrity issues

###  Frontend Integration
- [ ] API calls from frontend succeed
- [ ] Response handling works correctly
- [ ] Error states are properly displayed
- [ ] Loading states function properly
- [ ] Data flows correctly between frontend and backend

## Test Report Format

After executing tests, document results in this format:

```
Test Scenario: [Name]
Status: [PASS/FAIL]
Details: [Specific results and observations]
Issues: [Any problems encountered]
Resolution: [How issues were resolved]
```

## Notes
- Ensure database is accessible and properly configured
- Verify environment variables are set correctly
- Test with clean database state for accurate results
- Document any configuration changes made during testing