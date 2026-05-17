#  RBAC Testing & Deployment Guide

Complete guide for testing, validating, and deploying the role-based access control system.

---

##  Testing Scenarios

### Scenario 1: Admin Login

**Setup**:
1. Login with email: `shake.job.atgmail.com`
2. Password: Your test password

**Expected Results**:
-  User role in `AuthContext` is `admin`
-  Can see "Admin Panel" in navigation
-  Can navigate to `/admin-feature-panel`
-  Can see all features in the feature control grid
-  Can change feature readiness (Unreleased  Beta  Released  Deprecated)
-  Console shows: " Admin role assigned to: shake.job.atgmail.com"

**Test Actions**:
```javascript
// In browser console
// Check auth context
const auth = window.__APP_CONTEXT__?.auth;
console.log('Current role:', auth.user.role); // Should be 'admin'

// Check feature access
const { hasFeatureAccess } = require('./lib/rbac');
console.log(hasFeatureAccess('admin', 'bookAdvisor')); // true
console.log(hasFeatureAccess('admin', 'adminPanel')); // true
```

### Scenario 2: Advisor Login

**Setup**:
1. Add email to `.env.local`:
   ```env
   VITE_ADVISOR_EMAILS=advisor@example.com
   ```
2. Restart dev server
3. Login with: `advisor@example.com`

**Expected Results**:
-  User role is `advisor`
-  Can see "Advisor Panel" in navigation
-  CAN see `bookAdvisor` feature in feature list
-  CANNOT see "Admin Panel" option
-  Can navigate to `/advisor-panel`
-  Can set availability schedule
-  Can accept/reject bookings
-  Can start sessions

**Test Actions**:
```javascript
const auth = window.__APP_CONTEXT__?.auth;
console.log('Current role:', auth.user.role); // Should be 'advisor'

// Advisors should NOT have bookAdvisor
const { hasFeatureAccess } = require('./lib/rbac');
console.log(hasFeatureAccess('advisor', 'bookAdvisor')); // false
console.log(hasFeatureAccess('advisor', 'advisorPanel')); // true
console.log(hasFeatureAccess('advisor', 'adminPanel')); // false
```

### Scenario 3: Regular User Login

**Setup**:
1. Login with any email NOT in admin or advisor lists
2. Example: `user@example.com`

**Expected Results**:
-  User role is `user`
-  Can see "Book Advisor" in navigation
-  CAN access `bookAdvisor` feature
-  CANNOT see "Admin Panel" or "Advisor Panel"
-  Can see all standard features
-  Can book advisors
-  Can pay for sessions

**Test Actions**:
```javascript
const auth = window.__APP_CONTEXT__?.auth;
console.log('Current role:', auth.user.role); // Should be 'user'

// Users should have bookAdvisor
const { hasFeatureAccess } = require('./lib/rbac');
console.log(hasFeatureAccess('user', 'bookAdvisor')); // true
console.log(hasFeatureAccess('user', 'advisorPanel')); // false
console.log(hasFeatureAccess('user', 'adminPanel')); // false
```

---

##  Feature Access Testing Matrix

Run this test to validate all role-feature combinations:

```javascript
// Test script - run in browser console
const { hasFeatureAccess } = require('./lib/rbac');

const features = [
  'accounts', 'transactions', 'loans', 'goals', 'groups', 
  'investments', 'reports', 'calendar', 'todoLists', 'transfer',
  'taxCalculator', 'bookAdvisor', 'adminPanel', 'advisorPanel'
];

const roles = ['admin', 'advisor', 'user'];

console.table(
  features.map(feature => ({
    feature,
    admin: hasFeatureAccess('admin', feature),
    advisor: hasFeatureAccess('advisor', feature),
    user: hasFeatureAccess('user', feature)
  }))
);
```

**Expected Output**:
| feature | admin | advisor | user |
|---------|-------|---------|------|
| accounts | true | true | true |
| transactions | true | true | true |
| loans | true | true | true |
| goals | true | true | true |
| groups | true | true | true |
| investments | true | true | true |
| reports | true | true | true |
| calendar | true | true | true |
| todoLists | true | true | true |
| transfer | true | true | true |
| taxCalculator | true | true | true |
| bookAdvisor | true | **false** | true |
| adminPanel | true | false | false |
| advisorPanel | false | true | false |

---

##  Admin Email Lock Testing

### Test 1: Admin Email Must Match Exactly

```javascript
const { isAdminEmail } = require('./lib/rbac');

// Should be true
console.log(isAdminEmail('shake.job.atgmail.com')); // true

// Should be false - wrong email
console.log(isAdminEmail('admin@example.com')); // false
console.log(isAdminEmail('shake.job@outlook.com')); // false

// Should be false - case doesn't matter for email
console.log(isAdminEmail('SHAKE.JOB.ATGMAIL.COM')); // true (emails are case-insensitive)
```

### Test 2: User Metadata Cannot Override Admin

