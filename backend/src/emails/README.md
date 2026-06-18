# Emails module

One home for transactional email: the SendGrid provider, branded templates, and
intent-named send services. Previously the provider and an HTML template were
duplicated between `utils/email.ts` and the email worker — both now route through
this module.

```
emails/
├── providers/sendgrid.provider.ts   # SendGrid transport + sender identity (sendEmail)
├── templates/layout.ts              # shared branded card + escapeHtml + emailButton
├── templates/index.ts               # render* template functions → { subject, html }
├── services/email.service.ts        # intent-named senders per event
└── index.ts                         # barrel
```

> Located at `src/emails/` so it compiles inside the backend's `rootDir: ./src`.
> The async **job** (BullMQ) lives at [`../workers/email.worker.ts`](../workers/email.worker.ts) and now renders via this module.

## Email events (§8)

| Event | Service | Template | Status |
|---|---|---|---|
| Welcome (after registration) | `sendWelcomeEmail(to, name?)` | `renderWelcomeEmail` | **wired** — best-effort in `auth.controller` register |
| Role assigned | `sendRoleAssignedEmail(to, role, name?)` | `renderRoleAssignedEmail` | **wired** — best-effort on advisor approval (`advisor.controller`) |
| Password reset | `sendPasswordResetEmail(to, resetUrl, name?)` | `renderPasswordResetEmail` | template ready — under Option A, Supabase Auth handles reset emails natively |
| Account verification | `sendVerificationEmail(to, verifyUrl, name?)` | `renderVerificationEmail` | template ready — under Option A, Supabase Auth handles verification natively |
| In-app notification | `sendNotificationEmail({ to, title, message, … })` | `renderNotificationEmail` | **live** via the email worker |
| OTP delivery | `sendEmail(...)` (in `otp.service`) | inline | live |
| Collaboration invitation | `sendEmail(...)` (in `invitation.service`) | inline | live |

The four event templates above are provided as ready-to-use building blocks; wiring
them into their flows (e.g. `sendWelcomeEmail` in registration) is a deliberate
follow-up because it changes behavior and depends on a verified sender.

## Usage

```ts
import { sendWelcomeEmail, sendPasswordResetEmail } from '../emails';

await sendWelcomeEmail(user.email, user.name);
await sendPasswordResetEmail(user.email, resetUrl, user.name);
```

Sends are **best-effort**: services resolve to `false` (never throw) when SendGrid
isn't configured, so they never block the underlying operation.

## Configuration

| Env var | Purpose |
|---|---|
| `SENDGRID_API_KEY` | Enables sending. When unset, all sends are skipped (logged) and return `false`. |
| `SENDGRID_FROM_EMAIL` | Verified sender address (default fallback only for dev). |
| `SENDGRID_FROM_NAME` | Sender display name (default `Kanaku`). |
| `FRONTEND_URL` | Base URL used to build links/buttons in emails. |

> ⚠️ **Delivery caveat:** SendGrid will not deliver until the configured
> `SENDGRID_FROM_EMAIL` is a **verified sender** in the SendGrid dashboard.
> Until then, sends may be skipped/rejected regardless of this module.

## Inbound events

Delivery/open/bounce events come back via the SendGrid Event Webhook — see
[`../modules/webhooks`](../modules/webhooks/README.md). Use `customArgs` on a send
to correlate events back to a notification/invitation.
