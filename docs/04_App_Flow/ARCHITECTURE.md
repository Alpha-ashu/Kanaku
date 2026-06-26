# Finora / Kanaku — System Architecture

A local‑first personal‑finance app. The client keeps an encrypted working set on
device (Dexie, PIN‑protected) and syncs through a backend‑for‑frontend (BFF) API.
The backend owns identity (issues its own JWT), enforces the PIN server‑side, and
talks to Postgres and a few external providers. **There is no Redis or queue
broker:** cache, rate‑limiting and session state run in‑process, and async
notification delivery runs off a PostgreSQL outbox drained by `node-cron`.

The backend runs as **two Fly process groups from one image** — a public **`api`**
process and a non‑public **`worker`** process (background jobs only) — and is
fronted by a dedicated **observability machine** (self‑hosted Loki + Grafana +
Prometheus + Vector). Every request carries a **`requestId`** that flows through
structured **Pino** logs and the immutable **audit** trail. Each process
**validates its configuration at startup and refuses to boot on missing required
config** ([`config/env.ts`](../../backend/src/config/env.ts)).

> Companion: [SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md) — communication flows
> for Login, PIN, Sync, and Account Aggregator.

## Component diagram

```mermaid
flowchart TB
  subgraph CLIENTS["Clients"]
    Web["Web · React 18 + Vite SPA (Workbox SW)"]
    Android["Android · Capacitor 8 (AAB)"]
  end

  subgraph VERCEL["Vercel — static SPA host + edge"]
    direction TB
    CDN["Static SPA bundle (Vite build)"]
    Edge["Rewrites (vercel.json):<br/>/api/v1/stocks → serverless fn<br/>/api/* · /health · /socket.io → Fly backend"]
    Fn["Serverless fn — market data"]
  end

  subgraph BACKEND["Backend — Fly.io 'kanaku' · region sin · Node 22 + Express 4 + TS<br/>two process groups from one image"]
    direction TB
    subgraph APIPROC["api process (public · RUN_WORKERS_IN_API=false)"]
      MW["Middleware — global: requestId → timeout → metrics → helmet/CSP → CORS → sanitize → rateLimit<br/>per-route: auth (JWT + idle-session) → pinGate → validate (Zod)"]
      Feat["Feature routers — MVP always-on +<br/>phase-gated (advisor · payments · aa)"]
      InMem["In-process stores:<br/>cache · rate-limit · idle/PIN markers"]
      WS["Socket.IO (realtime)"]
    end
    subgraph WORKERPROC["worker process (no public port)"]
      Outbox["Notification outbox drainer<br/>(node-cron, every 15s) + AI + cleanup jobs"]
    end
    Prisma["Prisma ORM (audit interceptor → immutable AuditLog)"]
  end

  subgraph OBS["Observability — Fly.io 'kanaku-observability' (Machine 3)"]
    direction TB
    Vector["Vector — ships api+worker stdout (Pino JSON) over 6PN"]
    Loki["Loki — log store (14d)"]
    Prom["Prometheus — scrapes /metrics:9091 over 6PN"]
    Graf["Grafana — dashboards + multi-channel alerting<br/>(Loki + Prometheus only · no DB)"]
  end

  subgraph DATA["Data"]
    PG[("PostgreSQL · Supabase<br/>48 models · pooler 6543 / direct 5432<br/>+ notification outbox rows + immutable AuditLog")]
  end

  subgraph EXTERNAL["External services"]
    SbAuth["Supabase Auth (GoTrue)<br/>credential backend"]
    SbStore["Supabase Storage<br/>avatars · bills"]
    SG["SendGrid — email"]
    FCM["Firebase FCM/APNS — push"]
    Setu["Setu — RBI Account Aggregator"]
    AIp["Google Gemini · OCR (Tesseract)"]
    Mkt["Market-data API"]
  end

  Web --> CDN
  CDN -- "/api/* (same-origin)" --> Edge
  Android -- "direct HTTPS (cross-origin, x-client-platform: native)" --> MW
  Edge -- "/api/v1/stocks" --> Fn --> Mkt
  Edge -- "/api/* · /socket.io · /health" --> MW

  MW --> Feat --> Prisma --> PG
  Feat <--> InMem
  Feat <--> WS
  WS -. "realtime events" .-> Web
  Feat -- "verify credentials" --> SbAuth
  Feat -- "signed URLs / uploads" --> SbStore
  Feat -- "consent + data fetch" --> Setu
  Setu -- "HMAC webhook" --> Feat
  SG -- "delivery webhook" --> Feat
  Feat -- "categorize · scan · insights" --> AIp

  Feat -- "write Notification row (status=pending)" --> PG
  Outbox -- "poll due rows" --> PG
  Outbox -- "email" --> SG
  Outbox -- "push" --> FCM

  APIPROC -. "stdout · Pino JSON" .-> Vector
  WORKERPROC -. "stdout · Pino JSON" .-> Vector
  Vector --> Loki
  Prom -. "scrape /metrics:9091 (6PN)" .-> APIPROC
  Prom -. "scrape /metrics:9091 (6PN)" .-> WORKERPROC
  Graf --> Loki
  Graf --> Prom
```

