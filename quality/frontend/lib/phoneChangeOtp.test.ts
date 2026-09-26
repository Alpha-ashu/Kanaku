import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, TokenManager } from '@/lib/api';

describe('Phone Change, Avatar & OTP API integration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    TokenManager.clearTokens();
    api.clearCache();
  });

  it('calls sendOtp with correct payload for SMS phone change', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { message: 'OTP sent successfully', expiresIn: 300 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.auth.sendOtp({
      destination: '9876543210',
      purpose: 'phone_change',
      channel: 'sms',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/otp/send'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          destination: '9876543210',
          purpose: 'phone_change',
          channel: 'sms',
        }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('calls verifyOtp with correct payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { message: 'OTP verified successfully' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.auth.verifyOtp({
      destination: '9876543210',
      purpose: 'phone_change',
      otp: '123456',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/otp/verify'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          destination: '9876543210',
          purpose: 'phone_change',
          otp: '123456',
        }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('calls changePhone with phone and verified OTP', async () => {
    TokenManager.setAccessToken('auth-test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { message: 'Phone number updated successfully', phone: '+919876543210' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.auth.changePhone({
      phone: '9876543210',
      otp: '123456',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/phone/change'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer auth-test-token',
        }),
        body: JSON.stringify({
          phone: '9876543210',
          otp: '123456',
        }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('calls deleteAvatar to remove user avatar', async () => {
    TokenManager.setAccessToken('auth-test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { message: 'Avatar removed successfully' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.auth.deleteAvatar();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/avatar'),
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer auth-test-token',
        }),
      })
    );
    expect(result.success).toBe(true);
  });
});
