import { prisma } from '../../db/prisma';
import bcrypt from 'bcryptjs';
import { logger } from '../../config/logger';

export interface CreatePinRequest {
  userId: string;
  pin: string; // 6-digit PIN
  email?: string;
  name?: string;
  role?: string;
  isApproved?: boolean;
}

export interface VerifyPinRequest {
  userId: string;
  pin: string;
  deviceId?: string;
}

export interface UpdatePinRequest {
  userId: string;
  currentPin: string;
  newPin: string;
}

export interface PinResponse {
  success: boolean;
  message: string;
  expiresAt?: string;
  attemptsRemaining?: number;
  lockedUntil?: string;
  backup?: string;
}

class PinService {
  private readonly PIN_LENGTH = 6;
  private readonly PIN_EXPIRY_DAYS = 90;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_HOURS = 1;

  private normalizeRole(role?: string): 'admin' | 'advisor' | 'user' {
    if (role === 'admin' || role === 'advisor' || role === 'user') {
      return role;
    }

    if (role === 'customer') {
      return 'user';
    }

    return 'user';
  }

  private async ensureLocalUser(request: CreatePinRequest): Promise<void> {
    const normalizedRole = this.normalizeRole(request.role);
    const resolvedEmail = request.email?.trim() || `user-${request.userId.slice(0, 8)}@placeholder.KANKU.app`;
    const fallbackNameFromEmail = resolvedEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'User';
    const resolvedName = request.name?.trim() || fallbackNameFromEmail || 'User';

    await prisma.user.upsert({
      where: { id: request.userId },
      update: {
        email: resolvedEmail,
        name: resolvedName,
        role: normalizedRole,
        status: 'verified',
        isApproved: request.isApproved ?? normalizedRole !== 'advisor',
      },
      create: {
        id: request.userId,
        email: resolvedEmail,
        name: resolvedName,
        password: 'supabase-managed-account',
        role: normalizedRole,
        status: 'verified',
        isApproved: request.isApproved ?? normalizedRole !== 'advisor',
      },
    });
  }

  /**
   * Create a new PIN for a user
   */
  async createPin(request: CreatePinRequest): Promise<PinResponse> {
    try {
      const { userId, pin } = request;

      // Validate PIN format
      if (!this.validatePinFormat(pin)) {
        return {
          success: false,
          message: 'PIN must be exactly 6 digits',
        };
      }

      // Check if PIN is weak
      if (this.isWeakPin(pin)) {
        return {
          success: false,
          message: 'PIN is too weak. Avoid sequential, repeating, or common patterns.',
        };
      }

      // Check if PIN already exists
      const existingPin = await prisma.userPin.findUnique({
        where: { userId },
      });

      if (existingPin) {
        return {
          success: false,
          message: 'PIN already exists. Use update PIN endpoint instead.',
        };
      }

      await this.ensureLocalUser(request);

      // Hash the PIN
      const pinHash = await bcrypt.hash(pin, 12);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.PIN_EXPIRY_DAYS);

      // Create PIN record
      await prisma.userPin.create({
        data: {
          userId,
          pinHash,
          expiresAt,
          isActive: true,
        },
      });

      return {
        success: true,
        message: 'PIN created successfully',
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('[PinService] Create PIN error:', error);
      return {
        success: false,
        message: 'Failed to create PIN',
      };
    }
  }

