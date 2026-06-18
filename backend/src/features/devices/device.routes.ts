import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams, z } from '../../middleware/validate';
import * as DeviceController from './device.controller';

const router = Router();

// All device routes require authentication
router.use(authMiddleware);

// Schemas — kept here so the route layer is the single source of truth for
// what shapes are accepted.  Mirrors device.controller.ts.
const deviceIdParamsSchema = z.object({
  // deviceId is a client-supplied string (UUID, FCM install id, etc).
  // Length capped to prevent log/DB abuse; charset restricted to URL-safe.
  deviceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._\-:]+$/, 'invalid deviceId'),
});

const registerDeviceBodySchema = z.object({
  deviceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._\-:]+$/, 'invalid deviceId'),
  deviceName: z.string().min(1).max(120),
  deviceType: z.enum(['mobile', 'web', 'desktop', 'tablet']),
  osType: z.string().min(1).max(40),
  osVersion: z.string().max(40).optional(),
  fcmToken: z.string().max(512).optional(),
  apnsToken: z.string().max(512).optional(),
});

const updateTokensBodySchema = z.object({
  fcmToken: z.string().max(512).optional(),
  apnsToken: z.string().max(512).optional(),
});

/**
 * POST /api/v1/devices - Register or update a device
 */
router.post('/', validateBody(registerDeviceBodySchema), DeviceController.registerDevice);

/**
 * GET /api/v1/devices - Get all devices for current user
 */
router.get('/', DeviceController.getDevices);

/**
 * GET /api/v1/devices/:deviceId - Get specific device
 */
router.get('/:deviceId', validateParams(deviceIdParamsSchema), DeviceController.getDevice);

/**
 * POST /api/v1/devices/:deviceId/sync - Update device sync timestamp
 */
router.post('/:deviceId/sync', validateParams(deviceIdParamsSchema), DeviceController.updateSync);

/**
 * PUT /api/v1/devices/:deviceId/tokens - Update notification tokens
 */
router.put(
  '/:deviceId/tokens',
  validateParams(deviceIdParamsSchema),
  validateBody(updateTokensBodySchema),
  DeviceController.updateNotificationTokens,
);

/**
 * POST /api/v1/devices/:deviceId/deactivate - Deactivate a device
 */
router.post(
  '/:deviceId/deactivate',
  validateParams(deviceIdParamsSchema),
  DeviceController.deactivateDevice,
);

/**
 * DELETE /api/v1/devices/:deviceId - Delete a device
 */
router.delete('/:deviceId', validateParams(deviceIdParamsSchema), DeviceController.deleteDevice);

export { router as deviceRoutes };
