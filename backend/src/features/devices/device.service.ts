import { prisma } from '../../utils/prisma';
import { AppError } from '../../utils/errors';
import crypto from 'crypto';

export class DeviceService {
  /**
   * Register or update a device for a user
   */
  static async registerDevice(
    userId: string,
    data: {
      deviceId: string;
      deviceName: string;
      deviceType: 'mobile' | 'web' | 'desktop' | 'tablet';
      osType: string;
      osVersion?: string;
      fcmToken?: string;
      apnsToken?: string;
    }
  ) {
    try {
      // Check if device already exists
      const existingDevice = await prisma.device.findUnique({
        where: {
          userId_deviceId: {
            userId,
            deviceId: data.deviceId,
          },
        },
      });

      if (existingDevice) {
        // Update existing device
        return await prisma.device.update({
          where: {
            userId_deviceId: {
              userId,
              deviceId: data.deviceId,
            },
          },
          data: {
            deviceName: data.deviceName,
            deviceType: data.deviceType,
            osType: data.osType,
            osVersion: data.osVersion,
            fcmToken: data.fcmToken || existingDevice.fcmToken,
            apnsToken: data.apnsToken || existingDevice.apnsToken,
            lastSyncedAt: new Date(),
          },
        });
      }

      // Create new device
      return await prisma.device.create({
        data: {
          userId,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          deviceType: data.deviceType,
          osType: data.osType,
          osVersion: data.osVersion,
          fcmToken: data.fcmToken,
          apnsToken: data.apnsToken,
          metadata: {
            registeredAt: new Date().toISOString(),
            userAgent: process.env.NODE_ENV,
          },
        },
      });
    } catch (error) {
      console.error('Device registration error:', error);
      throw new AppError(500, 'DEVICE_REGISTRATION_FAILED', 'Failed to register device');
    }
  }

  /**
   * Get all devices for a user
   */
  static async getUserDevices(userId: string) {
    try {
      return await prisma.device.findMany({
        where: { userId },
        select: {
          id: true,
          deviceId: true,
          deviceName: true,
          deviceType: true,
          osType: true,
          isActive: true,
          lastSyncedAt: true,
          createdAt: true,
        },
        orderBy: { lastSyncedAt: 'desc' },
      });
    } catch (error) {
      console.error('Get user devices error:', error);
      throw new AppError(500, 'FETCH_DEVICES_FAILED', 'Failed to fetch devices');
    }
  }

  /**
   * Get a specific device
   */
  static async getDevice(userId: string, deviceId: string) {
    try {
      const device = await prisma.device.findUnique({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
      });

      if (!device) {
        throw new AppError(404, 'DEVICE_NOT_FOUND', 'Device not found');
      }

      return device;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Get device error:', error);
      throw new AppError(500, 'FETCH_DEVICE_FAILED', 'Failed to fetch device');
    }
  }

  /**
   * Update device activity/sync timestamp
   */
  static async updateDeviceSync(userId: string, deviceId: string) {
    try {
      return await prisma.device.update({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
        data: {
          lastSyncedAt: new Date(),
          isActive: true,
        },
      });
    } catch (error) {
      console.error('Update device sync error:', error);
      // Don't throw here, just log - not critical for sync operation
    }
  }

  /**
   * Deactivate a device
   */
  static async deactivateDevice(userId: string, deviceId: string) {
    try {
      return await prisma.device.update({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
        data: {
          isActive: false,
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Deactivate device error:', error);
      throw new AppError(500, 'DEACTIVATE_DEVICE_FAILED', 'Failed to deactivate device');
    }
  }

  /**
   * Delete a device
   */
  static async deleteDevice(userId: string, deviceId: string) {
    try {
      const device = await this.getDevice(userId, deviceId);

      return await prisma.device.delete({
        where: {
          id: device.id,
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Delete device error:', error);
      throw new AppError(500, 'DELETE_DEVICE_FAILED', 'Failed to delete device');
    }
  }

  /**
   * Update notification tokens
   */
  static async updateNotificationTokens(
    userId: string,
    deviceId: string,
    tokens: { fcmToken?: string; apnsToken?: string }
  ) {
    try {
      return await prisma.device.update({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
        data: {
          fcmToken: tokens.fcmToken || undefined,
          apnsToken: tokens.apnsToken || undefined,
        },
      });
    } catch (error) {
      console.error('Update notification tokens error:', error);
      throw new AppError(500, 'UPDATE_TOKENS_FAILED', 'Failed to update notification tokens');
    }
  }

  /**
   * Get active devices for sync broadcasting
   */
  static async getActiveDevicesForUser(userId: string, excludeDeviceId?: string) {
    try {
      return await prisma.device.findMany({
        where: {
          userId,
          isActive: true,
          ...(excludeDeviceId && { NOT: { deviceId: excludeDeviceId } }),
        },
        select: {
          id: true,
          deviceId: true,
          deviceType: true,
          fcmToken: true,
          apnsToken: true,
        },
      });
    } catch (error) {
      console.error('Get active devices error:', error);
      return [];
    }
  }

  /**
   * Generate device fingerprint
   */
  static generateDeviceFingerprint(data: {
    userAgent?: string;
    platform?: string;
    screen?: { width: number; height: number };
  }): string {
    const fingerprint = JSON.stringify(data);
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  }
}
