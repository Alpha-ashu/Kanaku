# advisors module

> Financial advisor directory, verification, and ratings.

**Base path:** `/api/v1/advisors`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/advisors` | auth | `AdvisorController.listAdvisors` |
| GET | `/advisors/application/my` | auth | `AdvisorController.getMyApplication` |
| GET | `/advisors/application/:id/document/:docType` | auth | `AdvisorController.getApplicationDocument` |
| POST | `/advisors/apply` | auth | `—` |
| PUT | `/advisors/online-status` | auth, admin | `AdvisorController.setOnlineStatus` |
| PUT | `/advisors/role-mode` | auth, admin | `AdvisorController.switchRoleMode` |
| POST | `/advisors/availability` | auth, admin | `AdvisorController.setAvailability` |
| PUT | `/advisors/availability/status` | auth, admin | `AdvisorController.setAvailabilityStatus` |
| GET | `/advisors/:id/availability` | auth | `AdvisorController.getAvailability` |
| DELETE | `/advisors/availability/:id` | auth, admin | `AdvisorController.deleteAvailability` |
| GET | `/advisors/me/sessions` | auth, admin | `AdvisorController.getSessions` |
| PUT | `/advisors/sessions/:id/rate` | auth | `AdvisorController.rateSession` |
| GET | `/advisors/admin/applications` | auth, admin | `AdvisorController.listPendingAdvisors` |
| PUT | `/advisors/admin/:id/approve` | auth, admin | `AdvisorController.approveAdvisor` |
| PUT | `/advisors/admin/:id/reject` | auth, admin | `AdvisorController.rejectAdvisor` |
| GET | `/advisors/:id` | auth | `AdvisorController.getAdvisor` |

## Files

- `advisor.controller.ts`
- `advisor.routes.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `advisors/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
