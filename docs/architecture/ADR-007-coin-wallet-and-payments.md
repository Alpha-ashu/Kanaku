# ADR-007 — Coin wallet, session payments and staff permissions

**Status:** Implemented 2026-09-30, **not yet deployed**. Ships dark behind the admin `wallet` module.
**Migration:** `20260930000000_wallet_ledger_payments` (additive only).

## Decision

Advisor sessions are paid in application coins bought through a payment
gateway. The backend is the only authority on balances, payments, session
access and time; the database enforces the financial invariants itself.

```
payment provider ──(signed confirmation)──► PaymentOrder ──► ledger PAYMENT_CREDIT ──► wallet
client wallet ──(pay: one DB transaction)──► client −cost  +  advisor PENDING +cost ──► booking PAID
session completed ──(one DB transaction)──► advisor PENDING −cost  +  AVAILABLE +cost
cancelled / not started ──(one DB transaction)──► client +refund  +  advisor −refund (+ remainder released)
```

## Data model

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `wallets` | Cached balances per user (`available_balance`, `pending_balance`, `status`) | `CHECK >= 0` on both balances; one per user |
| `wallet_transactions` | **The ledger.** One row per balance movement, with balances after it | UNIQUE `reference`; `amount <> 0`; closed `type`/`bucket` sets; **trigger refuses UPDATE / DELETE / TRUNCATE** |
| `coin_packages` | Purchasable bundles (price in paise) | seeded **inactive**; orders snapshot price/coins |
| `payment_orders` | One coin purchase at a provider | UNIQUE `(provider, provider_order_id)`, `(provider, provider_payment_id)`, `(user_id, idempotency_key)` |
| `payment_webhook_events` | Every webhook delivery, verified or not | UNIQUE `(provider, event_id)` — redeliveries are recognised |
| `staff_permission_grants` | Extra permissions an admin granted a manager | only `GRANTABLE_TO_MANAGER` values are honoured |
| `manager_assignments` | Users/advisors a manager is responsible for | scopes every `team.*` read |
| `BookingRequest` (+ columns) | `startsAt/endsAt/timeZone` (absolute instants), `coinCost`, `paymentStatus`, `paidAt`, `refundedAt`, `earningsReleasedAt`, `expiredAt`, `cancelled*` | `paymentStatus` closed set; `coinCost >= 0` |
| `ChatMessage.readAt` | Read receipts | |

Wallets, ledger rows and payment orders have **no foreign key to `User`**:
financial records survive account deletion (pseudonymised by id). Deletion is
refused while an account holds coins, pending earnings or paid sessions that
have not happened (`wallet.guards.ts`).

All new tables have RLS enabled with a deny-all policy for `anon` /
`authenticated` — Supabase would otherwise serve them over PostgREST to the
anon key in the web bundle.

## Invariants and where they are enforced

| Invariant | Enforced by |
| --- | --- |
| Balance ≥ 0 | conditional `UPDATE … WHERE balance + delta >= 0 RETURNING` in `postEntry` + table CHECK |
| Every balance change has an immutable record | `postEntry` writes the ledger row in the same transaction; trigger blocks edits |
| No double credit / debit | UNIQUE ledger `reference` (`purchase:<order>`, `session:<booking>:payment`, …) + advisory/row locks + status checks after the lock |
| No double-spend under concurrency | row lock taken by the conditional update; wallets locked in id order (no deadlock) |
| Coins only after verified payment | `verifyCheckout` signature **and** `fetchOrderStatus` from the provider API, or a signed webhook; captured amount must equal the order |
| One provider payment → one order | UNIQUE `(provider, provider_payment_id)` + explicit check → `PAYMENT_ID_REUSED` flagged, never credited |
| Session locked until paid and in its window | `deriveLifecycle` on server time; `/sessions/:id/access`, `start`, chat all check it |
| Advisor credit only from a paid session | `SESSION_EARNING` is written only inside `payTx`, held as pending until completion |

## Time

