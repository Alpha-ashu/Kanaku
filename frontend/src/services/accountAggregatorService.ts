/**
 * Account Aggregator (AA) Frontend Service
 * Manages consent flow, data fetch, and financial data display.
 * Uses existing api client with JWT authentication.
 */

import { apiClient } from '@/lib/api';

export interface ConsentRequest {
  vua: string;
  fiTypes: string[];
  consentTypes?: string[];
  purpose: { code: string; text: string };
  dataRange: { from: string; to: string };
  consentMode?: 'VIEW' | 'STORE' | 'QUERY';
  fetchType?: 'ONETIME' | 'PERIODIC';
}

export interface ConsentResponse {
  success: boolean;
  consentHandle?: string;
  status?: string;
  redirectUrl?: string;
  message?: string;
}

export interface ConsentStatusResponse {
  success: boolean;
  consentId?: string;
  status?: string;
  message?: string;
}

export interface DataSessionResponse {
  success: boolean;
  sessionId?: string;
  status?: string;
  message?: string;
}

export interface FITransaction {
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  date: string;
  narration: string;
  reference?: string;
  balance?: number;
}

export interface FIAccount {
  type: string;
  maskedAccNumber: string;
}

export interface FIData {
  account: FIAccount;
  transactions: FITransaction[];
  summary?: {
    currentBalance?: number;
    currency?: string;
  };
}

export interface FinancialDataResponse {
  success: boolean;
  data?: FIData[];
  message?: string;
}

export interface UserConsent {
  id: string;
  consentHandle: string;
  consentId: string | null;
  status: string;
  purpose: string;
  fiTypes: string;
  dataFrom: string;
  dataTo: string;
  createdAt: string;
}

class AAService {
  /**
   * Step 1: Send OTP for AA consent verification
   */
  async sendConsentOtp(email: string): Promise<{ success: boolean; message: string; expiresIn?: number }> {
    const response = await apiClient.post('/otp/send', {
      destination: email,
      channel: 'email',
      purpose: 'aa_consent',
    });
    return response as { success: boolean; message: string; expiresIn?: number };
  }

  /**
   * Step 2: Verify OTP before creating consent
   */
  async verifyConsentOtp(email: string, otp: string): Promise<{ success: boolean; verificationToken?: string; message: string }> {
    const response = await apiClient.post('/otp/verify', {
      destination: email,
      purpose: 'aa_consent',
      otp,
    });
    return response as { success: boolean; verificationToken?: string; message: string };
  }

  /**
   * Step 3: Create consent request (requires prior OTP verification)
   */
  async createConsent(request: ConsentRequest): Promise<ConsentResponse> {
    const response = await apiClient.post('/aa/consent', request);
    return response as ConsentResponse;
  }

  /**
   * Step 4: Check consent status after user approval
   */
  async getConsentStatus(consentHandle: string): Promise<ConsentStatusResponse> {
    const response = await apiClient.get(`/aa/consent/status/${consentHandle}`);
    return response as ConsentStatusResponse;
  }

  /**
   * Step 5: Create data fetch session (consent must be ACTIVE)
   */
  async createDataSession(consentId: string): Promise<DataSessionResponse> {
    const response = await apiClient.post('/aa/data/session', { consentId });
    return response as DataSessionResponse;
  }

  /**
   * Step 6: Fetch financial data
   */
  async fetchFinancialData(sessionId: string): Promise<FinancialDataResponse> {
    const response = await apiClient.get(`/aa/data/fetch/${sessionId}`);
    return response as FinancialDataResponse;
  }

  /**
   * Get list of user's consents
   */
  async getConsents(): Promise<{ success: boolean; data: UserConsent[] }> {
    const response = await apiClient.get('/aa/consents');
    return response as { success: boolean; data: UserConsent[] };
  }

  /**
   * Revoke an active consent
   */
  async revokeConsent(consentId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/aa/consent/revoke/${consentId}`, {});
    return response as { success: boolean; message: string };
  }

  /**
   * Get financial summary (aggregated data)
   */
  async getFinancialSummary(): Promise<{
    success: boolean;
    data: {
      accounts: Array<{ accountType: string; maskedAccountNumber: string; createdAt: string }>;
      transactions: Array<{ transactionDate: string; amount: number; type: string; description: string }>;
    };
  }> {
    const response = await apiClient.get('/aa/financial-summary');
    return response as any;
  }

  /**
   * Full flow helper: OTP → Consent → Redirect
   * Returns the redirect URL for user consent approval
   */
  async initiateConsentFlow(
    email: string,
    otp: string,
    vua: string,
    options: {
      fiTypes?: string[];
      purpose?: { code: string; text: string };
      dataRange?: { from: string; to: string };
    } = {},
  ): Promise<{ success: boolean; redirectUrl?: string; message: string }> {
    // Verify OTP first
    const otpResult = await this.verifyConsentOtp(email, otp);
    if (!otpResult.success) {
      return { success: false, message: otpResult.message };
    }

    // Create consent
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const consentResult = await this.createConsent({
      vua,
      fiTypes: options.fiTypes || ['DEPOSIT'],
      consentTypes: ['TRANSACTIONS', 'SUMMARY'],
      purpose: options.purpose || { code: '101', text: 'Personal Finance Management' },
      dataRange: options.dataRange || {
        from: oneYearAgo.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      },
    });

    if (!consentResult.success || !consentResult.redirectUrl) {
      return { success: false, message: consentResult.message || 'Failed to create consent.' };
    }

    return {
      success: true,
      redirectUrl: consentResult.redirectUrl,
      message: 'Consent created. Please approve in your bank app.',
    };
  }
}

export const aaService = new AAService();
export default aaService;

