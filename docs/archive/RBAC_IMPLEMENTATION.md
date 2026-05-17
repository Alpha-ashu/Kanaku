#  Role-Based Access Control (RBAC) System Implementation

This document outlines the complete RBAC system implemented in the Expense Tracker application.

---

##  System Overview

The application implements a **three-tier role hierarchy**:

1. **Admin** - System administrator with full control
2. **Advisor** - Financial advisor service provider
3. **User** - Regular application user

---

##  Admin Role

### Access Requirements
- **Email Only**: `shake.job.atgmail.com`
- **Verification**: Email-based, hardcoded in system
- **Security**: Cannot be overridden by metadata or environment variables

### Admin Capabilities
 Access to **ALL features**  
 Access to **ALL new features before public release**  
 Feature control panel (Feature Readiness Management)  
 Can test and validate features in staging environment  
 Can approve features for public release  
 Can manage feature rollout by setting readiness status  
 Can view all users and statistics  
 Can manage advisor accounts  

### Admin Actions
- **Features**  Accounts, Transactions, Loans, Goals, Groups, Investments, Reports, Calendar, ToDoLists, Transfer, TaxCalculator, BookAdvisor
- **Admin Panel**  Feature Control Panel (new route: `admin-feature-panel`)
- **Feature Control**  Manage feature readiness (unreleased, beta, released, deprecated)

### Files
- Component: `frontend/src/app/components/AdminFeaturePanel.tsx`
- Route: `admin-feature-panel`

---

##  Advisor Role

### How to Get Advisor Role
Add email to environment variable:
```
VITE_ADVISOR_EMAILS=email1@example.com,email2@example.com
```

Or user metadata during registration:
```json
{
  "role": "advisor"
}
```

### Advisor Capabilities
 All standard user features EXCEPT `bookAdvisor`  
 Can set availability schedule  
 Can receive and manage booking requests  
 Can start chat/audio/video sessions  
 Can complete sessions  
 Can receive payments/settlements  
 Access to **Advisor Panel**  

### What Advisors CANNOT Do
 Cannot book other advisors (no self-booking)  
 Cannot access admin features  
 Cannot control feature flags  

### Advisor Actions
- **Setup Availability**  Set working hours and days
- **Manage Bookings**  Accept/reject booking requests from users
- **Session Management**  Start and complete sessions
- **Earnings**  View and track payments received
- **Session History**  View completed sessions and ratings

### Files
- Component: `frontend/src/app/components/AdvisorPanel.tsx`
- Route: `advisor-panel`
- Session Management: `frontend/src/lib/sessionManagement.ts`
- Payment Settlement: `frontend/src/lib/paymentSettlement.ts`

---

##  User Role

### Default Role
All users without admin/advisor designation receive the `user` role.

### User Capabilities
 All standard app features (Accounts, Transactions, Loans, Goals, etc.)  
 Can book financial advisors  
 Can pay for sessions  
 Can join sessions  
 Can view session history  
 Can rate advisors  
 Can view notifications  

### What Users CANNOT Do
 Cannot initiate chat/audio/video directly  
 Cannot start sessions (only advisors can)  
 Cannot access admin features  
 Cannot access advisor panel  

---

##  Feature Control System

### Feature Readiness Levels

#### 1. **Unreleased** 
- Visible to **Admin only**
- Used for feature testing and development
- Not visible to users or advisors
- Status: Development/Internal Testing

#### 2. **Beta** 
- Visible to **Admin + Advisors**
- Gathering feedback from advisors
- Testing with select group
- Status: Pre-Community Testing

#### 3. **Released** 
- Visible to **Everyone** (Admin, Advisors, Users)
- Production-ready
- Fully supported
- Status: Public

#### 4. **Deprecated** 
- Visible to **No one**
- Scheduled for removal
- Users previously using it warned
- Status: Decommissioning