Everything is decided on the server clock. `startsAt` is computed from the
client's wall-clock date/time and IANA zone (`bookingTime.ts`); rows created
before this change have no `startsAt` and are resolved in `Asia/Kolkata` for
display, but the clock never auto-expires or auto-completes them.

Render's free plan sleeps, so a timer alone cannot be trusted at T−5:
`settleBookingIfDue` runs **lazily** whenever a booking is opened or a session
joined, and `sessionClock.worker.ts` sweeps every minute (ordered by start time,
batch 200) when the instance is awake. Both are idempotent.

Lifecycle (`deriveLifecycle`): `REQUESTED → AWAITING_PAYMENT → PAYMENT_DUE →
UPCOMING → READY → IN_PROGRESS → COMPLETED`, plus `EXPIRED` (unpaid at
start + grace, nothing charged), `MISSED` (paid, never started → refunded),
`CANCELLED`, `REJECTED`, `RESCHEDULE_PROPOSED`.

## Payment providers

`features/payments/providers/` — one `PaymentProvider` interface; the wallet,
bookings and admin code never talk to a gateway directly.

* **Razorpay** — popup checkout: signed result checked on the server, then the
  captured amount read from the API. Google Pay / PhonePe / Paytm apps are also
  reachable as UPI methods inside Razorpay checkout.
* **PhonePe** (Standard Checkout v2) and **Paytm** (Initiate Transaction +
  hosted page) — redirect checkout: the browser goes to the provider and comes
  back to `/wallet?purchase=<order id>`; the order settles only from the
  provider's status API or a verified webhook (PhonePe: SHA256(username:password)
  header; Paytm: checksum). Paytm's page needs a form POST, so the app opens a
  signed, per-order launch link (`GET /payments/launch/paytm/:orderId?t=`) that
  auto-submits it; Paytm posts the browser back to `/payments/return/paytm`,
  which only triggers a status check. Written against the providers' published
  APIs and unit/integration tested with the APIs mocked — **run each end to end
  on its sandbox/staging before adding it to `PAYMENT_PROVIDERS`.**
* **Sandbox** — a fake gateway for development and tests; never offered when
  `NODE_ENV=production`.

A webhook whose signature fails is recorded as REJECTED, but a correctly signed
delivery with the same id is still processed (a forged first delivery must not
get the genuine one dropped as a duplicate).

Webhook URL: `POST /api/v1/payments/webhooks/<provider>` — signature checked over
the raw body; duplicates by `(provider, event_id)`.

## Permissions (RBAC)

`security/permissions.ts`. Roles say what an account *is*; permissions say what
it may *do*.

* **admin** — everything.
* **manager** — `team.read`, `team.bookings.read` by default, restricted to
  users assigned to them. An admin may grant `team.wallets.read`,
  `team.payments.read`, `users.directory.read`, `finance.read`,
  `finance.refund`, `finance.reconcile`, `security.read`.
  `finance.adjust`, `finance.payouts`, `finance.packages.manage`,
  `finance.providers.read` and `staff.manage` can never be granted.
* **advisor / user** — ownership only; no route takes a user id to read a
  wallet, and someone else's booking/session/order answers 404.

## Advisor withdrawals (added 2026-10-01)

Owner decision: advisors may withdraw coins **earned** from completed sessions;
coins bought with money stay spend-only. Finance staff pay manually (UPI / bank
transfer outside the app) and record the reference. Migration
`20261001000000_advisor_withdrawals` (two tables; the ledger `type` CHECK gains
`WITHDRAWAL` and `WITHDRAWAL_REVERSAL`).

* **What can be withdrawn:** `min(available, released − reversed earnings −
  withdrawals + returned withdrawals)`. Spending, refunds and earlier
  withdrawals all count against it, so a purchase can never be cashed out.
  Minimum `WALLET_MIN_WITHDRAWAL_COINS` (300), maximum
  `WALLET_MAX_WITHDRAWAL_COINS`; 1 coin = ₹1 (`SESSION_COIN_VALUE_MINOR`).
