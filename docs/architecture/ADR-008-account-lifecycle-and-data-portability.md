# ADR-008 — Delete account, reset data, import & export

**Status:** Implemented 2026-09-30, **not yet deployed**.
**Migration:** `20260930010000_client_roles_read_only` (RLS policies only — see §5).

## 1. Re-authentication for irreversible actions (`security/stepUp.ts`)

Deleting an account and wiping its data need more than an access token (the
thing a stolen session has). The request carries a proof, checked on the server:

| Proof | Body | Who it suits |
| --- | --- | --- |
| Password | `{ proof: { method: 'password', password } }` | password accounts (bcrypt, or the identity provider for provider-managed ones) |
| Email code | `{ proof: { method: 'email_code' } }` after `POST /otp/send` + `/otp/verify` with `purpose: 'sensitive_action'` | everyone — the only option for Google sign-in |

An email code is **consumed** by the action (marked `EXPIRED` in the same
statement that claims it), so one code authorises exactly one deletion/reset.
No proof → **428** `STEP_UP_REQUIRED` / `STEP_UP_CODE_REQUIRED`; wrong password
→ **403** `STEP_UP_FAILED` (message never mentions "PIN": the web client treats
PIN-worded 403s as a PIN re-lock). Every attempt is audited
(`security.step_up_verified|failed`). Routes are rate limited (5/min/user).

`GET /settings/step-up-methods` tells the client which proofs the account has.

## 2. Delete account (`features/settings/accountDeletion.service.ts`)

One implementation behind `DELETE /auth/account` and `DELETE /settings/account`
(the old 30-day soft delete was never called by any client and its "sign in to
cancel" was never honoured). `GET /settings/account/deletion-check` returns
`{ allowed, requiresProof, blockers, openBookings, methods }` for the dialog.

| Role / state | Result |
| --- | --- |
| user, advisor, manager | deleted after proof |
| admin | **403** `ADMIN_SELF_DELETE_FORBIDDEN` — another admin changes the role first |
| protected role account (`SEED_*_EMAIL`) | **403** `PROTECTED_ACCOUNT` |
| coins held, earnings pending, paid session not yet held | **409** `ACCOUNT_HAS_OPEN_BALANCE`, `details.blockers` lists them |
| sign-up < 2 h old holding no data | no proof needed (onboarding "cancel registration") |

Order: refusals → proof → notify the other side of every open booking (the
cascade removes those bookings from *their* list too) → one transaction deletes
`profiles` + `User` (cascades) → remove storage objects (bills, chat
attachments of both parties, Vault files and versions, KYC documents) →
identity-provider user → revoke presented tokens, clear caches → audit
`gdpr.account_delete_executed`. Coin ledger rows and payment orders have no FK
to `User` and remain as the financial record.

Client: `DangerActionDialog` (shared by every role's profile page) shows what
is removed/kept, offers "download a copy first", collects the proof and the
typed confirm word; `wipeDeletedAccountFromDevice()` then clears every local
table, queued uploads, PIN, biometric unlock and profile before a full reload
to `/login`.

## 3. Reset data (`POST /settings/clear-data`)

Needs a proof (dry run excepted). **Removed:** accounts, transactions and their
derived snapshots, budgets, goals, loans, investments, gold, bills, recurring
rules, friends, group expenses, to-do lists (lists included — they used to
survive and re-sync), notifications, import/AI history, device trust, custom
categories (the default set is recreated). **Kept:** profile, sign-in, PIN,
coin wallet and ledger, advisor bookings/sessions/chat/payments (shared with
another person; paid ones are ledger-referenced), advisor application / KYC /
availability, Vault. Failures return a generic message and code; details go to
the log only.

Client order matters: sync is suppressed for the whole operation and the upload
queue is dropped **before** the server call — a create queued earlier and pushed
afterwards would put deleted data back. `resetLocalUserData()` clears every
table except the two investment catalogues, keeps session/PIN/profile keys
(dropping the profile flags sent the user back through onboarding).

## 4. Import & export

**One write path** for imported transactions — `features/import/importLedger.service.ts`
(`importLedgerRows`), used by `/import/confirm` (server-parsed statements and
spreadsheets), `/import/transactions` (rows parsed in the app) and
`/transactions/import/third-party` (API feeds):

- one DB transaction per batch (`createManyAndReturn`), each account moved once
  by its net (transfers move both sides), accounts locked in id order;
- idempotent per row: content `dedupHash` (+ `:occN` for identical rows within a
  file, which used to crash the import) or the source's own id when it has one;
  re-imports and retries add nothing;
- created rows come back with server ids so the app shows them immediately.

`/import/*` previews are owned by the uploader (random UUID ids, 404 for anyone
else — they used to be readable/confirmable by guessable id), expire lazily and
are capped per user. Spreadsheet reading (`import/tabular.ts`): RFC 4180 CSV,
delimiter detection, bank preambles, debit/credit columns, type columns,
signed amounts, Dr/Cr markers, Indian and European number formats, day-first vs
month-first dates inferred per file; an unreadable date is reported, never
replaced by today.

In the app, importers write rows without queueing one upload each, then
`services/importSync.ts` pushes them in chunks of 250 and links each device row
to its server id; offline or unsupported rows fall back to the sync queue.
KANAKU backups and exports import as a **merge** (preview, account matching,
duplicates skipped) instead of the old destructive local "restore". Restored
accounts open at their opening balance (never the current one, which already
includes the file's transactions). New accounts on the server always start at
`balance = openingBalance`.

**Export:** `GET /settings/export` — everything the user owns (format
`kanaku-export`, schemaVersion 2; importable back), allowlisted user fields, no
hashes/tokens/storage paths/provider ids. `GET /transactions/export` — CSV with
account names and currency, UTF-8 BOM, formula-safe cells (`=HYPERLINK(…)` opens
as text). The Reports CSV/XLS exports are formula- and HTML-safe too.

## 5. RLS: client roles are read-only (`20260930010000_client_roles_read_only`)

Migration 20260813000000 gave every user table an owner policy `FOR ALL TO
authenticated`. Nothing in KANAKU writes through Supabase with a user session,
but every Google sign-in holds one (`auth.uid() = "User".id`), so those policies
let a user rewrite their own rows with no server rule — including
`"User".role = 'admin'`, account balances, advisor-application status, device
trust and audit rows — and `aa_consent_artifact` was open to every signed-in
user (`USING (true)`). Verified on a scratch database built with the production
policies: before, an authenticated session promoted itself to admin; after, the
same updates change 0 rows.

The migration drops every non-SELECT policy for anon/authenticated/public
(explicit deny-alls kept), re-creates owner policies as SELECT-only (Realtime
needs them), and leaves credential tables (`User`, `UserPin`, `RefreshToken`,
`AuditLog`, `OtpCode`, `otp_requests`, `Device`, `SyncQueue`,
`api_idempotency_keys`, `financial_events`, `aa_consent_artifact`) with no
client access. Service role (the API) is unaffected. Idempotent.
