# Tech Stack — Kanaku (Authoritative, June 2026)

> Mirrors `KANAKU_PROJECT_OVERVIEW.md` §B. Versions reflect the live codebase.

## Frontend
| Concern | Choice |
|---|---|
| Framework | React 18.3 (concurrent, Suspense) |
| Language | TypeScript 5.x (`strict`, no `any` in new code) |
| Build | Vite 5/6 (per-route code-splitting) |
| Styling | TailwindCSS 3 + shadcn/ui + Framer Motion (glassmorphic) |
| Routing | React Router 6 (lazy routes) |
| State | React Context + `useReducer` + Zustand (local stores) |
| Local DB | Dexie 4 (IndexedDB) + `dexie-cloud-addon`, schema **v15** |
| Network | `fetch` + custom `apiClient` (retry, dedupe, JWT refresh) |
| Realtime | Socket.IO client (user-scoped) + Supabase Realtime fallback |
| Mobile | Capacitor 6/8 (Android first; iOS scaffold) — Camera, Filesystem, Preferences, Speech |
| Charts | Recharts |
| Forms | React Hook Form + Zod 3 (shared schemas) |
| OCR | Tesseract.js 5 (WASM) + Gemini 1.5 Flash fallback |
| Voice | Web Speech API + Capacitor Speech + Gemini NLP |
| Testing | Vitest + React Testing Library + Playwright |

## Backend
| Concern | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Language | TypeScript 6 (strict) |
| Framework | Express 4 (modular feature routers) |
| ORM/DB | Prisma 6.19.2 + PostgreSQL 16 (Fly prod / Docker dev / Supabase) |
| Cache | Redis 7 (Upstash prod) — OTP, JWT denylist, feature-gate cache, idempotency, rate-limit |
| Auth | Supabase identity + custom JWT (HS256) — multi-strategy verify |
| Realtime | Socket.IO 4 + Supabase Realtime |
| Validation | Zod 3 middleware (`validateBody/Query/Params`) |
| Logging | Winston (JSON) + Morgan |
| Security | Helmet 7, CORS allow-list, express-rate-limit (Redis store), global body sanitiser |
| Workers | Recurring posting, AA polling, notification fan-out |
| AI (OCR) | Tesseract (text) + Gemini 1.5 Flash (structuring) + `receipt_ai` FastAPI fallback |
| Email/SMS | Resend (email) + MSG91/Twilio (OTP) |
| Account Aggregator | Setu AA (RBI-licensed) |
| Tests | Jest 30 + Supertest |

## Data layer
| Layer | Where | Purpose |
|---|---|---|
| PostgreSQL | Fly/Docker/Supabase | System of record (48 models) |
| Redis | Upstash/Docker | OTP TTL, refresh denylist, feature-gate cache, idempotency, rate limit |
| Dexie (IndexedDB) | Browser/WebView | Local-first mirror, schema v15, per-row `syncStatus` |
| Supabase Storage | Cloud bucket | Receipt images, KYC docs, avatars |
| dexie-cloud | Managed | User-scoped delta sync |

## DevOps / Hosting
| Concern | Choice |
|---|---|
| FE hosting | Vercel |
| BE hosting | Fly.io (multi-region) |
| DB hosting | Fly Postgres (HA) / Supabase |
| Mobile | Capacitor Android → Google Play (internal) |
| CI | GitHub Actions (pr-checks, deploy-fly, deploy-vercel) |
| Observability | Sentry, Winston JSON → Fly logs, Vercel Analytics |
| Secrets | Fly secrets / Vercel env / GH Actions — never in code |

## Conventions
- API versioned under `/api/v1`; monetary `Decimal(18,2)` (never float); ownership re-checked server-side.
- Roles: `admin` > `manager` > `advisor` > `user`; deny-by-default RBAC; feature gates at Module → Sub-feature → AI capability.

