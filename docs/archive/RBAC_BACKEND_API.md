#  RBAC Backend Integration Guide

Guide for backend developers to implement RBAC validation on API endpoints.

---

##  Overview

The RBAC system defines permissions in the frontend, but **backend must validate all requests** for security.

**Golden Rule**: Never trust client-side permission checks. Always verify on the backend.

---

##  Backend Architecture

```
Request  Auth Middleware  Role Check  Permission Check  Action
                (JWT)         (Parse)      (Validate)       (Execute)
```

### Authentication Flow

1. **JWT Token** contains user email and basic info
2. **Middleware** decodes JWT and extracts role
3. **Role Determination** happens in auth middleware (match email/metadata)
4. **Permission Check** validates user can perform action
5. **Action Execution** proceeds if all checks pass

---

##  Auth Middleware Implementation

### Node.js/Express Example

```typescript
// middleware/authMiddleware.ts

import jwt from 'jsonwebtoken';
import { parseUserRole } from './rbac';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'admin' | 'advisor' | 'user';
  };
}

export const authMiddleware = (req: AuthRequest, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Determine role based on email
    const role = parseUserRole(decoded.email, decoded.user_metadata);
    
    // Attach user to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Helper: Determine role from email
export const parseUserRole = (
  email: string,
  metadata?: any
): 'admin' | 'advisor' | 'user' => {
  // Admin check (hardcoded)
  if (email.toLowerCase() === 'shake.job.atgmail.com') {
    console.log(' Admin role assigned to:', email);
    return 'admin';
  }
  
  // Advisor check (from environment variable)
  const advisorEmails = (process.env.ADVISOR_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase());
  
  if (advisorEmails.includes(email.toLowerCase())) {
    return 'advisor';
  }
  
  // Check metadata
  if (metadata?.role === 'advisor') {
    return 'advisor';
  }
  
  // Default: user
  return 'user';
};
```

---

##  Permission Check Middleware

### Generic Permission Checker

```typescript
// middleware/permissionMiddleware.ts

export interface PermissionCheckOptions {
  feature?: string;
  action?: string;
  roles?: ('admin' | 'advisor' | 'user')[];
}

export const checkPermission = (options: PermissionCheckOptions) => {
  return (req: AuthRequest, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const { feature, action, roles } = options;
    
    // Role-based check
    if (roles && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Only ${roles.join(', ')} can access this`,
        required_role: roles,
        user_role: req.user.role
      });
    }
    
    // Feature-based check
    if (feature) {
      const hasAccess = hasFeatureAccess(req.user.role, feature);
      if (!hasAccess) {
        return res.status(403).json({
          error: `User does not have access to feature: ${feature}`,
          feature,
          user_role: req.user.role
        });
      }
    }
    
    // Action-based check
    if (action) {
      const canPerform = canPerformAction(req.user.role, action);
      if (!canPerform) {
        return res.status(403).json({
          error: `User cannot perform action: ${action}`,
          action,
          user_role: req.user.role
        });
      }
    }
    
    next();
  };
};

// RBAC functions (same as frontend)
export const hasFeatureAccess = (role: string, feature: string): boolean => {
  const ROLE_PERMISSIONS = {
    admin: {
      features: ['accounts', 'transactions', 'loans', 'goals', 'groups',
                 'investments', 'reports', 'calendar', 'todoLists', 'transfer',
                 'taxCalculator', 'bookAdvisor', 'adminPanel']
    },
    advisor: {
      features: ['accounts', 'transactions', 'loans', 'goals', 'groups',
                 'investments', 'reports', 'calendar', 'todoLists', 'transfer',
                 'taxCalculator', 'advisorPanel'] // NO bookAdvisor
    },
    user: {
      features: ['accounts', 'transactions', 'loans', 'goals', 'groups',
                 'investments', 'reports', 'calendar', 'todoLists', 'transfer',
                 'taxCalculator', 'bookAdvisor']
    }
  };
  
  return ROLE_PERMISSIONS[role]?.features.includes(feature) ?? false;
};

