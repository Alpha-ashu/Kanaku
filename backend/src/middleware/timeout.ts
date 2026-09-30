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
  /** Restart this request's budget at `timeoutMs` from now. See `extendRequestTimeout`. */
  extendTimeout?: (timeoutMs: number) => void;
}

export const requestTimeout = (timeoutMs: number = DEFAULT_TIMEOUT_MS) => {
  return (req: TimeoutRequest, res: Response, next: NextFunction) => {
    let budgetMs = timeoutMs;
    const onTimeout = () => {
      req.timedOut = true;

      if (res.headersSent) return;

      logger.warn('[timeout] Request exceeded budget', {
        method: req.method,
        path: req.path,
        requestId: (req as any).id,
        timeoutMs: budgetMs,
      });

      res.status(503).json({
        success: false,
        error: 'Request took too long. Please retry.',
        code: 'REQUEST_TIMEOUT',
        requestId: (req as any).id,
      });
    };
    let timer = setTimeout(onTimeout, timeoutMs);

    req.extendTimeout = (extendedMs: number) => {
      if (req.timedOut || res.headersSent) return;
      clearTimeout(timer);
      budgetMs = extendedMs;
      timer = setTimeout(onTimeout, extendedMs);
    };

    // Clear the timer once the response is finished one way or another.
    const cleanup = () => clearTimeout(timer);
    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  };
};

/**
 * Route-level budget for requests whose BODY is large — document uploads.
 *
 * The global timer starts when the headers arrive, so a multipart body still
 * streaming in from a phone counts against it. At 30 s, three ID scans on a
 * mobile uplink could not finish: the client got a 503 "took too long" while
 * the handler carried on and saved the application anyway, so the user saw an
 * error for a submission that had in fact succeeded — and their retry was then
 * refused as "already pending". Mount this BEFORE the body parser.
 */
export const extendRequestTimeout = (timeoutMs: number) =>
  (req: TimeoutRequest, _res: Response, next: NextFunction) => {
    req.extendTimeout?.(timeoutMs);
    next();
  };

