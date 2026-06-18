# Advisor Booking Flow Test

Verify the end-to-end advisor booking workflow: advisor creation → availability setup → client booking → session management → completion.

## Flow steps to verify

**Step 1 — Advisor onboarding:**
- Advisor applies: `POST /api/advisors/apply`
- Admin approves: `PATCH /api/admin/advisors/:id/approve`
- Advisor sets availability: `POST /api/advisors/availability`

**Step 2 — Client books session:**
- Client browses advisors: `GET /api/advisors`
- Client requests booking: `POST /api/bookings`
- Advisor confirms: `PATCH /api/bookings/:id/confirm`

**Step 3 — Session execution:**
- Session starts: `PATCH /api/sessions/:id/start`
- Real-time chat via Socket.IO (check socket handler in `backend/src/sockets/`)
- Session ends: `PATCH /api/sessions/:id/complete`

**Step 4 — Post-session:**
- Client can view session history: `GET /api/sessions`
- Advisor can view earnings (check payments module)

## Checks

1. Inspect `backend/src/modules/advisors/`, `bookings/`, `sessions/` for any TODO or unimplemented handlers.
2. Verify RBAC middleware is applied to all advisor routes (`requireRole(['advisor'])`) in `backend/src/middleware/rbac.ts`.
3. Check frontend pages under `frontend/src/pages/` for AdvisorDashboard, ClientBooking components.
4. Report any gaps between backend routes and frontend UI.
