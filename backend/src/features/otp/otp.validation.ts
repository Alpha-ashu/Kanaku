import { z } from 'zod';

export const sendOtpSchema = z.object({
  destination: z.string().min(5).max(100),
  channel: z.enum(['sms', 'email']).optional().default('email'),
  purpose: z.enum(['signup', 'login', 'reset_password', 'aa_consent', 'sensitive_action']),
});

export const verifyOtpSchema = z.object({
  destination: z.string().min(5).max(100),
  purpose: z.enum(['signup', 'login', 'reset_password', 'aa_consent', 'sensitive_action']),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

