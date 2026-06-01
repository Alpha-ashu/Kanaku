# Feature Gates & Admin Sub-Feature Modal Test Guide

## Overview
This document provides comprehensive test scenarios to validate that the feature gate system works correctly across the Finora application, including the Admin Feature Panel, sub-feature modals, and component-level enforcement.

## Architecture Summary

### Data Flow
```
Admin Panel (toggles sub-feature)
    ↓
handleToggleSubFeature() / handleToggleSubFeatureRoleAccess()
    ↓
saveAndBroadcastFeatures()
    ├─ Save to localStorage
    ├─ Post to BroadcastChannel
    └─ Sync to backend database
    ↓
AppContext Listeners (multiple)
    ├─ Storage change listener
    ├─ BroadcastChannel listener
    └─ Custom event listener
    ↓
computeVisibleFeatures()
    ├─ Read admin_global_feature_settings
    ├─ Merge with role defaults
    └─ Call setSubFeatures(computeSubFeatureMap(role, parsed))
    ↓
Components get fresh data via useSubFeature()
    └─ Conditional rendering: {canImport && <ImportButton />}
```

## Test Scenarios

### Test 1: Admin Sub-Feature Modal Opens and Closes
**Objective**: Verify SubFeatureModal renders correctly when clicking "Sub-Features" button

**Steps**:
1. Log in as admin
2. Navigate to Admin Panel → Feature Control
3. Find "Accounts" feature card
4. Click "Sub-Features" button on the card
5. Verify a modal overlay appears with:
   - Semi-transparent backdrop
   - Centered modal with rounded corners
   - "Sub-Features" title with feature icon
   - X button in top-right
   - List of sub-features (importStatement, exportData, createAccount, etc.)
   - Each sub-feature has toggle switch and role access checkboxes

**Expected Result**: ✅ Modal appears, displays all sub-features, backdrop is clickable to close

**Console Logging**: Should see no errors related to modal rendering

---

### Test 2: Toggle Sub-Feature Enabled State
**Objective**: Verify toggling a sub-feature enabled flag works in same tab

**Setup**:
- Log in as admin
- Open Admin Panel → Feature Control
- Open "Accounts" sub-features modal

**Steps**:
1. Find "importStatement" sub-feature in modal
2. Toggle the enabled switch OFF
3. Verify:
   - Modal shows updated state immediately
   - Toast notification appears: `Access for [role] to sub-feature "[childKey]" updated!`
   - Modal closes (or stays open to allow further changes)
4. Open Accounts page in same tab
5. Verify Import button is **hidden** (not showing up on bank/card accounts)

**Expected Result**: ✅ Import button hidden, feature gate enforced immediately

**Console Logging**:
- Should see: `[AppContext] Admin feature update detected`
- Should see: `[AppContext] Feature broadcast received` (same-tab broadcast)

---

### Test 3: Cross-Tab Feature Gate Propagation
**Objective**: Verify feature changes propagate to other open tabs via BroadcastChannel

**Setup**:
- Open Finora in 2 browser tabs
- Tab A: Logged in as admin
- Tab B: Logged in as user (or same admin), Accounts page visible

**Steps**:
1. In Tab A: Open Admin Panel → Feature Control
2. In Tab A: Open "Accounts" sub-features modal
3. In Tab A: Toggle "importStatement" OFF
4. In Tab B: Watch for Import button to disappear
5. Verify immediate update without page refresh

**Expected Result**: ✅ Import button disappears in Tab B within 100ms

**Console Logging**:
- Tab B should log: `[AppContext] Feature broadcast received from another tab/session`

---

### Test 4: Feature Persistence After Page Reload
**Objective**: Verify feature settings persist in localStorage and survive page reload

**Setup**:
- Log in as admin
- Open Admin Panel

**Steps**:
1. Disable "importStatement" sub-feature for accounts
2. Note the time when change was made
3. Navigate away or refresh the page
4. Go back to Accounts page
5. Verify Import button is still hidden
6. Open Admin Panel again
7. Verify "importStatement" is still toggled OFF

**Expected Result**: ✅ Setting persists across page reload

**Data Points**:
- localStorage key: `admin_global_feature_settings`
- Each feature has `lastUpdated` timestamp

---

### Test 5: Role-Based Access Control for Sub-Features
**Objective**: Verify that different roles see different sub-features based on roleAccess settings

**Setup**:
- Log in as admin
- Open Admin Panel

