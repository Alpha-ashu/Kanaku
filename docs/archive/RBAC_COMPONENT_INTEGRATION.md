#  RBAC Integration Guide for Components

Quick reference for integrating role-based access control in React components.

---

##  Quick Start

### 1. Import the Hook
```tsx
import { useFeatureAccess } from '@/hooks/useRBAC';
```

### 2. Check Feature Access
```tsx
const MyComponent = () => {
  const hasAccess = useFeatureAccess('bookAdvisor');
  
  if (!hasAccess) return <div>Feature not available</div>;
  
  return <div>Book Advisor Content</div>;
};
```

---

##  Common Use Cases

### Case 1: Show/Hide Feature Based on Role

```tsx
import { useIsAdmin, useIsAdvisor } from '@/hooks/useRBAC';

export const DashboardHeader = () => {
  const isAdmin = useIsAdmin();
  const isAdvisor = useIsAdvisor();
  
  return (
    <div className="header">
      <h1>Dashboard</h1>
      
      {isAdmin && <button>Admin Settings</button>}
      {isAdvisor && <button>Advisor Panel</button>}
    </div>
  );
};
```

### Case 2: Conditional Content Rendering

```tsx
import { useFeatureAccess } from '@/hooks/useRBAC';

export const SidebarMenu = () => {
  const hasTransactions = useFeatureAccess('transactions');
  const hasReports = useFeatureAccess('reports');
  const hasTaxCalculator = useFeatureAccess('taxCalculator');
  
  return (
    <nav className="sidebar">
      {hasTransactions && <a href="/transactions">Transactions</a>}
      {hasReports && <a href="/reports">Reports</a>}
      {hasTaxCalculator && <a href="/tax">Tax Calculator</a>}
    </nav>
  );
};
```

### Case 3: Action Permission Check

```tsx
import { useActionPermission } from '@/hooks/useRBAC';

export const PaymentButton = () => {
  const canPay = useActionPermission('canPayForSessions');
  
  const handlePayment = () => {
    if (!canPay) {
      alert('You cannot perform this action');
      return;
    }
    // Process payment
  };
  
  return (
    <button 
      onClick={handlePayment}
      disabled={!canPay}
    >
      Pay Now
    </button>
  );
};
```

### Case 4: Protect Component by Role

```tsx
import { useRequireRole } from '@/hooks/useRBAC';

export const AdminOnlyComponent = () => {
  const isAuthorized = useRequireRole('admin');
  
  if (!isAuthorized) {
    return <div className="error">Access Denied</div>;
  }
  
  return (
    <div className="admin-panel">
      {/* Admin content */}
    </div>
  );
};
```

### Case 5: Multiple Feature Check

```tsx
import { useMultipleFeatureAccess } from '@/hooks/useRBAC';

export const AdvancedAnalyticsPanel = () => {
  const requiredFeatures = ['reports', 'investments', 'calendar'];
  const hasAllFeatures = useMultipleFeatureAccess(requiredFeatures);
  
  if (!hasAllFeatures) {
    return <div>Some features are not available</div>;
  }
  
  return <div className="analytics">Analytics Dashboard</div>;
};
```

---

##  Available Hooks

### `useFeatureAccess(featureName: string): boolean`
Check if user has access to a specific feature.

```tsx
const hasBookAdvisor = useFeatureAccess('bookAdvisor');
```

**Returns**: `true` if user's role has permission and feature is released/beta (for advisors)

---

### `useActionPermission(action: string): boolean`
Check if user can perform a specific action.

```tsx
const canStartSession = useActionPermission('canStartSessions');
```

**Returns**: `true` if user's role can perform the action

---

### `useIsAdmin(): boolean`
Check if current user is admin.

```tsx
const isAdmin = useIsAdmin();
```

**Returns**: `true` if role === 'admin'

---

### `useIsAdvisor(): boolean`
Check if current user is advisor.

```tsx
const isAdvisor = useIsAdvisor();
```

**Returns**: `true` if role === 'advisor'

---

### `useIsUser(): boolean`
Check if current user is regular user.

```tsx
const isUser = useIsUser();
```

**Returns**: `true` if role === 'user'

---

### `useMultipleFeatureAccess(features: string[]): boolean`
Check if user has access to ALL specified features.

```tsx
const hasEverything = useMultipleFeatureAccess(['accounts', 'transactions', 'reports']);
```

**Returns**: `true` if user has permission for ALL features

---

### `useRequireRole(role: string | string[]): boolean`
Check if user has one of the required roles.

```tsx
// Single role
const isAdmin = useRequireRole('admin');

// Multiple roles (OR)
const isAdminOrAdvisor = useRequireRole(['admin', 'advisor']);
```

**Returns**: `true` if user's role matches

---

##  Using RBAC in Navigation

### Update Navigation to Show Role-Based Items

