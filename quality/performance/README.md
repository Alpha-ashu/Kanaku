# Quality · Performance

Load, latency, and resource testing.

## Targets (from deploy configs)
- Fly.io: 1 vCPU / 1 GB, `hard_limit=1000` connections, `soft_limit=800` (`fly.toml`).
- Health check: `GET /health` every 15s.
- Metrics: Prometheus on `:9091/metrics`.

## Suggested tooling
| Concern | Tool |
|---|---|
| HTTP load | `k6` or `autocannon` |
| Sustained soak | `k6` scenarios |
| Frontend bundle/perf | Lighthouse CI, Vite bundle analyzer |
| DB query perf | add `backend/tests/integration/query-performance.test.ts` (Jest + test DB) |

## Budgets (proposed)
- p95 API latency < 300 ms under 500 rps.
- Cold start (Fly auto-start) < 3 s.
- Frontend LCP < 2.5 s on mid-tier mobile.

> Put runnable perf scripts here once added; wire into CI as a non-blocking job first.

