/**
 * Delete account / reset data / export — the client side of the re-authenticated
 * account actions. The server decides everything that matters (who may delete,
 * whether proof is needed, whether the proof is good); this only carries it.
 *
 * Uses backendService's axios instance so failures keep the server's own
 * message, code and `details` (see lib/apiFailure.ts) — api.ts replaces 403/409
 * bodies with generic text, which would hide "your wallet still holds 40 coins".
 */
import { backendService } from '@/lib/backend-api';

export type StepUpProof = { method: 'password'; password: string } | { method: 'email_code' };

export interface StepUpMethods {
  password: boolean;
  emailCode: boolean;
  /** Masked, e.g. "ra****@gmail.com". */
  email: string | null;
}

export interface DeletionBlocker {
  code: 'PROTECTED_ACCOUNT' | 'ADMIN_SELF_DELETE_FORBIDDEN' | 'ACCOUNT_HAS_OPEN_BALANCE';
  message: string;
}

export interface DeletionCheck {
  allowed: boolean;
  requiresProof: boolean;
  blockers: DeletionBlocker[];
  openBookings: number;
  methods: StepUpMethods;
}

export interface ResetReport {
  success: boolean;
  factoryResetId: string;
  summary?: Record<string, Record<string, number>>;
  preserved?: Record<string, string>;
}

const unwrap = <T>(response: { data: unknown }): T => {
  const body = response.data as { data?: T } & T;
  return (body && typeof body === 'object' && 'data' in body && body.data !== undefined ? body.data : body) as T;
};

/** A stable key per attempt: a network retry of the same reset replays, never re-runs. */
export const newActionKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const accountLifecycleService = {
  async deletionCheck(): Promise<DeletionCheck> {
    return unwrap<DeletionCheck>(await backendService.api.get('/settings/account/deletion-check'));
  },

  async stepUpMethods(): Promise<StepUpMethods> {
    return unwrap<StepUpMethods>(await backendService.api.get('/settings/step-up-methods'));
  },

  /**
   * Email a sensitive_action code. The server always sends it to the ACCOUNT's
   * address whatever `destination` says; the field is only required by the schema.
   */
  async sendEmailCode(accountEmail: string): Promise<void> {
    await backendService.api.post('/otp/send', { destination: accountEmail, channel: 'email', purpose: 'sensitive_action' });
  },

  async verifyEmailCode(accountEmail: string, code: string): Promise<void> {
    await backendService.api.post('/otp/verify', { destination: accountEmail, purpose: 'sensitive_action', otp: code });
  },

  /** Permanent. `proof` may be omitted only for a fresh, empty sign-up (onboarding discard). */
  async deleteAccount(proof?: StepUpProof): Promise<{ cancelledBookings?: number }> {
    const response = await backendService.api.delete('/auth/account', { data: proof ? { proof } : {} });
    return unwrap<{ cancelledBookings?: number }>(response);
  },

  async resetData(proof: StepUpProof, idempotencyKey: string): Promise<ResetReport> {
    const response = await backendService.api.post('/settings/clear-data', { proof }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      // A reset of a large account can take a while; it is one transaction server side.
      timeout: 120_000,
    });
    return response.data as ResetReport;
  },

  /** Everything the user owns, as the JSON the importer also reads back. */
  async exportAll(): Promise<string> {
    const response = await backendService.api.get('/settings/export', { responseType: 'text', transformResponse: (d: unknown) => d, timeout: 120_000 });
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  },

  /** Every transaction as CSV (UTF-8 with BOM, formula-safe). */
  async exportTransactionsCsv(): Promise<string> {
    const response = await backendService.api.get('/transactions/export', { responseType: 'text', transformResponse: (d: unknown) => d, timeout: 120_000 });
    return String(response.data ?? '');
  },
};
