/**
 * OTP Module Types — RBI-Compliant OTP Verification System
 */

export type OtpChannel = 'sms' | 'email';
export type OtpPurpose = 'signup' | 'login' | 'reset_password' | 'aa_consent' | 'sensitive_action';
export type OtpStatus = 'ACTIVE' | 'VERIFIED' | 'EXPIRED' | 'BLOCKED';

export interface SendOtpRequest {
  destination: string;
  channel?: OtpChannel;
  purpose: OtpPurpose;
}

export interface VerifyOtpRequest {
  destination: string;
  purpose: OtpPurpose;
  otp: string;
}

export interface OtpRecord {
  id: string;
  userId: string | null;
  destination: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  otpHash: string;
  expiryTime: Date;
  attempts: number;
  maxAttempts: number;
  status: OtpStatus;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  verifiedAt: Date | null;
}

export interface OtpResponse {
  success: boolean;
  message: string;
  expiresIn?: number;
  retryAfter?: number;
}

export interface OtpVerifyResponse {
  success: boolean;
  message: string;
  verificationToken?: string;
}

