# admin module

> Admin console — user/role management, feature flags, and operational dashboards (admin role required).

**Base path:** `/api/v1/admin`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/admin/features` | auth | `AdminController.getFeatureFlags` |
| GET | `/admin/ai-features` | auth | `AdminController.getAIFeatureFlags` |
| GET | `/admin/users` | auth | `AdminController.getAllUsers` |
| GET | `/admin/users/pending` | auth | `AdminController.getPendingAdvisors` |
| POST | `/admin/users/:advisorId/approve` | auth | `AdminController.approveAdvisor` |
| POST | `/admin/users/:advisorId/reject` | auth | `AdminController.rejectAdvisor` |
| GET | `/admin/users/activity` | auth | `AdminController.getUserActivity` |
| POST | `/admin/users/:userId/status` | auth | `AdminController.toggleUserStatus` |
| POST | `/admin/users/:userId/role` | auth | `AdminController.updateUserRole` |
| DELETE | `/admin/users/:userId` | auth | `AdminController.deleteUser` |
| GET | `/admin/users/:userId/storage` | auth | `AdminController.getUserStorageStats` |
| GET | `/admin/stats` | auth | `AdminController.getPlatformStats` |
| GET | `/admin/cache/metrics` | auth, validated | `AdminController.getCacheMetrics` |
| POST | `/admin/features/toggle` | auth | `AdminController.toggleFeatureFlag` |
| POST | `/admin/ai-features/toggle` | auth | `AdminController.toggleAIFeatureFlags` |
| GET | `/admin/reports/users` | auth | `AdminController.getUsersReport` |
| GET | `/admin/reports/revenue` | auth | `AdminController.getRevenueReport` |
| GET | `/admin/ai/overview` | auth | `getAdminAIOverview` |
| GET | `/admin/ai/users` | auth, validated | `getAdminAIUsers` |
| GET | `/admin/ai/insights` | auth, validated | `getAdminAIInsights` |
| GET | `/admin/ai/patterns` | auth | `getAdminAIPatterns` |
| GET | `/admin/ai/accuracy` | auth | `getAdminAIAccuracy` |
| GET | `/admin/ai/raw/:userId` | auth, validated | `getAdminAIRawUserData` |
| POST | `/admin/ai/run/features` | auth, validated | `runAdminFeatureRefresh` |
| POST | `/admin/ai/run/predictions` | auth, validated | `runAdminPredictionRefresh` |
| GET | `/admin/ai/config` | auth | `getAdminAIConfig` |
| POST | `/admin/ai/config` | auth | `updateAdminAIConfig` |

## Files

- `admin.controller.ts`
- `admin.routes.ts`
- `admin.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `admin/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
