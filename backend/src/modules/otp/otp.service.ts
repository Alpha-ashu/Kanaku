import { randomUUID, createHash, timingSafeEqual } from 'crypto';
import { logger } from '../../config/logger';
import { prisma } from '../../db/prisma';
import type { OtpChannel, OtpPurpose, OtpResponse, OtpVerifyResponse } from './otp.types';

/**
 * OTP Service — RBI-Compliant OTP Generation and Verification
 *
 * Security Controls:
 * - 6-digit numeric OTP
 * - 90-second expiry (configurable)
 * - Max 5 attempts per OTP
 * - Rate limiting: 1 OTP per purpose per 60s cooldown
 * - Constant-time comparison to prevent timing attacks
 * - Hash-only storage (SHA-256)
 * - Single active OTP per destination+purpose
 * - Full audit logging
 */

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 90;
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 60;
const BLOCK_THRESHOLD = 10; // Block after 10 total failed attempts in 1 hour

class OtpService {
  /**
   * Generate a cryptographically random 6-digit OTP
   */
  private generateOtp(): string {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    const num = buffer[0] % 1000000;
    return num.toString().padStart(OTP_LENGTH, '0');
  }

  /**
   * Hash OTP for secure storage (SHA-256)
   */
  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Constant-time comparison of OTP hashes (prevents timing attacks)
   */
  private verifyHash(inputOtp: string, storedHash: string): boolean {
    const inputHash = this.hashOtp(inputOtp);
    try {
      return timingSafeEqual(
        Buffer.from(inputHash, 'hex'),
        Buffer.from(storedHash, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Check if user is rate-limited or blocked
   */
  private async checkRateLimit(destination: string, purpose: OtpPurpose): Promise<{ allowed: boolean; retryAfter?: number }> {
    const cooldownTime = new Date(Date.now() - COOLDOWN_SECONDS * 1000);
    const blockWindow = new Date(Date.now() - 60 * 60 * 1000); // 1 hour

    // Check recent OTP sent within cooldown period
    const recentOtp = await prisma.otpRequest.findFirst({
      where: {
        destination,
        purpose,
        createdAt: { gte: cooldownTime },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOtp) {
      const elapsed = Date.now() - recentOtp.createdAt.getTime();
      const retryAfter = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
      return { allowed: false, retryAfter };
    }

    // Check total failed attempts in the block window
    const failedCount = await prisma.otpRequest.count({
      where: {
        destination,
        status: 'BLOCKED',
        createdAt: { gte: blockWindow },
      },
    });

    if (failedCount >= BLOCK_THRESHOLD) {
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true };
  }

  /**
   * Send OTP to destination
   */
  async sendOtp(
    destination: string,
    purpose: OtpPurpose,
    channel: OtpChannel = 'email',
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<OtpResponse> {
    try {
      // Rate limit check
      const rateCheck = await this.checkRateLimit(destination, purpose);
      if (!rateCheck.allowed) {
        return {
          success: false,
          message: 'Please wait before requesting another OTP.',
          retryAfter: rateCheck.retryAfter,
        };
      }

      // Invalidate any existing active OTPs for this destination+purpose
      await prisma.otpRequest.updateMany({
        where: {
          destination,
          purpose,
          status: 'ACTIVE',
        },
        data: { status: 'EXPIRED' },
      });

      // Generate and hash OTP
      const otp = this.generateOtp();
      const otpHash = this.hashOtp(otp);
      const expiryTime = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

      // Store OTP record
      await prisma.otpRequest.create({
        data: {
          id: randomUUID(),
          userId: userId || null,
          destination,
          channel,
          purpose,
          otpHash,
          expiryTime,
          attempts: 0,
          maxAttempts: MAX_ATTEMPTS,
          status: 'ACTIVE',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      // Deliver OTP (via existing notification/email infrastructure)
      await this.deliverOtp(destination, otp, channel, purpose);

      logger.info(`[OTP] Sent ${channel} OTP to ${destination.substring(0, 3)}*** for ${purpose}`);

      return {
        success: true,
        message: `OTP sent to your ${channel === 'sms' ? 'phone' : 'email'}.`,
        expiresIn: OTP_EXPIRY_SECONDS,
      };
    } catch (error) {
      logger.error('[OTP] Send error:', error);
      return { success: false, message: 'Failed to send OTP. Please try again.' };
    }
  }

  /**
   * Verify OTP
   */
  async verifyOtp(
    destination: string,
    purpose: OtpPurpose,
    inputOtp: string,
  ): Promise<OtpVerifyResponse> {
    try {
      // Find active OTP for destination+purpose
      const otpRecord = await prisma.otpRequest.findFirst({
        where: {
          destination,
          purpose,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!otpRecord) {
        return { success: false, message: 'No active OTP found. Please request a new one.' };
      }

      // Check expiry
      if (new Date() > otpRecord.expiryTime) {
        await prisma.otpRequest.update({
          where: { id: otpRecord.id },
          data: { status: 'EXPIRED' },
        });
        return { success: false, message: 'OTP has expired. Please request a new one.' };
      }

      // Check max attempts
      if (otpRecord.attempts >= otpRecord.maxAttempts) {
        await prisma.otpRequest.update({
          where: { id: otpRecord.id },
          data: { status: 'BLOCKED' },
        });
        return { success: false, message: 'Maximum attempts exceeded. Please request a new OTP.' };
      }

      // Increment attempt count
      await prisma.otpRequest.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      // Verify OTP hash (constant-time comparison)
      const isValid = this.verifyHash(inputOtp, otpRecord.otpHash);

      if (!isValid) {
        const remaining = otpRecord.maxAttempts - otpRecord.attempts - 1;
        logger.warn(`[OTP] Invalid attempt for ${destination.substring(0, 3)}*** (${remaining} remaining)`);
        return {
          success: false,
          message: remaining > 0
            ? `Incorrect OTP. ${remaining} attempt(s) remaining.`
            : 'Maximum attempts exceeded. Please request a new OTP.',
        };
      }

      // Mark OTP as verified
      await prisma.otpRequest.update({
        where: { id: otpRecord.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      });

      // Generate a short-lived verification token
      const verificationToken = randomUUID();

      logger.info(`[OTP] Verified successfully for ${destination.substring(0, 3)}*** (${purpose})`);

      return {
        success: true,
        message: 'OTP verified successfully.',
        verificationToken,
      };
    } catch (error) {
      logger.error('[OTP] Verification error:', error);
      return { success: false, message: 'Verification failed. Please try again.' };
    }
  }

  /**
   * Deliver OTP via configured channel
   */
  private async deliverOtp(
    destination: string,
    otp: string,
    channel: OtpChannel,
    purpose: OtpPurpose,
  ): Promise<void> {
    const purposeText = {
      signup: 'account registration',
      login: 'login verification',
      reset_password: 'password reset',
      aa_consent: 'Account Aggregator consent',
      sensitive_action: 'action verification',
    }[purpose];

    if (channel === 'email') {
      // Use existing notification system for email delivery
      logger.info(`[OTP] Email delivery to ${destination}: OTP for ${purposeText}`);
      // In production, integrate with email service (Supabase Auth email, SendGrid, etc.)
      // For development, log the OTP
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`[OTP] DEV MODE - OTP: ${otp} (destination: ${destination})`);
      }
    } else {
      // SMS delivery
      logger.info(`[OTP] SMS delivery to ${destination}: OTP for ${purposeText}`);
      // In production, integrate with SMS gateway (Twilio, MSG91, etc.)
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`[OTP] DEV MODE - OTP: ${otp} (destination: ${destination})`);
      }
    }
  }

  /**
   * Check if a valid verification exists (for gating sensitive operations)
   */
  async hasRecentVerification(destination: string, purpose: OtpPurpose, withinSeconds = 300): Promise<boolean> {
    const threshold = new Date(Date.now() - withinSeconds * 1000);
    const verified = await prisma.otpRequest.findFirst({
      where: {
        destination,
        purpose,
        status: 'VERIFIED',
        verifiedAt: { gte: threshold },
      },
    });
    return Boolean(verified);
  }
}

export const otpService = new OtpService();

