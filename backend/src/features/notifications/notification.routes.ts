import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as NotificationController from './notification.controller';
import {
  notificationIdParamSchema,
  listNotificationsQuerySchema,
  sendNotificationSchema,
  notificationPreferencesSchema,
} from './notification.validation';

const router = Router();

// All notification routes require authentication
router.use(authMiddleware);

// Get user's notifications
router.get('/', validateQuery(listNotificationsQuerySchema), NotificationController.getNotifications);

// Get unread count
router.get('/unread/count', NotificationController.getUnreadCount);

// Notification preferences — registered before '/:id' so "preferences" is not read as an id
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', validateBody(notificationPreferencesSchema), NotificationController.updatePreferences);

// Get specific notification
router.get('/:id', validateParams(notificationIdParamSchema), NotificationController.getNotification);

// Mark as read
router.put('/:id/read', validateParams(notificationIdParamSchema), NotificationController.markAsRead);

// Mark all as read
router.post('/mark-all-read', NotificationController.markAllAsRead);

// Delete notification
router.delete('/:id', validateParams(notificationIdParamSchema), NotificationController.deleteNotification);

// Clear all
router.delete('/', NotificationController.clearAllNotifications);

// Send notification (admin/system only)
router.post('/send', requireRole('admin'), validateBody(sendNotificationSchema), NotificationController.sendNotification);

export { router as notificationRoutes };