### Managing Feature Readiness
Admin can change feature readiness from **Admin Feature Panel**:
1. Navigate to: `admin-feature-panel`
2. Select feature
3. Click status button (Unreleased/Beta/Released/Deprecated)
4. Change is immediate

### Example Features
- `bookAdvisor` - Released
- `todoLists` - Released
- `taxCalculator` - Released
- `advancedReports` - Beta (Advisors can test)
- `aiInsights` - Unreleased (Admin only)

---

##  Session Management Workflow

### Complete User  Advisor Session Flow

#### Step 1: User Books Advisor
```
User:
- Selects advisor
- Chooses available time slot
- Books session
- Pays amount

Notification:
- Advisor receives "booking_request" notification
```

#### Step 2: Advisor Accepts Booking
```
Advisor:
- Receives notification
- Reviews booking details
- Clicks "Accept" or "Decline"

If Accept:
- Status  "accepted"
- User receives "booking_accepted" notification

If Decline:
- Status  "rejected"
- User receives "booking_rejected" notification
```

#### Step 3: Ready Confirmation
```
When scheduled time arrives:

Advisor:
- Sees "Ready?" confirmation
- Clicks "Ready"

User:
- See "Ready?" confirmation (real-time)
- Clicks "Ready"

Requirement:
- BOTH must click Ready
- Only then session starts
```

#### Step 4: Session Active
```
Both parties:
- Chat/Audio/Video session begins
- Session duration tracked
- Real-time communication

Either party can end session
```

#### Step 5: Completion & Payment
```
When session ends:

System:
1. Mark session "completed"
2. Calculate session amount:
   - Base: Advisor hourly rate
   - Duration: Session minutes
   - Amount: (duration/60 minutes)  hourly rate

3. Process payment:
   - User: Charged full amount
   - Platform: 10% fee (default)
   - Advisor: 90% settlement

4. Send notifications:
   - User: "session_completed"
   - Advisor: "payment_received"
   - Both: Confirmation details

5. Create settlement record:
   - Settlement ID generated
   - Funds transferred to advisor
   - Transaction recorded
```

### Session States
```
pending  accepted  ready  active  completed
```

Only valid state transitions allowed.

---

##  Notification System

### Notification Triggers

| Event | Who Gets It | Trigger |
|-------|-----------|---------|
| `booking_request` | Advisor | User books session |
| `booking_accepted` | User | Advisor accepts booking |
| `booking_rejected` | User | Advisor declines booking |
| `session_ready` | Both | Ready confirmation needed |
| `session_started` | Both | Session begins |
| `session_completed` | Both | Session ends |
| `payment_settled` | User | Payment processed |
| `payment_received` | Advisor | Payment in their account |
| `role_changed` | User | User role updated |
| `feature_released` | All Users | New feature available |

### Notification Implementation

```javascript
// Create notification
const notification = createNotification(
  userId,
  'booking_request',
  { advisorId: 'adv-1', userName: 'John', date: '2026-02-15', time: '10:00 AM' },
  { bookingId: 123 }
);

// Check if critical (triggers alert sound)
const isCritical = shouldPlayAlert('booking_request'); // true
```

### Critical Notifications (Alert Sound/Badge)
- booking_request
- session_ready
- session_completed
- payment_received

---

##  Payment Settlement System

### Payment Flow

1. **Booking Created**
   - Status: `pending`

2. **Payment Processing**
   - Status: `processing`
   - Transaction created
   - Payment gateway called

3. **Payment Completed**
   - Status: `completed`
   - Transaction recorded
   - Settlement initiated

4. **Settlement to Advisor**
   - Platform fee: 10%
   - Advisor receives: 90%
   - Settlement record created
   - Advisor notified

### Payment States
```
pending  processing  completed  [optional: refunded]
```

### Fee Structure
```
Booking Amount: $100
Platform Fee (10%): $10
Advisor Settlement (90%): $90
```

### Refund Process
- Only possible after completed payment
- Advisor notified of refund
- Money returned to user
- Reason recorded

---

##  Implementation Files

