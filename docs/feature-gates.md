# Feature Gates Manager

Inspect, enable, or disable feature flags/gates for this application. Feature gates control what functionality is accessible per role and per user.

## View current gates

1. Read `frontend/src/hooks/useFeatureFlags.ts` — list all defined feature flags.
2. Read `backend/src/modules/admin/` — find the feature flag management API.
3. Check the database: `admin_feature_flags` or equivalent table in `backend/prisma/schema.prisma`.
4. List: flag name | default state | roles it affects | current state.

## Enable/disable a gate

To toggle a feature flag, the admin can:
- Via API: `PATCH /api/admin/feature-flags/:flagName` with `{ enabled: true/false }`
- Via DB: update the feature flag record directly (dev only)

## Add a new gate

When adding a new feature gate:
1. Add the flag constant to `frontend/src/hooks/useFeatureFlags.ts`
2. Add the backend gate check in the relevant controller/middleware
3. Seed a default record in Prisma seed script
4. Document the gate in `docs/FEATURE_GATES_IMPLEMENTATION.md`

## Current known gates (from FEATURE_GATES_IMPLEMENTATION.md)

Read `docs/FEATURE_GATES_IMPLEMENTATION.md` for the full list. Key ones:
- AI features (receipt OCR, voice logging)
- Advisor module
- Group expenses
- Investment tracking
- Gold tracking
- Tax module

## Role-scoped gates

Some gates only apply to specific roles:
- `ADVISOR_MODULE` — only available to `client` and `advisor` roles
- `ADMIN_DIAGNOSTICS` — only available to `admin` role

Run `/role-audit` first to ensure RBAC is correctly enforced before toggling gates.
