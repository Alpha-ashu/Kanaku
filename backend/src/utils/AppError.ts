/**
 * AppError  typed error class for all application-level errors.
 * Controllers should throw AppError instead of building inline res.json() error responses.
 * The central errorHandler middleware in middleware/error.ts will consume and format these.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, code: string, message: string, isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  //  Common factory helpers 

  static badRequest(message: string, code = 'BAD_REQUEST'): AppError {
    return new AppError(400, code, message);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED'): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN'): AppError {
    return new AppError(403, code, message);
  }

  static notFound(resource = 'Resource', code = 'NOT_FOUND'): AppError {
    return new AppError(404, code, `${resource} not found`);
  }

  static conflict(message: string, code = 'CONFLICT'): AppError {
    return new AppError(409, code, message);
  }

  static tooManyRequests(message = 'Too many requests. Please slow down.', code = 'RATE_LIMIT_EXCEEDED'): AppError {
    return new AppError(429, code, message);
  }

  static internal(message = 'Something went wrong. Please try again later.', code = 'INTERNAL_ERROR'): AppError {
    return new AppError(500, code, message, false);
  }
}

/**
 * Prisma error code  AppError mapper.
 * Call this in the errorHandler to intercept Prisma-specific codes centrally.
 */
export function fromPrismaError(error: any): AppError | null {
  if (!error || error.name !== 'PrismaClientKnownRequestError') {
    return null;
  }

  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      return AppError.conflict(
        'This record already exists. Please use different values.',
        'DUPLICATE_ENTRY',
      );
    case 'P2025':
      // Record not found
      return AppError.notFound('Record');
    case 'P2003':
      // Foreign key constraint
      return AppError.badRequest('Referenced record does not exist.', 'FOREIGN_KEY_VIOLATION');
    case 'P2016':
      // Query interpretation error
      return AppError.badRequest('Invalid query parameters.', 'INVALID_QUERY');
    default:
      return null;
  }
}

/**
 * Is this error the database disagreeing with the schema the client was
 * generated from — a missing column, a missing table, a query that no longer
 * type-checks?
 *
 * The distinction matters because of how these failures are usually handled.
 * Non-critical persistence is routinely wrapped in `catch { logger.warn }` so a
 * transient storage or network blip cannot fail an operation the user already
 * paid for. That is the right call for a blip, and exactly the wrong call for a
 * structural error: a missing column fails EVERY time, silently, for every user,
 * and a warning in a log nobody greps is indistinguishable from silence.
 *
 * This is not hypothetical. `CollaborationParticipant.phone` was missing from an
 * environment for long enough to break every group-expense invitation on it, and
 * the only trace was a warn line inside createGroup's catch.
 *
 * Deliberately narrow. Connectivity (P1001/P1002) is transient and handled by
 * isDatabaseConnectivityError. Constraint violations (P2002/P2003) are usually
 * real data conditions — a race, a genuine duplicate — not a schema mismatch, so
 * they are not treated as structural here.
 */
export function isStructuralDatabaseError(error: any): boolean {
  if (!error) return false;

  const code: string = error?.code ?? '';
  const name: string = error?.name ?? '';
  const msg: string = error?.message ?? '';

  // P2021 table missing, P2022 column missing, P2023 inconsistent column data,
  // P1012 schema validation failure.
  if (code === 'P2021' || code === 'P2022' || code === 'P2023' || code === 'P1012') {
    return true;
  }

  // A query that does not match the schema at all (unknown field or argument).
  if (name === 'PrismaClientValidationError') return true;

  // Prisma phrases the missing-column case this way, and it survives even when
  // the error reaches us without its code (wrapped, serialised, re-thrown).
  return msg.includes('does not exist in the current database');
}

/**
 * Check whether an error is a database connectivity error.
 */
export function isDatabaseConnectivityError(error: any): boolean {
  if (!error) return false;
  const msg: string = error?.message ?? '';
  return (
    error.code === 'P1001' ||
    error.code === 'P1002' ||
    msg.includes("Can't reach database") ||
    msg.includes('Error validating datasource') ||
    msg.includes('Connection refused')
  );
}

