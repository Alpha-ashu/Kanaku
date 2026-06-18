import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../../config/logger';
import { prisma } from '../../db/prisma';
import { sendEmail } from '../../utils/email';
import type { OtpChannel, OtpPurpose, OtpResponse, OtpVerifyResponse } from './otp.types';

/**
 * Server-side secret keying the OTP HMAC. A dedicated OTP_HMAC_SECRET is
 * preferred; we fall back to JWT_SECRET (always set) so existing deployments
 * keep working without a new env var. Keying the hash means a DB read alone
 * cannot be brute-forced/rainbow-tabled against the small 6-digit OTP space.
 */
const OTP_HMAC_SECRET = process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET || 'kanaku-otp-fallback-secret';

/**
 * OTP Service — RBI-Compliant OTP Generation and Verification
 *
 * Security Controls:
 * - 6-digit numeric OTP
 * - 90-second expiry (configurable)
 * - Max 5 attempts per OTP
 * - Rate limiting: 1 OTP per purpose per 60s cooldown
 * - Constant-time comparison to prevent timing attacks
 * - Hash-only storage (keyed HMAC-SHA256)
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
   * Hash OTP for secure storage (keyed HMAC-SHA256).
   * Keyed so an attacker with DB read access cannot precompute the full
   * 6-digit space and reverse a stored hash.
   */
  private hashOtp(otp: string): string {
    return createHmac('sha256', OTP_HMAC_SECRET).update(otp).digest('hex');
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
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`[OTP] DEV MODE - OTP: ${otp} (destination: ${destination})`);
      }

      const sent = await sendEmail({
        to: destination,
        subject: `Your Kanaku verification code: ${otp}`,
        html: buildOtpEmailHtml(otp, purposeText, OTP_EXPIRY_SECONDS),
        categories: ['kanaku-otp', purpose],
      });

      if (sent) {
        logger.info(`[OTP] Email delivered to ${destination.substring(0, 3)}*** for ${purposeText}`);
      } else {
        logger.warn(`[OTP] Email delivery failed/skipped for ${destination.substring(0, 3)}*** — OTP still valid, user can request resend`);
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

function buildOtpEmailHtml(otp: string, purposeText: string, expirySeconds: number): string {
  const minutes = Math.round(expirySeconds / 60) || 1;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #333; }
          .container { max-width: 480px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
          .card { background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
          .logo { font-size: 22px; font-weight: bold; color: #5B21B6; margin-bottom: 8px; }
          .code { font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #1f2937; background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0; }
          .message { font-size: 14px; color: #4b5563; }
          .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="logo">KANAKU</div>
            <p class="message">Use this code to complete your ${purposeText}:</p>
            <div class="code">${otp}</div>
            <p class="message">This code expires in ${minutes} minute${minutes === 1 ? '' : 's'}. Never share it with anyone.</p>
            <div class="footer">
              <p>If you didn't request this, you can safely ignore this email.</p>
              <p>&copy; ${new Date().getFullYear()} Kanaku. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export const otpService = new OtpService();

