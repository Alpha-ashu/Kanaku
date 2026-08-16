/**
 * Regression tests for the sync-queue poison-loop fix: a deterministic 4xx
 * must park the record immediately, and the error's status/code must survive
 * the compiled APIError class (subclassing Error historically lost own
 * properties on some toolchain/WebView combinations, which made every 400
 * look retryable and flooded the network).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase/client', () => ({
  default: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

import { APIError } from '@/lib/api';
import { isPermanentValidationError, isTransientServerError } from '@/lib/auth-sync-integration';

describe('APIError property survival (compiled class contract)', () => {
  it('keeps status, code, details, and prototype through construction', () => {
    const err = new APIError('FRIEND_ALREADY_EXISTS', 'duplicate', 400, { hint: 'x' });
    expect(err).toBeInstanceOf(APIError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('APIError');
    expect(err.status).toBe(400);
    expect(err.code).toBe('FRIEND_ALREADY_EXISTS');
    expect(err.details).toEqual({ hint: 'x' });
    // Own-property check: the sync classifier reads these directly off the
    // instance, so they must not live only on a lost prototype.
    expect(Object.prototype.hasOwnProperty.call(err, 'status')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(err, 'code')).toBe(true);
  });
});

describe('isPermanentValidationError', () => {
  it('parks deterministic 4xx validation rejections', () => {
    expect(isPermanentValidationError(new APIError('FRIEND_ALREADY_EXISTS', 'dup', 400))).toBe(true);
    expect(isPermanentValidationError(new APIError('VALIDATION_ERROR', 'bad input', 422))).toBe(true);
    expect(isPermanentValidationError(new APIError('NOT_FOUND', 'gone', 404))).toBe(true);
    expect(isPermanentValidationError(new APIError('CONFLICT', 'conflict', 409))).toBe(true);
  });

  it('keeps INSUFFICIENT_BALANCE retryable (FIFO deposit may fix it)', () => {
    expect(isPermanentValidationError(new APIError('INSUFFICIENT_BALANCE', 'low balance', 400))).toBe(false);
  });

  it('never parks server errors or connectivity failures', () => {
    expect(isPermanentValidationError(new APIError('INTERNAL', 'boom', 500))).toBe(false);
    expect(isPermanentValidationError(new APIError('NETWORK_ERROR', 'offline', 0))).toBe(false);
    expect(isPermanentValidationError(new Error('Failed to fetch'))).toBe(false);
  });

  it('reads status/code from wrapped axios-style shapes too', () => {
    expect(isPermanentValidationError({ response: { status: 400, data: { code: 'BAD_INPUT' } } })).toBe(true);
    expect(isPermanentValidationError({ response: { status: 400, data: { code: 'INSUFFICIENT_BALANCE' } } })).toBe(false);
    expect(isPermanentValidationError({ statusCode: 422 })).toBe(true);
  });
});

/**
 * The counterpart to the poison-loop fix. A 5xx says nothing is wrong with the
 * *record*, so it must defer the queue rather than count against MAX_SYNC_RETRIES:
 * classifying it as a generic per-item failure let a backend outage (e.g. the 502
 * the Vite dev proxy returns while the API is still booting) burn the whole retry
 * budget and then DROP pending writes the user had already made locally.
 */
describe('isTransientServerError', () => {
  it('treats 5xx as a server-side outage, not a bad record', () => {
    expect(isTransientServerError(new APIError('INTERNAL', 'boom', 500))).toBe(true);
    expect(isTransientServerError(new APIError('HTTP_502', 'Bad Gateway', 502))).toBe(true);
    expect(isTransientServerError(new APIError('UNAVAILABLE', 'down', 503))).toBe(true);
  });

  it('treats 429 as transient (backoff, do not spend the retry budget)', () => {
    expect(isTransientServerError(new APIError('RATE_LIMITED', 'slow down', 429))).toBe(true);
  });

  it('leaves deterministic 4xx to isPermanentValidationError', () => {
    expect(isTransientServerError(new APIError('VALIDATION_ERROR', 'bad input', 422))).toBe(false);
    expect(isTransientServerError(new APIError('NOT_FOUND', 'gone', 404))).toBe(false);
    expect(isTransientServerError(new APIError('CONFLICT', 'conflict', 409))).toBe(false);
  });

  it('does not claim connectivity failures (status 0) — isConnectivityError owns those', () => {
    expect(isTransientServerError(new APIError('NETWORK_ERROR', 'offline', 0))).toBe(false);
    expect(isTransientServerError(new Error('Failed to fetch'))).toBe(false);
  });

  it('reads status from wrapped axios-style shapes too', () => {
    expect(isTransientServerError({ response: { status: 502 } })).toBe(true);
    expect(isTransientServerError({ statusCode: 500 })).toBe(true);
  });

  // The two classifiers must never both claim an error: the queue checks
  // transient first, so an overlap would silently un-park poison records.
  it('is mutually exclusive with isPermanentValidationError', () => {
    for (const status of [400, 404, 409, 422, 429, 500, 502, 503]) {
      const err = new APIError('X', 'x', status);
      expect(isTransientServerError(err) && isPermanentValidationError(err)).toBe(false);
    }
  });
});
