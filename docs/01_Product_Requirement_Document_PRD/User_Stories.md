# User Stories — Kanaku

Format: `As a <role>, I want <capability> so that <benefit>.`
Each story includes acceptance notes for QA testability.

## Authentication
- **US-001** As a user, I want to sign up with email so that I can create an account.
  - Notes: validate email format; password strength; confirmation flow.
- **US-002** As a user, I want to sign in offline using a cached session so that I can keep working without internet.
  - Notes: session valid window; re-auth required after expiry.
- **US-003** As a user, I want to log out so that my session is cleared on shared devices.

## Transactions
- **US-010** As a user, I want to add an expense so that I can track spending.
  - Notes: amount > 0; category required; default to today.
- **US-011** As a user, I want to add income so that my balance reflects earnings.
- **US-012** As a user, I want to edit/delete a transaction so that I can fix mistakes.
  - Notes: balance recalculated atomically; ownership enforced.
- **US-013** As a user, I want offline transactions to sync automatically so that I never lose data.

## Dashboard & Insights
- **US-020** As a user, I want to see total balance and recent activity so that I understand my finances at a glance.
- **US-021** As a user, I want spend-by-category charts so that I can spot overspending.
- **US-022** As a user, I want to filter by date range so that I can review specific periods.

## Receipts
- **US-030** As a user, I want to scan a receipt so that data entry is faster.
  - Notes: low-confidence parses require manual confirmation.

## Admin / Platform
- **US-040** As an admin, I want feature gates so that I can control rollouts.
- **US-041** As an admin, I want rate limiting so that the API is protected from abuse.

