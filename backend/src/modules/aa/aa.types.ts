/**
 * Account Aggregator (AA) Module Types — RBI-Compliant
 * Setu AA API Integration Types
 */

export type ConsentStatus = 'CREATED' | 'PENDING' | 'READY' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'REJECTED';
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
export type FIType = 'DEPOSIT' | 'TERM_DEPOSIT' | 'RECURRING_DEPOSIT' | 'MUTUAL_FUNDS' | 'SIP' | 'INSURANCE' | 'CREDIT_CARD' | 'EQUITIES';
export type ConsentMode = 'VIEW' | 'STORE' | 'QUERY';
export type FetchType = 'ONETIME' | 'PERIODIC';

export interface ConsentPurpose {
  code: string;
  text: string;
}

export interface FIDataRange {
  from: string;
  to: string;
}

export interface CreateConsentRequest {
  userId: string;
  vua: string; // Virtual User Address (e.g., user@setu-aa)
  fiTypes: FIType[];
  consentTypes: string[];
  purpose: ConsentPurpose;
  dataRange: FIDataRange;
  consentMode?: ConsentMode;
  fetchType?: FetchType;
  consentExpiry?: string;
}

export interface ConsentResponse {
  success: boolean;
  consentHandle?: string;
  consentId?: string;
  status?: ConsentStatus;
  redirectUrl?: string;
  message?: string;
}

export interface ConsentStatusResponse {
  success: boolean;
  consentId?: string;
  status?: ConsentStatus;
  message?: string;
}

export interface ConsentArtifact {
  consentId: string;
  status: ConsentStatus;
  signedConsent?: string;
  consentDetail?: Record<string, unknown>;
}

export interface DataSessionRequest {
  consentId: string;
  userId: string;
}

export interface DataSessionResponse {
  success: boolean;
  sessionId?: string;
  status?: SessionStatus;
  message?: string;
}

export interface FIAccount {
  type: string;
  maskedAccNumber: string;
  linkRefNumber?: string;
}

export interface FITransaction {
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  date: string;
  narration: string;
  reference?: string;
  balance?: number;
}

export interface FIData {
  account: FIAccount;
  transactions: FITransaction[];
  summary?: {
    currentBalance?: number;
    currency?: string;
    branch?: string;
    ifscCode?: string;
  };
}

export interface FetchDataResponse {
  success: boolean;
  data?: FIData[];
  message?: string;
}

export interface AANotificationPayload {
  type: 'CONSENT_STATUS_UPDATE' | 'FI_DATA_READY' | 'SESSION_STATUS_UPDATE';
  consentId?: string;
  consentHandle?: string;
  sessionId?: string;
  status?: string;
  timestamp: string;
}

