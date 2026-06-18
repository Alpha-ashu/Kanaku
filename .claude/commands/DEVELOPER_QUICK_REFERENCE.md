# Developer Quick Reference Guide

**Fast lookup for common operations and endpoints**

---

## Quick Commands

### Start Development Environment

```bash
# Terminal 1: Frontend
cd frontend && npm run dev

# Terminal 2: Backend  
cd backend && npm run dev

# Terminal 3: Prisma Studio (optional - browse database)
cd backend && npx prisma studio
```

### Common Database Operations

```bash
# View database with GUI
npx prisma studio

# Run pending migrations
npx prisma migrate dev

# Reset database (careful!)
npx prisma migrate reset

# Generate Prisma client
npx prisma generate

# View migration status
npx prisma migrate status
```

---

## Token-Based Testing

Save this handy function for testing:

```bash
# Function to test endpoints with token
test_endpoint() {
  local method=$1
  local endpoint=$2
  local token=$3
  local data=$4
  
  if [ -z "$data" ]; then
    curl -X $method "http://localhost:5000/api/v1$endpoint" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json"
  else
    curl -X $method "http://localhost:5000/api/v1$endpoint" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

# Usage:
# test_endpoint GET /auth/profile "$USER_TOKEN"
# test_endpoint POST /advisors/availability "$ADVISOR_TOKEN" '{"dayOfWeek":1,...}'
```

---

## Common Endpoints Cheat Sheet

### Authentication (No Token Needed)
```
POST /auth/register        # Create account
POST /auth/login           # Login
GET  /auth/profile         # Get current user (needs token)
```

### User Booking
```
GET  /advisors             # List all advisors
GET  /advisors/:id         # Get advisor details
POST /bookings             # Create booking request
GET  /bookings             # Get my bookings
PUT  /bookings/:id/cancel  # Cancel booking
```

### Advisor Operations
```
POST /advisors/availability         # Set availability
GET  /advisors/:id/availability     # View availability
DELETE /advisors/availability/:id   # Remove availability slot
GET  /advisors/me/sessions          # My sessions
PUT  /advisors/sessions/:id/rate    # Rate session (as client)
```

### Session Management
```
GET    /sessions/:id                # Session details
POST   /sessions/:id/messages       # Send message
GET    /sessions/:id/messages       # View chat
POST   /sessions/:id/start          # Start session (advisor)
POST   /sessions/:id/complete       # End session (advisor)
POST   /sessions/:id/cancel         # Cancel session
```

### Payment Processing
```
GET    /payments                    # List payments
POST   /payments/initiate           # Start payment
POST   /payments/complete           # Mark paid
POST   /payments/refund             # Refund payment
```

### Notifications
```
GET   /notifications                # Get notifications
GET   /notifications/unread/count   # Unread count
PUT   /notifications/:id/read       # Mark read
DELETE /notifications/:id            # Delete notification
POST  /notifications/mark-all-read  # Mark all read
```

### Admin Only
```
GET    /admin/users                      # List users
GET    /admin/users/pending              # Pending advisors
POST   /admin/users/:id/approve          # Approve advisor
POST   /admin/users/:id/reject           # Reject advisor
GET    /admin/stats                      # Platform stats
GET    /admin/features                   # Feature flags
POST   /admin/features/toggle            # Toggle feature
GET    /admin/reports/users              # User report
GET    /admin/reports/revenue            # Revenue report
```

---

## Request/Response Examples

### Example 1: Register & Get Token

```bash
# 1. Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "secure123",
    "role": "user"
  }'

# Response:
# HTTP 201
# {
#   "accessToken": "eyJhbGc...",
#   "refreshToken": "eyJhbGc...",
#   "user": {
#     "id": "cln...",
#     "email": "user@example.com",
#     "name": "John Doe",
#     "role": "user",
#     "isApproved": true
#   }
# }

# 2. Use the token for next requests
TOKEN="eyJhbGc..."

curl -X GET http://localhost:5000/api/v1/advisors \
  -H "Authorization: Bearer $TOKEN"
```

### Example 2: Full Booking Flow

