import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { AppError, fromPrismaError, isDatabaseConnectivityError } from '../utils/AppError';

// Re-export AppError so existing imports from this path still work
export { AppError };

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  //  1. Normalise to AppError 

  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if ((err as any)?.name === 'PrismaClientKnownRequestError') {
    appError = fromPrismaError(err) ?? AppError.internal();
  } else if (isDatabaseConnectivityError(err)) {
    appError = new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is temporarily unavailable. Please try again shortly.', false);
  } else if ((err as any)?.name === 'ZodError') {
    // Zod validation — never leak field paths or technical detail to the
    // client. Full issue list is logged below for server-side debugging.
    appError = AppError.badRequest(
      'Some of your inputs look incorrect. Please review and try again.',
      'VALIDATION_ERROR',
    );
  } else if (err instanceof SyntaxError && (err as any).status === 400) {
    // Malformed JSON body
    appError = AppError.badRequest('Invalid JSON in request body.', 'INVALID_JSON');
  } else {
    const legacyErr = err as ApiError;
    const statusCode = legacyErr?.statusCode ?? 500;
    appError = new AppError(
      statusCode,
      legacyErr?.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      statusCode >= 500 ? 'Something went wrong. Please try again later.' : (legacyErr?.message ?? 'An error occurred'),
      statusCode < 500,
    );
  }

  //  2. Logging 

  const logPayload = {
    statusCode: appError.statusCode,
    code: appError.code,
    // Always log the real message for developers
    technicalMessage: (err as Error)?.message ?? appError.message,
    stack: (err as Error)?.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).userId ?? undefined,
    requestId: (req as any).id ?? undefined,
  };

  if (appError.statusCode >= 500) {
    logger.error('Server error', logPayload);
  } else {
    logger.warn('Client error', logPayload);
  }

  //  3. Response

  // Guard against double-send if headers were already flushed (e.g. streaming).
  if (res.headersSent) {
    return;
  }

  // Never leak internal details in the response  only user-friendly message.
  // requestId is echoed so users can quote it when reporting an issue and
  // support can correlate it with the server logs above.
  res.status(appError.statusCode).json({
    success: false,
    error: appError.message,
    code: appError.code,
    requestId: (req as any).id ?? undefined,
  });
};
