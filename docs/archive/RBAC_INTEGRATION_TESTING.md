#  RBAC Integration Testing Guide

**Complete guide to test the newly integrated RBAC system in your app.**

---

##  What Was Just Implemented

### Files Created:
1. **FeatureGate.tsx** - Component wrapper that checks permissions before rendering
   - Shows access denied message if user lacks permission
   - Displays helpful info about who can access the feature

### Files Modified:
1. **navigation.ts** - Added RBAC metadata to all navigation items
2. **Header.tsx** - Filters navigation items based on role
3. **Sidebar.tsx** - Filters navigation items based on role
4. **App.tsx** - Wrapped feature components with FeatureGate

### Features Protected:
- `bookAdvisor` - Only users and admins (advisors cannot see/access)
- `adminPanel` - Only admins
- `advisorPanel` - Only advisors
- `taxCalculator` - All roles
- All other features - All roles (filtered at nav level)

---

##  Testing Scenarios

### Scenario 1: Test as Regular User

**Setup**:
1. Login with any email except:
   - `shake.job.atgmail.com` (admin)
   - Emails in `VITE_ADVISOR_EMAILS` (advisor)
2. Example: `user@example.com`

**Expected Results**:
-  Can see "Book Advisor" in navigation (sidebar & header)
-  Can click and access Book Advisor feature
-  Can see all standard features (accounts, transactions, etc.)
-  Cannot see "Admin Panel" in navigation
-  Cannot see "Advisor Panel" in navigation
-  If somehow access `/admin-feature-panel` (direct URL), see access denied

**Test Steps**:
```
1. Login as user@example.com
2. Look at sidebar - should show:
    Book Advisor
    Admin Panel
    Advisor Panel
3. Look at header menu (mobile) - same as above
4. Click "Book Advisor" - should load normally
5. Try direct URL: enter admin-feature-panel in page
   - Should show: "Access Denied - This feature is not available for your role"
```

---

### Scenario 2: Test as Advisor

**Setup**:
1. Add email to `.env.local`:
   ```env
   VITE_ADVISOR_EMAILS=advisor@test.com
   ```
2. Restart dev server
3. Login with: `advisor@test.com`

**Expected Results**:
-  Cannot see "Book Advisor" in navigation (HIDDEN)
-  If you somehow access `/book-advisor` directly, see access denied
-  Can see "Advisor Panel" in navigation
-  Can click and access Advisor Panel
-  Cannot see "Admin Panel"
-  Can see all other features

**Test Steps**:
```
1. Clear browser cache / logout first
2. Update .env.local with your test advisor email
3. Restart dev server (npm run dev)
4. Wait for app to restart fully
5. Login as advisor@test.com
6. Look at sidebar:
    Book Advisor should NOT be visible
    Advisor Panel should be visible
    Admin Panel should NOT be visible
7. Try clicking where Book Advisor would be (bookAdvisor nav id)
   - Should show: "Access Denied - bookAdvisor feature not available"
8. Click "Advisor Panel" - should load Advisor workspace
```

**Verify in Console**:
```javascript
// Open DevTools  Console
const { role } = window.__APP_CONTEXT__.auth;
console.log('Your role:', role); // Should be 'advisor'

const { hasFeatureAccess } = require('./lib/rbac');
console.log('Can access bookAdvisor?', hasFeatureAccess('advisor', 'bookAdvisor')); // false
console.log('Can access advisorPanel?', hasFeatureAccess('advisor', 'advisorPanel')); // true
```

---

### Scenario 3: Test as Admin

**Setup**:
1. Login with email exactly: `shake.job.atgmail.com`
2. Password: Your test password

