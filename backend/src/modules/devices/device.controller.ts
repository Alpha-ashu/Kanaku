import { Request, Response, NextFunction } from 'express';
import { DeviceService } from './device.service';
import { validateRequest } from '../../middleware/validation';
import { z } from 'zod';

// Validation schemas
const registerDeviceSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  deviceName: z.string().min(1, 'Device name is required'),
  deviceType: z.enum(['mobile', 'web', 'desktop', 'tablet'], {
    errorMap: () => ({ message: 'Invalid device type' }),
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
export const registerDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = registerDeviceSchema.parse(req.body);

    const device = await DeviceService.registerDevice(userId, validatedData);

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
export const getDevices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
export const getDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { deviceId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
export const updateSync = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { deviceId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
export const updateNotificationTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { deviceId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
export const deactivateDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { deviceId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
export const deleteDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { deviceId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await DeviceService.deleteDevice(userId, deviceId);

    res.status(200).json({
      success: true,
      message: 'Device deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