```bash
# 1. Get approvals from earlier
ADVISOR_ID="adv123..."
BOOKING_AMOUNT=100

# 2. Create booking
curl -X POST http://localhost:5000/api/v1/bookings \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "advisorId": "'$ADVISOR_ID'",
    "sessionType": "video",
    "proposedDate": "2026-02-20",
    "proposedTime": "14:00",
    "duration": 60,
    "amount": '$BOOKING_AMOUNT'
  }'

# Response: HTTP 201 with booking object
# Save booking ID
BOOKING_ID="bk123..."

# 3. Advisor accepts (on advisor side)
curl -X PUT http://localhost:5000/api/v1/bookings/$BOOKING_ID/accept \
  -H "Authorization: Bearer $ADVISOR_TOKEN"

# Response: HTTP 200 with booking + session object
# Save session ID  
SESSION_ID="sess123..."

# 4. Start session (advisor)
curl -X POST http://localhost:5000/api/v1/sessions/$SESSION_ID/start \
  -H "Authorization: Bearer $ADVISOR_TOKEN"

# 5. Exchange messages
curl -X POST http://localhost:5000/api/v1/sessions/$SESSION_ID/messages \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Thank you for the advice!"}'

# 6. Complete session (advisor)
curl -X POST http://localhost:5000/api/v1/sessions/$SESSION_ID/complete \
  -H "Authorization: Bearer $ADVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Discussed portfolio strategy"}'

# 7. Rate session (user)
curl -X PUT http://localhost:5000/api/v1/advisors/sessions/$SESSION_ID/rate \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "feedback": "Excellent!"}'

# 8. Process payment
PAYMENT_ID="pay123..."

curl -X POST http://localhost:5000/api/v1/payments/initiate \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "'$SESSION_ID'", "paymentMethod": "stripe"}'

# When payment gateway confirms:
curl -X POST http://localhost:5000/api/v1/payments/complete \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "'$PAYMENT_ID'", "transactionId": "pi_123"}'
```

---

## Error Responses Reference

### 401 Unauthorized
```json
{
  "error": "No token provided" // or "Invalid token"
}
```
**Solution:** Include valid JWT in Authorization header

### 403 Forbidden
```json
{
  "error": "Access denied",
  "requiredRole": "advisor",
  "userRole": "user"
}
```
**Solution:** User doesn't have required role

### 400 Bad Request
```json
{
  "error": "Missing required fields: advisorId, amount"
}
```
**Solution:** Add missing fields to request

### 404 Not Found
```json
{
  "error": "Advisor not found or not approved"
}
```
**Solution:** Check ID is correct and resource exists

### 500 Internal Server Error
```json
{
  "error": "Failed to create booking"
}
```
**Solution:** Check server logs for details

---

## Database Queries (PostgreSQL)

### Check user roles
```sql
SELECT id, email, name, role, "isApproved" FROM "User";
```

### List pending advisors
```sql
SELECT * FROM "User" WHERE role = 'advisor' AND "isApproved" = false;
```

### Approve advisor
```sql
UPDATE "User" SET "isApproved" = true WHERE id = 'advisor-id-here';
```

### View bookings
```sql
SELECT id, "clientId", "advisorId", status, amount, "proposedDate" 
FROM "BookingRequest" 
ORDER BY "createdAt" DESC;
```

### View completed sessions
```sql
SELECT id, "advisorId", "clientId", status, rating
FROM "AdvisorSession"
WHERE status = 'completed'
ORDER BY "startTime" DESC;
```

### Check payments
```sql
SELECT id, "amount", status, "transactionId", "createdAt"
FROM "Payment"
ORDER BY "createdAt" DESC;
```

### View notifications
```sql
SELECT id, "userId", title, message, "isRead", "createdAt"
FROM "Notification"
WHERE "userId" = 'user-id-here'
ORDER BY "createdAt" DESC;
```

---

## Middleware Order (Important!)

Routes are processed in this order:

```
1. Public routes (no auth)
    POST /auth/register
    POST /auth/login
    GET  /advisors

2. Auth required
    authMiddleware
    requireRole/requireFeature

3. Admin only
    authMiddleware
    requireRole('admin')
    endpoint handler
```

**Key:** You can't have `requireRole()` without `authMiddleware` first!

---

## Frontend Integration Points

### 1. Update AuthContext

```typescript
// frontend/src/contexts/AuthContext.tsx
const login = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  
  // NOW includes role!
  setUser({
    ...response.user,
    role: response.user.role,        //  NEW
    isApproved: response.user.isApproved //  NEW
  });
  
  setToken(response.accessToken);
};
```

### 2. Connect Booking Flow

```typescript
// Before: called local function
// Now: call backend endpoint
const bookAdvisor = async (advisorId, date, time, duration, amount) => {
  const response = await backendApi.post('/bookings', {
    advisorId,
    sessionType: 'video',
    proposedDate: date,
    proposedTime: time,
    duration,
    amount
  });
  
  return response; // Has booking ID, status, etc.
};
```

