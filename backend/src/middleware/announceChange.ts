import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
import { logger } from '../config/logger';
import { getSocketManager } from '../sockets';

/**
 * Tell a user's other devices that one of their backend-owned tables changed.
 *
 * Budgets, recurring transactions and categories are NOT part of the Dexie sync
 * engine's ten synced tables. They mirror through featureSyncService, which
 * App.tsx runs once per session and otherwise only on a manual pull-to-refresh.
 * So a budget created on a phone did not appear on an already-open laptop until
 * that laptop was reloaded — the same multi-device gap that bills had.
 *
 * Implemented as middleware rather than a call inside each handler because
 * these routers have eight-odd mutating endpoints between them, and an emit
 * added by hand is an emit that gets forgotten on the ninth. Hooking `finish`
 * also means the event is tied to what the client was actually told: it fires on
 * a 2xx and stays silent on a 4xx/5xx, without any handler having to remember.
 *
 * Reads are skipped — they change nothing, and a device reacting to its own
 * refetch by refetching would be a loop. The event goes to the acting user's own
 * room only, so it carries no data another account could act on; the devices
 * that receive it re-pull through the normal authorized endpoints.
 */
export const announceChange = (event: string) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();

    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      // Read late: authMiddleware populates this, and on some routers it runs
      // after this middleware is mounted.
      const userId = req.userId || req.user?.id;
      if (!userId) return;

      try {
        getSocketManager().notifyUser(userId, event, { reason: `${req.method} ${req.path}` });
      } catch (error: any) {
        // A socket failure must never affect a response that has already been
        // sent — the device reconciles on its next sync regardless.
        logger.warn('Change announcement failed', {
          event,
          userId,
          error: error?.message || error,
        });
      }
    });

    next();
  };
