# Database Health Check

Check the health of the database: connection status, pending migrations, Prisma schema sync, and table counts. Report any mismatches or warnings.

## Steps

1. Run `npx prisma migrate status` inside `backend/` to show migration state.
2. Run `npx prisma db pull --force` dry-run equivalent: check if schema drift exists by running `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code` (note any drift).
3. Run the backend health endpoint: `curl -s http://localhost:3000/health` and show the JSON response.
4. Query key table row counts using `npx prisma db execute --file backend/scripts/check_tables.js` if available, or use Prisma Studio to spot-check.
5. Report a summary table: Migration state | Schema drift | API health | Critical table counts.

## Output format

Present a structured report with:
- ✅ or ❌ status per check
- Any blocking issues highlighted
- Recommended next action if anything is red
