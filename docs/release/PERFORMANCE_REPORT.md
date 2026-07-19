# Kanaku — Performance Report (Beta Audit, 2026-07-19)

## 1. API latency vs targets

Target: P95 < 300 ms per API call; dashboard < 1 s.

Latest recorded benchmark (`quality/performance/benchmark_results.json`, local server +
staging DB, 10–15 iterations/endpoint):

| Endpoint | P50 | P95 | SLA | Verdict |
|---|--:|--:|--:|:-:|
| POST /auth/login (bcrypt-bound by design) | 366 ms | 1185 ms | 2000 ms | ✅ |
| GET /dashboard/summary | 4 ms | 7 ms | 1000 ms | ✅ |
| GET /dashboard/cashflow | 3 ms | 6 ms | 1000 ms | ✅ |
| GET /accounts | 4 ms | 5 ms | 500 ms | ✅ |
| GET /transactions | 3 ms | 5 ms | 500 ms | ✅ |
| GET /todos | 3 ms | 5 ms | 500 ms | ✅ |

Phase 9.5 `scale_benchmark.cjs` additionally covers seeded-volume reads (500+ txns),
write latency, and N concurrent writes with DB lock/queue observation. Re-run before GA
against the production-shaped environment; local numbers demonstrate headroom, not
production truth (network RTT to Supabase dominates in prod).

## 2. Backend efficiency mechanisms (verified in code)

- Composite indexes matched to hot queries (see DATABASE_ARCHITECTURE.md) — dashboard,
  category breakdown, account statements all index-served.
- User-scoped Redis response cache on accounts/transactions/goals/loans reads (TTL 30–180 s)
  with hit-rate metrics; graceful no-Redis fallback.
- Pagination enforced everywhere (max 100/page; 5000 hard cap for sync pulls).
- Aggregations pushed to SQL (`groupBy`/`aggregate`), not JS loops over rows.
- pgbouncer connection pooling; per-request timeout; circuit breakers on external calls.
- In-process metrics: per-route counters + P50/P95/P99, exposed at `/api/v1/health/metrics`
  (admin) and Prometheus `/metrics` for Grafana dashboards.

## 3. Frontend

- Production build verified: initial JS ≈ **182 KB gzip**; heavy vendors (pdf 133 KB,
  pdfgen 184 KB, charts 115 KB, supabase 55 KB gzip) are separate lazy chunks.
- All ~45 pages lazy-loaded; admin chunks compiled out of the user surface entirely.
- Offline-first Dexie reads make page interactions local (no network on the critical path);
  static assets served immutable from Vercel edge.
- Improvement backlog (non-blocking): split the 636 KB (pre-gzip) index chunk further;
  virtualize very long transaction lists.

## 4. Caching & sync freshness

Server response cache is **user-scoped** (no cross-user leakage — key = prefix:userId:path:query)
and TTL-bounded (30–180 s). There is **no push invalidation on mutation**; the design relies on
the offline-first model: the UI reads its own Dexie copy (updated synchronously on mutation)
and reconciles via `/sync` + Socket.IO events, so users see their writes immediately.
Residual staleness window applies only to cold cross-device REST reads (≤ TTL).
**Recommendation (post-beta):** call `cacheDeleteByPrefix`/`cacheDeleteByUserId` in the
mutation paths of the four cached modules to close that window entirely.

## 5. Horizontal scale readiness

Stateless API (JWT; no server session affinity) → N instances behind a load balancer work
today, with these single-instance assumptions to lift before scaling out (documented in
KNOWN_LIMITATIONS.md): in-memory rate-limit counters, 60 s auth-snapshot cache, in-memory
metrics registry (per-instance scrape is fine for Prometheus), and Socket.IO room state
(needs the Redis adapter for multi-instance).

## 6. Load-test posture

`scale_benchmark.cjs` (seed → benchmark → concurrent writes → integrity → cleanup) is the
supported load harness; run it against staging before each release. Concurrency phase
asserts zero failed writes and zero waiting DB locks.