export const canPerformAction = (role: string, action: string): boolean => {
  const ROLE_ACTIONS = {
    admin: [
      'canTestNewFeatures', 'canApproveFeatures', 'canManageAdvisors',
      'canControlFeatures', 'canViewAllData', 'canManageSettings'
    ],
    advisor: [
      'canStartSessions', 'canSetAvailability', 'canReceiveBookings',
      'canManageSessions', 'canReceivePayments', 'canViewOwnData'
    ],
    user: [
      'canBookAdvisors', 'canPayForSessions', 'canJoinSessions',
      'canViewSessionHistory', 'canRateAdvisors', 'canViewOwnData'
    ]
  };
  
  return ROLE_ACTIONS[role]?.includes(action) ?? false;
};
```

---

##  Route Examples

### Admin-Only Endpoint

```typescript
// routes/admin.ts

import { authMiddleware } from '../middleware/authMiddleware';
import { checkPermission } from '../middleware/permissionMiddleware';

router.post(
  '/api/admin/feature-control',
  authMiddleware,
  checkPermission({ roles: ['admin'] }),
  async (req: AuthRequest, res) => {
    const { featureName, readinessStatus } = req.body;
    
    // Only admins reach here
    console.log(`Admin ${req.user.email} changed ${featureName} to ${readinessStatus}`);
    
    // Update feature status in database
    await updateFeatureReadiness(featureName, readinessStatus);
    
    res.json({ success: true, feature: featureName, status: readinessStatus });
  }
);
```

### Booking Endpoint (User Creates Booking)

```typescript
router.post(
  '/api/bookings',
  authMiddleware,
  checkPermission({ feature: 'bookAdvisor', action: 'canBookAdvisors' }),
  async (req: AuthRequest, res) => {
    const { advisorId, date, time, sessionType, amount } = req.body;
    
    // Only users with bookAdvisor access reach here
    // (Advisors are auto-rejected by permission check)
    
    console.log(`User ${req.user.email} booked advisor ${advisorId}`);
    
    const booking = await createBooking({
      userId: req.user.id,
      advisorId,
      date,
      time,
      sessionType,
      amount,
      status: 'pending'
    });
    
    // Trigger notification to advisor
    await notifyAdvisor(advisorId, 'booking_request', {
      userName: req.user.email,
      amount,
      date,
      time
    });
    
    res.json(booking);
  }
);
```

### Advisor Panel Endpoint

```typescript
router.get(
  '/api/advisor/availability',
  authMiddleware,
  checkPermission({ roles: ['advisor'] }),
  async (req: AuthRequest, res) => {
    // Only advisors reach here
    const availability = await getAdvisorAvailability(req.user.id);
    res.json(availability);
  }
);

router.post(
  '/api/advisor/availability',
  authMiddleware,
  checkPermission({ roles: ['advisor'], action: 'canSetAvailability' }),
  async (req: AuthRequest, res) => {
    const { schedule } = req.body; // { monday: true, tuesday: false, ... }
    
    await updateAdvisorAvailability(req.user.id, schedule);
    
    res.json({ success: true, schedule });
  }
);
```

### Payment Endpoint

```typescript
router.post(
  '/api/payments/process',
  authMiddleware,
  checkPermission({ action: 'canPayForSessions' }),
  async (req: AuthRequest, res) => {
    const { bookingId, amount, paymentMethod } = req.body;
    
    // Verify user owns this booking
    const booking = await getBooking(bookingId);
    if (booking.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot pay for others bookings' });
    }
    
    // Process payment
    const payment = await processPayment({
      userId: req.user.id,
      bookingId,
      amount,
      paymentMethod,
      status: 'processing',
      timestamp: new Date()
    });
    
    // Calculate settlement to advisor
    const platformFee = Math.floor(amount * 0.1); // 10%
    const advisorSettlement = amount - platformFee;
    
    // Create transaction records
    await createTransaction({
      userId: req.user.id,
      type: 'debit',
      amount,
      description: `Payment for session with advisor`,
      status: 'completed'
    });
    
    await createTransaction({
      userId: booking.advisorId,
      type: 'credit',
      amount: advisorSettlement,
      description: `Settlement from session with user`,
      platformFee,
      status: 'completed'
    });
    
    // Notify advisor
    await notifyAdvisor(booking.advisorId, 'payment_received', {
      amount: advisorSettlement,
      platformFee,
      date: new Date()
    });
    
    res.json({ success: true, payment });
  }
);
```

---

##  Session Management API

### Accept/Reject Booking (Advisor Only)

```typescript
router.post(
  '/api/bookings/:bookingId/accept',
  authMiddleware,
  checkPermission({ roles: ['advisor'] }),
  async (req: AuthRequest, res) => {
    const { bookingId } = req.params;
    
    // Verify advisor owns this booking
    const booking = await getBooking(bookingId);
    if (booking.advisorId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot accept others bookings' });
    }
    
    // Update booking status
    await updateBooking(bookingId, {
      status: 'accepted',
      acceptedAt: new Date()
    });
    
    // Notify user
    await notifyUser(booking.userId, 'booking_accepted', {
      advisorEmail: req.user.email,
      date: booking.date,
      time: booking.time
    });
    
    res.json({ success: true, status: 'accepted' });
  }
);