```tsx
import { useIsAdmin, useIsAdvisor, useFeatureAccess } from '@/hooks/useRBAC';

export const Navigation = ({ setCurrentPage }) => {
  const isAdmin = useIsAdmin();
  const isAdvisor = useIsAdvisor();
  const hasBookAdvisor = useFeatureAccess('bookAdvisor');
  
  return (
    <nav>
      {/* Always available */}
      <button onClick={() => setCurrentPage('dashboard')}>Dashboard</button>
      
      {/* Based on features */}
      {hasBookAdvisor && (
        <button onClick={() => setCurrentPage('bookAdvisor')}>Book Advisor</button>
      )}
      
      {/* Admin only */}
      {isAdmin && (
        <button onClick={() => setCurrentPage('admin-feature-panel')}>
          Admin Panel
        </button>
      )}
      
      {/* Advisor only */}
      {isAdvisor && (
        <button onClick={() => setCurrentPage('advisor-panel')}>
          Advisor Panel
        </button>
      )}
    </nav>
  );
};
```

---

##  Direct Function Usage (Without Hooks)

If you need to check permissions without React hooks:

```tsx
import { hasFeatureAccess, canPerformAction } from '@/lib/rbac';
import { useAuth } from '@/contexts/AuthContext';

export const MyComponent = () => {
  const { user } = useAuth();
  
  // Direct function call
  if (!hasFeatureAccess(user.role, 'bookAdvisor')) {
    return <div>Not available</div>;
  }
  
  return <div>Available</div>;
};
```

---

##  Component Examples

### Example 1: Conditional Button

```tsx
import { useActionPermission } from '@/hooks/useRBAC';

export const BookSessionButton = ({ advisorId }) => {
  const canBook = useActionPermission('canBookAdvisors');
  
  return (
    <button 
      disabled={!canBook}
      className={canBook ? 'btn-primary' : 'btn-disabled'}
      onClick={() => canBook && bookSession(advisorId)}
    >
      {canBook ? 'Book Session' : 'Not Available'}
    </button>
  );
};
```

### Example 2: Feature Section

```tsx
import { useFeatureAccess } from '@/hooks/useRBAC';

export const AdvancedFeatures = () => {
  const hasTaxCalculator = useFeatureAccess('taxCalculator');
  const hasAdvancedReports = useFeatureAccess('advancedReports');
  
  if (!hasTaxCalculator && !hasAdvancedReports) {
    return null; // Don't show section if no features available
  }
  
  return (
    <section className="advanced">
      {hasTaxCalculator && <TaxCalculator />}
      {hasAdvancedReports && <AdvancedReports />}
    </section>
  );
};
```

### Example 3: Role-Aware Dashboard

```tsx
import { useIsAdmin, useIsAdvisor, useIsUser } from '@/hooks/useRBAC';

export const Dashboard = () => {
  const isAdmin = useIsAdmin();
  const isAdvisor = useIsAdvisor();
  const isUser = useIsUser();
  
  return (
    <div className="dashboard">
      <h1>Welcome</h1>
      
      {isAdmin && <AdminDashboard />}
      {isAdvisor && <AdvisorDashboard />}
      {isUser && <UserDashboard />}
    </div>
  );
};
```

---

##  Security Best Practices

### 1. Always Validate Backend Too
```tsx
// Frontend (for UX)
const hasAccess = useFeatureAccess('bookAdvisor');

// Backend (for security)
// Validate request with RBAC before processing
```

### 2. Don't Hide Critical Info
```tsx
//  WRONG - Never hide security/payment info
const showPrice = useFeatureAccess('bookAdvisor');

//  CORRECT - Always show price, just disable action
const canBook = useFeatureAccess('bookAdvisor');
```

### 3. Check Role at API Level
```tsx
// Backend endpoint should verify role
app.post('/api/book', (req, res) => {
  const userRole = req.user.role;
  if (!hasFeatureAccess(userRole, 'bookAdvisor')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Process booking
});
```

---

##  FAQ

**Q: How do I add a new feature to the system?**
A: Add it to `ROLE_PERMISSIONS` in `frontend/src/lib/rbac.ts`:
```tsx
admin: { features: ['...', 'myNewFeature'] },
advisor: { features: ['...', 'myNewFeature'] },
user: { features: ['...', 'myNewFeature'] }
```

**Q: How do I make someone an admin?**
A: The admin email is hardcoded as `shake.job.atgmail.com`. No other email can be admin.

**Q: How do I add advisors?**
A: Set environment variable:
```env
VITE_ADVISOR_EMAILS=email1@example.com,email2@example.com
```

**Q: Can users change their role?**
A: No. Role is determined by email at login time via AuthContext.

**Q: How do I test different roles locally?**
A: Login with different emails:
- Admin: `shake.job.atgmail.com`
- Advisor: Add email to `VITE_ADVISOR_EMAILS`
- User: Any other email

---

##  Related Documentation

- [RBAC System Overview](./RBAC_IMPLEMENTATION.md)
- [Session Management](../frontend/src/lib/sessionManagement.ts)
- [Payment Settlement](../frontend/src/lib/paymentSettlement.ts)
- [Notification System](../frontend/src/lib/notificationSystem.ts)