### Core RBAC System
```
frontend/src/lib/rbac.ts
 ROLE_PERMISSIONS (all roles and capabilities)
 isAdminEmail() (strict admin validation)
 hasFeatureAccess() (check feature permission)
 canPerformAction() (check action permission)
 isFeatureVisible() (check readiness + role)
 Feature readiness definitions
```

### Hooks for Components
```
frontend/src/hooks/useRBAC.ts
 useFeatureAccess(feature)
 useActionPermission(action)
 useIsAdmin()
 useIsAdvisor()
 useIsUser()
 useRequireRole(role)
```

### Session Management
```
frontend/src/lib/sessionManagement.ts
 AdvisorBooking interface
 AdvisorSession interface
 SESSION_STATE_FLOW
 isValidStateTransition()
 Session utilities
```

### Notifications
```
frontend/src/lib/notificationSystem.ts
 Notification templates
 createNotification()
 getNotificationRecipients()
 shouldPlayAlert()
 Critical notification rules
```

### Payments
```
frontend/src/lib/paymentSettlement.ts
 Payment interface
 PLATFORM_FEE_PERCENTAGE (10%)
 calculatePlatformSplit()
 processPayment()
 settlePaymentToAdvisor()
 refundPayment()
```

### Auth Context (Updated)
```
frontend/src/contexts/AuthContext.tsx
 Strict admin email validation
 Role resolution with RBAC
 Email-based admin check
 Advisor email list support
```

### Components
```
frontend/src/app/components/AdminFeaturePanel.tsx
 Admin feature control interface

frontend/src/app/components/AdvisorPanel.tsx
 Advisor workspace and management

frontend/src/app/components/BookAdvisor.tsx
 User booking interface (updated)
```

---

##  Security Measures

### Admin Email Lock
- Admin role is **hardcoded** to `shake.job.atgmail.com`
- No environment variable override possible
- Email validation happens in `rbac.ts`
- Cannot be changed without code modification

### Role-Based Access Control
- All features check role before rendering
- Backend would validate permissions on API calls
- Middleware prevents unauthorized access
- Permission matrix enforced at component level

### Payment Security
- Transaction IDs required for refunds
- Settlement records immutable
- Audit trail for all payments
- Balance checks before processing

---

##  Environment Setup

### Required Environment Variables

```env
# Supabase
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_key

# Optional: Advisor emails
VITE_ADVISOR_EMAILS=advisor1@example.com,advisor2@example.com

# Optional: Admin backup list (NOT USED FOR PRIMARY ADMIN)
VITE_ADMIN_EMAILS=shake.job.atgmail.com
```

**Note**: The primary admin is **always** `shake.job.atgmail.com`. Environment variables cannot override this.

---

##  Future Enhancements

1. **Payment Gateway Integration**
   - Stripe/Razorpay integration
   - Real payment processing
   - Webhook handling

2. **Real-time Notifications**
   - WebSocket connection
   - Push notifications
   - Email notifications

3. **Advanced Reporting**
   - Session analytics
   - Payment reports
   - Advisor performance metrics

4. **Multi-currency Support**
   - Currency conversion
   - Regional payment methods
   - Tax compliance

5. **Advisor Ratings**
   - Star rating system
   - Review management
   - Advisor ranking

---

##  Testing Checklist

- [ ] Admin email `shake.job.atgmail.com` can access admin panel
- [ ] Other emails cannot access admin panel
- [ ] Advisors can manage availability and bookings
- [ ] Users can book advisors
- [ ] Notifications trigger correctly
- [ ] Payment processing works
- [ ] Feature readiness controls visibility
- [ ] Session state transitions valid
- [ ] Refunds process correctly
- [ ] Role-based feature visibility works

---

##  Support

For issues or questions about the RBAC system, refer to:
- Feature flags: `frontend/src/lib/rbac.ts`
- Hook usage: `frontend/src/hooks/useRBAC.ts`
- Component examples: `AdminFeaturePanel.tsx`, `AdvisorPanel.tsx`