**Steps**:
1. Open "Accounts" sub-features modal
2. Find "importStatement" sub-feature
3. Toggle the "advisor" role access OFF (uncheck the advisor checkbox)
4. Verify toast: `Access for advisor to sub-feature "importStatement" updated!`
5. Log in as different user with "advisor" role (create test advisor account)
6. Navigate to Accounts page
7. Verify Import button is hidden (blocked by role access)
8. Switch back to admin or user role
9. Verify Import button is visible (allowed by role access)

**Expected Result**: ✅ Import button visibility changes based on user role

---

### Test 6: Sub-Feature Role Access Matrix Rendering
**Objective**: Verify all role toggles appear in sub-feature modal

**Setup**:
- Log in as admin
- Open Admin Panel → Feature Control
- Open "Accounts" sub-features modal

**Steps**:
1. Find "importStatement" sub-feature entry
2. Verify it displays 4 role access toggle buttons:
   - admin
   - manager
   - advisor
   - user
3. Each should show current toggle state
4. Toggle each role independently
5. Verify toggles work and update the enabled state correctly

**Expected Result**: ✅ All 4 roles present, toggles functional

---

### Test 7: Feature Modal Close Behavior
**Objective**: Verify modal closes correctly via multiple methods

**Setup**:
- Log in as admin
- Open Admin Panel → Feature Control
- Open "Accounts" sub-features modal

**Steps - Method A: X Button**:
1. Click the X button in top-right
2. Verify modal closes

**Steps - Method B: Backdrop Click**:
1. Open "Accounts" sub-features modal again
2. Click on the semi-transparent backdrop
3. Verify modal closes

**Steps - Method C: Making Changes**:
1. Open modal, make a change (toggle sub-feature)
2. Verify toast appears
3. Modal may stay open (for efficiency) or close

**Expected Result**: ✅ Modal closes via X button and backdrop; backdrop click closes reliably

---

### Test 8: Verify All Affected Components Have Gates
**Objective**: Verify feature gates work in multiple components beyond Accounts

**Components to Test**:
- **Accounts.tsx**: Import/Create/Edit/Delete buttons gated
- **Dashboard.tsx**: Quick actions, AI summary gated
- **Loans.tsx**: Borrow/Lend/Reminder buttons gated
- **Goals.tsx**: Create/Edit/Delete/Sharing gated
- **Investments.tsx**: Add/Analytics/SIP buttons gated
- **Transactions.tsx**: Add/Edit/Delete/Import buttons gated

**Steps**:
1. For each component, disable its main sub-features in admin panel
2. Navigate to that component page
3. Verify buttons/features are hidden
4. Re-enable features
5. Verify buttons reappear

**Expected Result**: ✅ All components respect feature gates

---

### Test 9: Backend Sync Verification
**Objective**: Verify feature changes are persisted to backend database

**Setup**:
- Log in as admin
- Backend logs accessible
- Admin Panel open

**Steps**:
1. Disable "importStatement" sub-feature
2. Check backend logs for:
   - `POST /api/v1/admin/global-feature-flags` call
   - Request body contains updated feature settings
   - Response indicates successful save
3. Query database directly (if accessible):
   ```sql
   SELECT * FROM admin_global_feature_settings ORDER BY updated_at DESC LIMIT 1;
   ```
4. Verify the disabled feature is recorded

**Expected Result**: ✅ Settings saved to backend database

---

### Test 10: Feature Definition Completeness
**Objective**: Verify all expected sub-features exist for each module

**Setup**:
- Log in as admin
- Open Admin Panel → Feature Control

**Module: Accounts** (6 sub-features):
- [ ] importStatement
- [ ] exportData
- [ ] createAccount
- [ ] editAccount
- [ ] deleteAccount
- [ ] accountTransfer

**Module: Transactions** (5 sub-features):
- [ ] addTransaction
- [ ] editTransaction
- [ ] deleteTransaction
- [ ] importStatement
- [ ] exportStatement

**Module: Goals** (5 sub-features):
- [ ] createGoal
- [ ] editGoal
- [ ] deleteGoal
- [ ] groupGoals
- [ ] goalSharing

**Module: Loans** (4 sub-features):
- [ ] borrowMoney
- [ ] lendMoney
- [ ] emiReminder
- [ ] loanSettlement

**Module: Investments** (4 sub-features):
- [ ] addInvestment
- [ ] portfolioAnalytics
- [ ] sipTracking
- [ ] groupInvestments

**Module: Reports** (5 sub-features):
- [ ] pdfExport
- [ ] excelExport
- [ ] csvExport
- [ ] aiInsightsReport
- [ ] forecasting

