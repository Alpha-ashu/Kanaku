# Frontend Skill Reference  KANAKU

> Stack: React 18  TypeScript (strict)  Vite  Capacitor  Dexie  Sonner  Tailwind CSS

---

## 1. React 18 Patterns

### Concurrent Features
- Use `React.Suspense` + lazy imports for route-level code splitting:
  ```tsx
  const Dashboard = React.lazy(() => import('@/pages/Dashboard'));
  <Suspense fallback={<PageSpinner />}><Dashboard /></Suspense>
  ```
- Prefer `useTransition` for non-urgent state updates (e.g., filter changes) to keep the UI responsive.
- Use `useDeferredValue` for derived expensive computations on large lists.

### Component Design
- **Single responsibility**: one component = one concern.
- Prefer composition via `children` / render props over prop drilling.
- Extract shared UI logic into custom hooks (`useTransactions`, `useGoals`, etc.) living in `frontend/src/hooks/`.
- Use `React.memo` only when profiling shows it is needed  avoid premature optimisation.

### State Management
- **Local state**  `useState` / `useReducer`.
- **Cross-component state**  Context + `useReducer` (see `AuthContext`, `SettingsContext`).
- **Server cache**  TanStack Query (`useQuery`, `useMutation`) where pages need live data.
- **Offline data**  Dexie (see 4 below).

---

## 2. TypeScript Conventions

- **Strict mode** is enabled in `tsconfig.json`  `noImplicitAny`, `strictNullChecks`, etc.
- Avoid `any`. Use `unknown` and narrow with type guards.
- Define explicit interfaces/types for all DTOs. Never rely on raw backend shapes.
- Use Zod schemas on the frontend to validate API responses before using them.
- Prefer `interface` for object shapes that can be extended; `type` for unions/aliases.

```ts
// Good
interface Transaction {
  id: string;
  amount: number;
  category: string;
  date: string;
}

//  Avoid
const data: any = await api.transactions.getAll();
```

---

## 3. Vite Configuration

- Alias `@/` maps to `frontend/src/` (set in `vite.config.ts`).
- **Standard Root**: All components live under `@/app/components/`.
- **Absolute Imports**: Always use `@/app/components/{module}/{Component}`. Avoid `../../`.
- Environment variables must be prefixed `VITE_` to be exposed to the browser.
- Use `import.meta.env.VITE_API_URL`  never `process.env`.
- Build output goes to `dist/` which Capacitor syncs to the native project.

---

## 4. Capacitor (Mobile Bridge)

- All Capacitor plugin imports must be guarded with `Capacitor.isNativePlatform()` checks.
- Use `@capacitor/core`  `Capacitor.getPlatform()` to branch logic between `web`, `android`, `ios`.
- Filesystem, Camera, and Biometric APIs require permissions declared in `AndroidManifest.xml`.
- Call `CapacitorApp.addListener('backButton', ...)` to handle Android back button.
- Never use `window.location.href` for in-app navigation  use React Router's `useNavigate()`.

```ts
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  // Native-only code
}
```

---

## 5. Dexie (Offline-First Local DB)

### Schema Conventions
- Database is defined in `frontend/src/db/` (typically `db.ts`).
- Table names are plural snake_case: `transactions`, `accounts`, `goals`.
- Every table has `id` (UUID string) as primary key.
- Add a `syncStatus: 'pending' | 'synced' | 'error'` field to every table that participates in cloud sync.
- Add `updatedAt: number` (Unix ms timestamp) for conflict resolution.

### Write Rule  Local First
```ts
// Always write to Dexie first, mark pending, then sync in background
await db.transactions.put({ ...tx, syncStatus: 'pending', updatedAt: Date.now() });
syncQueue.enqueue(tx); // background sync
```

### Background Sync
- Use `syncQueue` / service worker / `navigator.serviceWorker` to replay pending writes.
- On sync success, update `syncStatus` to `'synced'`.
- On sync failure, set `syncStatus` to `'error'` and retry with backoff (`retryAsync` from `errorHandling.ts`).

---

## 6. Error Handling

- **Never** call `toast.error(rawServerMessage)` directly. Use `ErrorHandler.handle(ErrorFactory.fromHTTPStatus(status, friendlyMsg))`.
- All fetch logic lives in `frontend/src/lib/api.ts` which already wraps errors and maps them to user-friendly messages.
- Wrap page-level components with `<ErrorBoundary>` to catch render errors gracefully.
- Log technical details with `console.error('[Context] message:', details)`  never render stack traces to the UI.

```ts
// Correct pattern
try {
  await api.transactions.create(data);
} catch (err) {
  // api.ts already showed the toast  just log locally
  console.error('[AddTransaction] Failed to create transaction:', err);
}
```

---

## 7. Styling (Tailwind CSS)

- Use design tokens defined in `tailwind.config.ts` (colours, spacing, breakpoints).
- **Glassmorphism**: Use `bg-white/70 backdrop-blur-xl border border-white/20 shadow-xl`.
- **Gradients**: Standardize on the KANAKUgradient: `#7B4CFF` to `#4A9EFF`.
- **Typography**: Use **Outfit** or **Inter** as the primary font for a premium fintech feel.
- **Rounded Corners**: Standardize on `rounded-2xl` for cards and `rounded-3xl` for containers.
- **Micro-animations**: Use `framer-motion` for all state-driven UI changes.
- Mobile-first breakpoints: `sm:`  640px, `md:`  768px, `lg:`  1024px.
- Dark mode is handled via `class` strategy  add `dark` to `<html>` rather than `prefers-color-scheme`.
- Prefer utility classes over custom CSS.

---

## 8. Routing

- React Router v6 is used. Declare routes in `frontend/src/routes/` or the root `App.tsx`.
- Protected routes check the `AuthContext` and redirect to `/login` if unauthenticated.
- Use `<Outlet />` for nested routes (e.g., dashboard sub-pages).
- Lazy-load all heavy pages (chart-heavy dashboards, reports) with `React.lazy`.

---

## 9. Performance Checklist

- [ ] Route-level code splitting with `React.lazy`.
- [ ] Image assets compressed and served from `/public` or a CDN.
- [ ] No synchronous localStorage reads inside render  move to `useEffect`.
- [ ] Avoid anonymous functions in JSX props on hot render paths.
- [ ] Memo-ize expensive derived data with `useMemo`.
- [ ] Run `vite build --report` to check bundle size before release.


