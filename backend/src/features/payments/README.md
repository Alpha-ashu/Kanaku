# payments module

> Payment processing and settlement (includes provider webhook).

**Base path:** `/api/v1/payments`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/payments/webhook` | auth | `PaymentController.handleWebhook` |
| GET | `/payments` | auth | `PaymentController.getPayments` |
| GET | `/payments/:id` | auth | `PaymentController.getPayment` |
| POST | `/payments/initiate` | auth, validated | `PaymentController.initiatePayment` |
| POST | `/payments/complete` | auth, validated | `PaymentController.completePayment` |
| POST | `/payments/fail` | auth, validated | `PaymentController.failPayment` |
| POST | `/payments/refund` | auth, validated | `PaymentController.refundPayment` |

## Files

- `payment.controller.ts`
- `payment.routes.ts`
- `payment.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `payments/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
