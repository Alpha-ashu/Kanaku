# Backend API Documentation - Complete

**Base URL:** `http://localhost:5000/api/v1`  
**Status:** Phase 1 & 2 Complete - RBAC + Advisor Booking System Implemented

---

## Table of Contents

1. [Authentication](#authentication)
2. [Role-Based Access Control](#rbac)
3. [Advisor Bookings](#bookings)
4. [Advisor Management](#advisors)
5. [Sessions](#sessions)
6. [Payments](#payments)
7. [Notifications](#notifications)
8. [Admin](#admin)
9. [Core Finance APIs](#core-finance-apis)
10. [Testing Instructions](#testing)

---

## Core Finance APIs

All endpoints below require `Authorization: Bearer <token>` and are served under `/api/v1`.

### Accounts

- `GET /accounts`
- `POST /accounts`
- `GET /accounts/{id}`
- `PUT /accounts/{id}`
- `DELETE /accounts/{id}`

### Transactions

- `GET /transactions`
- `POST /transactions`
- `GET /transactions/{id}`
- `PUT /transactions/{id}`
- `DELETE /transactions/{id}`
- `GET /transactions/account/{accountId}`

### Goals

- `GET /goals`
- `POST /goals`
- `GET /goals/{id}`
- `PUT /goals/{id}`
- `DELETE /goals/{id}`

### Loans

- `GET /loans`
- `POST /loans`
- `GET /loans/{id}`
- `PUT /loans/{id}`
- `DELETE /loans/{id}`
- `POST /loans/{id}/payment`

### Investments

- `GET /investments`
- `POST /investments`
- `PUT /investments/{id}`
- `DELETE /investments/{id}`

### Todos

- `GET /todos`
- `POST /todos`
- `PUT /todos/{id}`
- `DELETE /todos/{id}`

### Groups (Group Expense)

- `GET /groups`
- `POST /groups`
- `PUT /groups/{id}`
- `DELETE /groups/{id}`

### Settings

- `GET /settings`
- `PUT /settings`

---

## Authentication

### Register
**POST** `/auth/register`

**Public** - No auth required

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "securepassword123",
  "role": "user" // optional: "user" (default) or "advisor"
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "cln1234...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "isApproved": true
  }
}
```

### Login
**POST** `/auth/login`

**Public** - No auth required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "cln1234...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "isApproved": true
  }
}
```

### Get Profile
**GET** `/auth/profile`

**Auth:** Required (any role)

**Response (200):**
```json
{
  "id": "cln1234...",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "isApproved": true
}
```

---

## RBAC (Role-Based Access Control)

### Roles & Permissions

**User (default):**
- Can book advisors
- Can access their own data
- Can rate sessions
- Can view advisor profiles

**Advisor (request-based):**
- Can manage availability
- Can accept/reject bookings
- Can conduct sessions
- Can receive payments
- Must be approved by admin

**Admin:**
- Full access to all resources
- Can approve/reject advisors
- Can toggle feature flags
- Can view platform statistics

### How to Test Roles

1. **Create a User:**
```bash
POST /auth/register
{
  "email": "user@test.com",
  "name": "Test User",
  "password": "test123",
  "role": "user"
}
```

2. **Create an Advisor (Pending):**
```bash
POST /auth/register
{
  "email": "advisor@test.com",
  "name": "Test Advisor",
  "password": "test123",
  "role": "advisor"
}
```

3. **Approve Advisor (as Admin):**
```bash
POST /admin/users/{advisorId}/approve
Authorization: Bearer {admin_token}
```

4. **Access Advisor Features:**
```bash
POST /advisors/availability
Authorization: Bearer {advisor_token}
{
  "dayOfWeek": 1,
  "startTime": "09:00",
  "endTime": "17:00"
}
```

---

## Bookings

### Create Booking Request
**POST** `/bookings`

**Auth:** Required (User only - feature: bookAdvisor)

**Request Body:**
```json
{
  "advisorId": "adv123...",
  "sessionType": "video",
  "description": "Need financial advice",
  "proposedDate": "2026-02-15",
  "proposedTime": "14:30",
  "duration": 60,
  "amount": 100
}
```

**Response (201):**
```json
{
  "id": "bk123...",
  "clientId": "user123...",
  "advisorId": "adv123...",
  "sessionType": "video",
  "description": "Need financial advice",
  "proposedDate": "2026-02-15T14:30:00.000Z",
  "proposedTime": "14:30",
  "duration": 60,
  "amount": 100,
  "status": "pending",
  "createdAt": "2026-02-08T10:00:00.000Z",
  "updatedAt": "2026-02-08T10:00:00.000Z"
}
```

### Get My Bookings
**GET** `/bookings?role=user` or `/bookings?role=advisor`

**Auth:** Required

**Response (200):**
```json
[
  {
    "id": "bk123...",
    "clientId": "user123...",
    "advisorId": "adv123...",
    "status": "pending",
    "amount": 100,
    // ... other fields
  }
]
```

### Accept Booking (Advisor)
**PUT** `/bookings/{id}/accept`

**Auth:** Required (Advisor, approved)

**Response (200):**
```json
{
  "booking": {
    "id": "bk123...",
    "status": "accepted"
  },
  "session": {
    "id": "sess123...",
    "status": "scheduled",
    "startTime": "2026-02-15T14:30:00.000Z"
  }
}
```

### Reject Booking (Advisor)
**PUT** `/bookings/{id}/reject`

**Auth:** Required (Advisor, approved)

**Request Body:**
```json
{
  "reason": "Not available at this time"
}
```

**Response (200):**
```json
{
  "id": "bk123...",
  "status": "rejected",
  "rejectionReason": "Not available at this time"
}
```

### Cancel Booking (Client)
**PUT** `/bookings/{id}/cancel`

**Auth:** Required

**Response (200):**
```json
{
  "id": "bk123...",
  "status": "cancelled"
}
```

---

## Advisors

### List All Advisors
**GET** `/advisors`

**Public** - No auth required

**Response (200):**
```json
[
  {
    "id": "adv123...",
    "name": "Financial Expert",
    "email": "advisor@example.com",
    "advisorAvailability": [
      {
        "id": "av123...",
        "dayOfWeek": 1,
        "startTime": "09:00",
        "endTime": "17:00",
        "isActive": true
      }
    ]
  }
]
```

### Get Advisor Profile
**GET** `/advisors/{id}`

**Public** - No auth required

**Response (200):**
```json
{
  "id": "adv123...",
  "name": "Financial Expert",
  "email": "advisor@example.com",
  "role": "advisor",
  "isApproved": true,
  "averageRating": 4.8,
  "reviewCount": 25,
  "advisorAvailability": [...]
}
```

### Set Availability (Advisor)
**POST** `/advisors/availability`

**Auth:** Required (Advisor, approved)

**Request Body:**
```json
{
  "dayOfWeek": 1,
  "startTime": "09:00",
  "endTime": "17:00",
  "isActive": true
}
```

**Response (201):**
```json
{
  "id": "av123...",
  "advisorId": "adv123...",
  "dayOfWeek": 1,
  "startTime": "09:00",
  "endTime": "17:00",
  "isActive": true
}
```

### Get Advisor's Sessions
**GET** `/advisors/me/sessions`

**Auth:** Required (Advisor)

**Response (200):**
```json
[
  {
    "id": "sess123...",
    "sessionType": "video",
    "status": "completed",
    "startTime": "2026-02-15T14:30:00.000Z",
    "endTime": "2026-02-15T15:30:00.000Z",
    "rating": 5,
    "feedback": "Excellent advice!",
    "chatMessages": [...],
    "payment": {...}
  }
]
```

---

## Sessions

### Get Session Details
**GET** `/sessions/{id}`

**Auth:** Required (Advisor or Client in session)

**Response (200):**
```json
{
  "id": "sess123...",
  "bookingId": "bk123...",
  "advisorId": "adv123...",
  "clientId": "user123...",
  "sessionType": "video",
  "status": "scheduled",
  "startTime": "2026-02-15T14:30:00.000Z",
  "endTime": null,
  "rating": null,
  "feedback": null,
  "chatMessages": [],
  "payment": null
}
```

### Send Chat Message
**POST** `/sessions/{id}/messages`

**Auth:** Required (Advisor or Client in session)

**Request Body:**
```json
{
  "message": "Hello, I have a question about my finances"
}
```

**Response (201):**
```json
{
  "id": "msg123...",
  "sessionId": "sess123...",
  "senderId": "user123...",
  "message": "Hello, I have a question about my finances",
  "timestamp": "2026-02-15T14:30:00.000Z",
  "sender": {
    "id": "user123...",
    "name": "John Doe"
  }
}
```

### Get Session Messages
**GET** `/sessions/{id}/messages`

**Auth:** Required (Advisor or Client in session)

**Response (200):**
```json
[
  {
    "id": "msg123...",
    "message": "Hello, I have a question about my finances",
    "timestamp": "2026-02-15T14:30:00.000Z",
    "sender": { "id": "user123...", "name": "John Doe" }
  },
  {
    "id": "msg124...",
    "message": "I can help with that",
    "timestamp": "2026-02-15T14:31:00.000Z",
    "sender": { "id": "adv123...", "name": "Advisor" }
  }
]
```

### Start Session (Advisor)
**POST** `/sessions/{id}/start`

**Auth:** Required (Advisor)

**Response (200):**
```json
{
  "id": "sess123...",
  "status": "in-progress",
  "startTime": "2026-02-15T14:30:00.000Z"
}
```

### Complete Session (Advisor)
**POST** `/sessions/{id}/complete`

**Auth:** Required (Advisor)

**Request Body:**
```json
{
  "notes": "Discussed investment strategy and budget allocation"
}
```

**Response (200):**
```json
{
  "id": "sess123...",
  "status": "completed",
  "endTime": "2026-02-15T15:30:00.000Z",
  "notes": "Discussed investment strategy and budget allocation"
}
```

### Rate Session (Client)
**PUT** `/advisors/sessions/{id}/rate`

**Auth:** Required (Client)

**Request Body:**
```json
{
  "rating": 5,
  "feedback": "Excellent advice and very professional"
}
```

**Response (200):**
```json
{
  "id": "sess123...",
  "rating": 5,
  "feedback": "Excellent advice and very professional"
}
```

### Cancel Session
**POST** `/sessions/{id}/cancel`

**Auth:** Required (Advisor or Client)

**Request Body:**
```json
{
  "reason": "Emergency came up"
}
```

**Response (200):**
```json
{
  "id": "sess123...",
  "status": "cancelled"
}
```

---

## Payments

### Get Payments
**GET** `/payments?type=sent|received`

**Auth:** Required

**Response (200):**
```json
[
  {
    "id": "pay123...",
    "sessionId": "sess123...",
    "clientId": "user123...",
    "advisorId": "adv123...",
    "amount": 100,
    "currency": "USD",
    "status": "completed",
    "paymentMethod": "stripe",
    "transactionId": "pi_1234...",
    "createdAt": "2026-02-15T14:30:00.000Z"
  }
]
```

### Initiate Payment
**POST** `/payments/initiate`

**Auth:** Required (Client)

**Request Body:**
```json
{
  "sessionId": "sess123...",
  "paymentMethod": "stripe",
  "description": "Payment for video consultation"
}
```

**Response (201):**
```json
{
  "payment": {
    "id": "pay123...",
    "sessionId": "sess123...",
    "amount": 100,
    "currency": "USD",
    "status": "pending",
    "paymentMethod": "stripe"
  }
}
```

### Complete Payment
**POST** `/payments/complete`

**Auth:** Required or Webhook

**Request Body:**
```json
{
  "paymentId": "pay123...",
  "transactionId": "pi_1234567890"
}
```

**Response (200):**
```json
{
  "id": "pay123...",
  "status": "completed",
  "transactionId": "pi_1234567890"
}
```

### Refund Payment
**POST** `/payments/refund`

**Auth:** Required (Admin or Client)

**Request Body:**
```json
{
  "paymentId": "pay123...",
  "reason": "Session cancelled by advisor"
}
```

**Response (200):**
```json
{
  "id": "pay123...",
  "status": "refunded"
}
```

### Payment Webhook
**POST** `/payments/webhook`

**Public** - No auth required (use signature verification in production)

**Request Body:**
```json
{
  "type": "payment.success|payment.failure",
  "paymentId": "pay123...",
  "transactionId": "pi_1234567890",
  "status": "success|failed"
}
```

---

## Notifications

### Get Notifications
**GET** `/notifications?unread=true&limit=20`

**Auth:** Required

**Response (200):**
```json
[
  {
    "id": "notif123...",
    "userId": "user123...",
    "title": "New Booking Request",
    "message": "John Doe requested a video session",
    "type": "info",
    "category": "booking",
    "deepLink": "/bookings",
    "isRead": false,
    "createdAt": "2026-02-15T14:30:00.000Z"
  }
]
```

### Get Unread Count
**GET** `/notifications/unread/count`

**Auth:** Required

**Response (200):**
```json
{
  "unreadCount": 3
}
```

### Mark Notification as Read
**PUT** `/notifications/{id}/read`

**Auth:** Required

**Response (200):**
```json
{
  "id": "notif123...",
  "isRead": true,
  "readAt": "2026-02-15T14:31:00.000Z"
}
```

### Mark All as Read
**POST** `/notifications/mark-all-read`

**Auth:** Required

**Response (200):**
```json
{
  "message": "All notifications marked as read"
}
```

### Delete Notification
**DELETE** `/notifications/{id}`

**Auth:** Required

**Response (200):**
```json
{
  "message": "Notification deleted"
}
```

### Clear All Notifications
**DELETE** `/notifications`

**Auth:** Required

**Response (200):**
```json
{
  "message": "All notifications cleared"
}
```

---

## Admin

All admin routes require **Admin role**

### Get All Users
**GET** `/admin/users?role=advisor&approved=false`

**Auth:** Required (Admin)

**Response (200):**
```json
[
  {
    "id": "user123...",
    "email": "user@example.com",
    "name": "User Name",
    "role": "advisor",
    "isApproved": false,
    "createdAt": "2026-02-08T10:00:00.000Z"
  }
]
```

### Get Pending Advisors
**GET** `/admin/users/pending`

**Auth:** Required (Admin)

**Response (200):**
```json
[
  {
    "id": "adv123...",
    "email": "advisor@example.com",
    "name": "Advisor Name",
    "createdAt": "2026-02-08T10:00:00.000Z"
  }
]
```

### Approve Advisor
**POST** `/admin/users/{advisorId}/approve`

**Auth:** Required (Admin)

**Response (200):**
```json
{
  "message": "Advisor approved",
  "user": {
    "id": "adv123...",
    "email": "advisor@example.com",
    "name": "Advisor Name",
    "role": "advisor",
    "isApproved": true
  }
}
```

### Reject Advisor
**POST** `/admin/users/{advisorId}/reject`

**Auth:** Required (Admin)

**Request Body:**
```json
{
  "reason": "Incomplete profile information"
}
```

**Response (200):**
```json
{
  "message": "Advisor rejected",
  "user": {
    "id": "adv123...",
    "email": "advisor@example.com",
    "name": "Advisor Name",
    "role": "user",
    "isApproved": false
  }
}
```

### Get Platform Statistics
**GET** `/admin/stats`

**Auth:** Required (Admin)

**Response (200):**
```json
{
  "users": {
    "total": 150,
    "advisors": 15,
    "advisorRequests": 5
  },
  "bookings": {
    "total": 42,
    "completedSessions": 35,
    "pendingBookings": 2
  },
  "payments": {
    "total": 35,
    "totalRevenue": 3500,
    "currency": "USD"
  }
}
```

### Get Feature Flags
**GET** `/admin/features`

**Auth:** Required (Admin)

**Response (200):**
```json
{
  "advisorBooking": true,
  "payments": true,
  "groups": false,
  "investments": true,
  "loanTracking": true,
  "calendar": true,
  "reports": true,
  "realtime": false
}
```

### Toggle Feature Flag
**POST** `/admin/features/toggle`

**Auth:** Required (Admin)

**Request Body:**
```json
{
  "flag": "payments",
  "enabled": false
}
```

**Response (200):**
```json
{
  "message": "Feature flag 'payments' toggled to false",
  "flag": "payments",
  "enabled": false
}
```

### Get Users Report
**GET** `/admin/reports/users?startDate=2026-01-01&endDate=2026-02-08`

**Auth:** Required (Admin)

**Response (200):**
```json
{
  "total": 150,
  "users": [
    {
      "id": "user123...",
      "email": "user@example.com",
      "name": "User Name",
      "role": "user",
      "createdAt": "2026-02-08T10:00:00.000Z"
    }
  ],
  "generatedAt": "2026-02-08T15:00:00.000Z"
}
```

### Get Revenue Report
**GET** `/admin/reports/revenue?startDate=2026-01-01&endDate=2026-02-08`

**Auth:** Required (Admin)

**Response (200):**
```json
{
  "totalRevenue": 5000,
  "paymentCount": 50,
  "currency": "USD",
  "byAdvisor": {
    "Jane Smith": { "count": 15, "total": 1500 },
    "John Doe": { "count": 10, "total": 1000 }
  },
  "generatedAt": "2026-02-08T15:00:00.000Z"
}
```

---

## Testing Instructions

### 1. Set Up Test Data

```bash
# Create test user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "name": "Test User",
    "password": "testpass123",
    "role": "user"
  }'

# Create test advisor
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testadvisor@example.com",
    "name": "Test Advisor",
    "password": "testpass123",
    "role": "advisor"
  }'

# Create admin user (manually update in database)
UPDATE users SET role = 'admin', isApproved = true WHERE email = 'admin@example.com';
```

### 2. Test Advisor Booking Workflow

```bash
# 1. Approve advisor (as admin)
curl -X POST http://localhost:5000/api/v1/admin/users/{advisorId}/approve \
  -H "Authorization: Bearer {admin_token}"

# 2. Set advisor availability
curl -X POST http://localhost:5000/api/v1/advisors/availability \
  -H "Authorization: Bearer {advisor_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "dayOfWeek": 1,
    "startTime": "09:00",
    "endTime": "17:00"
  }'

# 3. Create booking request (as user)
curl -X POST http://localhost:5000/api/v1/bookings \
  -H "Authorization: Bearer {user_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "advisorId": "{advisorId}",
    "sessionType": "video",
    "proposedDate": "2026-02-20",
    "proposedTime": "14:00",
    "duration": 60,
    "amount": 100
  }'

# 4. Accept booking (as advisor)
curl -X PUT http://localhost:5000/api/v1/bookings/{bookingId}/accept \
  -H "Authorization: Bearer {advisor_token}"

# 5. Start session (as advisor)
curl -X POST http://localhost:5000/api/v1/sessions/{sessionId}/start \
  -H "Authorization: Bearer {advisor_token}"

# 6. Send messages
curl -X POST http://localhost:5000/api/v1/sessions/{sessionId}/messages \
  -H "Authorization: Bearer {user_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Thank you for the advice"
  }'

# 7. Complete session (as advisor)
curl -X POST http://localhost:5000/api/v1/sessions/{sessionId}/complete \
  -H "Authorization: Bearer {advisor_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Discussed financial planning"
  }'

# 8. Rate session (as user)
curl -X PUT http://localhost:5000/api/v1/advisors/sessions/{sessionId}/rate \
  -H "Authorization: Bearer {user_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "feedback": "Excellent session"
  }'

# 9. Initiate payment
curl -X POST http://localhost:5000/api/v1/payments/initiate \
  -H "Authorization: Bearer {user_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "{sessionId}",
    "paymentMethod": "stripe"
  }'

# 10. Complete payment (simulate webhook)
curl -X POST http://localhost:5000/api/v1/payments/complete \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "{paymentId}",
    "transactionId": "pi_test123"
  }'
```

### 3. Use Postman Collection

See `backend/POSTMAN_COLLECTION.json` for ready-to-use requests and scenarios.

---

## Important Notes

1. **JWT Tokens:** Always include `Authorization: Bearer {token}` header for protected routes
2. **Role Checks:** Backend validates roles on every request - client-side checks are for UX only
3. **Notifications:** Created automatically on key events (booking, session, payment)
4. **Feature Flags:** Currently hardcoded - database persistence to be added
5. **Payments:** Stripe/Razorpay integration pending - currently stub implementation
6. **WebSocket:** Real-time notifications pending - use polling for now

---

## Next Steps

- [ ] Integrate Stripe/Razorpay for real payments
- [ ] Implement WebSocket for real-time notifications
- [ ] Add persistent feature flags to database
- [ ] Create Postman/API documentation
- [ ] Add API rate limiting
- [ ] Implement audit logging
- [ ] Add email notifications
- [ ] Create mobile-specific endpoints