* **Payout details** (`payout_methods`, one per user): a UPI ID or bank account +
  IFSC, AES-256-GCM encrypted with `security/crypto.ts` (AAD bound to the user),
  shown only masked. Saving requires step-up proof (password or emailed code),
  is audited and always emailed to the account holder. The finance console
  flags requests whose payout details changed within 72 hours.
* **Lifecycle** (`withdrawal_requests`): `REQUESTED → APPROVED → PAID`, or
  `REJECTED` / `CANCELLED` (advisor, only while `REQUESTED`). The coins leave
  the wallet when the request is made (`withdrawal:<id>`) and come back on
  reject/cancel (`withdrawal:<id>:reversal`, unique — at most once). Approval
  locks out the advisor's cancel, so staff never pay a withdrawn request.
  Transitions are compare-and-set on the status.
* **Duplicate-proofing:** `useSubmitLock` + a request key kept across network
  retries (client); per-user advisory lock, unique `(user_id, idempotency_key)`,
  and `open_key` — set to the user id while a request is open, with a UNIQUE
  index and a CHECK tying it to the status — so one open request per advisor is
  a database rule.
* **Who acts:** `finance.payouts` (admin only, not grantable). Viewing the full
  account is a separate, audited read (`wallet.payout_details_viewed`); lists
  carry only the masked label. Staff cannot review their own request.
* **Deletion / export:** an open request blocks account deletion; requests (no
  account details) and the masked payout method are in the data export.
  Requests outlive the account as financial records, like payment orders.
* `WALLET_WITHDRAWALS_ENABLED=false` pauses new requests without touching open ones.

## Feature Panel → server gate (fixed 2026-10-01)

The admin Feature Panel saves to the `PlatformSettings` singleton, but
`requireFeature` / `requireAIFeature` still read the legacy copy in the first
admin's `UserSettings`, so the API enforced a stale snapshot (or the role
defaults) whatever the panel showed. The gate now reads `PlatformSettings` and
falls back to the legacy copy only when the panel has never saved. In the web
app, `wallet` is an **admin opt-in** feature (`ADMIN_OPT_IN_FEATURES` in
`lib/featureFlags.ts`): dark by default, and the admin's setting grants it per
role — before, the role default (`false`) capped it, so the toggle could never
show the wallet to advisors or users.

Follow-up the same day: production's saved settings (16 Sep) had admins
switched off for most pages and managers for the Dashboard, so once the API
followed the panel those pages were gone for both roles. The panel now:

* covers every gated module (`frontend/src/app/components/admin/featureCatalog.ts`
  — Admin Console, Advisor Panel, Vault and Transfers had no switch), grouped
  into staff workspaces and app features;
* shows locked switches for what cannot be revoked — an admin's own
  workspaces, and the personal-finance basics for every role — and saves them
  as on;
* has a **By role** tab: every page one role can have, and *Restore defaults*
  for that role.

`GET /admin/features` now reports the personal-finance basics as on for a
non-admin whenever any role has them (it used to report the caller's own tick,
so a manager lost the Dashboard in the app while the API still served it).

## Configuration

See `backend/.env.example` (“Coin wallet & session payments”). Every business
rule — coin value, the 5-minute lead, grace windows, refund policy, order TTL —
is an environment variable with a conservative default.

## Known limitations

* Video: by default a public Jitsi room whose name is an HMAC the server hands
  out only when access is granted. With a token-authenticated Jitsi server
  (`JITSI_APP_ID`/`JITSI_APP_SECRET`, `SESSION_VIDEO_BASE_URL`) each join link
  carries a room-scoped token expiring with the join window, so the room itself
  enforces access (advisor = moderator).
* No platform fee is deducted from advisor earnings yet (see
  `docs/legal/DRAFT_COINS_PAYMENTS_AND_DATA.md` §4).
* An admin refund of a session whose earning was already withdrawn fails with
  "not enough coins" (the reversal comes out of the advisor's available
  balance); settle it with an audited adjustment.
* The auth snapshot falls back to token claims if the DB lookup times out;
  money-moving code re-reads the rows it acts on inside its transaction.
