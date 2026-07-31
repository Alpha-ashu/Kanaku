import { describe, expect, it } from 'vitest';
import { isPinServiceUnavailable } from '@/services/pinService';

/**
 * A PIN request timeout must be classified as "service unavailable".
 *
 * The unlock screen branches on `isPinServiceUnavailable()`: true takes the graceful
 * degraded path (fall back to the local PIN hash, show "Unable to verify PIN right
 * now"), false is treated as the server having genuinely rejected the PIN.
 *
 * A timeout used to surface as the raw AbortError string, "signal is aborted without
 * reason". That matched none of the failure patterns, so it was classified as a
 * rejection and printed verbatim on the unlock screen — telling the user their
 * correct PIN was wrong, in language from the fetch spec.
 */
describe('PIN service failure classification', () => {
  it('treats a request timeout as a service outage, not a rejected PIN', () => {
    expect(isPinServiceUnavailable({
      success: false,
      message: 'PIN service request timeout after 8000ms',
    })).toBe(true);
  });

  it('never lets a raw abort string reach the user as a PIN rejection', () => {
    // Guards the translation in fetchWithTimeout: if the AbortError is ever passed
    // through untranslated again, this is the shape it arrives in — and it is NOT
    // recognised as an outage, which is exactly what made it user-visible.
    expect(isPinServiceUnavailable({
      success: false,
      message: 'signal is aborted without reason',
    })).toBe(false);
  });

  it('still classifies the other transport failures as outages', () => {
    for (const message of [
      'Failed to fetch',
      'Network error while contacting PIN service',
      'Internal Server Error',
      'PIN request failed',
    ]) {
      expect(isPinServiceUnavailable({ success: false, message }), message).toBe(true);
    }
    expect(isPinServiceUnavailable({ success: false, message: 'x', statusCode: 503 })).toBe(true);
  });

  it('does not mistake a genuine wrong-PIN rejection for an outage', () => {
    expect(isPinServiceUnavailable({
      success: false,
      message: 'Incorrect PIN',
      statusCode: 401,
    })).toBe(false);
  });

  it('reports no outage for a successful response', () => {
    expect(isPinServiceUnavailable({ success: true, message: 'ok' })).toBe(false);
    expect(isPinServiceUnavailable(null)).toBe(false);
  });
});
