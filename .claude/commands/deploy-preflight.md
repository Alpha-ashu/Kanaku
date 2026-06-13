# Deploy Preflight Checklist

Run this before every production deployment to catch common issues. Covers build, security, database, and environment hygiene.

## 1. Code quality

- [ ] Run `npm run build:frontend` — must succeed with 0 errors
- [ ] Run `npm --prefix backend run build` — must compile cleanly
- [ ] Check TypeScript: `npx tsc --noEmit` in root, frontend, and backend — 0 errors
- [ ] Run all tests: `npm --prefix backend test` — all must pass

## 2. Database

- [ ] Run `/db-health` — migrations current, no schema drift
- [ ] Confirm `DATABASE_URL` in `.env.vercel` / Vercel dashboard points to production Supabase
- [ ] Verify no pending destructive migrations

## 3. Environment variables

- [ ] Check all `.env.example` vars are set in Vercel dashboard (no missing required vars)
- [ ] Verify `NODE_ENV=production` is set in deployment environment
- [ ] Confirm `JWT_SECRET` is set and is ≥ 32 chars
- [ ] Verify `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are all set

## 4. Security

- [ ] Run `/security-audit` — all ❌ items must be resolved before deploy
- [ ] Verify no hardcoded secrets in committed code: `git grep -i "secret\|password\|api_key" -- *.ts *.js *.json`
- [ ] Confirm `.gitignore` includes `.env`, `.env.*`, `*.pem`

## 5. Performance

- [ ] Check frontend bundle size: `npm run build:frontend` and note JS bundle kB
- [ ] Verify Vite code-splitting is working (no single bundle > 500kB)

## 6. Vercel-specific

- [ ] Review `vercel.json` — correct region, route rewrites, and function limits
- [ ] Verify `api/` serverless functions are under Hobby plan limits (12 functions)

## 7. Final gate

- [ ] Run `/api-smoke` against staging (if available) or confirm dev is clean
- [ ] Create a git tag: `git tag -a v<version> -m "Release notes"`

Report each item ✅/❌. Do NOT deploy if any ❌ exists in sections 1-4.
