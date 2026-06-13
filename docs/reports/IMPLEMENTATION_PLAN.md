# Implementation Plan - Feature Flags Optimization, Token Security & Duplicate Records Elimination

This plan details the changes required to optimize feature flag retrieval, secure the feature flags payload by user role, verify JWT claims, and prevent duplicate records across the application.

## User Review Required

> [!IMPORTANT]
> - **Duplicate Prevention Strategy**:
>   - In the frontend, we will check the local Dexie DB before submitting form data to prevent double-saving or resubmissions.
>   - For Transactions, Accounts, and Goals, the frontend will pass a unique `clientRequestId`/`dedupHash` to the backend Express API, which already implements idempotency checks using these keys.
>   - For Group Expenses, since the table lacks a unique `clientRequestId` field, we will implement name-and-date pre-validation on the backend.
> - **Role-Based Payload Sanitization**:
>   - Feature flags will be stored in the database as a **role-centric flat structure** (so the JSON doesn't leak other roles' access rules).
>   - Non-admin responses will dynamically reconstruct feature settings for their specific role only.
>   - Admin responses will reconstruct the full configuration for management inside the admin panel.

---

## Proposed Changes

### 1. Optimize Feature Flag Polling

Remove redundancy in features polling by disabling periodic background fetching and relying entirely on the mount fetch and push-based WebSocket broadcasts.

#### [MODIFY] [AppContext.tsx](file:///k:/Project/kenku/KANAKU/frontend/src/contexts/AppContext.tsx)
- Remove the `setInterval` block inside the `useEffect` on lines 690-694.
- Remove the `visibilitychange` listener that triggers a re-fetch of features.
- Retain the immediate fetch on mount/session change and the WebSocket listener that triggers `fetchGlobalFlags()` in real-time.

---

### 2. Role-Based Feature Payload Filtering

#### [NEW] [featureHelpers.ts](file:///k:/Project/kenku/KANAKU/backend/src/utils/featureHelpers.ts)
- Implement `transformFeaturesToRoleCentric(features)`: Convert feature-centric structures to role-centric flat configurations before database storage.
- Implement `reconstructFeatures(roleCentric, targetRole?)`: Dynamically reconstruct the feature-centric configuration (filtering by targetRole if provided).
- Implement `transformAIFeaturesToRoleCentric(aiFeatures)`.
- Implement `reconstructAIFeatures(roleCentric, targetRole?)`.

#### [MODIFY] [admin.controller.ts](file:///k:/Project/kenku/KANAKU/backend/src/modules/admin/admin.controller.ts)
- **`toggleFeatureFlag`**:
  - Transform features to role-centric flat dictionary and save under `admin_global_feature_settings`.
- **`getFeatureFlags`**:
  - Reconstruct the full features configuration for `admin` role, or return only the requesting user's role-centric reconstructed structure.
- **`toggleAIFeatureFlags`**:
  - Transform and save under `admin_ai_feature_settings`.
- **`getAIFeatureFlags`**:
  - Reconstruct for `admin` role or requesting user's role-centric structure.

#### [MODIFY] [featureGate.ts](file:///k:/Project/kenku/KANAKU/backend/src/middleware/featureGate.ts)
- Modify `getGlobalFeatures()` and `getAIGlobalFeatures()` to reconstruct feature-centric settings on-the-fly using the helper, ensuring the middleware checkers function without modification.

---

### 3. JWT Claim Security

#### [VERIFY] [auth.ts](file:///k:/Project/kenku/KANAKU/backend/src/utils/auth.ts) & [securityGate.ts](file:///k:/Project/kenku/KANAKU/backend/src/middleware/securityGate.ts)
- Custom tokens sign only non-sensitive user identity attributes. No environment credentials or secret URLs are encoded. No changes required.

---

### 4. Duplicate Records Prevention

#### [MODIFY] [auth-sync-integration.ts](file:///k:/Project/kenku/KANAKU/frontend/src/lib/auth-sync-integration.ts)
- **`saveTransactionWithBackendSync`**: Generate `transaction.dedupHash = transaction.dedupHash || crypto.randomUUID()` and send it in the request payload.
- **`saveAccountWithBackendSync`**: Generate `account.clientRequestId = account.clientRequestId || crypto.randomUUID()` and send it in the request payload.
- **`saveGoalWithBackendSync`**: Generate `goal.clientRequestId = goal.clientRequestId || crypto.randomUUID()` and send it in the request payload.

#### [MODIFY] [AddTransaction.tsx](file:///k:/Project/kenku/KANAKU/frontend/src/app/components/transactions/AddTransaction.tsx)
- In `handleSubmit`, query the local Dexie DB for any identical transaction (same account, type, amount, description) created within the last 10 seconds. Block the submission if a duplicate is found.

#### [MODIFY] [AddAccount.tsx](file:///k:/Project/kenku/KANAKU/frontend/src/app/components/core/AddAccount.tsx)
- In `handleSubmit`, check if an active account with the same name and type already exists locally. Block if found.

#### [MODIFY] [AddGoal.tsx](file:///k:/Project/kenku/KANAKU/frontend/src/app/components/goals/AddGoal.tsx)
- In `handleSubmit`, check if an active goal with the same name already exists locally. Block if found.

#### [MODIFY] [AddGroup.tsx](file:///k:/Project/kenku/KANAKU/frontend/src/app/components/groups/AddGroup.tsx)
- In `handleSubmit`, check if a group expense with the same name and date already exists locally. Block if found.

#### [MODIFY] [goal.controller.ts](file:///k:/Project/kenku/KANAKU/backend/src/modules/goals/goal.controller.ts)
- **`createGoal`**: Pre-validate that a goal with the same name does not already exist for this user (with `deletedAt: null`).
- **`updateGoal`**: Pre-validate name uniqueness if it is being changed.

#### [MODIFY] [group.controller.ts](file:///k:/Project/kenku/KANAKU/backend/src/modules/groups/group.controller.ts)
- **`createGroup`**: Pre-validate that a group expense with the same name, amount, and date does not already exist for this user.

---

## Verification Plan

### Automated Tests
- Build and compile the backend:
  `npm run build` inside `backend/`.
- Run tests:
  `npm run test` inside `backend/`.

### Manual Verification
- Verify that feature flags are populated correctly in the frontend after login.
- Access the network tab as a non-admin user and verify that responses for `/admin/features` contain only the current role's configuration, without leaking other roles' structures.
- Try submitting the same transaction, account, goal, or group expense twice rapidly to verify that duplicate prevention flags the retry and only one record is saved.
