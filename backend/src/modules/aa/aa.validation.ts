import { z } from 'zod';

export const createConsentSchema = z.object({
  vua: z.string().min(3).max(100).describe('Virtual User Address (e.g., user@setu-aa)'),
  fiTypes: z.array(z.enum(['DEPOSIT', 'TERM_DEPOSIT', 'RECURRING_DEPOSIT', 'MUTUAL_FUNDS', 'SIP', 'INSURANCE', 'CREDIT_CARD', 'EQUITIES'])).min(1),
  consentTypes: z.array(z.string()).min(1).default(['TRANSACTIONS', 'SUMMARY']),
  purpose: z.object({
    code: z.string().min(1).max(10),
    text: z.string().min(1).max(200),
  }),
  dataRange: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format: YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format: YYYY-MM-DD'),
  }),
  consentMode: z.enum(['VIEW', 'STORE', 'QUERY']).optional().default('VIEW'),
  fetchType: z.enum(['ONETIME', 'PERIODIC']).optional().default('ONETIME'),
});

export const consentHandleParamSchema = z.object({
  consentHandle: z.string().min(1).max(200),
});

export const consentIdParamSchema = z.object({
  consentId: z.string().min(1).max(200),
});

export const createDataSessionSchema = z.object({
  consentId: z.string().min(1).max(200),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1).max(200),
});

export const aaNotificationSchema = z.object({
  type: z.enum(['CONSENT_STATUS_UPDATE', 'FI_DATA_READY', 'SESSION_STATUS_UPDATE']),
  consentId: z.string().optional(),
  consentHandle: z.string().optional(),
  sessionId: z.string().optional(),
  status: z.string().optional(),
  timestamp: z.string(),
});

