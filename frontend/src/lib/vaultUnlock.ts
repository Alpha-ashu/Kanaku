/**
 * Client half of the server-side Vault lock (backend features/vault/vault.lock.ts).
 *
 * POST /vault/lock/verify returns a short-lived `unlockToken`; it is sent back as
 * `X-Vault-Unlock` on every request and re-issued by the server on each accepted
 * vault response, which slides the auto-lock window with activity. When it
 * lapses the server answers 403 VAULT_LOCKED and the API client dispatches
 * VAULT_LOCKED_EVENT so the Vault screen shows its lock overlay again.
 *
 * Kept in sessionStorage (not localStorage): closing the app re-locks the vault.
 * Dependency-free so both the API client and vaultService can import it.
 */
const STORAGE_KEY = 'KANAKU_vault_unlock_token';
export const VAULT_LOCKED_EVENT = 'KANAKU_VAULT_LOCKED';

let memoryToken: string | null = null;

const storage = (): Storage | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

export const setVaultUnlockToken = (token: string | null | undefined): void => {
  memoryToken = token || null;
  try {
    if (memoryToken) storage()?.setItem(STORAGE_KEY, memoryToken);
    else storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — the in-memory copy still works for this session */
  }
};

export const getVaultUnlockToken = (): string | null => {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    memoryToken = null;
  }
  return memoryToken;
};

export const clearVaultUnlockToken = (): void => setVaultUnlockToken(null);

/** Stores the refreshed token the backend echoes on accepted vault responses. */
export const captureVaultUnlockToken = (response: Response): void => {
  try {
    const refreshed = response.headers?.get?.('X-Vault-Unlock');
    if (refreshed) setVaultUnlockToken(refreshed);
  } catch {
    /* header unreadable (CORS/mocked response) — keep the existing token */
  }
};

/** The server says the vault is locked: drop the stale token and tell the UI. */
export const signalVaultLocked = (): void => {
  clearVaultUnlockToken();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VAULT_LOCKED_EVENT));
  }
};
