# Backend Scripts

Supported backend helper scripts live here.

## Seeding realistic demo data (canonical path)

```bash
npm run seed:demo
```

Runs `seed-production-roles.cjs` then `seed-mock-data.cjs`. Safe to run **anytime** —
each step is idempotent: role accounts are upserted by email (never duplicated), and
per-user mock data is fully deleted and recreated on every run, scoped strictly to
that user's own rows.

Covers all 4 canonical roles (admin/manager/advisor/user @kanaku.com — ask the team
for current passwords, they are not stored in this repo) with: accounts
(bank/credit/cash/wallet), 35+ transactions per user across income/expense categories,
goals with contributions, loans, friends, investments, gold assets, budgets, recurring
transactions, group expenses (linked to real Friend records via `friendId` so the
collaboration/invitation system engages), tax calculations, notifications, and both an
individual and a "Together" (shared) to-do list per user via the real `todo_lists` /
`todo_items` / `todo_list_shares` tables — plus a full advisor↔client booking/session
scenario.

Requires `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (and the manager/advisor/user
equivalents) set as env vars or Fly secrets — `seed-production-roles.cjs` skips any
role whose env vars aren't set rather than guessing a default, so a misconfigured
secret never silently creates accounts on the wrong domain.

**Do not hardcode demo data into migrations or application code.** This script is the
one reusable, re-runnable source of demo data — re-run it after any schema change or
before testing a new release to quickly surface missing tables, broken relationships,
or features that silently aren't persisting data.

- `reset-demo-users.cjs` (`npm run demo:reset-users`) is an **older, separate** demo-user
  bootstrap (different emails/passwords, Supabase-Auth-based). Don't mix it with
  `seed:demo` — pick one canonical set of demo accounts to avoid the exact kind of
  duplicate-account confusion this caused before.

## Other scripts

- `seed-admin-feature-data.cjs`: deterministic admin feature-flag QA fixture, used by `qa:seed-admin`
- `run-feature-matrix.ps1`: feature matrix execution
- `run-feature-matrix-with-server.ps1`: starts backend, runs matrix, stops backend

```bash
npm run qa:seed-admin
npm run qa:matrix
npm run qa:test-features
```

Prefer the package scripts instead of calling PowerShell files directly.

<!-- ci: touch to re-run the Backend Feature Matrix on current main after the
     Actions-minutes outage; this file is build-irrelevant. -->