```javascript
// Even with metadata role='admin', should be 'user'
const user = {
  id: '123',
  email: 'hacker@example.com',
  user_metadata: { role: 'admin' }  // This should be IGNORED
};

const { parseUserRole } = require('./contexts/AuthContext');
const role = parseUserRole(user);
console.log(role); // Should be 'user', NOT 'admin'
```

---

##  Admin Feature Panel Testing

### Test: Feature Readiness States

**Access Admin Panel**:
1. Login as `shake.job.atgmail.com`
2. Navigate: Menu  Admin Panel
3. Verify you see feature control grid

**Change Feature Status**:

#### Unreleased  Beta
1. Click "Unreleased" button for any feature
2. Confirm status changes to "Beta"
3. Verify advisor can now see this feature
4. Verify regular users cannot

#### Beta  Released
1. Click "Beta" button for any feature
2. Confirm status changes to "Released"
3. Verify all users can see this feature
4. Verify feature appears in navigation

#### Released  Deprecated
1. Click "Released" button for any feature
2. Confirm status changes to "Deprecated"
3. Verify no users can see this feature
4. Verify feature disappears from navigation

**Test with Different Roles**:
```javascript
// As Admin - can change
console.log(canChangeFeatureStatus('admin', 'bookAdvisor')); // true

// As Advisor - cannot change
console.log(canChangeFeatureStatus('advisor', 'bookAdvisor')); // false

// As User - cannot change
console.log(canChangeFeatureStatus('user', 'bookAdvisor')); // false
```

---

##  Advisor Panel Testing

### Test: Advisor Panel Access

1. Login as advisor
2. Navigate to Advisor Panel
3. Verify you see:
   -  Pending Bookings count
   -  Confirmed Sessions count
   -  Monthly Earnings display
   -  Availability Schedule (7 days)
   -  Booking Requests section
   -  Confirmed Sessions section

### Test: Availability Management

**Set Availability**:
1. In "Availability Schedule" section
2. Click day toggles (Monday-Sunday)
3. Verify toggle state changes
4.  Should save to state (or database in production)

**Expected Toggle States**:
- Green/enabled = Available that day
- Gray/disabled = Not available that day

### Test: Booking Management

**Accept Booking**:
1. Click "Accept" button on pending booking
2.  Status changes to "Confirmed Sessions"
3.  Toast notification appears
4.  Button changes to "Start Session"

**Reject Booking**:
1. Click "Decline" on pending booking
2.  Booking disappears from list
3.  Toast notification shows rejection
4.  User is notified

**Start Session**:
1. Click "Start Session" on confirmed booking
2.  Session begins
3.  Both parties see notification
4.  Session mode activated

---

##  Notification Testing

### Test: Notification Creation

```javascript
const { createNotification } = require('./lib/notificationSystem');

const notification = createNotification(
  'user-123',
  'booking_request',
  { advisorName: 'John', amount: 2000, date: '2026-02-20' },
  { bookingId: 'book-456' }
);

console.log(notification);
// Should show:
// {
//   id: 'UUID',
//   userId: 'user-123',
//   type: 'booking_request',
//   title: 'Booking Request Received',
//   message: 'John has requested a booking...',
//   icon: '',
//   createdAt: timestamp,
//   read: false,
//   metadata: { bookingId: 'book-456' }
// }
```

### Test: Notification Recipients

```javascript
const { getNotificationRecipients } = require('./lib/notificationSystem');

// Booking request -> goes to advisor
let recipients = getNotificationRecipients('booking_request', 'user-123', 'advisor-456');
console.log(recipients); // ['advisor-456']

// Session completed -> goes to both
recipients = getNotificationRecipients('session_completed', 'user-123', 'advisor-456');
console.log(recipients); // ['user-123', 'advisor-456']

// Payment received -> goes to advisor
recipients = getNotificationRecipients('payment_received', 'user-123', 'advisor-456');
console.log(recipients); // ['advisor-456']
```

### Test: Critical Notifications

```javascript
const { shouldPlayAlert } = require('./lib/notificationSystem');

// Critical notifications
console.log(shouldPlayAlert('booking_request')); // true - plays sound
console.log(shouldPlayAlert('session_ready')); // true - plays sound
console.log(shouldPlayAlert('payment_received')); // true - plays sound

// Non-critical
console.log(shouldPlayAlert('feature_released')); // false - no sound
```

---

##  Payment Settlement Testing

### Test: Payment Calculation

```javascript
const { calculatePlatformSplit } = require('./lib/paymentSettlement');

const amount = 1000; // 1000 INR
const { platformFee, advisorSettlement } = calculatePlatformSplit(amount);

console.log({
  totalAmount: amount,        // 1000
  platformFee,                // 100 (10%)
  advisorSettlement          // 900 (90%)
});

// Verify
console.log(platformFee === amount * 0.1); // true
console.log(advisorSettlement === amount * 0.9); // true
```

### Test: Payment Status Flow

```javascript
const { isValidPaymentTransition } = require('./lib/paymentSettlement');

// Valid transitions
console.log(isValidPaymentTransition('pending', 'processing')); // true
console.log(isValidPaymentTransition('processing', 'completed')); // true
console.log(isValidPaymentTransition('completed', 'refunded')); // true

// Invalid transitions
console.log(isValidPaymentTransition('completed', 'pending')); // false
console.log(isValidPaymentTransition('pending', 'completed')); // false - must go through processing
```

