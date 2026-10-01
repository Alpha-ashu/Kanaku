# DRAFT — Coins, session payments, account deletion and data export

> **Status: draft for the owner / legal review. Not linked from the app.**
> The coin wallet ships switched off. Before an admin enables the `wallet`
> module, the published Terms, Privacy Policy and pricing page must say what the
> code below actually does. Two points need a business decision first (§4).

## 1. What the product does today (facts the text must match)

| Area | Behaviour in code |
|---|---|
| Coins | Bought with money through Razorpay (and PhonePe / Paytm when enabled). Default 1 coin = ₹1 (`SESSION_COIN_VALUE_MINOR`). Spent only on advisor sessions inside KANAKU. No cash value, not transferable between users, no withdrawal. |
| Purchase confirmation | Coins are credited only after the payment provider confirms the payment (never on the browser's word). A payment captured after the order expired is still credited. |
| Purchase refunds | Finance staff can refund an unused purchase: the coins are removed first, then the money is returned through the provider. |
| Session price | Advisor's hourly rate × duration, rounded up to whole coins; charged at the payment deadline (5 minutes before the start). |
| Client cancels | Full refund if ≥ 60 min before start (`SESSION_CANCEL_FULL_REFUND_MINUTES`); later: `SESSION_LATE_CANCEL_REFUND_PERCENT` (default **100 %**). |
| Advisor / platform cancels | Full refund. |
| Paid session never started | Refunded in full after the join window (`SESSION_REFUND_UNSTARTED`, default on) — the platform cannot tell who failed to attend. |
| Advisor earnings | Held as "pending" until the session completes, then released. Refunds come out of pending earnings. **100 % of the session price goes to the advisor** — no platform fee is deducted today. No payouts to a bank account. |
| Delete account | Requires the password or an emailed one-time code. Refused while coins are held, earnings are pending, or a paid session has not happened. Deletes the profile and all personal data; **coin ledger entries and payment orders are kept** (linked only to an internal id) as financial records. |
| Reset data | Requires the same proof. Erases financial records; keeps profile, PIN, coin wallet, advisor bookings/chats, advisor profile and Vault. |
| Data export | Settings → Export: everything as JSON (re-importable) or transactions as CSV. |

## 2. Proposed clauses — Terms (end user / client)

**Coins.** KANAKU coins are a prepaid balance you can use only to pay for advisor
sessions in KANAKU. Coins have no cash value, cannot be transferred to another
user and cannot be withdrawn or exchanged for money. Coins are added to your
wallet only after our payment partner confirms your payment; if a payment is
confirmed late, the coins are added when the confirmation arrives.

**Buying coins.** Payments are processed by our payment partners (Razorpay,
PhonePe, Paytm). KANAKU does not receive or store your card number, UPI PIN or
bank credentials. If money leaves your account but coins do not appear within
[24 hours], contact support with the order reference shown in your wallet.

**Refund of unused coins.** [Owner decision: e.g. "Unused coins from a purchase
may be refunded to the original payment method within [N] days of purchase on
request."] Coins already spent on sessions are not refundable as money.

**Session payments and cancellations.** A session is paid in coins at its payment
deadline, 5 minutes before it starts. If you cancel at least [60 minutes] before
the start, all coins are returned. [Later cancellations: X % returned.] If the
advisor or KANAKU cancels, or a paid session does not take place, all coins are
returned to your wallet.

**Deleting your account.** You can delete your account at any time from your
profile after confirming it is you. Deletion is permanent. We cannot delete an
account that still holds coins, pending advisor earnings or a paid session that
has not yet taken place — use or cancel them first, or contact support. We keep
records of coin purchases and coin movements after deletion where the law
requires us to keep financial records; they are no longer linked to your name or
email.

## 3. Proposed clauses — Privacy Policy

- **Payment data:** we store order references, amounts, status and the payment
  partner's payment id; we never store card numbers, UPI PINs or bank passwords.
- **Financial records after deletion:** coin purchase and ledger records are
  retained for [the period required by law, e.g. 8 years under the Companies
  Act / GST rules — confirm with your accountant], identified only by an internal id.
- **Verification codes:** to confirm sensitive actions (deleting your account,
  resetting data) we may email you a one-time code.
- **Your data:** you can download all your data at any time (Settings → Export).

## 4. Decisions needed before launch

1. **No-shows.** The current Terms say "no refund" for a client no-show. The
   system cannot see who did not attend, so it refunds every unstarted paid
   session by default. Options: keep the refund (update the Terms), or set
   `SESSION_REFUND_UNSTARTED=false` so such sessions stay on hold for finance
   staff to decide case by case.
2. **Platform fee.** `TERMS_ADVISOR.md` says KANAKU keeps a platform fee
   (15–25 %). No fee is implemented — advisors receive the full price. Either
   remove the fee from the advisor terms for now, or have the fee built (a
   separate change to the coin ledger and the finance reports).
3. **Late-cancellation refund.** To match the current client Terms (24-hour
   notice, no refund later): `SESSION_CANCEL_FULL_REFUND_MINUTES=1440` and
   `SESSION_LATE_CANCEL_REFUND_PERCENT=0`.
4. **Taxes.** Whether GST applies at coin purchase or at session use, and the
   invoices users receive — confirm with an accountant.
5. **Regulation.** Coins stay closed-loop (no withdrawal, no transfer between
   users). Adding advisor cash-outs or user-to-user transfers needs advice on the
   RBI prepaid payment instrument rules first.

## 5. Pricing page (`PricingPage.tsx`) — when the wallet launches

Replace "no paid plans" style claims with: *"KANAKU is free to use. Sessions
with verified financial advisors are paid per session with KANAKU coins, which
you buy in the app."* Until the wallet is enabled, the current page is accurate.
