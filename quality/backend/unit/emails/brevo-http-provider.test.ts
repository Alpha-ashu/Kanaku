import { isBrevoHttpConfigured, sendBrevoHttpEmail } from '../../../../backend/src/emails/providers/brevo.provider';

describe('Brevo HTTP API Email Provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isBrevoHttpConfigured', () => {
    it('returns false when BREVO_API_KEY is not set', () => {
      delete process.env.BREVO_API_KEY;
      expect(isBrevoHttpConfigured()).toBe(false);
    });

    it('returns true when BREVO_API_KEY is set', () => {
      process.env.BREVO_API_KEY = 'xkeysib-test-api-key';
      expect(isBrevoHttpConfigured()).toBe(true);
    });
  });

  describe('sendBrevoHttpEmail', () => {
    it('returns false when BREVO_API_KEY is not set', async () => {
      delete process.env.BREVO_API_KEY;
      const res = await sendBrevoHttpEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });
      expect(res).toBe(false);
    });

    it('sends email successfully when API responds with 201', async () => {
      process.env.BREVO_API_KEY = 'xkeysib-test-api-key';
      process.env.SMTP_FROM_EMAIL = 'support@kanaku.app';
      process.env.SMTP_FROM_NAME = 'Kanaku Support';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<test-msg-id@brevo>' }),
      });
      global.fetch = mockFetch as any;

      const res = await sendBrevoHttpEmail({
        to: 'recipient@example.com',
        subject: 'Your OTP Code: 123456',
        html: '<p>Your code is 123456</p>',
      });

      expect(res).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(init.method).toBe('POST');
      expect(init.headers['api-key']).toBe('xkeysib-test-api-key');

      const body = JSON.parse(init.body);
      expect(body.sender).toEqual({ name: 'Kanaku Support', email: 'support@kanaku.app' });
      expect(body.to).toEqual([{ email: 'recipient@example.com' }]);
      expect(body.subject).toBe('Your OTP Code: 123456');
      expect(body.htmlContent).toBe('<p>Your code is 123456</p>');
    });

    it('handles HTTP error responses gracefully without throwing', async () => {
      process.env.BREVO_API_KEY = 'xkeysib-test-api-key';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Key not found',
      });
      global.fetch = mockFetch as any;

      const res = await sendBrevoHttpEmail({
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(res).toBe(false);
    });

    it('handles network failure gracefully without throwing', async () => {
      process.env.BREVO_API_KEY = 'xkeysib-test-api-key';

      const mockFetch = jest.fn().mockRejectedValue(new Error('Network connection timeout'));
      global.fetch = mockFetch as any;

      const res = await sendBrevoHttpEmail({
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(res).toBe(false);
    });
  });
});