## Request lifecycle

1. **Edge routing.** The web SPA is served from Vercel; its API calls are
   same‑origin and routed by `vercel.json`: `/api/v1/stocks` is answered by a
   Vercel **serverless function** (market data), while `/api/*`, `/health` and
   `/socket.io` are reverse‑proxied to the Fly backend. The **Capacitor** app
   calls the Fly backend **directly** (cross‑origin, `x-client-platform: native`).
2. **Auth transport.** The client sends the backend's short‑lived **access JWT**
   (`Authorization: Bearer …`); web additionally carries the **HttpOnly refresh
   cookie** (same‑origin via the proxy). Native clients refresh over a header
   rather than the cross‑site cookie.
3. **Middleware (global).** request id → hard timeout → metrics → Helmet + a
   per‑request CSP nonce → CORS allowlist → body sanitization → in‑memory
   rate‑limit.
4. **Middleware (per route).** `authMiddleware` verifies the JWT **and** enforces
   the sliding **idle‑session** window; `pinGate` gates financial routes on a live
   PIN unlock (when enabled); Zod validates the body.
5. **Handler.** The feature router runs business logic through **Prisma** against
   **PostgreSQL**, using the in‑process cache where helpful, and emits side
   effects: realtime events over **Socket.IO**, signed Storage URLs, AA / AI calls,
   and a **Notification** row (`status='pending'`) for any async email/push.
6. **Delivery.** The outbox drainer (an independent `node-cron` loop) delivers
   those notifications out of band.

## Notification delivery — PostgreSQL outbox (replaces BullMQ/Redis)

```mermaid
sequenceDiagram
  participant R as Feature router
  participant DB as PostgreSQL
  participant D as Outbox drainer (node-cron 15s)
  participant P as SendGrid / FCM

  R->>DB: INSERT Notification (status='pending', deliveryStatus email/push='queued')
  Note over R: returns immediately — no broker
  loop every 15s · batch of 25
    D->>DB: SELECT where status in (pending,retrying) AND nextRetryAt<=now
    D->>DB: status='processing' (idempotent per channel)
    D->>P: send email / push
    alt success
      P-->>D: ok
      D->>DB: deliveryStatus[ch]='sent', status='sent', sentAt=now
    else failure & attempts<MAX(5)
      P-->>D: error
      D->>DB: status='retrying', attempts++, nextRetryAt=now+backoff(2^n)
    else attempts exhausted
      D->>DB: deliveryStatus[ch]='failed', status='failed'  (queryable dead-letter)
    end
  end
```

Tunable via env (all optional): `NOTIFICATION_OUTBOX_CRON` (default `*/15 * * * * *`),
`NOTIFICATION_OUTBOX_BATCH` (25), `NOTIFICATION_MAX_ATTEMPTS` (5),
`CACHE_MAX_ENTRIES` (50000). Source: [`workers/index.ts`](../../backend/src/workers/index.ts).

## Tech stack