router.post(
  '/api/bookings/:bookingId/reject',
  authMiddleware,
  checkPermission({ roles: ['advisor'] }),
  async (req: AuthRequest, res) => {
    const { bookingId } = req.params;
    const { reason } = req.body;
    
    // Verify advisor owns this booking
    const booking = await getBooking(bookingId);
    if (booking.advisorId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot reject others bookings' });
    }
    
    // Update booking status
    await updateBooking(bookingId, {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason: reason
    });
    
    // Refund user if payment already processed
    if (booking.paymentStatus === 'completed') {
      await refundPayment(booking.paymentId, 'Booking rejected by advisor');
      
      notification.type = 'payment_refunded';
    } else {
      notification.type = 'booking_rejected';
    }
    
    // Notify user
    await notifyUser(booking.userId, notification.type, {
      advisorEmail: req.user.email,
      reason
    });
    
    res.json({ success: true, status: 'rejected' });
  }
);
```

### Start Session (Advisor Only)

```typescript
router.post(
  '/api/sessions/:bookingId/start',
  authMiddleware,
  checkPermission({ roles: ['advisor'], action: 'canStartSessions' }),
  async (req: AuthRequest, res) => {
    const { bookingId } = req.params;
    
    const booking = await getBooking(bookingId);
    
    // Verify advisor
    if (booking.advisorId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Verify booking is accepted
    if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'Booking not accepted' });
    }
    
    // Create session
    const session = await createSession({
      bookingId,
      status: 'active',
      startedAt: new Date(),
      advisorId: req.user.id,
      userId: booking.userId
    });
    
    // Notify user session started
    await notifyUser(booking.userId, 'session_started', {
      advisorEmail: req.user.email,
      sessionType: booking.sessionType
    });
    
    res.json({ success: true, sessionId: session.id, startedAt: session.startedAt });
  }
);
```

---

##  Data Validation Examples

### Validate Request User Owns Resource

```typescript
async function validateUserOwnsResource(
  userId: string,
  resourceId: string,
  resourceType: 'booking' | 'session' | 'payment'
): Promise<boolean> {
  const resource = await getResource(resourceType, resourceId);
  
  if (resourceType === 'booking') {
    return resource.userId === userId || resource.advisorId === userId;
  }
  
  if (resourceType === 'session') {
    return resource.userId === userId || resource.advisorId === userId;
  }
  
  if (resourceType === 'payment') {
    return resource.userId === userId;
  }
  
  return false;
}

// Usage
router.get(
  '/api/bookings/:bookingId',
  authMiddleware,
  async (req: AuthRequest, res) => {
    const isOwner = await validateUserOwnsResource(
      req.user.id,
      req.params.bookingId,
      'booking'
    );
    
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Cannot view others bookings' });
    }
    
    const booking = await getBooking(req.params.bookingId);
    res.json(booking);
  }
);
```

---

##  Logging & Audit Trail

```typescript
// utils/auditLog.ts

export interface AuditLog {
  timestamp: Date;
  userId: string;
  userEmail: string;
  userRole: 'admin' | 'advisor' | 'user';
  action: string;
  resource: string;
  resourceId: string;
  success: boolean;
  details?: any;
}

