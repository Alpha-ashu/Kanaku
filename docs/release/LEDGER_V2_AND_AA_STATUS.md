# Ledger V2 activation & Account Aggregator — status

_Last updated: 2026-07-30_

Companion to [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) §1 and §2. Records what was
wired on 2026-07-30, and — more importantly — why the remaining modules cannot be wired
without schema and API changes that were not obvious from the original plan.

---

## 1. Ledger V2

### 1.1 How the machinery fits together

```text
controller (inside prisma.$transaction)
  └─ if (FinancialLedgerService.isEnabled('<module>'))
       └─ FinancialEventDispatcher.publish(tx, new XEvent(...))
            ├─ FinancialEventStore.record(tx, event)      append-only event log
            └─ ledger.subscriber.ts listener
                 └─ FinancialLedgerService.postJournalEntry(tx, journal, legs)
                      ├─ FinancialInvariantValidator (leg count, sign, account ownership)
                      ├─ idempotency-key check
                      └─ journal entry + transaction legs
```

Two things follow from this shape and are easy to get wrong:

1. **`postJournalEntry` does not check the feature flag itself.** The gate lives at the
   *publish* site. A publish added without an `isEnabled()` guard would start writing
   journal entries in production immediately.
2. **The publish must be inside the caller's interactive transaction.** A journal entry
   must never be able to commit without the row that caused it. That rules out the array
   form `prisma.$transaction([...])`, which cannot run arbitrary code between statements.

### 1.2 Flags

| Flag | Effect |
| --- | --- |
| `LEDGER_V2_ENABLED` | Master switch. **Unset in every tracked config**, so all of V2 is inert today. |
| `LEDGER_GROUPS_ENABLED` | Per-module opt-out (`'false'` disables). Defaults on when the master is on. |
| `LEDGER_GOALS_ENABLED` | " |
| `LEDGER_INVESTMENTS_ENABLED` | " |
| `LEDGER_LOANS_ENABLED` | " |

### 1.3 Publisher status

| Module | Event | Status |
| --- | --- | --- |
| Groups | `GROUP_EXPENSE_CREATED` | ✅ pre-existing |
| Groups | `GROUP_SETTLEMENT_COMPLETED` | ✅ pre-existing |
| **Loans** | **`LOAN_PAYMENT_CREATED`** | ✅ **added 2026-07-30** — `addLoanPayment` + `settleLoan` |
| Loans | `LOAN_DISBURSED` | ⛔ blocked — see below |
| Investments | `INVESTMENT_PURCHASED` / `INVESTMENT_REDEEMED` | ⛔ blocked |
| Goals | `GOAL_CONTRIBUTION` / `GOAL_WITHDRAWAL` | ⛔ blocked |

Subscribers for **all** of these already exist and are tested in
`ledger.subscriber.ts` — the gap was only ever on the publishing side.

### 1.4 What was added

`backend/src/features/loans/loan.controller.ts`:

- `addLoanPayment` and `settleLoan` were converted from the array form of
  `prisma.$transaction` to the interactive form, so the event commits atomically with the
  payment row and the balance update.
- Both publish `LoanPaymentCreatedEvent` behind `FinancialLedgerService.isEnabled('loans')`.
- Both require an `accountId`; a payment recorded without one has no cash leg to post and
  is skipped rather than posted against a guessed account.
- Idempotency keys are `loan-payment-<paymentId>` / `loan-settlement-<paymentId>`.

A settlement is treated as a payment for ledger purposes: it moves cash and closes the
obligation. Any discount (outstanding balance minus settled amount) is **not** a cash leg
and is deliberately not posted — writing off the remainder is a separate accounting event
that has no model yet.

### 1.5 Why the rest is blocked — the important finding

The original plan (KNOWN_LIMITATIONS §1) reads as though the remaining modules just need
publishers added. They do not. **Three of the four have no funding account to post
against**, which is a schema/API gap, not a wiring gap:

| Module | Blocker |
| --- | --- |
| Loan disbursement | `POST /loans` accepts no `accountId`. A loan is created as a standalone obligation with no modelled cash movement. `LoanDisbursedEvent` requires an account for the cash leg. |
| Investments | The `Investment` model has **no `accountId` column at all** (`backend/prisma/schema.prisma`). Purchases and redemptions record quantity and price, never the account the money came from or went to. Needs a migration plus an API change. |
| Goals | There is **no server-side contribution endpoint**. `/goals` exposes CRUD and members only; goal funding happens client-side in Dexie. There is no server-side money movement to publish an event about. |

Each of these is a product decision about modelling cash movement, not a mechanical
change, and each needs its own review. Adding an `accountId` to investments in particular
is a migration against live financial data.

### 1.6 Verification status — read this before enabling

- `tsc --noEmit` on the backend: **clean**.
- `loans.test.ts` + `loans-goals-settings.test.ts`: **49/49 pass**.
- ⚠️ **The loan publish path has not been exercised against a live database.** During this
  run the staging Postgres (`52.65.247.42:5432`) was unreachable from the dev machine, so
  those suites covered auth, validation and the `DATABASE_UNAVAILABLE` paths rather than
  committing real loan payments. The `$transaction` refactor is type-verified and
  structurally reviewed, not integration-verified.

**Before setting `LEDGER_V2_ENABLED=true` anywhere:** re-run the loan suites against a
reachable database, then exercise `POST /loans/:id/payment` and `POST /loans/:id/settle`
with the flag on and confirm the journal entries balance
(`ledgerReconciliation.test.ts` covers the invariant checks).

---

## 2. Account Aggregator (Setu)

### 2.1 Status

The `/aa` module is **fully implemented**, not a stub: 9 endpoints, 5 tables, consent
lifecycle (create / status / artifact / revoke), data sessions, FI data fetch, and
AES-256-GCM at-rest encryption of FI payloads under a per-user key with a hard refusal to
persist plaintext in production.

It is dormant by two independent gates:

1. **Mount gate** — `ENABLED_MODULES` must include `aa`, or `/api/v1/aa/*` 404s
   (`backend/src/routes/index.ts`). Unset in production by design.
2. **Credentials** — `AA_CLIENT_ID`, `AA_CLIENT_SECRET`, `AA_FIU_ID`, `AA_REDIRECT_URL`.

### 2.2 What was added

The credentials were readable only by grepping `aa.service.ts`; they appeared in
`backend/.env.example` but were absent from the env schema, so nothing validated or
reported them. A deploy with `ENABLED_MODULES=aa` and no credentials booted happily and
then failed at the provider on the first consent request — with a 401 that says nothing
about the real cause.

`backend/src/config/env.ts` now:

- declares `AA_BASE_URL`, `AA_CLIENT_ID`, `AA_CLIENT_SECRET`, `AA_FIU_ID`,
  `AA_REDIRECT_URL` in the zod schema (all optional — the module is phase-gated);
- adds an `isModuleEnabled()` helper mirroring the `ENABLED_MODULES` parsing in
  `routes/index.ts`;
- reports the four credentials as a single startup config row that escalates from
  `optional` to **`required` when `ENABLED_MODULES` includes `aa`**, and is only
  "present" when all four are set — so a half-configured AA deploy is visible at boot
  rather than at first consent.

`AA_BASE_URL` defaults to the Setu **sandbox** in `aa.service.ts`. Set it explicitly
before going anywhere near live data.

### 2.3 Remaining before AA can do anything real

Not code — all of it is external:

| # | Item |
| --- | --- |
| 1 | Setu FIU onboarding: client id/secret, FIU id, registered redirect URL |
| 2 | `AA_ENCRYPTION_ROOT_KEY` set (production **refuses** to persist FI data without it) |
| 3 | `WEBHOOK_SETU_SECRET` for inbound consent-notification signature verification |
| 4 | `ENABLED_MODULES=aa` on the target deploy |
| 5 | RBI/compliance sign-off — this is a regulated data flow, and the module handles real bank statements |