| Layer | Technology |
|---|---|
| **Web client** | React 18 + Vite SPA, TypeScript 5, React Router 7; MUI 7 + Radix UI + Tailwind 4; Recharts, React Hook Form, Framer Motion; Dexie 4 (encrypted IndexedDB), Workbox service worker, `socket.io-client`, `axios` |
| **Mobile** | Capacitor 8 → Android AAB (wraps the same SPA) |
| **Frontend host** | Vercel — serves the static SPA, runs a serverless function for market data (`/api/v1/stocks`), and same‑origin reverse‑proxies `/api/*`, `/health`, `/socket.io` to the Fly backend |
| **Backend runtime** | Node.js 22 (Alpine, multi‑stage Docker, non‑root), Express 4, TypeScript 5 |
| **API security** | JWT HS256 (`jsonwebtoken` / `jose`), Helmet + per‑request CSP nonce, CORS allowlist, Zod validation, body sanitization, in‑memory rate‑limiting, server‑side PIN gate + idle‑session, `Idempotency-Key` support |
| **ORM / database** | Prisma 6 → **PostgreSQL (Supabase)** — 48 models, pooler `:6543` (app) / direct `:5432` (migrations) |
| **In‑process stores** | bounded TTL cache, rate‑limit buckets, idle/PIN session markers — **no Redis** (single instance) |
| **Realtime** | Socket.IO 4 (proxied through Vercel for web; direct for native) |
| **Background jobs** | `node-cron` — notification **outbox drainer**, nightly cleanup + GDPR hard‑delete sweep, AI background jobs |
| **Email / push** | SendGrid (`@sendgrid/mail`); Firebase Admin / FCM + APNS — both delivered via the Postgres outbox |
| **Identity / storage** | Supabase Auth (GoTrue) as the server‑side credential backend; Supabase Storage (avatars, bills, signed URLs) |
| **AI / OCR** | Google Gemini (`@google/generative-ai`), Tesseract.js + `sharp`, `pdf-parse`; guarded by circuit breakers |
| **Open Banking** | Setu — RBI Account Aggregator (consent + HMAC webhooks; AES‑256‑GCM at rest) |
| **Logging** | **Pino** structured JSON on stdout (Winston‑compatible facade so call sites are unchanged); auto‑injected `requestId` + `service`; deep‑redacted; rotating on‑box file + shipped to Loki |
| **Observability** | Self‑hosted **Loki + Grafana + Prometheus + Vector** on a dedicated Fly app `kanaku-observability` (Machine 3); Prometheus scrapes `:9091/metrics` over 6PN; Grafana dashboards + multi‑channel alerting; Grafana has **no production‑DB path** (audit visibility comes from the `[AUDIT]` log stream). `/api/v1/health/*` JSON probes remain. Tracing is **OpenTelemetry‑ready** (see [OPENTELEMETRY_READINESS.md](./OPENTELEMETRY_READINESS.md)) |
| **Config validation** | Centralized startup validation per process — [`config/env.ts`](../../backend/src/config/env.ts) (Node, zod + service‑aware required/recommended manifest) and `platform/observability/validate-config.sh` (the observability container pre‑flight). Missing **required** config ⇒ the service refuses to boot |
| **Backend host** | Fly.io — app `kanaku`, region `sin`, shared‑cpu‑1x / 1 GB; **two process groups** (`api` public + `worker` non‑public) from one image |
| **CI/CD** | GitHub Actions → `flyctl deploy` (backend); Vercel auto‑deploy (frontend) |

## API surface

All routes are under `/api/v1`. Public liveness: `GET /health`. Authenticated
diagnostics: `GET /api/v1/health/deep` (database + circuit breakers + crypto — no
Redis/queue health; those were removed). Admin: `GET /api/v1/health/metrics`.

- **Always mounted (MVP):** `auth`, `avatars`, `webhooks`, `sync`, `pin`,
  `transactions`, `accounts`, `goals`, `loans`, `settings`, `friends`,
  `investments`, `todos`, `groups`, `categorize`, `learn`, `voice`, `import`,
  `ai`, `receipts`, `notifications`, `devices`, `bills`, `dashboard`, `admin`,
  `stocks`, `otp`, `recurring`, `budgets`, `gold`, `collaborations`.
