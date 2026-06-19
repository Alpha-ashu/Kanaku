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

const LOCAL_SCHEMA_VERSION = 14;                  // bump whenever Dexie schema changes
const META_ENDPOINT = '/sync/meta';
const CHECK_INTERVAL_MS = 15 * 60 * 1000;         // recheck every 15 min
let syncHalted = false;

interface ServerMeta {
  schemaVersion: number;
  /** Minimum client schema version still supported by the backend. */
  minSupportedClientVersion?: number;
}

export const isSyncHalted = (): boolean => syncHalted;

const haltSync = (reason: string) => {
  if (syncHalted) return;
  syncHalted = true;
  // eslint-disable-next-line no-console
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

    if (typeof minSupportedClientVersion === 'number' && LOCAL_SCHEMA_VERSION < minSupportedClientVersion) {
      haltSync(`local v${LOCAL_SCHEMA_VERSION} < min supported v${minSupportedClientVersion}`);
      return;
    }

    if (LOCAL_SCHEMA_VERSION < schemaVersion) {
      haltSync(`local v${LOCAL_SCHEMA_VERSION} < server v${schemaVersion}`);
    } else if (LOCAL_SCHEMA_VERSION > schemaVersion) {
      // eslint-disable-next-line no-console
      console.warn('[syncSchemaGuard] local schema is AHEAD of server — preview build on prod backend?');
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

