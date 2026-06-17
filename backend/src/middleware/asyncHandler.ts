import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler so any thrown error (or rejected promise) is
 * forwarded to the global error handler via next(err) instead of producing an
 * unhandled rejection. Use this for new handlers so they never need their own
 * try/catch boilerplate:
 *
 *   router.get('/', asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler =
  <T extends Request = Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