- **Phase‑gated** (deferred → 404 unless opted in via `ENABLED_MODULES`):
  `advisor` → `bookings`/`advisors`/`sessions`; `payments` → `payments`;
  `aa` → `aa`. This keeps regulated/unfinished endpoints unreachable in
  production even though the code ships in the repo. Source:
  [`routes/index.ts`](../../backend/src/routes/index.ts).
- **Edge‑served:** in production `/api/v1/stocks` is answered by the Vercel
  serverless function, not the Fly router (see `vercel.json`).

## Notes

- **Identity is backend‑managed (BFF).** The client only ever holds the backend's
  **HS256 JWT** (15‑min access + 7‑day refresh as an HttpOnly cookie). Supabase Auth
  is used *server‑side* as the credential backend; the client never receives a
  Supabase token for API auth.
- **The PIN is a real server‑side control** (when `PIN_GATE_ENABLED=true`): financial
  routes and private profile fields require a live, server‑recorded PIN unlock,
  enforced by the `pinGate` middleware — not just a client lock.
- **Local‑first:** the encrypted Dexie store is the working set; the backend is the
  sync source of truth. Nothing financial is fetched before PIN unlock.
- **No Redis / queue broker.** Cache, rate‑limiting and the idle/PIN session markers
  all run **in‑process**, so a provider quota can't take login down. Async email/push
  is a **PostgreSQL outbox**: producers write a `Notification` row at
  `status='pending'`; the `node-cron` drainer ([`workers/index.ts`](../../backend/src/workers/index.ts))
  polls due rows, sends via SendGrid/FCM, and drives
  `pending → processing → sent | retrying | failed` with exponential backoff. A row
  that exhausts its retries rests at `status='failed'` — the queryable dead‑letter
  equivalent (the `Notification @@index([status, nextRetryAt])` powers the sweep).
- **API / worker split.** One image, two Fly process groups. The public **`api`**
  process serves HTTP + Socket.IO and (with `RUN_WORKERS_IN_API=false`) runs **no**
  background jobs; the non‑public **`worker`** process owns the outbox drainer, AI
  and cleanup jobs, so a slow/failing job can never affect API responsiveness. The
  default (flag unset) keeps jobs in the API process for local/single‑machine runs
  — behaviour‑preserving. Both expose `/metrics:9091` on the private 6PN; the
  worker also serves an internal `/health` for Fly checks. See
  [`config/serviceRole.ts`](../../backend/src/config/serviceRole.ts).
- **Single API instance.** The in‑memory stores (cache / rate‑limit / idle‑PIN
  markers) live in the **`api`** process and assume one instance
  (`min_machines_running = 1`, auto‑stop off). Horizontal scaling would require
  re‑homing that state to a shared store. The worker holds no such state.
- **Fail‑fast configuration.** Every process validates its configuration at
  startup ([`config/env.ts`](../../backend/src/config/env.ts) for Node;
  `validate-config.sh` for the observability container) and **refuses to boot** when
  a required value is missing or malformed — `recommended` values only degrade a
  feature (push, AA) and warn. This turns silent misconfiguration into an
  immediate, explained startup failure.
- **Observability & audit.** Structured Pino logs and Prometheus metrics flow to
  the self‑hosted Machine 3 stack; the Prisma audit interceptor writes an
  **immutable** `AuditLog` row (append‑only trigger) and a redacted `[AUDIT]` log
  line per financial mutation. Distributed tracing is prepared but not yet enabled
  ([OPENTELEMETRY_READINESS.md](./OPENTELEMETRY_READINESS.md)).
- **Module phasing.** Deferred regulated modules stay unmounted unless
  `ENABLED_MODULES` opts them in; MVP modules are always mounted.

> ⚠️ Verify Supabase **Row‑Level Security** is enabled on the data tables — the
> publishable key + project URL are public by design, so RLS is the real guard.
