import { Router, Response, NextFunction } from 'express';
import { syncService } from './sync.service';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';

const router = Router();

// All sync routes require authentication
router.use(authMiddleware);

// NOTE: sync routes keep their in-handler validation (clear, tested error
// messages like 'Device ID is required'). The per-entity payload is further
// validated defensively in sync.service (unknown entity types are rejected and
// only allow-listed fields are persisted), so a generic validateBody layer is
// intentionally not used here.

function requireUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) throw AppError.unauthorized();
  return userId;
}

/**
 * POST /api/v1/sync/pull
 */
router.post('/pull', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { deviceId, lastSyncedAt, entityTypes } = req.body;

    if (!deviceId) throw AppError.badRequest('Device ID is required', 'DEVICE_ID_REQUIRED');

    if (lastSyncedAt && Number.isNaN(Date.parse(String(lastSyncedAt)))) {
      throw AppError.badRequest('lastSyncedAt must be a valid timestamp', 'INVALID_TIMESTAMP');
    }

    const result = await syncService.pullData({ userId, deviceId, lastSyncedAt, entityTypes });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/sync/push
 */
router.post('/push', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { deviceId, entities } = req.body;

    if (!deviceId || !entities || !Array.isArray(entities)) {
      throw AppError.badRequest('Device ID and entities array are required', 'PUSH_FIELDS_REQUIRED');
    }

    const result = await syncService.pushData({ userId, deviceId, entities });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/sync/register-device
 */
router.post('/register-device', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { deviceId, deviceName, deviceType, platform, appVersion } = req.body;

    if (!deviceId) throw AppError.badRequest('Device ID is required', 'DEVICE_ID_REQUIRED');

    const device = await syncService.registerDevice(userId, {
      deviceId, deviceName, deviceType, platform, appVersion,
    });

    res.json({ success: true, device });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/sync/devices
 */
router.get('/devices', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const devices = await syncService.getUserDevices(userId);
    res.json({ success: true, devices });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/sync/deactivate-device
 */
router.post('/deactivate-device', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { deviceId } = req.body;

    if (!deviceId) throw AppError.badRequest('Device ID is required', 'DEVICE_ID_REQUIRED');

    await syncService.deactivateDevice(userId, deviceId);
    res.json({ success: true, message: 'Device deactivated' });
  } catch (error) {
    next(error);
  }
});

export { router as syncRoutes };
