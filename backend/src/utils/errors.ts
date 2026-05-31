/**
 * Re-exports AppError and related helpers from AppError.ts.
 * Satisfies imports from `utils/errors` across the backend.
 */
export { AppError, fromPrismaError, isDatabaseConnectivityError } from './AppError';
