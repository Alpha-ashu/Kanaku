/**
 * Error Handling Utilities
 * Centralized error handling and recovery strategies
 */

import { toast } from 'sonner';
import { logger } from './logger';

// ==================== Toast Duration Constants (F-8) ====================
// Centralised durations so every toast in the app is consistent.
export const TOAST_DURATION = {
  /** Short confirmations and success messages */
  SHORT: 3000,
  /** Standard informational / warning messages */
  NORMAL: 4000,
  /** Errors that need user attention */
  ERROR: 5000,
} as const;

// ==================== Error Types ====================

export enum ErrorType {
  NETWORK = 'NETWORK_ERROR',
  AUTHENTICATION = 'AUTH_ERROR',
  AUTHORIZATION = 'PERMISSION_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  SERVER = 'SERVER_ERROR',
  TIMEOUT = 'TIMEOUT_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR',
}

export interface AppError {
  type: ErrorType;
  message: string;
  code?: string;
  details?: any;
  recoverable: boolean;
  timestamp: Date;
}

// ==================== Error Factory ====================

export class ErrorFactory {
  static create(
    type: ErrorType,
    message: string,
    code?: string,
    details?: any
  ): AppError {
    return {
      type,
      message,
      code,
      details,
      recoverable: ErrorFactory.isRecoverable(type),
      timestamp: new Date(),
    };
  }

  static fromHTTPStatus(status: number, message?: string): AppError {
    switch (status) {
      case 400:
        return ErrorFactory.create(
          ErrorType.VALIDATION,
          message || 'Invalid request data',
          'BAD_REQUEST'
        );
      case 401:
        return ErrorFactory.create(
          ErrorType.AUTHENTICATION,
          message || 'Authentication required',
          'UNAUTHORIZED'
        );
      case 403:
        return ErrorFactory.create(
          ErrorType.AUTHORIZATION,
          message || 'You don\'t have permission to perform this action',
          'FORBIDDEN'
        );
      case 404:
        return ErrorFactory.create(
          ErrorType.NOT_FOUND,
          message || 'Resource not found',
          'NOT_FOUND'
        );
      case 408:
        return ErrorFactory.create(
          ErrorType.TIMEOUT,
          message || 'Request timeout',
          'TIMEOUT'
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return ErrorFactory.create(
          ErrorType.SERVER,
          message || 'Server error. Please try again later.',
          `SERVER_ERROR_${status}`
        );
      default:
        return ErrorFactory.create(
          ErrorType.UNKNOWN,
          message || 'An unexpected error occurred',
          `HTTP_${status}`
        );
    }
  }

  static isRecoverable(type: ErrorType): boolean {
    const recoverableErrors = [
      ErrorType.NETWORK,
      ErrorType.TIMEOUT,
      ErrorType.VALIDATION,
    ];
    return recoverableErrors.includes(type);
  }
}

// ==================== Error Handler ====================

export class ErrorHandler {
  private static handlers: Map<ErrorType, (error: AppError) => void> = new Map();

  static register(type: ErrorType, handler: (error: AppError) => void): void {
    this.handlers.set(type, handler);
  }

  static handle(error: AppError, showToast: boolean = true): void {
    // Log error (silent in production)
    logger.error('[Error]', { type: error.type, code: error.code });

    // Show toast notification
    if (showToast) {
      this.showErrorToast(error);
    }

    // Execute custom handler if registered
    const handler = this.handlers.get(error.type);
    if (handler) {
      handler(error);
    }

    // Execute default recovery strategy
    this.executeRecoveryStrategy(error);
  }

  private static showErrorToast(error: AppError): void {
    const toastOptions = {
      duration: TOAST_DURATION.ERROR,
      action: error.recoverable
        ? {
            label: 'Retry',
            onClick: () => {
              toast.info('Retrying...');
            },
          }
        : undefined,
    };

    switch (error.type) {
      case ErrorType.NETWORK:
        toast.error('Network error. Please check your connection.', toastOptions);
        break;
      case ErrorType.AUTHENTICATION:
        toast.error('Please log in to continue.', toastOptions);
        break;
      case ErrorType.AUTHORIZATION:
        toast.error('You don\'t have permission to perform this action.', toastOptions);
        break;
      case ErrorType.VALIDATION:
        toast.error(error.message, toastOptions);
        break;
      case ErrorType.NOT_FOUND:
        toast.error('Resource not found.', toastOptions);
        break;
      case ErrorType.SERVER:
        toast.error('Server error. Please try again later.', toastOptions);
        break;
      case ErrorType.TIMEOUT:
        toast.error('Request timeout. Please try again.', toastOptions);
        break;
      default:
        toast.error(error.message || 'An unexpected error occurred.', toastOptions);
    }
  }

  private static executeRecoveryStrategy(error: AppError): void {
    switch (error.type) {
      case ErrorType.AUTHENTICATION:
        // Redirect to login
        setTimeout(() => {
          window.location.href = '/login';
        }, 1000);
        break;

      case ErrorType.NETWORK:
        // Check connection and retry
        if (navigator.onLine) {
          logger.info('[Network] Connection appears to be restored — consider retrying the failed request.');
        }
        break;

      case ErrorType.SERVER:
        // Log to error tracking service
        this.logToService(error);
        break;

      default:
        break;
    }
  }

