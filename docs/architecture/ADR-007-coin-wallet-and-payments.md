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

* **Razorpay** — implemented (orders, checkout signature, API status read,
  webhooks, refunds). Google Pay / PhonePe / Paytm apps are reachable as UPI
  methods inside Razorpay checkout.
* **Sandbox** — a fake gateway for development and tests; never offered when
  `NODE_ENV=production`.
* **PhonePe / Paytm direct** — *not implemented.* Both need merchant sandbox
  credentials to build and verify their checksum/status flows. Adding one is a
  new adapter file plus a registry entry.

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
  `finance.adjust`, `finance.packages.manage`, `finance.providers.read` and
  `staff.manage` can never be granted.
* **advisor / user** — ownership only; no route takes a user id to read a
  wallet, and someone else's booking/session/order answers 404.

## Configuration

See `backend/.env.example` (“Coin wallet & session payments”). Every business
rule — coin value, the 5-minute lead, grace windows, refund policy, order TTL —
is an environment variable with a conservative default.

## Known limitations

* The video room is a public Jitsi room whose name is an HMAC the server hands
  out only when access is granted. A self-hosted Jitsi with JWT auth would make
  the room itself enforce access.
* Advisor withdrawals (coins → money) are not implemented. Adding them changes
  the wallet's regulatory character (closed → semi-closed prepaid instrument).
* The auth snapshot falls back to token claims if the DB lookup times out;
  money-moving code re-reads the rows it acts on inside its transaction.
