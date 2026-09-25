# Proposal — Account inactivity policy (90-day)

**Status:** DRAFT — needs product approval before any code is written.
**Date:** 2026-09-25
**Audience:** Kanaku product owner + development team

Nothing in this document is implemented. It exists because the brief asked for a
policy to approve rather than a policy invented in code.

---

## 0. The finding that motivates this

Kanaku **already implements a 90-day rule, and it is the wrong one.**

`middleware/auth.ts` and `auth.controller.ts` expire a user's *email
verification* 90 days after `verifiedAt` and drop the account into View-Only
Mode:

> "Profile verification has expired (required every 90 days). Your account is in
> View-Only Mode. Please verify your account again to add or edit records."

The frontend then re-applied the same 90-day window a second time, on its own
clock (`useProfileVerification.ts`). That duplicate client-side expiry has been
removed — the server is now the only authority on expiry — but **the server-side
behaviour is untouched**, because changing it is the decision below.

This conflates two separate things:

| | Question it answers | Correct trigger to re-check |
|---|---|---|
| **Email verification** | Does this address belong to this person? | The address changes, or a security event |
| **Account activity** | Is this account still in use? | Time without meaningful use |

An email verified in January is no less verified in June. Re-sending an OTP
proves nothing new about an address that has not changed — it only adds a
gate, and it fails outright whenever mail delivery is down, which is the
condition production is in right now (`502 OTP_SEND_FAILED`).

**Recommendation: decouple them.** Verification becomes permanent until the
address changes; the 90-day window becomes an *inactivity* policy that never
asks for an OTP to prove an unchanged address.

---

## 1. What constitutes meaningful activity

**Proposed:** a deliberate, authenticated action the user took.

Counts:
- successful login (password or PIN unlock)
- creating, editing or deleting any record — transaction, account, goal, loan,
  budget, todo, investment, document
- uploading a bill, receipt or statement
- a booking or advisor message
- a KAI conversation turn

Does **not** count:
- background sync pulls, polling, the 20 s feature-flag poll, socket traffic
- token refresh
- `/health`, `/metrics`, scrapes
- push-notification receipt or an unopened email

**Rationale:** a phone left installed with the app backgrounded must not look
active. Conversely, a user who logs in monthly and reads their dashboard is
active even if they write nothing — so login counts on its own.

**Implementation note:** this is one `last_activity_at` write, throttled to at
most once per hour per user, from the mutation path — not from `authMiddleware`,
which would make every background poll count.

---

## 2. When inactivity starts

From `last_activity_at`, defaulting to `created_at` for accounts that predate
the field. **Not** from `last_login_at` alone — a long-lived session is use.

---

## 3–5. Warning schedule

**Proposed**, all configurable, no value hard-coded in more than one place:

| Day | State | Action |
|---|---|---|
| 0 | `ACTIVE` | — |
| 60 | `INACTIVE` | No message. Internal state only. |
| 75 | `WARNING` | Email + in-app: "It's been a while" |
| 85 | `WARNING` | Second notice: "Your account will be restricted in 5 days" |
| 89 | `FINAL_WARNING` | Final notice, 24 h before |
| 90 | `SUSPENDED` | Restricted (§6) |

Three warnings across 15 days, the last a day ahead. Any meaningful activity at
any point resets to `ACTIVE` and clears `warning_level`.

**Idempotency:** each warning writes `warning_level` + `warning_sent_at` in the
same transaction that enqueues the notification, and the job selects on
`warning_level < N`. A job that runs hourly, or twice, or catches up after a
week of downtime sends each warning exactly once. This is the failure mode most
worth guarding — a scheduled job that re-sends on every tick is worse than one
that never runs.

---

## 6. What suspension blocks — and what it must not

**Proposed: suspension restricts *writes*, never *access to your own data*.**

| Blocked | Still available |
|---|---|
| Creating/editing/deleting records | Logging in |
| Uploading documents | Reading every existing record |
| New bookings, advisor messages | Exporting / downloading data |
| KAI actions that write | Viewing documents already uploaded |
| Outbound notifications | The reactivation flow |

