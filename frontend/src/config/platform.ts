/**
 * App-surface (platform) selector — which audience this BUILD serves.
 *
 * The product requires the Admin/Manager platform to be separate from the
 * User/Advisor platform. Deployment-wise that is two web origins built from
 * this same repo:
 *
 *   VITE_APP_SURFACE=user   → the customer origin (app.<domain>): the
 *                             Admin/Manager UI is compiled OUT of the bundle
 *                             (the lazy chunks are never emitted/loaded and
 *                             the routes are unreachable).
 *   VITE_APP_SURFACE=admin  → the back-office origin (admin.<domain>):
 *                             full app incl. Admin/Manager workspaces.
 *   unset ("unified")       → today's single-platform behaviour (default, so
 *                             existing deploys are unaffected until the second
 *                             origin is provisioned).
 *
 * Server side, the same split is enforced by ADMIN_UI_HOSTS +
 * adminPlatformGate (backend/src/middleware/adminPlatformGate.ts): admin and
 * manager route groups 404 unless the request comes via the admin origin.
 *
 * `__ADMIN_UI_ENABLED__` is a Vite `define` replaced with a literal boolean at
 * build time (see vite.config.ts), so `ADMIN_UI_ENABLED ? lazy(...) : null`
 * lets Rollup constant-fold the branch and drop the admin chunks entirely from
 * a `user`-surface build.
 */
export type AppSurface = 'unified' | 'user' | 'admin';

// Injected by Vite `define`. Fallback keeps type-check/tests (non-Vite) working.
declare const __ADMIN_UI_ENABLED__: boolean | undefined;

const rawSurface = (import.meta.env.VITE_APP_SURFACE as string | undefined) ?? 'unified';

export const APP_SURFACE: AppSurface =
  rawSurface === 'user' || rawSurface === 'admin' ? rawSurface : 'unified';

/** False only on the customer-platform build — Admin/Manager UI stripped. */
export const ADMIN_UI_ENABLED: boolean =
  typeof __ADMIN_UI_ENABLED__ === 'boolean' ? __ADMIN_UI_ENABLED__ : APP_SURFACE !== 'user';
