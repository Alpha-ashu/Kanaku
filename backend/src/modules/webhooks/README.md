# webhooks module

> Inbound webhooks from external providers (e.g. SendGrid) — public.

**Base path:** `/api/v1/webhooks`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/webhooks/sendgrid` | public | `receiveSendGridEvents` |

## Files

- `README.md`
- `webhook.controller.ts`
- `webhook.routes.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `webhooks/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
