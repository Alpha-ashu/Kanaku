import type { Response } from 'express';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { isWalletError } from './wallet.errors';

/**
 * One error mapping for every wallet, payment and finance handler: a typed
 * WalletError becomes its own status/code/message; anything else is logged in
 * full and answered generically with the request id, never with internals.
 */
export const sendWalletError = (res: Response, error: unknown, context: string, requestId?: string) => {
  if (res.headersSent) return undefined;
  if (isWalletError(error)) {
    return res.status(error.status).json({ success: false, error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) });
  }
  if ((error as { code?: string })?.code === 'INVALID_CURSOR') {
    return res.status(400).json({ success: false, error: 'Invalid pagination cursor', code: 'INVALID_CURSOR' });
  }
  if (isDatabaseUnavailableError(error)) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable. Please try again.', code: 'DB_OFFLINE' });
  }
  logger.error(`[wallet] ${context} failed`, { requestId, error });
  return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR', requestId });
};

export const requestIdOf = (req: unknown) => (req as { id?: string }).id;
