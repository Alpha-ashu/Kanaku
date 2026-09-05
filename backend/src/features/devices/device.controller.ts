import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { DeviceService } from './device.service';
import { prisma } from '../../db/prisma';
import { sendPushNotification } from '../../config/firebase';
import { z } from 'zod';

// Validation schemas
const registerDeviceSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  deviceName: z.string().min(1, 'Device name is required'),
  deviceType: z.enum(['mobile', 'web', 'desktop', 'tablet'], {
    message: 'Invalid device type',
  }),
  osType: z.string().min(1, 'OS type is required'),
  osVersion: z.string().optional(),
  fcmToken: z.string().optional(),
  apnsToken: z.string().optional(),
});

const updateTokensSchema = z.object({
  fcmToken: z.string().optional(),
  apnsToken: z.string().optional(),
});

/**
 * Register or update a device
 */
export const registerDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const validatedData = registerDeviceSchema.parse(req.body);

    const device = await DeviceService.registerDevice(userId, validatedData as any);

    res.status(200).json({
      success: true,
      data: device,
      message: 'Device registered successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all devices for current user
 */
export const getDevices = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const devices = await DeviceService.getUserDevices(userId);

    res.status(200).json({
      success: true,
      data: devices,
      count: devices.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific device
 */
export const getDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { deviceId } = req.params;

    const device = await DeviceService.getDevice(userId, deviceId);

    res.status(200).json({
      success: true,
      data: device,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update device sync timestamp
 */
export const updateSync = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { deviceId } = req.params;

    const device = await DeviceService.updateDeviceSync(userId, deviceId);

    res.status(200).json({
      success: true,
      data: device,
      message: 'Device sync updated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update notification tokens
 */
export const updateNotificationTokens = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { deviceId } = req.params;

    const validatedData = updateTokensSchema.parse(req.body);

    const device = await DeviceService.updateNotificationTokens(userId, deviceId, validatedData);

    res.status(200).json({
      success: true,
      data: device,
      message: 'Notification tokens updated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deactivate a device
 */
export const deactivateDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { deviceId } = req.params;

    const device = await DeviceService.deactivateDevice(userId, deviceId);

    res.status(200).json({
      success: true,
      data: device,
      message: 'Device deactivated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a device
 */
export const deleteDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { deviceId } = req.params;

    await DeviceService.deleteDevice(userId, deviceId);

    res.status(200).json({
      success: true,
      message: 'Device deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send test push notification to a device
 */
export const testNotification = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { deviceId } = req.params;

    const device = await prisma.device.findFirst({
      where: {
        userId,
        deviceId,
        isActive: true,
      },
    });

    if (!device) {
      return res.status(404).json({ error: 'Active device not found' });
    }

    const title = 'Kanaku Test Notification';
    const message = `Push notification delivered successfully to ${device.deviceName || 'your device'}.`;

    // Create durable notification record in the database
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'info',
        category: 'device_test',
        deepLink: '/settings',
        priority: 'high',
        channels: JSON.stringify(['push', 'app']),
        deliveryStatus: JSON.stringify({
          app: 'sent',
          push: device.fcmToken || device.apnsToken ? 'sent' : 'queued',
        }),
        status: 'sent',
        sentAt: new Date(),
      },
    });

    // Directly dispatch push notification if token exists
    const token = device.fcmToken || device.apnsToken;
    let pushResult: any = null;
    if (token) {
      try {
        pushResult = await sendPushNotification(token, {
          title,
          body: message,
          data: {
            notificationId: notification.id,
            category: 'device_test',
            deepLink: '/settings',
            priority: 'high',
          },
        });
      } catch (err: any) {
        console.warn('[DeviceController] Test push notification warning:', err.message);
      }
    }

    res.status(200).json({
      success: true,
      message: token
        ? 'Push notification sent to device'
        : 'Test notification created (device has no push token attached)',
      data: {
        notificationId: notification.id,
        device: {
          id: device.id,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          hasToken: Boolean(token),
        },
        pushResult,
      },
    });
  } catch (error) {
    next(error);
  }
};
