# Redis → Dragonfly Migration & Queue Architecture (v2.0)

Production-grade background-processing and cache architecture for Kanaku / Finora.
Replaces Upstash (per-command billing) with self-hosted Dragonfly, keeps BullMQ,
and makes PostgreSQL the single source of truth for notification delivery.

## 1. What changed

| Area | Before | After |
|------|--------|-------|
| Cache store | Upstash (per-command billing) | Self-hosted Dragonfly (flat cost) |
| Queue backend | BullMQ on shared `REDIS_URL` | BullMQ on its own logical DB (DB0) |
| Dead queues | `sync-operations` (no producer/consumer) | **removed** |
| Connections | `redisConnection` + unused `redisSubscriber` | single BullMQ connection; unused subscriber **removed** |
| Worker files | duplicate `email.worker.ts`/`push.worker.ts` (dead) | **removed**; one idempotent implementation |
| Notification delivery | direct send / ad-hoc enqueue | DB row → queue → worker → status (idempotent + DLQ) |
| Workload isolation | one Redis keyspace for everything | logical DBs: BullMQ/cache/session/rate-limit |

## 2. Logical database separation

Each workload resolves its own connection URL, falling back to `REDIS_URL` with a
logical DB index appended. See [`backend/src/config/redis-connections.ts`](../backend/src/config/redis-connections.ts).

| Workload | Env var | Logical DB | Used by |
|----------|---------|-----------|---------|
| BullMQ | `BULLMQ_REDIS_URL` | DB0 | queues + workers |
| Cache | `CACHE_REDIS_URL` | DB1 | response/profile cache, OTP, idempotency, socket identity |
| Sessions | `SESSION_REDIS_URL` | DB2 | idle-session + PIN-gate markers |
| Rate limit | `RATE_LIMIT_REDIS_URL` | DB3 | API throttling counters |

If a per-workload var is unset, it derives from `REDIS_URL` (e.g.
`redis://host:6379` → `redis://host:6379/2` for sessions). To scale horizontally,
point any workload's var at a **different** Dragonfly instance — no code change.

## 3. Migration steps

```bash
# 1. Bring up Dragonfly (+ Valkey fallback) locally
docker compose up -d dragonfly valkey

# 2. Point the backend at Dragonfly (DB indices auto-derived)
#    backend/.env
REDIS_URL=redis://localhost:6379
# (optional) override per workload — see .env.example

# 3. Apply the additive notification-lifecycle migration
cd backend
npx prisma migrate deploy        # applies 20260622000000_notification_lifecycle
npx prisma generate

# 4. Start the backend
npm run dev    # or: npm run build && npm start
```

The migration is **additive and non-destructive**: it adds `status`, `attempts`,
`nextRetryAt`, `errorMessage`, `sentAt`, `updatedAt` to `Notification`, keeps the
existing `deliveryStatus`/`channels`, and backfills historical rows to `sent` so
they are never reprocessed.

## 4. Notification reliability (PostgreSQL = source of truth)

Flow (see [`notification.dispatcher.ts`](../backend/src/features/notifications/notification.dispatcher.ts)
and [`workers/index.ts`](../backend/src/workers/index.ts)):

```
dispatchNotification()
  → write Notification row (status=pending)        [PostgreSQL]
  → enqueue email/push job carrying notificationId  [Dragonfly DB0]
      → worker: idempotency check (skip if channel already 'sent')
      → send via SendGrid / FCM
      → success: deliveryStatus[channel]='sent', status='sent', sentAt=now
      → failure: attempts++, status='retrying', nextRetryAt set, retry (exp backoff)
      → after 5 attempts: status='failed' + copy to <queue>-dlq (never dropped)
```

- **Idempotency (§12):** a job whose channel is already `sent` is skipped — no
  duplicate emails/pushes on retry or double-enqueue.
- **Dead-letter (§11):** exhausted jobs are copied to `email-notifications-dlq` /
  `push-notifications-dlq` with the original payload + failure reason.
