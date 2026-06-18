# notifications module

> In-app notifications and notification preferences.

**Base path:** `/api/v1/notifications`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/notifications` | auth | `NotificationController.getNotifications` |
| GET | `/notifications/unread/count` | auth | `NotificationController.getUnreadCount` |
| GET | `/notifications/:id` | auth | `NotificationController.getNotification` |
| PUT | `/notifications/:id/read` | auth | `NotificationController.markAsRead` |
| POST | `/notifications/mark-all-read` | auth | `NotificationController.markAllAsRead` |
| DELETE | `/notifications/:id` | auth | `NotificationController.deleteNotification` |
| DELETE | `/notifications` | auth | `NotificationController.clearAllNotifications` |
| POST | `/notifications/send` | auth, admin | `NotificationController.sendNotification` |

## Files

- `cross-device-sync.service.ts`
- `notification.controller.ts`
- `notification.routes.ts`
- `notification.service.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · ✅ service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `notifications/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
