/**
 * Schema-version safety guard for offline-first sync.
 *
 * Why this matters:
 *   When a user installs a new app version, their Dexie schema bumps
 *   from (say) v14 → v15 — but the WebView may still hold a stale
 *   service worker pointing at the old bundle, or two browser tabs may
 *   be running different versions. Pushing v14 records to a backend
 *   expecting v15 (or vice-versa) silently corrupts data.
 *
 * This module:
 *   1. Reads the **local** Dexie schema version.
 *   2. Reads the **server's expected client schema version** from
 *      `GET /api/v1/sync/meta` (which the backend must return).
 *   3. If local < server, surface a "Please reload" prompt to the user
 *      via a Sonner toast and HALT the SyncEngine until they accept.
 *   4. If local > server, log a warning (rare — preview build talking
 *      to prod backend) and allow sync but flag as risky.
 *
 * Wire this into your bootstrap (e.g. `frontend/src/main.tsx`):
 *
 *   import { initSchemaGuard } from '@/lib/syncSchemaGuard';
 *   initSchemaGuard().catch(console.error);
 */

import { toast } from 'sonner';
import { apiClient } from './api';
import { db } from './database';

/**
 * The local schema version, read from Dexie itself.
 *
 * This used to be a hand-maintained `const LOCAL_SCHEMA_VERSION = 14`, which had
 * drifted three versions behind the actual schema (database.ts declares up to
 * version 17). A guard whose whole job is comparing versions cannot be trusted
 * to a number someone has to remember to bump — so it now reads db.verno and
 * cannot go stale.
 */
const localSchemaVersion = (): number => db.verno;

const META_ENDPOINT = '/sync/meta';
const CHECK_INTERVAL_MS = 15 * 60 * 1000;         // recheck every 15 min
let syncHalted = false;
let warnedBehind = false;

interface ServerMeta {
  schemaVersion: number;
  /** Minimum client schema version still supported by the backend. */
  minSupportedClientVersion?: number;
}

export const isSyncHalted = (): boolean => syncHalted;

const haltSync = (reason: string) => {
  if (syncHalted) return;
  syncHalted = true;
   
  console.warn('[syncSchemaGuard] sync halted —', reason);
  toast.error('App update required', {
    description: 'Please reload the app to keep your data safe.',
    duration: Infinity,
    action: {
      label: 'Reload',
      onClick: () => window.location.reload(),
    },
  });
};

const checkOnce = async (): Promise<void> => {
  try {
    const res = await apiClient.get<ServerMeta>(META_ENDPOINT, { showErrorToast: false });
    if (!res?.success || !res.data) return;
    const { schemaVersion, minSupportedClientVersion } = res.data;

    if (typeof schemaVersion !== 'number') return;

    const local = localSchemaVersion();

    // HARD stop: below the floor the backend still accepts, the shapes genuinely
    // do not match and pushing would corrupt data.
    if (typeof minSupportedClientVersion === 'number' && local < minSupportedClientVersion) {
      haltSync(`local v${local} < min supported v${minSupportedClientVersion}`);
      return;
    }

    // SOFT nudge: merely trailing the server is normal and must NOT halt sync.
    //
    // Web auto-deploys on every push while Android and iOS are installed by hand,
    // so mobile clients are routinely a version or two behind. Halting on any lag
    // would strand every phone that had not been updated yet — the opposite of
    // the stability this guard exists to provide. Only the floor above is fatal.
    if (local < schemaVersion) {
      if (!warnedBehind) {
        warnedBehind = true;
        console.warn(
          `[syncSchemaGuard] local schema v${local} is behind server v${schemaVersion}. ` +
          'Sync continues; update the app when convenient.',
        );
      }
    } else if (local > schemaVersion) {
      console.warn(
        `[syncSchemaGuard] local schema v${local} is AHEAD of server v${schemaVersion} — ` +
        'preview build against a prod backend, or the backend needs its SERVER_SCHEMA_VERSION bumped.',
      );
    }
  } catch {
    // Backend offline / endpoint missing — fail open. The endpoint is
    // optional; first-deploy of this code can ship without the route
    // and just rely on the local version check on next iteration.
  }
};

export const initSchemaGuard = async (): Promise<void> => {
  await checkOnce();
  setInterval(checkOnce, CHECK_INTERVAL_MS);
};

