# Safe Prisma Migration

Run a Prisma database migration with safety checks before and after. Never run destructive migrations without confirmation.

## Pre-flight checks (always run first)

1. Check current migration status: `cd backend && npx prisma migrate status`
2. Show what the migration will change: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma`
3. If any `DROP`, `DELETE`, or column-removal operations appear — STOP and ask user to confirm before proceeding.

## Migration steps

4. If safe to proceed: `npx prisma migrate dev --name <describe-the-change>`
5. Verify: `npx prisma migrate status` — should show all migrations applied.
6. Regenerate client: `npx prisma generate`
7. Run smoke test: `npm --prefix backend run test:smoke`

## Rollback

If migration fails:
- Show the exact error
- Suggest rollback by reverting the schema change and running `npx prisma migrate dev`
- Never use `prisma migrate reset` in production

## Safety rules

- Always test on the dev database first
- Never run against `DATABASE_URL` pointing to production without explicit user confirmation
- Check `backend/.env` vs `backend/.env.test` to confirm which DB is targeted
