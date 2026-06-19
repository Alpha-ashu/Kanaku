/**
 * Request timeout middleware.
 *
 * Hard limit on how long any single request may hold a worker, so a
 * stuck DB query / hung upstream call cannot exhaust the process.
 *
 * On timeout we emit a structured 503 response (if headers are not yet
 * sent) and let downstream handlers see `req.timedOut === true` so they
 * can short-circuit further work.
 *
 * Configure via `REQUEST_TIMEOUT_MS` env var (defaults to 30 s in prod,
 * 60 s in dev for debugger sessions).
 */

import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

const DEFAULT_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 30_000 : 60_000;

export interface TimeoutRequest extends Request {
  timedOut?: boolean;
}

export const requestTimeout = (timeoutMs: number = DEFAULT_TIMEOUT_MS) => {
  return (req: TimeoutRequest, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      req.timedOut = true;

      if (res.headersSent) return;

      logger.warn('[timeout] Request exceeded budget', {
        method: req.method,
        path: req.path,
        requestId: (req as any).id,
        timeoutMs,
      });

      res.status(503).json({
        success: false,
        error: 'Request took too long. Please retry.',
        code: 'REQUEST_TIMEOUT',
        requestId: (req as any).id,
      });
    }, timeoutMs);

    // Clear the timer once the response is finished one way or another.
    const cleanup = () => clearTimeout(timer);
    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  };
};

