# Post-Implementation Setup Guide

**Required Steps to Make the System Operational**

---

##  CRITICAL: Database Migration

### Step 1: Run Prisma Migration

The database schema has been updated with new tables and fields. You MUST run the migration before the system will work.

```bash
cd backend

# Create and run migration
npx prisma migrate dev --name add_rbac_and_advisor_features

# When prompted for migration name, confirm: "add_rbac_and_advisor_features"
```

**What this does:**
- Adds `role` field to User table (default: 'user')
- Adds `isApproved` field to User table (default: false)
- Creates 6 new tables: BookingRequest, AdvisorSession, ChatMessage, AdvisorAvailability, Payment, Notification
- Sets up proper indexes and relationships

### Step 2: Verify Migration Success

```bash
# Check Prisma client was generated
ls -la node_modules/.prisma/client/

# Verify database has new tables (using psql, mysql, or your DB admin tool)
-- For PostgreSQL:
\dt  -- should show new tables

-- For MySQL:
SHOW TABLES;
```

**Expected output:**
```
All tables listed:
- User (modified)
- BookingRequest (new)
- AdvisorSession (new)
- ChatMessage (new)
- AdvisorAvailability (new)
- Payment (new)
- Notification (new)
[existing tables...]
```

### Step 3: Create Initial Admin User (Manual)

Since there's no admin creation endpoint yet, create one manually:

**PostgreSQL:**
```sql
INSERT INTO "User" (id, email, name, password, role, "isApproved", "createdAt", "updatedAt")
VALUES (
  'admin-uuid-here',
  'admin@example.com',
  'Admin User',
  '$2a$10$...bcrypt-hash-here...',
  'admin',
  true,
  NOW(),
  NOW()
);
```

Or use the app to create it as a regular user, then manually update in database:

```sql
UPDATE "User" SET role = 'admin', "isApproved" = true WHERE email = 'admin@example.com';
```

---

##  Environment Configuration

### Step 1: Set Environment Variables

Create/update `backend/.env`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/expense_tracker"

# JWT
JWT_SECRET="your-super-secret-key-change-this-in-production"

# Payment Gateway (Coming Soon)
STRIPE_API_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Email Service (Coming Soon)
SENDGRID_API_KEY="SG...."

# App
PORT=5000
NODE_ENV=development
API_URL="http://localhost:5000"
```

### Step 2: Update Frontend Environment

Create/update `frontend/.env`:

```env
VITE_API_URL="http://localhost:5000/api/v1"
```

---

##  Testing the System

### Test 1: Basic Auth with Roles

```bash
# 1. Register as user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "name": "Test User",
    "password": "testpass123",
    "role": "user"
  }'

# Expected Response: 201
# {
#   "accessToken": "...",
#   "refreshToken": "...",
#   "user": {
#     "role": "user",
#     "isApproved": true
#   }
# }

# 2. Register as advisor (pending approval)
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testadvisor@example.com",
    "name": "Test Advisor",
    "password": "testpass123",
    "role": "advisor"
  }'

# Expected Response: 201
# {
#   "user": {
#     "role": "advisor",
#     "isApproved": false
#   }
# }
```

### Test 2: RBAC Authorization

```bash
# Save tokens from registration
USER_TOKEN="user_token_from_above"
ADVISOR_TOKEN="advisor_token_from_above"
ADMIN_TOKEN="admin_token_from_above"

# Try to access advisor-only endpoint as user (should fail)
curl -X POST http://localhost:5000/api/v1/advisors/availability \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"}'

# Expected: 403 Forbidden
# {
#   "error": "Feature access denied",
#   "feature": "manageAvailability",
#   "userRole": "user"
# }

# Try same with advisor token (should succeed)
curl -X POST http://localhost:5000/api/v1/advisors/availability \
  -H "Authorization: Bearer $ADVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"}'

# Expected: 201 Created
# { availability object }
```

### Test 3: Admin Approval Workflow

```bash
# Get advisor ID from earlier registration
ADVISOR_ID="from_above"

# Approve advisor (as admin)
curl -X POST http://localhost:5000/api/v1/admin/users/$ADVISOR_ID/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected: 200 OK
# {
#   "message": "Advisor approved",
#   "user": {
#     "isApproved": true
#   }
# }

