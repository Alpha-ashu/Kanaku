/**
 * Backend Sync Routes
 * 
 * These routes handle backend-first synchronization to reduce
 * frontend processing and prevent UI refreshes on tab switching.
 */

import express from 'express';
import { syncService } from '../features/sync/sync.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Pull data from backend (frontend requests latest data)
router.post('/pull', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId, deviceId, lastSyncedAt, entityTypes } = req.body;
    
    // Validate request
    if (!userId || !deviceId) {
      return res.status(400).json({
        success: false,
        error: 'userId and deviceId are required',
      });
    }

    // Ensure user can only access their own data
    if (userId !== req.user?.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Pull data from backend
    const syncResponse = await syncService.pullData({
      userId,
      deviceId,
      lastSyncedAt,
      entityTypes,
    });

    res.json(syncResponse);
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during sync pull',
    });
  }
});

// Push data to backend (frontend sends changes)
router.post('/push', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId, deviceId, entities } = req.body;
    
    // Validate request
    if (!userId || !deviceId || !Array.isArray(entities)) {
      return res.status(400).json({
        success: false,
        error: 'userId, deviceId, and entities array are required',
      });
    }

    // Ensure user can only access their own data
    if (userId !== req.user?.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Push data to backend
    const syncResponse = await syncService.pushData({
      userId,
      deviceId,
      entities,
    });

    res.json(syncResponse);
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during sync push',
    });
  }
});

// Get sync status for a user
router.get('/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get user's devices and sync status
    const devices = await syncService.getUserDevices(userId);
    
    res.json({
      success: true,
      data: {
        devices,
        lastSynced: new Date(),
        status: 'active',
      },
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during sync status',
    });
  }
});

// Register a new device for sync
router.post('/register-device', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const deviceInfo = req.body;
    
    // Register device
    const device = await syncService.registerDevice(userId, deviceInfo);
    
    res.json({
      success: true,
      data: device,
    });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device',
    });
  }
});

// Deactivate a device
router.delete('/device/:deviceId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const { deviceId } = req.params;
    
    // Deactivate device
    await syncService.deactivateDevice(userId, deviceId);
    
    res.json({
      success: true,
      message: 'Device deactivated successfully',
    });
  } catch (error) {
    console.error('Device deactivation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate device',
    });
  }
});

export default router;