- **States (§19):** `pending → processing → retrying → sent | failed`. Every
  failure is recorded (`errorMessage`, `attempts`) and recoverable from the DLQ.

### Standard job policy (§10) — `STANDARD_JOB_OPTIONS` in `config/queue.ts`
`attempts: 5`, `backoff: exponential @ 5000ms`, `removeOnComplete: true`,
`removeOnFail: false`.

## 5. Monitoring (§13)

`GET /api/v1/health/queues` (admin only) returns per queue:
job counts (waiting/active/completed/failed/delayed), queue depth, worker health
+ concurrency, average processing time, and dead-letter queue size. See
[`workers/queue-monitor.ts`](../backend/src/workers/queue-monitor.ts).

## 6. Production Dragonfly hardening (§16/§17)

The repo `docker-compose.yml` is a **local** stack (loopback-only ports, optional
password). For production:

```yaml
dragonfly:
  image: docker.dragonflydb.io/dragonflydb/dragonfly:latest
  restart: unless-stopped
  command:
    - "--dir"
    - "/data"
    - "--dbfilename"
    - "dump"
    - "--snapshot_cron"
    - "*/10 * * * *"
    - "--requirepass"
    - "${DRAGONFLY_PASSWORD}"   # REQUIRED — strong random secret
  volumes:
    - dragonfly_data:/data
  networks: [internal]          # internal-only; NO host `ports:` mapping
  ulimits: { memlock: -1 }
```

Requirements: password auth (`DRAGONFLY_PASSWORD`, strong random), internal
network only (no public exposure), persistent volume, `restart: unless-stopped`.
With auth on, set `REDIS_URL=rediss?://default:<password>@<host>:6379`.

## 7. Acceptance-criteria status

| Criterion | Status |
|-----------|--------|
| Upstash removed (Dragonfly primary) | ✅ env/docs point at Dragonfly |
| Dragonfly persistence + password + restart | ✅ compose (`--requirepass`, volume, `unless-stopped`) |
| BullMQ retained | ✅ |
| `sync-operations` removed | ✅ |
| Unused Redis subscriber removed | ✅ |
| Retry + exponential backoff | ✅ `STANDARD_JOB_OPTIONS` |
| Dead-letter queues | ✅ per-queue DLQ + `moveToDeadLetter` |
| PostgreSQL source of truth | ✅ lifecycle fields + dispatcher |
| Notification status lifecycle | ✅ pending→processing→retrying→sent/failed |
| Idempotent delivery (no duplicates) | ✅ per-channel `sent` guard |
| No notification silently lost | ✅ DLQ + `failed` state |
| Logical DB separation | ✅ DB0–DB3 + per-workload env vars |
| Cache / Session / Rate-limit on Dragonfly | ✅ purpose clients |
| Queue metrics / failed / retry / worker / DLQ visible | ✅ `/api/v1/health/queues` |
| Separate workers for reports/cleanup/ai/receipts | ⏳ deferred — see below |

## 8. Deferred (intentionally — avoids dead infrastructure, §20)

Per the agreed decisions, we did **not** pre-create queues with no producers:

- **reports / receipts / ai-processing queues** — added when a real producer
  exists. The generic factory (`getQueue` + `moveToDeadLetter` + monitoring)
  already supports them; wiring is a few lines each.
- **cleanup / AI batch** — remain on `node-cron` / `setInterval` (Postgres-only,
  zero Redis cost), as agreed.
- **~30 direct `prisma.notification.create` sites** — these create **app-only**
  rows, which are delivered the moment they exist. Because `status` defaults to
  `'sent'`, they are already correct without any change (no "stuck pending"
  rows). New code that needs an **email/push** channel should use
  `dispatchNotification()` so it inherits the lifecycle/idempotency/DLQ
  guarantees; converting the existing app-only sites is optional cleanup, not a
  correctness requirement.
