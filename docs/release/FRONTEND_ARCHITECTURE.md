# Kanaku — Frontend Architecture (Beta Audit Snapshot, 2026-07-19)

Verified against `frontend/src` during the beta audit.

## Stack

React 18 + TypeScript + Vite, Tailwind CSS, Dexie (IndexedDB) for offline-first data,
Socket.IO client, Capacitor 8 (Android), PWA (service worker + install prompt).

## Structure

```
frontend/src
├── index.tsx              # entry: ErrorBoundary → BrowserRouter → App
├── app/App.tsx            # auth/PIN/onboarding state machine + page switch (~45 lazy pages)
├── app/components/        # LIVE component tree
│   ├── core/              # Dashboard, Accounts, Transactions, Sidebar, TopBar, BottomNav
│   ├── transactions/      # AddTransaction, PayEMI, …
│   ├── goals|groups|loans|investments|features|profile|advisor|admin|manager|auth|marketing
│   └── ui/                # shadcn/ui primitive kit (partially used — kept as design system)
├── contexts/              # AppContext, AuthContext, SecurityContext
├── lib/                   # api.ts (typed API client + wrappers), database.ts (Dexie schema v15),
│                          # auth-sync-integration, offline-sync-engine, featureFlags, pwa, …
├── services/              # OCR / receipt / voice / import engines
├── hooks/, utils/, types/, strategies/
└── pages/                 # ⚠ LEGACY, UNROUTED (see CODE_QUALITY_REPORT.md — scheduled for removal)
```

## Rendering & performance (verified)

- Every page is `React.lazy` + Suspense → per-page async chunks.
- Admin/Manager surfaces compiled out of user builds: `__ADMIN_UI_ENABLED__` Vite `define`
  folds `false ? lazy(...) : null` so the chunks are physically absent (`VITE_APP_SURFACE=user`).
- Production build passes; main bundle 182 KB gzip; heavy vendors split
  (pdf 133 KB, pdfgen 184 KB, charts 115 KB gzip) and loaded on demand.
- Static assets served with `cache-control: immutable` (vercel.json).

## Data flow (offline-first)

1. UI reads/writes **Dexie** first (instant, offline-capable).
2. `offline-sync-engine` + `backend-sync-service` push mutations to `/api/v1/sync/push`
   and pull deltas via `/sync/pull` (device-scoped cursors, `SyncQueue` on server).
3. Socket.IO events + notification badge keep other devices fresh.
4. Auth: backend JWT in `TokenManager`; web refresh via HttpOnly cookie, native via
   `x-refresh-token` header (Capacitor cannot use cross-site cookies).

## Security & UX affordances (verified counts)

- 1,383 `data-testid` attributes across the live tree (Playwright automation registry).
- ARIA attributes in 75 live components; keyboard navigable modals via shadcn primitives.
- Skeleton/pulse loading states in 20 components; explicit empty states in 12.
- Dark mode variants present in 14 components (Tailwind `dark:`).
- Global `ErrorBoundary` at the root plus granular boundaries.
- PIN lock, inactivity auto-lock, limited-mode & offline banners.

## Known gaps (documented, not blocking)

See [CODE_QUALITY_REPORT.md](CODE_QUALITY_REPORT.md) and [UI_UX_REVIEW.md](UI_UX_REVIEW.md):
- `src/pages/` + ~20 service/lib modules are unreachable legacy (tree-shaken out of the bundle;
  slated for deletion after beta).
- Dark-mode coverage is partial (14 components) — the app currently ships light-first.