export async function logAuditAction(
  req: AuthRequest,
  action: string,
  resource: string,
  resourceId: string,
  success: boolean,
  details?: any
) {
  const auditLog: AuditLog = {
    timestamp: new Date(),
    userId: req.user.id,
    userEmail: req.user.email,
    userRole: req.user.role,
    action,
    resource,
    resourceId,
    success,
    details
  };
  
  // Save to database or logging service
  await saveAuditLog(auditLog);
  
  // Log to console/file
  console.log(`[AUDIT] ${action} ${resource}/${resourceId} by ${req.user.email}`);
}

// Usage
router.post(
  '/api/admin/feature-control',
  authMiddleware,
  checkPermission({ roles: ['admin'] }),
  async (req: AuthRequest, res) => {
    const { featureName, readinessStatus } = req.body;
    
    try {
      await updateFeatureReadiness(featureName, readinessStatus);
      
      // Log successful action
      await logAuditAction(
        req,
        'UPDATE_FEATURE_STATUS',
        'feature',
        featureName,
        true,
        { newStatus: readinessStatus }
      );
      
      res.json({ success: true });
    } catch (error) {
      // Log failed action
      await logAuditAction(
        req,
        'UPDATE_FEATURE_STATUS',
        'feature',
        featureName,
        false,
        { error: error.message }
      );
      
      res.status(500).json({ error: 'Failed to update feature' });
    }
  }
);
```

---

##  API Endpoint Checklist

### Admin Endpoints
- [ ] POST `/api/admin/feature-control` - Change feature status
- [ ] GET `/api/admin/users` - List all users
- [ ] GET `/api/admin/advisors` - List all advisors
- [ ] POST `/api/admin/advisors/:id/toggle` - Enable/disable advisor
- [ ] GET `/api/admin/bookings` - View all bookings
- [ ] GET `/api/admin/payments` - View all payments

### Advisor Endpoints
- [ ] POST `/api/advisor/availability` - Set availability
- [ ] GET `/api/advisor/availability` - Get availability
- [ ] GET `/api/advisor/bookings` - Get pending bookings
- [ ] POST `/api/advisor/bookings/:id/accept` - Accept booking
- [ ] POST `/api/advisor/bookings/:id/reject` - Reject booking
- [ ] POST `/api/advisor/sessions/:id/start` - Start session
- [ ] POST `/api/advisor/sessions/:id/complete` - End session
- [ ] GET `/api/advisor/earnings` - View earnings

### User Endpoints
- [ ] POST `/api/bookings` - Create booking
- [ ] GET `/api/bookings` - Get user's bookings
- [ ] POST `/api/payments/process` - Process payment
- [ ] GET `/api/payments` - Get user's payments
- [ ] GET `/api/sessions` - Get user's sessions
- [ ] POST `/api/sessions/:id/ready` - Confirm ready for session
- [ ] POST `/api/sessions/:id/rate` - Rate advisor

---

##  Security Considerations

### Never Trust Client-Side Permissions
```typescript
//  WRONG - Never do this
const token = req.headers.authorization;
if (token.includes('admin')) {  // Client could forge token
  // Grant admin access
}

//  CORRECT - Always verify
const decoded = jwt.verify(token, SECRET);
if (decoded.email === 'shake.job.atgmail.com') {
  // Grant admin access
}
```

### Always Validate Request Data
```typescript
//  WRONG
router.post('/api/payment', (req) => {
  const { amount } = req.body;
  processPayment(amount); // What if amount is $1,000,000?
});

//  CORRECT
router.post('/api/payment', (req) => {
  const booking = await getBooking(req.body.bookingId);
  const { amount } = booking; // Use stored amount, not from client
  processPayment(amount);
});
```

### Prevent Privilege Escalation
```typescript
//  WRONG - User could change their role
app.post('/api/user/profile', (req) => {
  updateUser(req.body); // Includes role
});

//  CORRECT - Role comes from token only
app.post('/api/user/profile', (req) => {
  const { name, email, phone } = req.body;
  // role is NOT updated from request body
  updateUser({ name, email, phone, role: req.user.role });
});
```

---

##  Related Files

- Frontend RBAC: [rbac.ts](../frontend/src/lib/rbac.ts)
- Frontend Hooks: [useRBAC.ts](../frontend/src/hooks/useRBAC.ts)
- Session Management: [sessionManagement.ts](../frontend/src/lib/sessionManagement.ts)
- Payments: [paymentSettlement.ts](../frontend/src/lib/paymentSettlement.ts)