**Module: Notifications** (3 sub-features):
- [ ] pushNotifications
- [ ] emailNotifications
- [ ] inAppNotifications

**Module: Dashboard** (3 sub-features):
- [ ] quickActions
- [ ] aiSummary
- [ ] recentActivity

**Module: Groups** (4 sub-features):
- [ ] createGroup
- [ ] editGroup
- [ ] addMember
- [ ] settleExpense

**Module: BookAdvisor** (4 sub-features):
- [ ] createBooking
- [ ] chat
- [ ] reviews
- [ ] ratings

**Steps**:
1. Open each module's sub-features modal
2. Check off each sub-feature as verified
3. Note any missing or extra sub-features

**Expected Result**: ✅ All listed sub-features present in their modules

---

## Performance Checks

### Test 11: Admin Panel Rendering Performance
**Objective**: Verify admin panel loads and updates smoothly

**Steps**:
1. Open Admin Panel
2. Verify grid of ~15 feature cards renders within 1 second
3. Test search/filter functionality
4. Verify filtering response time < 100ms
5. Open/close multiple sub-feature modals
6. Verify no console errors or lag

**Expected Result**: ✅ Smooth 60 FPS animations, < 1s initial load

---

### Test 12: useSubFeature Hook Response Time
**Objective**: Verify feature gates don't introduce UI lag

**Setup**:
- Open Accounts page
- Have DevTools Profiler open

**Steps**:
1. In separate tab, toggle feature ON/OFF in admin panel
2. Watch Accounts page for re-render
3. Measure time from admin toggle to button appearing/disappearing
4. Should be < 200ms

**Expected Result**: ✅ Instant visual feedback (< 200ms latency)

---

## Error Handling Tests

### Test 13: Corrupted localStorage Recovery
**Objective**: Verify app handles corrupted feature settings gracefully

**Steps**:
1. Open DevTools Console
2. Run: `localStorage.setItem('admin_global_feature_settings', 'invalid json {{')`
3. Refresh page
4. Verify app loads without errors
5. Check console for: `Failed to apply admin feature settings`
6. Verify all features use defaults

**Expected Result**: ✅ App recovers gracefully, logs error, uses defaults

---

### Test 14: Network Error During Backend Sync
**Objective**: Verify admin can still make changes if backend is unreachable

**Setup**:
- Admin Panel open
- Network throttled to simulate high latency or offline

**Steps**:
1. Disable one sub-feature
2. Verify:
   - Change applied locally immediately
   - Toast shows success (optimistic UI)
   - App continues to work
   - Console shows backend sync attempted but failed
3. Re-enable network
4. Verify feature setting eventually syncs to backend

**Expected Result**: ✅ Optimistic UI, retry on network recovery

---

## Cleanup & Teardown

After completing tests:

1. **Reset to Defaults**: 
   ```javascript
   localStorage.removeItem('admin_global_feature_settings');
   localStorage.removeItem('feature_schema_version');
   location.reload();
   ```

2. **Verify All Features Visible**:
   - Log in as admin
   - All features should show in Feature Control panel
   - All buttons visible in component pages

3. **Backend Cleanup** (if test created test data):
   - Remove test feature flags from database
   - Verify production defaults are in place

---

## Regression Testing Checklist

Before each release, verify:

- [ ] Sub-feature modal opens/closes correctly
- [ ] Feature toggles propagate to other tabs
- [ ] Feature settings persist after page reload
- [ ] Different roles see different features
- [ ] All components respect feature gates
- [ ] No console errors in admin panel
- [ ] No console errors in component pages
- [ ] Backend successfully saves feature settings
- [ ] Feature gates don't impact performance
- [ ] Corrupted data handled gracefully

---

## Contact & Debugging

**Log Sources**:
- Browser Console: AppContext logging with `[AppContext]` prefix
- Admin Panel: Toast notifications for all changes
- Backend Logs: Feature flag sync operations

**Key localStorage Keys**:
- `admin_global_feature_settings` - Master feature matrix
- `feature_schema_version` - Schema version for migrations
- `visibleFeatures` - Computed visible features per role

**Key Context Fields**:
- `AppContext.subFeatures` - Map of enabled sub-features per role
- `AppContext.visibleFeatures` - Map of visible parent features per role

**Key Components**:
- `AdminFeaturePanel.tsx` - Admin UI
- `AppContext.tsx` - State management
- `featureFlags.ts` - Feature definitions
- Component pages - Gate enforcement

