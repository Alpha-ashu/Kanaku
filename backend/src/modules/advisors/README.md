# advisors module

> Financial advisor directory, verification, and ratings.

**Base path:** `/api/v1/advisors`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/advisors` | auth | `AdvisorController.listAdvisors` |
| GET | `/advisors/application/my` | auth | `AdvisorController.getMyApplication` |
| GET | `/advisors/application/:id/document/:docType` | auth, validated | `AdvisorController.getApplicationDocument` |
| POST | `/advisors/apply` | auth | `—` |
| PUT | `/advisors/online-status` | auth, admin, validated | `AdvisorController.setOnlineStatus` |
| PUT | `/advisors/role-mode` | auth, admin, validated | `AdvisorController.switchRoleMode` |
| POST | `/advisors/availability` | auth, admin, validated | `AdvisorController.setAvailability` |
| PUT | `/advisors/availability/status` | auth, admin, validated | `AdvisorController.setAvailabilityStatus` |
| GET | `/advisors/:id/availability` | auth, validated | `AdvisorController.getAvailability` |
| DELETE | `/advisors/availability/:id` | auth, admin, validated | `AdvisorController.deleteAvailability` |
| GET | `/advisors/me/sessions` | auth, admin | `AdvisorController.getSessions` |
| PUT | `/advisors/sessions/:id/rate` | auth, validated | `AdvisorController.rateSession` |
| GET | `/advisors/admin/applications` | auth, admin | `AdvisorController.listPendingAdvisors` |
| PUT | `/advisors/admin/:id/approve` | auth, admin, validated | `AdvisorController.approveAdvisor` |
| PUT | `/advisors/admin/:id/reject` | auth, admin, validated | `AdvisorController.rejectAdvisor` |
| GET | `/advisors/:id` | auth, validated | `AdvisorController.getAdvisor` |

## Files

- `advisor.controller.ts`
- `advisor.routes.ts`
- `advisor.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `advisors/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
