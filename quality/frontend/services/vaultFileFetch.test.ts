import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supportsInlinePdfPreview } from '@/app/components/vault/VaultDocumentPreviewModal';

/**
 * Vault preview/download bypass apiClient because they need raw bytes, so they
 * must answer the gate rejections apiClient answers on their behalf everywhere
 * else. When they don't, the failure is confusing in a specific way: the
 * document LIST goes through apiClient and keeps working, so the vault looks
 * healthy right up until you open a file, which dead-ends on "something went
 * wrong".
 *
 * These cover the expired-access-token case. Access tokens last 15 minutes;
 * every other request in the app refreshes and replays. This path did not, so
 * the first document opened more than 15 minutes into a session failed — and it
 * looked like the FILE was broken rather than the session.
 */

const mockRefreshAccessToken = vi.fn();
const mockGetAccessToken = vi.fn();
const mockAwaitPinUnlock = vi.fn();
const mockDownloadFile = vi.fn();

// Mutable so one test can walk through several device types.
let mockPlatform = { native: false, name: 'web' };

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockPlatform.native,
    getPlatform: () => mockPlatform.name,
  },
}));

vi.mock('@/lib/download', () => ({
  downloadFile: (opts: unknown) => mockDownloadFile(opts),
}));

vi.mock('@/lib/api', () => ({
  apiClient: {},
  TokenManager: { getAccessToken: () => mockGetAccessToken() },
  refreshAccessToken: () => mockRefreshAccessToken(),
}));

vi.mock('@/lib/apiBase', () => ({
  getConfiguredApiBase: () => '/api/v1',
  buildApiUrl: (base: string, p: string) => `${base}${p}`,
}));

vi.mock('@/lib/pinUnlockCoordinator', () => ({
  awaitPinUnlock: () => mockAwaitPinUnlock(),
  getPinUnlockToken: () => 'pin-token',
}));

vi.mock('@/lib/vaultUnlock', () => ({
  captureVaultUnlockToken: vi.fn(),
  getVaultUnlockToken: () => 'vault-token',
  setVaultUnlockToken: vi.fn(),
  signalVaultLocked: vi.fn(),
}));

vi.mock('@/lib/clientErrorReporter', () => ({ getSessionId: () => 'session-abc' }));

import { vaultService } from '@/services/vaultService';

/** Minimal stand-in for the parts of Response this code path touches. */
const makeResponse = (status: number, body: Record<string, unknown> = {}) => {
  const res: any = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/pdf' },
    json: async () => body,
    blob: async () => new Blob(['file-bytes']),
  };
  res.clone = () => res;
  return res;
};

const authHeaderOf = (call: unknown[]): string | undefined =>
  (call[1] as { headers: Record<string, string> }).headers.Authorization;

describe('vault file fetch — expired access token', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRefreshAccessToken.mockReset();
    mockGetAccessToken.mockReset();
    mockAwaitPinUnlock.mockReset();
    mockDownloadFile.mockReset();
    mockPlatform = { native: false, name: 'web' };
    // jsdom has no object-URL implementation. Add the two methods rather than
    // replacing window.URL wholesale — component imports further down this file
    // pull in code that calls `new URL(...)`, and swapping the object out took
    // the constructor with it.
    const url = window.URL as unknown as Record<string, unknown>;
    if (typeof url.createObjectURL !== 'function') url.createObjectURL = () => 'blob:mock';
    if (typeof url.revokeObjectURL !== 'function') url.revokeObjectURL = () => undefined;
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('refreshes and replays once when the token has expired', async () => {
    mockGetAccessToken
      .mockReturnValueOnce('expired-token')
      .mockReturnValue('fresh-token');
    mockRefreshAccessToken.mockResolvedValue('fresh-token');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await vaultService.previewDocument('doc-1');

    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.objectUrl).toBe('blob:mock');

    // The replay must carry the NEW token — rebuilding the headers is the whole
    // point, since resending the expired one would 401 again.
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer expired-token');
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('does not retry when the refresh itself fails', async () => {
    // The session is genuinely over; retrying would just 401 again and delay
    // the sign-out the app is about to do.
    mockGetAccessToken.mockReturnValue('expired-token');
    mockRefreshAccessToken.mockResolvedValue(null);

    const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, { error: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(vaultService.previewDocument('doc-1')).rejects.toThrow();
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when the request succeeds', async () => {
    mockGetAccessToken.mockReturnValue('good-token');
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    await vaultService.previewDocument('doc-1');

    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still recovers from the PIN gate on a freshly signed-in device', async () => {
    // Pre-existing behaviour, kept covered: the PIN unlock token is per-browser,
    // so every new device hits this before it can open anything.
    mockGetAccessToken.mockReturnValue('good-token');
    mockAwaitPinUnlock.mockResolvedValue(true);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(403, { code: 'PIN_VERIFICATION_REQUIRED' }))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await vaultService.previewDocument('doc-1');

    expect(mockAwaitPinUnlock).toHaveBeenCalledTimes(1);
    expect(result.objectUrl).toBe('blob:mock');
  });

  it('surfaces the server message for an error it cannot recover from', async () => {
    mockGetAccessToken.mockReturnValue('good-token');
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(500, {
        error: 'We could not open this document — its stored file could not be decrypted.',
        code: 'VAULT_DECRYPTION_FAILED',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // The user should read what actually happened, not a generic fallback.
    await expect(vaultService.previewDocument('doc-1')).rejects.toThrow(/could not be decrypted/i);
  });
});

/**
 * The two ways a vault document was unreachable on a PHONE even though the
 * server decrypted and returned it perfectly. Both were silent: no error, no
 * message, just nothing happening — which reads as "the file is broken".
 */
describe('vault documents on native devices', () => {
  beforeEach(() => {
    mockGetAccessToken.mockReturnValue('good-token');
  });

  it('routes download through the shared helper instead of a blob link', async () => {
    // The blob-URL + <a download> dance is a NO-OP inside the Capacitor
    // WebView, so the download button did nothing at all on Android and iOS.
    // lib/download.ts writes the file and opens the share sheet on native.
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    await vaultService.downloadDocument('doc-1', 'statement.pdf');

    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const arg = mockDownloadFile.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.filename).toBe('statement.pdf');
    expect(arg.mimeType).toBe('application/pdf');
    expect(arg.data).toBeInstanceOf(Blob);
  });

  it('refreshes an expired token before downloading too', async () => {
    mockGetAccessToken.mockReturnValueOnce('expired-token').mockReturnValue('fresh-token');
    mockRefreshAccessToken.mockResolvedValue('fresh-token');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    await vaultService.downloadDocument('doc-1', 'statement.pdf');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
  });
});

describe('supportsInlinePdfPreview', () => {
  // Android's WebView has no PDF renderer, so an <iframe> pointed at one shows
  // a blank white box. Everywhere else renders it.
  it('is false on Android native, true elsewhere', () => {
    mockPlatform = { native: true, name: 'android' };
    expect(supportsInlinePdfPreview()).toBe(false);

    mockPlatform = { native: true, name: 'ios' };
    expect(supportsInlinePdfPreview()).toBe(true);

    mockPlatform = { native: false, name: 'web' };
    expect(supportsInlinePdfPreview()).toBe(true);
  }, 15000);
});
