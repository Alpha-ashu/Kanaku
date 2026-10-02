import type { Response } from 'express';
import { logger } from '../config/logger';

/**
 * Answer a failed request: an expected refusal (4xx AppError) with its own
 * message and code, so the screen can say what to do; anything else with a
 * generic message. Handlers used to send `error.message` for every failure,
 * which put raw database/driver text into 500 responses.
 */
export const sendOperationalError = (res: Response, error: unknown, fallback: string) => {
  const err = error as { statusCode?: unknown; message?: string; code?: string } | null;
  const status = typeof err?.statusCode === 'number' ? err.statusCode : 500;
  if (status >= 500) {
    logger.error(fallback, { error });
    return res.status(status).json({ error: fallback });
  }
  return res.status(status).json({ error: err?.message || fallback, code: err?.code });
};