# Now advisor can accept bookings
```

### Test 4: Complete Booking Flow

See `backend/API_DOCUMENTATION.md` section "Testing Instructions" for full workflow example.

---

##  Server Startup

### Start Backend Server

```bash
cd backend

# Install dependencies if not done
npm install

# Generate Prisma client (if not done by migration)
npx prisma generate

# Start server
npm run dev

# Expected output:
# Server running at http://localhost:5000
# Connected to database: postgresql://...
```

### Start Frontend (in separate terminal)

```bash
cd frontend

# Install dependencies if needed
npm install

# Start dev server
npm run dev

# Expected output:
# vite v... dev server running at:
# > Local: http://localhost:5173
```

---

##  Common Issues & Solutions

### Issue 1: "relation 'User' does not exist"

**Cause:** Migration wasn't run
**Solution:**
```bash
cd backend
npx prisma migrate dev --name add_rbac_and_advisor_features
```

### Issue 2: "Cannot find module '@prisma/client'"

**Cause:** Prisma client not generated
**Solution:**
```bash
cd backend
npx prisma generate
npm install
```

### Issue 3: "Field 'role' not found on User"

**Cause:** Old types cached
**Solution:**
```bash
# Clear TypeScript cache
find . -name "*.tsbuildinfo" -delete

# Regenerate types
npx prisma generate

# Restart server
npm run dev
```

### Issue 4: "JWT malformed" errors

**Cause:** Database has old user records without role field
**Solution:**
```bash
# Option 1: Clear and start fresh
npx prisma migrate reset

# Option 2: Update existing users
UPDATE "User" SET role = 'user', "isApproved" = true WHERE role IS NULL;
```

### Issue 5: "Cannot POST /bookings" or 404 errors

**Cause:** Routes not registered or server not restarted
**Solution:**
```bash
# Kill server (Ctrl+C)
# Verify routes/index.ts has all imports
# Restart server
npm run dev

# Check logs for "Advisor routes loaded"
```

---

##  Default Test Credentials

After initial setup, use these for testing:

```
Admin:
- Email: admin@example.com
- Password: admin123
- Role: admin

Advisor:
- Email: advisor@example.com
- Password: advisor123
- Role: advisor (pending approval)

User:
- Email: user@example.com
- Password: user123
- Role: user
```

To create these test users, register them via `/auth/register` endpoint, then manually update the database for admin role.

---

##  Documentation Files Created

| File | Purpose |
|------|---------|
| `API_DOCUMENTATION.md` | Complete API reference with examples |
| `PHASE_1_2_IMPLEMENTATION.md` | Implementation summary |
| `INTEGRATION_VERIFICATION_REPORT.md` | What's working and what's missing |
| `POST_IMPLEMENTATION_SETUP.md` | This file - setup instructions |

---

##  Verification Checklist

After following all steps above:

- [ ] Database migration completed successfully
- [ ] New tables visible in database
- [ ] Backend server starts without errors
- [ ] Frontend loads at localhost:5173
- [ ] Can register user (role=user)
- [ ] Can register advisor (role=advisor)
- [ ] Can login and receive JWT with role
- [ ] GET /auth/profile returns role
- [ ] Admin approve/reject endpoints work
- [ ] Advisor availability endpoint checks role
- [ ] Booking endpoints require authentication
- [ ] All notification endpoints accessible

---

##  Next Priority Tasks

1. **Database Migration**  START HERE (5 minutes)
2. **Test all endpoints** (15 minutes)
3. **Stripe/Razorpay integration** (2-3 hours)
4. **Frontend integration** (2-3 hours)
5. **Email notifications setup** (1-2 hours)
6. **WebSocket real-time** (2-3 hours)

---

##  Quick Reference

**After migration, to verify:**

```bash
# 1. Check database
psql -U user -d expense_tracker -c "\dt"

# 2. Generate Prisma client
npx prisma generate

# 3. Start backend
npm run dev

# 4. Test auth endpoint
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test","password":"test123"}'

# Should return 201 with token and user object
```

---
