# Security Release Runbook

Use this runbook during production release to validate backend security controls and database RLS hardening.

## Scope

This runbook validates:
- Critical backend API security checks.
- Core finance table RLS and FORCE RLS posture in Supabase.

## Preconditions

- Backend dependencies are installed.
- Access to Supabase SQL Editor for the production project.
- Release operator has permission to run migration scripts.

## Step 1: Run Backend Security Gate

Execute in repository root:

npm --prefix backend run test:security:critical

Expected pass criteria:
- 3 test suites passed.
- No failing tests.
- Suites include security, transactions, and bills-security.

If this fails:
- Stop release.
- Triage failing suite and rerun until green.

## Step 2: Apply Core Finance RLS Hardening

In Supabase SQL Editor, run:
- supabase/migrations/010_enforce_rls_core_finance_tables.sql

Expected pass criteria:
- Script executes successfully with no errors.

If this fails:
- Stop release.
- Resolve schema or policy conflicts before proceeding.

## Step 3: Verify RLS Enforcement

In Supabase SQL Editor, run:
- supabase/migrations/010_verify_rls_core_finance_tables.sql

Expected pass criteria:
- rls_enabled = true for all required tables.
- force_rls_enabled = true for all required tables.
- verification_passed = true for every required table.

Required tables:
- accounts
- transactions
- friends
- group_expenses
- loans
- investments
- goals

If this fails:
- Stop release.
- Re-run migration 010 after resolving policy/table drift.

## Step 4: Staging Behavior Spot Checks

Validate in staging before production switch:
- /api/v1/auth returns 429 after threshold.
- /api/v1/bills returns 429 after threshold.
- Cross-user transaction access/update/delete is denied.
- Bill upload with foreign transactionId is rejected.

## Release Decision

Go for production only when:
- Backend security gate is green.
- Migration 010 applied successfully.
- Verification query fully passes.
- Staging spot checks match expected behavior.

## Evidence to Attach to Release

- Terminal output from backend security gate command.
- Screenshot or export of 010 verification query results.
- Short note confirming staging spot checks completed.