### 3. Display notifications from backend

```typescript
// frontend/src/hooks/useNotifications.ts
const fetchNotifications = async () => {
  const notifs = await backendApi.get('/notifications?unread=true');
  return notifs; // Real data from server
};
```

### 4. Wire up payments

```typescript
// When payment button clicked:
const initiatePayment = async (sessionId) => {
  const payment = await backendApi.post('/payments/initiate', {
    sessionId,
    paymentMethod: 'stripe'
  });
  
  // Use payment.id for Stripe integration
  return payment;
};
```

---

## Performance Tips

1. **Token Caching:** Store JWT in localStorage, send with every request
2. **Pagination:** Add `?limit=20&offset=0` to list endpoints
3. **Database Indexes:** Already set on commonly queried fields
4. **Connection Pooling:** Set `DATABASE_URL?connection_limit=5`

---

## Security Reminders

 **DO:**
- Always include auth token in protected endpoints
- Validate data on both frontend AND backend
- Use HTTPS in production
- Store JWT securely (httpOnly cookies if possible)
- Implement CSRF protection

 **DON'T:**
- Store passwords in plain text (bcrypt handles this)
- Trust client-side role checks (backend validates)
- Expose sensitive errors to users
- Log passwords or tokens
- Use default JWT secret in production

---

## Common Debugging Steps

**"Endpoint not found" (404)**
1. Check spelling of endpoint
2. Make sure route is registered in `/routes/index.ts`
3. Verify middleware is in correct order
4. Restart server after changes

**"Invalid token" (401)**
1. Token might have expired (get new one)
2. Check JWT_SECRET hasn't changed
3. Token might be malformed (copy full string)
4. Browser might have cached old token

**"Permission denied" (403)**
1. User doesn't have required role
2. Verify isApproved is true (for advisors)
3. Check feature key matches exactly
4. User might not be in relationship (e.g., not in session)

**Database connection errors**
1. Check DATABASE_URL is correct
2. Server might not be running
3. Connection limit might be reached
4. Run migrations if tables don't exist

---

## File Locations Reference

| Need | File |
|------|------|
| API endpoints | `backend/src/routes/index.ts` |
| Auth logic | `backend/src/modules/auth/` |
| RBAC rules | `backend/src/middleware/rbac.ts` |
| Database schema | `backend/prisma/schema.prisma` |
| API docs | `backend/API_DOCUMENTATION.md` |
| JWT tokens | `backend/src/utils/auth.ts` |
| Frontend auth | `frontend/src/contexts/AuthContext.tsx` |
| Feature gate | `frontend/src/app/components/FeatureGate.tsx` |

---

## Quick Test Script

```bash
#!/bin/bash
# save as test.sh and run with: bash test.sh

API="http://localhost:5000/api/v1"

# 1. Register user
USER=$(curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test'$(date +%s)'@test.com","name":"Test","password":"test123"}')

USER_TOKEN=$(echo $USER | jq -r '.accessToken')
echo "User Token: $USER_TOKEN"

# 2. Register advisor
ADV=$(curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"adv'$(date +%s)'@test.com","name":"Advisor","password":"test123","role":"advisor"}')

ADV_TOKEN=$(echo $ADV | jq -r '.accessToken')
ADV_ID=$(echo $ADV | jq -r '.user.id')
echo "Advisor Token: $ADV_TOKEN"
echo "Advisor ID: $ADV_ID"

# 3. Approve advisor manually in DB, then test advisors list
echo "Testing /advisors (should show advisor)..."
curl -s $API/advisors | jq .

# 4. Set availability
echo "Setting advisor availability..."
curl -s -X POST $API/advisors/availability \
  -H "Authorization: Bearer $ADV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dayOfWeek":1,"startTime":"09:00","endTime":"17:00"}' | jq .

# 5. Create booking
echo "Creating booking..."
BOOKING=$(curl -s -X POST $API/bookings \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"advisorId":"'$ADV_ID'","sessionType":"video","proposedDate":"2026-02-20","proposedTime":"14:00","duration":60,"amount":100}')

BOOKING_ID=$(echo $BOOKING | jq -r '.id')
echo "Booking ID: $BOOKING_ID"

echo " Basic flow working!"
```

---

## This Quarter's Goals

- [x] Phase 1: RBAC System 
- [x] Phase 2: Advisor Booking 
- [ ] Stripe/Razorpay integration (next)
- [ ] WebSocket real-time (next)
- [ ] Email notifications (next)
- [ ] Mobile optimization (later)
- [ ] Analytics dashboard (later)

---