**Rationale:** this is a personal-finance ledger. An account holder locked out of
their own transaction history because they did not open the app for three months
is a worse outcome than any storage cost saved. Suspension should feel like a
read-only shelf, not a locked door.

This deliberately reuses the existing **View-Only Mode** mechanism, which already
exists and is enforced server-side — so suspension is a new *reason* for an
existing state rather than a new enforcement path.

**Data retention: absolute.** No financial record, document, attachment,
investment, advisor history or audit entry is deleted by inactivity, ever.
Deletion happens only on explicit user request (the existing GDPR path).

---

## 7. Reactivation

**Proposed: logging in is enough.**

```
SUSPENDED → user logs in with password/PIN → ACTIVE
```

No OTP. The user just proved they hold the credentials; an emailed code proves
nothing further about an address that has not changed, and would fail closed
whenever mail is down — locking out exactly the user we are trying to bring
back.

Reactivation clears `warning_level`, sets `reactivated_at`, sets
`last_activity_at = now`, and writes an audit entry.

**Open question for product:** should reactivation after a *very* long period —
say a year — require an OTP? Defensible, but it inherits the mail-delivery
dependency. Recommendation: no, unless a security event is on record.

---

## 8. Configuration

One config object, server-side, admin-visible:

```
INACTIVITY_WARNING_DAYS      = [75, 85, 89]
INACTIVITY_SUSPEND_DAYS      = 90
INACTIVITY_ENABLED           = false   # ships OFF
ACTIVITY_WRITE_THROTTLE_MIN  = 60
```

`INACTIVITY_ENABLED=false` on first deploy is not caution for its own sake: the
job's first run would evaluate every existing account at once, and any account
whose `last_activity_at` backfills to an old `created_at` would be suspended
immediately. See §10.

---

## 9. Schema (additive only)

Check before adding — `User.status`, `emailVerified` and `verifiedAt` already
exist and several of these may map onto existing columns.

```
last_activity_at    DateTime?
warning_level       Int       @default(0)
warning_sent_at     DateTime?
suspended_at        DateTime?
reactivated_at      DateTime?
```

`email_verified_at` already exists as `User.verifiedAt`. **Do not add a second
column for it**, and do not backfill or reset it — §14 of the brief requires
existing verified users to stay verified.

---

## 10. Migration risk — the one that would cause real harm

`last_activity_at` starts null for every existing user. If the job treats null
as "inactive since `created_at`", **every account older than 90 days is
suspended on the first run** — which on this database is most of them.

**Required sequence:**

1. Ship the columns with `INACTIVITY_ENABLED=false`.
2. Backfill `last_activity_at` from the best available evidence — most recent of
   `last_login_at`, newest transaction/account/goal `updatedAt`, `verifiedAt`.
3. Start writing `last_activity_at` live; leave the job off for **at least one
   full 90-day window** so real signal accumulates.
4. Dry-run the job: log who *would* be warned or suspended, change nothing.
5. Review that list by hand.
6. Enable warnings only. Confirm no duplicate sends across several runs.
7. Enable suspension last.

Steps 4–5 are the ones not to skip. The dry run is what turns a bad backfill
into a log line instead of a mass suspension.

---

## 11. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| 1 | Decouple email verification from the 90-day rule, and remove the server-side "verify every 90 days" behaviour? | **Yes** |
| 2 | Warning schedule 75 / 85 / 89, suspend at 90? | As proposed |
| 3 | Does suspension block writes only, leaving data readable? | **Yes** |
| 4 | Is login alone enough to reactivate? | **Yes** |
| 5 | Does login alone count as activity? | **Yes** |
| 6 | Ship disabled, backfill, dry-run before enabling? | **Yes** |

On #1 specifically: approving it changes live behaviour for any user currently
in View-Only Mode through verification expiry — they would regain write access.
That is the intent, but it should be a decision, not a side effect.
