import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as DeviceController from './device.controller';

const router = Router();

// All device routes require authentication
router.use(authMiddleware);

/**
 * POST /api/v1/devices - Register or update a device
 * Body: { deviceId, deviceName, deviceType, osType, osVersion, fcmToken, apnsToken }
 */
router.post('/', DeviceController.registerDevice);

/**
 * GET /api/v1/devices - Get all devices for current user
 */
router.get('/', DeviceController.getDevices);

/**
 * GET /api/v1/devices/:deviceId - Get specific device
 */
router.get('/:deviceId', DeviceController.getDevice);

/**
 * POST /api/v1/devices/:deviceId/sync - Update device sync timestamp
 */
router.post('/:deviceId/sync', DeviceController.updateSync);

/**
 * PUT /api/v1/devices/:deviceId/tokens - Update notification tokens
 * Body: { fcmToken, apnsToken }
 */
router.put('/:deviceId/tokens', DeviceController.updateNotificationTokens);

/**
 * POST /api/v1/devices/:deviceId/deactivate - Deactivate a device
 */
router.post('/:deviceId/deactivate', DeviceController.deactivateDevice);

/**
 * DELETE /api/v1/devices/:deviceId - Delete a device
 */
router.delete('/:deviceId', DeviceController.deleteDevice);

export { router as deviceRoutes };
