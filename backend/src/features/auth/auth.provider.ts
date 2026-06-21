/**
 * Authentication provider abstraction.
 *
 * The backend is a Backend-for-Frontend (BFF): clients only ever talk to our own
 * /api/v1/auth/* endpoints and receive our own JWT. The external identity provider
 * (currently Supabase) is hidden behind this interface, so migrating to Firebase,
 * Auth0, Cognito, or a fully custom store is a backend-only change — no client edits.
 *
 * Today the provider is only consulted to verify credentials for accounts whose
 * password is still managed by the provider (not yet migrated to the local bcrypt
 * hash). All token issuance is ours (see utils/auth.generateTokens).
 */
import { getSupabaseAdminClient } from '../../db/supabase';
import { logger } from '../../config/logger';

export interface AuthProvider {
  /** Returns true when (email, password) is valid at the external provider. */
  verifyCredentials(email: string, password: string): Promise<boolean>;
}

export class SupabaseAuthProvider implements AuthProvider {
  async verifyCredentials(email: string, password: string): Promise<boolean> {
    const admin = getSupabaseAdminClient();
    if (!admin) return false;
    try {
      const { data, error } = await admin.auth.signInWithPassword({ email, password });
      return !error && !!data.user;
    } catch (err) {
      logger.warn('[AuthProvider] Supabase credential verification failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}

// Single swap point to change identity providers without touching any client.
export const authProvider: AuthProvider = new SupabaseAuthProvider();