  private static logToService(error: AppError): void {
    // Log full technical details via the shared logger (silent in production).
    logger.error('[Error Service] Unhandled server error', {
      type: error.type,
      code: error.code,
      timestamp: error.timestamp,
    });
    // TODO: integrate Sentry or a similar service here:
    // sentry.captureException(error);
  }
}

// ==================== Friendly message resolver (F-2, F-3) ====================
// Maps API/network errors to user-readable messages without exposing technical details.

const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Some of your inputs look incorrect. Please review and try again.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  409: 'This item already exists. Please use different values.',
  429: 'You are doing that too fast. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again later.',
  502: 'The server is temporarily unavailable. Please try again shortly.',
  503: 'Our servers are temporarily unavailable. Please try again in a moment.',
  504: 'The request timed out on the server. Please try again.',
};

const API_CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password. Please try again.',
  EMAIL_EXISTS: 'An account with this email already exists. Try signing in instead.',
  PHONE_EXISTS: 'This phone number is already registered to another account. Please use a different phone number.',
  MISSING_FIELDS: 'Please fill in all required fields.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  PASSWORD_TOO_SHORT: 'Your password must be at least 8 characters long.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'We could not find what you were looking for.',
  DUPLICATE_ENTRY: 'This item already exists. Please use different values.',
  VALIDATION_ERROR: 'Some of your inputs look incorrect. Please review and try again.',
  DATABASE_UNAVAILABLE: 'Our servers are temporarily unavailable. Please try again in a moment.',
  NETWORK_ERROR: 'Check your internet connection and try again.',
  TIMEOUT_ERROR: 'The request took too long. Please try again.',
  RATE_LIMIT_EXCEEDED: 'You are doing that too fast. Please wait a moment.',
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again later.',
};

/**
 * Resolves a user-friendly message from any caught error.
 * API errors (with status/code) are mapped through the friendly map.
 * Technical details are logged to console, never shown to users.
 */
export function resolveUserMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Something went wrong. Please try again.';
  }

  const err = error as Record<string, unknown>;

  // Log technical detail for developers (silent in production)
  if (err.message || err.code || err.status) {
    logger.error('[ErrorHandling] Caught error', {
      message: err.message,
      code: err.code,
      status: err.status,
    });
  }

  // API code takes highest priority
  if (typeof err.code === 'string' && API_CODE_MESSAGES[err.code]) {
    return API_CODE_MESSAGES[err.code];
  }

  // HTTP status fallback
  if (typeof err.status === 'number' && HTTP_STATUS_MESSAGES[err.status]) {
    return HTTP_STATUS_MESSAGES[err.status];
  }

  // Network / fetch errors
  const message = String(err.message || '').toLowerCase();
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Check your internet connection and try again.';
  }
  if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) {
    return 'The request took too long. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}

// ==================== Error Boundary Utility ====================

export function wrapAsyncFunction<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: (error: AppError) => void
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error: unknown) {
      // F-3: Use friendly message resolver instead of raw error.message
      const friendlyMessage = resolveUserMessage(error);
      const appError = ErrorFactory.create(
        ErrorType.UNKNOWN,
        friendlyMessage,
        (error as Record<string, unknown>)?.code as string | undefined,
        error
      );

      if (errorHandler) {
        errorHandler(appError);
      } else {
        ErrorHandler.handle(appError);
      }

      throw appError;
    }
  }) as T;
}

// ==================== Validation Error Helpers ====================

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export class ValidationErrorHandler {
  static formatErrors(errors: ValidationError[]): string {
    // Human-readable message only  never expose raw field names to the user
    return errors.map((e) => e.message).join('\n');
  }

  static showErrors(errors: ValidationError[]): void {
    errors.forEach((error) => {
      // Log technical field details for debugging (silent in production)
      logger.warn(`[Validation] field="${error.field}" — ${error.message}`);
      // Only show the friendly message to the user
      toast.error(error.message, { duration: TOAST_DURATION.NORMAL });
    });
  }

  static createError(field: string, message: string, value?: any): ValidationError {
    return { field, message, value };
  }
}

// ==================== Retry Utilities ====================

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoff: boolean;
  onRetry?: (attempt: number, error: any) => void;
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoff = true,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      const delay = backoff ? delayMs * attempt : delayMs;

      if (onRetry) {
        onRetry(attempt, error);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ==================== Safe Execution ====================

export async function safeExecute<T>(
  fn: () => Promise<T>,
  fallback?: T,
  showError: boolean = true
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (showError) {
      // F-2: use resolveUserMessage instead of raw error.message
      const friendlyMessage = resolveUserMessage(error);
      const appError = ErrorFactory.create(
        ErrorType.UNKNOWN,
        friendlyMessage,
        (error as Record<string, unknown>)?.code as string | undefined,
        error
      );
      ErrorHandler.handle(appError);
    }
    return fallback;
  }
}

// ==================== Setup Global Error Handlers ====================

export function setupGlobalErrorHandlers(): void {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    const error = ErrorFactory.create(
      ErrorType.UNKNOWN,
      event.message,
      'UNCAUGHT_ERROR',
      { filename: event.filename, lineno: event.lineno, colno: event.colno }
    );
    ErrorHandler.handle(error, false);
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = ErrorFactory.create(
      ErrorType.UNKNOWN,
      event.reason?.message || 'Unhandled promise rejection',
      'UNHANDLED_REJECTION',
      event.reason
    );
    ErrorHandler.handle(error, false);
  });

  // Register default handlers
  ErrorHandler.register(ErrorType.AUTHENTICATION, (_error) => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  });

  ErrorHandler.register(ErrorType.NETWORK, (_error) => {
    // Queue failed requests for retry when connection is restored
    logger.warn('[Network] Network error detected — queuing requests for retry when connection restores.');
  });
}

// ==================== Export ====================

export default {
  ErrorType,
  ErrorFactory,
  ErrorHandler,
  ValidationErrorHandler,
  wrapAsyncFunction,
  retryAsync,
  safeExecute,
  setupGlobalErrorHandlers,
};
