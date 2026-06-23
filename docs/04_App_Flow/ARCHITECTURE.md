# Finora / Kanaku — System Architecture

A local‑first personal‑finance app. The client keeps an encrypted working set on
device (Dexie, PIN‑protected) and syncs through a backend‑for‑frontend (BFF) API.
The backend owns identity (issues its own JWT), enforces the PIN server‑side, and
talks to Postgres and a few external providers. There is no Redis: cache,
rate‑limiting and session markers are in‑process, and notification delivery runs
off a PostgreSQL outbox (see Notes).

> Companion: [SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md) — communication flows
> for Login, PIN, Sync, and Account Aggregator.

## Component diagram

```mermaid
flowchart TB
  subgraph CLIENTS
    Web["Web · React + Vite"]
    Android["Android · Capacitor (AAB)"]
  end

  subgraph FRONTEND["Frontend — Vercel"]
    direction TB
    UI["React UI"]
    Ctx["AuthContext · SecurityContext · AppContext"]
    Apic["api.ts · TokenManager (backend JWT)"]
    Dexie[("Dexie · encrypted local store")]
    SyncE["Sync engine (offline-first)"]
  end

  subgraph BACKEND["Backend — Fly.io app kanaku · single instance"]
    direction TB
    MW["Middleware chain:<br/>auth → pinGate → rateLimit → idleSession → validate"]
    Feat["Feature routers:<br/>auth · pin · sync · settings · accounts · transactions ·<br/>investments · loans · goals · budgets · recurring · tax · gold ·<br/>dashboard · advisors · payments · collaboration · ai · receipts · aa · admin"]
    Cache["In-process cache · rate-limit ·<br/>idle/PIN session markers (in-memory)"]
    Outbox["Notification outbox drainer<br/>(node-cron, polls Postgres) · email · push"]
    Prisma["Prisma ORM"]
  end

  subgraph DATA
    PG[("PostgreSQL · Supabase<br/>~50 models · pooler 6543 / direct 5432<br/>+ notification outbox (delivery rows)")]
  end

  subgraph EXTERNAL
    SbAuth["Supabase Auth (GoTrue)<br/>credential backend"]
    SbStore["Supabase Storage<br/>avatars · bills"]
    Setu["Setu — RBI Account Aggregator"]
    SG["SendGrid (email)"]
    AIp["AI / OCR providers"]
  end

  Web --> UI
  Android --> UI
  UI --> Ctx --> Apic
  UI <--> Dexie
  SyncE <--> Dexie
  Apic -- "Bearer JWT + refresh cookie" --> MW
  SyncE -- "/sync/pull, /sync/push" --> MW

  MW --> Feat --> Prisma --> PG
  Feat <--> Cache
  Feat -- "verify credentials" --> SbAuth
  Feat -- "signed URLs / uploads" --> SbStore
  Feat -- "consent + data fetch" --> Setu
  Setu -- "HMAC webhook" --> Feat
  Outbox -- "poll pending rows" --> PG
  Outbox -- "email / push" --> SG
  Feat -- "categorize / scan / insights" --> AIp
```

## Notes

- **Identity is backend‑managed (BFF).** The client only ever holds the backend's
  **HS256 JWT** (15‑min access + 7‑day refresh as an HttpOnly cookie). Supabase Auth
  is used *server‑side* as the credential backend; the client never receives a
  Supabase token for API auth.
- **The PIN is a real server‑side control** (when `PIN_GATE_ENABLED=true`): financial
  routes and private profile fields require a live, server‑recorded PIN unlock — not
  just a client lock. See the PIN sequence.
- **Local‑first:** the encrypted Dexie store is the working set; the backend is the
  sync source of truth. Nothing financial is fetched before PIN unlock.
- **No Redis.** Cache, rate‑limiting and the idle/PIN session markers all run
  **in‑process** (single Fly machine), so a provider quota can't take login down.
  Notification email/push delivery is a **PostgreSQL outbox**: producers write a
  `Notification` row at `status='pending'`; a `node-cron` drainer
  (`workers/index.ts`) polls due rows, sends via SendGrid/FCM, and drives
  `pending → processing → sent | retrying | failed` with exponential backoff. A
  row that exhausts its retries rests at `status='failed'` — the queryable
  dead‑letter equivalent (the `Notification @@index([status, nextRetryAt])`
  powers the sweep). No queue broker (BullMQ/Redis) is involved.
- **Single backend instance** — the in‑memory stores assume one Fly machine.

> ⚠️ Verify Supabase **Row‑Level Security** is enabled on the data tables — the
> publishable key + project URL are public by design, so RLS is the real guard.