**Expected Results**:
-  Can see "Book Advisor" in navigation
-  Can access Book Advisor feature
-  Can see "Admin Panel" in navigation
-  Can access Admin Feature Panel
-  Cannot see "Advisor Panel" (admins don't manage advisors, they control features)
-  Can access all features

**Test Steps**:
```
1. Logout and login as shake.job.atgmail.com
2. Look at sidebar:
    Book Advisor visible
    Admin Panel visible
    Advisor Panel NOT visible
3. Click "Admin Panel" - should show feature control UI
4. Look in admin panel:
   - Should see list of features
   - Should see 4 readiness buttons (Unreleased, Beta, Released, Deprecated)
   - Should be able to click buttons to change status
5. Click "Book Advisor" - should be able to access booking feature
```

**Verify in Console**:
```javascript
const { role } = window.__APP_CONTEXT__.auth;
console.log('Your role:', role); // Should be 'admin'

const { hasFeatureAccess, isAdminEmail } = require('./lib/rbac');
console.log('Email is admin?', isAdminEmail('shake.job.atgmail.com')); // true
console.log('Can access everything?', hasFeatureAccess('admin', 'bookAdvisor')); // true
console.log('Can access adminPanel?', hasFeatureAccess('admin', 'adminPanel')); // true
```

---

##  Detailed Test Cases

### Test Case 1: Navigation Filtering

**Objective**: Verify navigation items are shown/hidden based on role

```
Role: User
Expected Navigation Items:
   Dashboard
   Accounts
   Transactions
   Loans
   Goals
   Groups
   Investments
   Calendar
   Reports
   Todo Lists
   Tax Calculator
   Book Advisor  KEY: Should be visible
   Settings
   Admin Panel  Should NOT be visible
   Advisor Panel  Should NOT be visible

Role: Advisor
Expected Navigation Items:
   Dashboard
   Accounts
   Transactions
   Loans
   Goals
   Groups
   Investments
   Calendar
   Reports
   Todo Lists
   Tax Calculator
   Book Advisor  KEY: Should NOT be visible (advisors don't book)
   Settings
   Admin Panel  Should NOT be visible
   Advisor Panel  Should be visible

Role: Admin
Expected Navigation Items:
   All of the above
   Book Advisor  Should be visible
   Admin Panel  Should be visible
   Advisor Panel  Should NOT be visible
```

**How to Test**:
1. Login as each role
2. For each role, compare visible navigation items with expected list above
3. Check both Header (mobile menu) and Sidebar (desktop)

---

### Test Case 2: Direct URL Access

**Objective**: Verify permission gates work even if someone types URL directly

**Setup**:
Login as User (cannot access admin features)

**Test**:
1. Open browser DevTools
2. Go to URL: `#admin-feature-panel`
3. Expected: See "Access Denied" error screen

**Verify**:
```javascript
// In console, trigger component load directly
const { setCurrentPage } = window.__APP_CONTEXT__;
setCurrentPage('admin-feature-panel');
// Should show: "Access Denied - This feature is not available for your role"
```

---

### Test Case 3: Feature Gate Error UI

**Objective**: Verify the access denied screen shows proper information

**Setup**:
Try to access a feature you don't have access to

**Expected Screen Elements**:
-  Lock icon (red/warning icon)
-  Title: "Access Denied"
-  Message: "This feature is not available for your role"
-  Yellow warning box showing:
  - Your current role
  - Explanation that feature requires different role
-  List of who CAN access the feature
-  Your email address shown at bottom

**Check Design**:
- Lock icon should be visible
- Colors should match app design (red for error, yellow for warning)
- Text should be readable
- Should work on mobile (responsive)

---

### Test Case 4: Role Switching

**Objective**: Verify role-specific features disappear when you switch roles

**Steps**:
1. Login as User
2. See "Book Advisor" in navigation 
3. Logout
4. Login as Advisor
5. "Book Advisor" should NOT be in navigation 
6. Logout
7. Login as Admin
8. "Book Advisor" should be visible again 

**Expected Behavior**:
- Navigation updates immediately upon login
- No page refresh needed
- Sidebar shows/hides items correctly
- Header menu shows/hides items correctly

---

##  Automated Test Checklist

Copy-paste these into browser console to test:

### Test 1: Navigation Items Filtered Correctly
```javascript
const nav = require('./app/constants/navigation');
const { useAuth } = require('./contexts/AuthContext');
const { role } = window.__APP_CONTEXT__.auth;

// Get visible items for current role
const visibleItems = nav.sidebarMenuItems.filter(item => {
  if (item.roles && item.roles.length > 0) {
    return item.roles.includes(role);
  }
  return true;
});

console.log(`Visible items for ${role}:`, visibleItems.map(i => i.label));
```

### Test 2: Advisor Cannot See Book Advisor
```javascript
const { role } = window.__APP_CONTEXT__.auth;
const nav = require('./app/constants/navigation');

if (role === 'advisor') {
  const hasBookAdvisor = nav.sidebarMenuItems.some(i => i.id === 'book-advisor');
  console.log('Advisor can see Book Advisor?', hasBookAdvisor); // Should be false or filtered out
}
```

### Test 3: Admin Can See Admin Panel
```javascript
const { role } = window.__APP_CONTEXT__.auth;
const nav = require('./app/constants/navigation');

if (role === 'admin') {
  const hasAdminPanel = nav.sidebarMenuItems.some(i => i.id === 'admin-feature-panel');
  console.log('Admin can see Admin Panel?', hasAdminPanel); // Should be true
}
```

### Test 4: FeatureGate Works
```javascript
// Try accessing forbidden feature
const { setCurrentPage } = window.__APP_CONTEXT__;
const { role } = window.__APP_CONTEXT__.auth;

if (role === 'user') {
  setCurrentPage('admin-feature-panel');
  // Should show "Access Denied" UI
  console.log(' If you see "Access Denied" screen, FeatureGate is working!');
}
```

### Test 5: Admin Email Lock
```javascript
const { isAdminEmail } = require('./lib/rbac');

console.log('Admin email check:');
console.log('  shake.job.atgmail.com:', isAdminEmail('shake.job.atgmail.com')); // true
console.log('  other@example.com:', isAdminEmail('other@example.com')); // false
console.log('  SHAKE.JOB.ATGMAIL.COM:', isAdminEmail('SHAKE.JOB.ATGMAIL.COM')); // true (case-insensitive)
```

---

##  Expected Test Results

### All Tests Pass 
```
Navigation Filtering:
   User sees Book Advisor
   Advisor doesn't see Book Advisor
   Admin sees both Admin Panel and Book Advisor
   Advisor doesn't see Admin Panel

FeatureGate Protection:
   Direct URL access blocked for unauthorized roles
   Access denied UI displays correctly
   User info shows in error message

Admin Email Lock:
   Only shake.job.atgmail.com can be admin
   No other email can be admin
   Case-insensitive email check works

Role Switching:
   Features appear/disappear on role change
   No need to refresh page
   Both sidebar and header updated
```

---

##  Troubleshooting

### Problem: "Book Advisor" still visible for advisors

**Solution**:
1. Check `.env.local` - is the email in `VITE_ADVISOR_EMAILS`?
2. Clear browser cache (Ctrl+Shift+Delete)
3. Restart dev server (npm run dev)
4. Re-login
5. If still not working:
   ```javascript
   // In console
   const { role } = window.__APP_CONTEXT__.auth;
   console.log('Current role:', role); // Should be 'advisor'
   ```

### Problem: "Admin Panel" not visible for admins

**Solution**:
1. Verify you logged in with: `shake.job.atgmail.com` (exact spelling)
2. Check AuthContext console output:
   - Open console (F12)
   - Look for: " Admin role assigned to: shake.job.atgmail.com"
   - If you don't see it, email doesn't match exactly
3. Clear cache and try again

### Problem: Access denied showing for everyone

**Solution**:
1. Check `FeatureGate.tsx` is in correct folder: `frontend/src/app/components/`
2. Verify import in App.tsx:
   ```typescript
   import { FeatureGate } from '@/app/components/FeatureGate';
   ```
3. Check useRBAC hook exists: `frontend/src/hooks/useRBAC.ts`
4. Restart dev server

### Problem: No errors but features not filtered

**Solution**:
1. Verify navigation.ts has `feature` field in each item:
   ```typescript
   { id: 'book-advisor', label: 'Book Advisor', icon: BookOpen, feature: 'bookAdvisor' }
   ```
2. Verify Header.tsx and Sidebar.tsx import and use the role:
   ```typescript
   const { role } = useAuth();
   ```
3. Verify filtering logic:
   ```typescript
   const visibleMenuItems = headerMenuItems.filter(item => {
     if (item.roles && item.roles.length > 0) {
       return item.roles.includes(role);
     }
     return true;
   });
   ```

---

##  Mobile Testing

The RBAC integration works on mobile too. Test:

1. **Mobile Sidebar** (Not visible on mobile, but test on resize)
2. **BottomNav** - Should also filter items
3. **Mobile Header Menu** - Should filter items

**To Test**:
1. Open DevTools (F12)
2. Click device toggle ( icon)
3. Select mobile device
4. Test as user, advisor, admin
5. Verify navigation items appear/disappear correctly

---

##  Sign-Off Checklist

- [ ] User can see Book Advisor
- [ ] Advisor cannot see Book Advisor
- [ ] Admin can see both Admin Panel and Book Advisor
- [ ] Cannot access features directly via URL when unauthorized
- [ ] Access denied page shows correct information
- [ ] Admin email lock works (only shake.job.atgmail.com)
- [ ] Navigation updates on login (no refresh needed)
- [ ] All items visible/hidden correctly for each role
- [ ] Error messages are helpful
- [ ] Mobile responsive (tested on mobile view)

---

##  Next Steps

After testing passes:
1.  RBAC Integration is complete!
2.  Next: Integrate notifications with database
3.  Next: Create session ready confirmation UI
4.  Next: Build payment processing UI

---

**Testing Completed**: _____________  
**Tested By**: _____________  
**Status**:  / 

