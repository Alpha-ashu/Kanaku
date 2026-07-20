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
import { isPermanentValidationError } from '@/lib/auth-sync-integration';

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
