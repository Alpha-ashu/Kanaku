# Runbook — launching the coin wallet

The wallet ships dark. Nothing charges anyone until **every** step below is done.
Architecture: [ADR-007](../architecture/ADR-007-coin-wallet-and-payments.md).

## 0. Decisions only the owner can make

- [ ] Coin price and packages (seeded inactive: 100 / 500+25 / 1000+75 / 2500+250 at ₹1 per coin).
- [ ] Refund policy (`SESSION_CANCEL_FULL_REFUND_MINUTES`, `SESSION_LATE_CANCEL_REFUND_PERCENT`, `SESSION_REFUND_UNSTARTED`).
- [ ] Legal: the public site states "no paid plans" — Terms, Privacy Policy and the pricing page must be
      updated before coins are sold. Start from `docs/legal/DRAFT_COINS_PAYMENTS_AND_DATA.md`, which lists
      what the code does and the decisions still open (no-show refunds, platform fee, GST). Coins are
      redeemable only inside KANAKU (closed-loop); do not add advisor withdrawals without advice on
      prepaid-instrument rules.
- [ ] Merchant onboarding with Razorpay (KYC, settlement account, business category).

## 1. Deploy (migration runs on deploy)

- [ ] Review `backend/prisma/migrations/20260930000000_wallet_ledger_payments/migration.sql`
      (additive; adds a trigger and RLS policies).
- [ ] Take a database backup / confirm PITR is on.
- [ ] Verify on a scratch database first:
      `npx prisma migrate deploy` then `prisma migrate diff --from-migrations … --to-schema … --exit-code`.
- [ ] Merge and deploy. `render.yaml` runs `npm run db:deploy` as the pre-deploy step.

## 2. Configure the provider (Render dashboard — secrets never in the repo)

- [ ] `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (start with `rzp_test_…`).
- [ ] In Razorpay: add webhook `https://<api-host>/api/v1/payments/webhooks/razorpay`
      for `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`; set its secret as
      `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Enable auto-capture on the Razorpay account.
- [ ] `PAYMENT_PROVIDERS=razorpay` (already in `render.yaml`).
- [ ] `AA_ENCRYPTION_ROOT_KEY` set — session chat refuses to store messages without it, and
      production refuses to boot without it. `VAULT_ENCRYPTION_ROOT_KEY` (falls back to the AA key)
      encrypts vault files and advisor KYC documents.

### Optional: PhonePe / Paytm (redirect checkout)

- [ ] PhonePe: `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV=sandbox`;
      webhook `https://<api-host>/api/v1/payments/webhooks/phonepe` with a username/password →
      `PHONEPE_WEBHOOK_USERNAME` / `PHONEPE_WEBHOOK_PASSWORD`.
- [ ] Paytm: `PAYTM_MID`, `PAYTM_MERCHANT_KEY` (16 chars), `PAYTM_WEBSITE`, `PAYTM_ENV=staging`; payment
      notification URL `https://<api-host>/api/v1/payments/webhooks/paytm`.
- [ ] `FRONTEND_URL` (users return to `/wallet`) and `API_PUBLIC_URL` (defaults to `RENDER_EXTERNAL_URL`).
- [ ] Buy a package with each on its sandbox (web and the Android app), confirm coins arrive and the Webhooks
      tab shows PROCESSED; only then add `phonepe` / `paytm` to `PAYMENT_PROVIDERS` and switch to live keys.

## 3. Verify in test mode

- [ ] Admin → Payments & Wallets → Overview: Razorpay shows *Configured*, *Webhook secret set*, mode *test*.
- [ ] Activate one package. Buy it with a Razorpay test card/UPI. Coins appear; the order shows
      `via callback` or `via webhook`; the Webhooks tab shows the delivery as PROCESSED.
- [ ] Close the checkout without paying → order CANCELLED, no coins.
- [ ] Book a paid advisor, accept, pay, start, complete → advisor earnings move pending → available.
- [ ] Overview → Ledger integrity → *Run check* reports all balances match.

## 4. Go live

- [ ] Admin → Feature Panel → **Coin Wallet**: enable, grant to users/advisors. This also starts
      charging coins for **new** bookings (existing bookings stay free).
- [ ] Switch to `rzp_live_…` keys and the live webhook secret.
- [ ] Watch for 24 h: failed orders, webhook failures, orders needing review, security events.

## Rollback

Disable **Coin Wallet** in the Feature Panel: the wallet API refuses non-admins
and new bookings stop being charged. Paid bookings, balances and the ledger are
untouched; the session clock keeps settling paid sessions (release / refund). Do
not drop the tables — the ledger is the financial record.

## Operations

| Symptom | Where to look |
| --- | --- |
| "I paid but have no coins" | Payments tab → the order → **Check** (asks the provider). The clock also reconciles every minute for 24 h. |
| Order flagged `AMOUNT_MISMATCH` / `PAYMENT_ID_REUSED` | Never auto-credited. Compare with the Razorpay dashboard; credit by an adjustment with a reason, or refund. |
| Refund at the provider, coins already spent | Wallet frozen automatically; security event `security.refund_unrecovered`. |
| Balance looks wrong | Overview → Ledger integrity. Correct only by an adjustment (a new ledger row); rows are never edited. |