---

##  Session State Machine Testing

### Test: Valid Transitions

```javascript
const { isValidStateTransition } = require('./lib/sessionManagement');

// Valid progression
console.log(isValidStateTransition('pending', 'accepted')); // true
console.log(isValidStateTransition('accepted', 'ready')); // true
console.log(isValidStateTransition('ready', 'active')); // true
console.log(isValidStateTransition('active', 'completed')); // true

// Invalid progressions
console.log(isValidStateTransition('pending', 'active')); // false - skip accepted
console.log(isValidStateTransition('completed', 'active')); // false - no backwards
console.log(isValidStateTransition('cancelled', 'completed')); // false - no revival

// Cancellation (allowed from any state)
console.log(isValidStateTransition('pending', 'cancelled')); // true
console.log(isValidStateTransition('active', 'cancelled')); // true
```

---

##  Pre-Deployment Checklist

- [ ] **Admin Email Lock**
  - [ ] Only `shake.job.atgmail.com` can be admin
  - [ ] Test with non-admin emails - verify access denied
  - [ ] Verify console log shows admin role assignment

- [ ] **Role Separation**
  - [ ] Advisors cannot see bookAdvisor feature
  - [ ] Users cannot access advisor panel
  - [ ] Admins can see all features and both panels

- [ ] **Feature Control**
  - [ ] Can change feature readiness in admin panel
  - [ ] Feature visibility updates immediately
  - [ ] Different roles see different features

- [ ] **Notifications**
  - [ ] Correct recipients get notifications
  - [ ] Critical notifications trigger alerts
  - [ ] Notification templates render correctly

- [ ] **Payments**
  - [ ] Platform fee calculation correct (10%)
  - [ ] Payment state transitions valid
  - [ ] Refunds can only happen after completion

- [ ] **Sessions**
  - [ ] State transitions follow valid progression
  - [ ] Cancellation works from any state
  - [ ] Cannot go backwards in states

- [ ] **Component Integration**
  - [ ] useFeatureAccess() hook works
  - [ ] useIsAdmin() hook works
  - [ ] useRequireRole() hook works
  - [ ] All hooks return correct values

- [ ] **Navigation**
  - [ ] Admin panel link only shows for admins
  - [ ] Advisor panel link only shows for advisors
  - [ ] Feature links respect readiness status
  - [ ] Book advisor link hidden from advisors

- [ ] **Error Handling**
  - [ ] Non-admin gets error accessing admin panel
  - [ ] Non-advisor gets error accessing advisor panel
  - [ ] Feature access denials show gracefully
  - [ ] No console errors

- [ ] **Security**
  - [ ] Authorization checked on page load
  - [ ] Unauthorized users redirected
  - [ ] Role cannot be manually changed in localStorage
  - [ ] Payment amounts verified before processing

---

##  Troubleshooting

### Issue: Admin Panel Shows Error "Access Denied"

**Solution**:
1. Verify email is exactly: `shake.job.atgmail.com`
2. Check AuthContext console log: Should show " Admin role assigned to:"
3. Clear localStorage and re-login
4. Check JWT token includes correct email in `email` field

### Issue: Advisor Cannot See bookAdvisor Feature

**Expected Behavior**  - This is correct! Advisors should NOT see bookAdvisor.

If they DO see it, check:
1. Role is actually 'advisor' (not 'user' or 'admin')
2. Feature readiness is not 'released' for everyone
3. ROLE_PERMISSIONS in rbac.ts excludes bookAdvisor for advisor

### Issue: Features Not Updating After Admin Changes Status

**Solution**:
1. Admin panel changes are immediate in mock
2. In production, wait for sync from backend
3. Try page refresh if needed
4. Check Dexie database updated (open DevTools  Application  IndexedDB)

### Issue: Notifications Not Showing

**Solution**:
1. Check notification list in component
2. Verify `createNotification()` was called
3. Check database for notification records
4. Verify recipient matches current user ID

### Issue: Payment Settlement Wrong Amount

**Solution**:
1. Verify PLATFORM_FEE_PERCENTAGE = 10
2. Check calculation: `advisor = amount * 0.9`
3. Verify session duration in minutes
4. Verify hourly rate is set correctly

---

##  Performance Metrics

Monitor these during/after deployment:

```javascript
// Measure role checking performance
console.time('roleCheck');
const hasAccess = hasFeatureAccess('admin', 'bookAdvisor');
console.timeEnd('roleCheck'); // Should be < 1ms

// Measure hook performance
console.time('hook');
const hook = useFeatureAccess('bookAdvisor');
console.timeEnd('hook'); // Should be < 5ms
```

**Target Performance**:
- Role checks: < 1ms
- Hook renders: < 5ms
- Feature readiness updates: Immediate
- Payment calculations: < 10ms

---

##  Sign-off

Once all tests pass, system is ready for production deployment.

**Test Date**: ____________________
**Tested By**: ____________________
**Approved By**: ____________________