  /**
   * Verify a user's PIN
   */
  async verifyPin(request: VerifyPinRequest): Promise<PinResponse> {
    try {
      const { userId, pin, deviceId } = request;

      // Validate PIN format
      if (!this.validatePinFormat(pin)) {
        return {
          success: false,
          message: 'Invalid PIN format',
        };
      }

      // Get user's PIN record
      const userPin = await prisma.userPin.findUnique({
        where: { userId },
      });

      if (!userPin) {
        return {
          success: false,
          message: 'PIN not set for this user',
        };
      }

      // Check if PIN is locked
      if (userPin.lockedUntil && userPin.lockedUntil > new Date()) {
        return {
          success: false,
          message: 'PIN is temporarily locked due to failed attempts',
          lockedUntil: userPin.lockedUntil.toISOString(),
        };
      }

      // Check if PIN is expired
      if (userPin.expiresAt < new Date()) {
        return {
          success: false,
          message: 'PIN has expired. Please create a new PIN.',
        };
      }

      // Check if PIN is active
      if (!userPin.isActive) {
        return {
          success: false,
          message: 'PIN is not active',
        };
      }

      // Verify the PIN
      const isPinValid = await bcrypt.compare(pin, userPin.pinHash);

      if (!isPinValid) {
        // Increment failed attempts
        const updatedFailedAttempts = userPin.failedAttempts + 1;
        const shouldLock = updatedFailedAttempts >= this.MAX_FAILED_ATTEMPTS;

        const updateData: any = {
          failedAttempts: updatedFailedAttempts,
        };

        if (shouldLock) {
          const lockedUntil = new Date();
          lockedUntil.setHours(lockedUntil.getHours() + this.LOCKOUT_DURATION_HOURS);
          updateData.lockedUntil = lockedUntil;
        }

        await prisma.userPin.update({
          where: { userId },
          data: updateData,
        });

        return {
          success: false,
          message: shouldLock
            ? `PIN incorrect. Account locked for ${this.LOCKOUT_DURATION_HOURS} hours.`
            : 'PIN incorrect',
          attemptsRemaining: Math.max(0, this.MAX_FAILED_ATTEMPTS - updatedFailedAttempts),
          lockedUntil: shouldLock ? updateData.lockedUntil.toISOString() : undefined,
        };
      }

      // PIN is correct - reset failed attempts and update last activity
      await prisma.userPin.update({
        where: { userId },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      // Update device last seen if provided
      if (deviceId) {
        await prisma.device.update({
          where: { deviceId },
          data: { lastSeenAt: new Date() },
        }).catch(() => {
          // Device might not exist, ignore
        });
      }

      return {
        success: true,
        message: 'PIN verified successfully',
        expiresAt: userPin.expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('[PinService] Verify PIN error:', error);
      return {
        success: false,
        message: 'Failed to verify PIN',
      };
    }
  }

  /**
   * Update an existing PIN
   */
  async updatePin(request: UpdatePinRequest): Promise<PinResponse> {
    try {
      const { userId, currentPin, newPin } = request;

      // Validate new PIN format
      if (!this.validatePinFormat(newPin)) {
        return {
          success: false,
          message: 'New PIN must be exactly 6 digits',
        };
      }

      // Check if new PIN is weak
      if (this.isWeakPin(newPin)) {
        return {
          success: false,
          message: 'New PIN is too weak. Avoid sequential, repeating, or common patterns.',
        };
      }

      // Verify current PIN first
      const verifyResult = await this.verifyPin({ userId, pin: currentPin });
      if (!verifyResult.success) {
        return {
          success: false,
          message: 'Current PIN is incorrect',
        };
      }

      // Hash the new PIN
      const newPinHash = await bcrypt.hash(newPin, 12);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.PIN_EXPIRY_DAYS);

      // Update PIN record
      await prisma.userPin.update({
        where: { userId },
        data: {
          pinHash: newPinHash,
          expiresAt,
          failedAttempts: 0,
          lockedUntil: null,
          isActive: true,
        },
      });

      return {
        success: true,
        message: 'PIN updated successfully',
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('[PinService] Update PIN error:', error);
      return {
        success: false,
        message: 'Failed to update PIN',
      };
    }
  }

  /**
   * Check PIN status and expiry
   */
  async getPinStatus(userId: string): Promise<PinResponse> {
    try {
      const userPin = await prisma.userPin.findUnique({
        where: { userId },
      });

      if (!userPin) {
        return {
          success: false,
          message: 'PIN not set for this user',
        };
      }

      const isExpired = userPin.expiresAt < new Date();
      const lockedUntil = userPin.lockedUntil && userPin.lockedUntil > new Date()
        ? userPin.lockedUntil.toISOString()
        : undefined;
      const isLocked = Boolean(lockedUntil);

      return {
        success: true,
        message: isExpired ? 'PIN has expired' : isLocked ? 'PIN is locked' : 'PIN is active',
        expiresAt: userPin.expiresAt.toISOString(),
        lockedUntil,
      };
    } catch (error) {
      logger.error('[PinService] Get PIN status error:', error);
      return {
        success: false,
        message: 'Failed to get PIN status',
      };
    }
  }

  /**
   * Force reset PIN (admin function)
   */
  async forceResetPin(userId: string): Promise<PinResponse> {
    try {
      const deleted = await prisma.userPin.deleteMany({
        where: { userId },
      });

      return {
        success: true,
        message: deleted.count > 0
          ? 'PIN reset successfully. User must create a new PIN.'
          : 'PIN already reset. User must create a new PIN.',
      };
    } catch (error) {
      logger.error('[PinService] Force reset PIN error:', error);
      return {
        success: false,
        message: 'Failed to reset PIN',
      };
    }
  }

  /**
   * Validate PIN format (6 digits)
   */
  private validatePinFormat(pin: string): boolean {
    return /^\d{6}$/.test(pin);
  }

  /**
   * Check if PIN is weak (sequential, repeating, or common patterns)
   */
  public isWeakPin(pin: string): boolean {
    // Sequential ascending/descending
    const isSequential = /012|123|234|345|456|567|678|789/.test(pin) || /987|876|765|654|543|432|321|210/.test(pin);
    // Repeating characters (e.g. 111111, 222222)
    const isRepeating = /(.)\1{2,}/.test(pin);
    // Common patterns
    const isPattern = /^(121212|101010|010101|212121|112233|223344)$/.test(pin);
    
    return isSequential || isRepeating || isPattern;
  }

  /**
   * Check if PIN is expiring soon (within 7 days)
   */
  async isPinExpiringSoon(userId: string): Promise<boolean> {
    try {
      const userPin = await prisma.userPin.findUnique({
        where: { userId },
      });

      if (!userPin) {
        return false;
      }

      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      return userPin.expiresAt <= sevenDaysFromNow;
    } catch (error) {
      logger.error('[PinService] Check PIN expiry error:', error);
      return false;
    }
  }

  /**
   * Get days remaining until PIN expires
   */
  async getPinDaysRemaining(userId: string): Promise<number> {
    try {
      const userPin = await prisma.userPin.findUnique({
        where: { userId },
      });

      if (!userPin) {
        return 0;
      }

      const now = new Date();
      const expiresAt = new Date(userPin.expiresAt);
      const diffTime = expiresAt.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return Math.max(0, diffDays);
    } catch (error) {
      logger.error('[PinService] Get PIN days remaining error:', error);
      return 0;
    }
  }

  async savePinKeyBackup(request: { userId: string; backup: string }): Promise<PinResponse> {
    const { userId, backup } = request;

    if (!backup || typeof backup !== 'string') {
      return {
        success: false,
        message: 'PIN key backup is required',
      };
    }

    try {
      const updated = await prisma.userPin.updateMany({
        where: { userId },
        data: { keyBackup: backup },
      });

      if (updated.count === 0) {
        return {
          success: false,
          message: 'PIN not set for this user',
        };
      }

      return {
        success: true,
        message: 'PIN key backup saved successfully',
      };
    } catch (error) {
      logger.error('[PinService] Save PIN key backup error:', error);
      return {
        success: false,
        message: 'Failed to save PIN key backup',
      };
    }
  }

  async getPinKeyBackup(userId: string): Promise<PinResponse> {
    try {
      const userPin = await prisma.userPin.findUnique({
        where: { userId },
        select: { keyBackup: true },
      });

      if (!userPin?.keyBackup) {
        return {
          success: false,
          message: 'No PIN key backup found',
        };
      }

      return {
        success: true,
        message: 'PIN key backup loaded successfully',
        backup: userPin.keyBackup,
      };
    } catch (error) {
      logger.error('[PinService] Get PIN key backup error:', error);
      return {
        success: false,
        message: 'Failed to load PIN key backup',
      };
    }
  }

  async clearPinKeyBackup(userId: string): Promise<PinResponse> {
    try {
      const updated = await prisma.userPin.updateMany({
        where: { userId },
        data: { keyBackup: null },
      });

      if (updated.count === 0) {
        return {
          success: false,
          message: 'PIN not set for this user',
        };
      }

      return {
        success: true,
        message: 'PIN key backup cleared successfully',
      };
    } catch (error) {
      logger.error('[PinService] Clear PIN key backup error:', error);
      return {
        success: false,
        message: 'Failed to clear PIN key backup',
      };
    }
  }
}

export const pinService = new PinService();
