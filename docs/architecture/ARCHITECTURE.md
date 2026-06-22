# Finora / Kanaku — System Architecture

A local‑first personal‑finance app. The client keeps an encrypted working set on
device (Dexie, PIN‑protected) and syncs through a backend‑for‑frontend (BFF) API.
The backend owns identity (issues its own JWT), enforces the PIN server‑side, and
talks to Postgres, Redis, and a few external providers.

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
    Workers["BullMQ workers:<br/>email · push · sync"]
    Prisma["Prisma ORM"]
  end

  subgraph DATA
    PG[("PostgreSQL · Supabase<br/>~50 models · pooler 6543 / direct 5432")]
    Redis[("Redis-wire cache + queues<br/>chain: Upstash → Dragonfly → Valkey<br/>+ in-memory fallback")]
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
  Feat <--> Redis
  Workers <--> Redis
  Feat -- "verify credentials" --> SbAuth
  Feat -- "signed URLs / uploads" --> SbStore
  Feat -- "consent + data fetch" --> Setu
  Setu -- "HMAC webhook" --> Feat
  Workers -- "send" --> SG
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
- **Resilience:** the cache layer fails over down a priority chain of Redis‑wire
  stores and ultimately to in‑memory, so a provider quota can't take login down.
  *(BullMQ queues use `REDIS_URL` only.)*
- **Single backend instance** — the in‑memory fallbacks assume one Fly machine.

> ⚠️ Verify Supabase **Row‑Level Security** is enabled on the data tables — the
> publishable key + project URL are public by design, so RLS is the real guard.
