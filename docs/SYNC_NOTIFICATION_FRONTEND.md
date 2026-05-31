# Frontend Integration Guide: Sync & Notifications

**Status:** React/Dexie/Socket.IO integration  
**Target:** Phases 4-5 (Frontend + Real-time Sync)

---

## Part 1: Enhanced Socket.IO Integration

### Step 1: Update Socket Manager for Real-Time Sync

**File: `backend/src/sockets/index.ts` (existing file - add to setupEventHandlers)**

Add these methods to the SocketManager class:

```typescript
private setupEventHandlers() {
  this.io.on('connection', (socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const userId = authSocket.userId;
    const deviceId = authSocket.deviceId;

    console.log(`[Socket] Device connected: ${deviceId} for user ${userId}`);

    // Join user's broadcast room
    socket.join(`user:${userId}`);
    socket.join(`device:${deviceId}`);

    // ==================== NEW: Real-time sync events ====================

    // Client sends sync delta
    socket.on('sync:entities', async (data: {
      entities: Array<{
        type: string;
        id: string;
        operation: 'CREATE' | 'UPDATE' | 'DELETE';
        payload: any;
      }>;
      deviceId: string;
    }) => {
      try {
        console.log(`[Sync] Received ${data.entities.length} entities from ${deviceId}`);
        
        // Process each entity
        for (const entity of data.entities) {
          await this.processEntitySync(userId, deviceId, entity);
        }

        // Acknowledge sync
        socket.emit('sync:ack', { success: true, count: data.entities.length });

        // Broadcast delta to other devices
        socket.to(`user:${userId}`).emit('sync:delta', {
          timestamp: Date.now(),
          sourceDevice: deviceId,
          entities: data.entities,
        });
      } catch (error) {
        console.error('[Sync] Error processing entities:', error);
        socket.emit('sync:error', { error: 'Failed to process sync' });
      }
    });

    // Client subscribes to notifications
    socket.on('subscribe:notifications', () => {
      socket.join(`notifications:${userId}`);
      console.log(`[Notifications] ${deviceId} subscribed to notifications`);
    });

    // Client requests sync delta since timestamp
    socket.on('sync:request-delta', async (data: { since: number }) => {
      try {
        const notifications = await prisma.notification.findMany({
          where: {
            userId,
            createdAt: { gte: new Date(data.since) },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        socket.emit('sync:delta', {
          timestamp: Date.now(),
          entities: notifications.map(n => ({
            type: 'notification',
            id: n.id,
            operation: 'UPDATE',
            payload: n,
          })),
        });
      } catch (error) {
        console.error('[Sync] Error fetching delta:', error);
        socket.emit('sync:error', { error: 'Failed to fetch delta' });
      }
    });

    // ==================== Existing event handlers ====================
    
    socket.on('disconnect', () => {
      console.log(`[Socket] Device disconnected: ${deviceId}`);
      this.handleUserDisconnection(userId, socket.id, deviceId);
    });

    socket.on('error', (error) => {
      console.error(`[Socket] Error for ${deviceId}:`, error);
    });
  });
}

private async processEntitySync(
  userId: string,
  deviceId: string,
  entity: any
) {
  // Queue sync operation for processing
  await prisma.syncQueue.create({
    data: {
      userId,
      deviceId,
      entityType: entity.type,
      entityId: entity.id,
      operation: entity.operation,
      data: JSON.stringify(entity.payload),
      status: 'pending',
    },
  });
}

// Broadcast notification to all user devices
public async broadcastNotificationToUser(
  userId: string,
  notification: any
) {
  this.io.to(`notifications:${userId}`).emit('notification:new', {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    deepLink: notification.deepLink,
    createdAt: notification.createdAt,
  });
}
```

---

## Part 2: Frontend Dexie Integration

### Step 2: Update Dexie Schema

**File: `frontend/src/lib/db.ts`**

```typescript
import Dexie, { Table } from 'dexie';

export interface INotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  category?: string;
  deepLink?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  deliveryStatus: string;
  syncStatus: 'pending' | 'synced' | 'failed';
  sourceUserId?: string;
  sourceEntity?: string;
  sourceEntityId?: string;
}

export interface ISyncQueueItem {
  id: string;
  userId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACKNOWLEDGE';
  data?: any;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  retryCount: number;
  createdAt: Date;
}

export interface IDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName?: string;
  deviceType: string;
  isActive: boolean;
  lastSeen: Date;
}

export class FinoraDB extends Dexie {
  notifications!: Table<INotification>;
  syncQueue!: Table<ISyncQueueItem>;
  devices!: Table<IDevice>;

  constructor() {
    super('FinoraDB');
    this.version(3).stores({
      // Notifications: primary key + indexes for querying
      notifications:
        '++id, userId, createdAt, isRead, type, syncStatus',
      // Sync queue: primary key + indexes for processing
      syncQueue:
        '++id, userId, deviceId, entityType, status, [userId+deviceId+createdAt]',
      // Devices: primary key + userId for multi-device tracking
      devices: '++id, userId, deviceId',
      // Keep existing tables (transactions, accounts, etc.)
      transactions: '++id, userId, date, syncStatus',
      accounts: '++id, userId, syncStatus',
      groupExpenses: '++id, userId, date, syncStatus',
      friends: '++id, userId, email, syncStatus',
      loans: '++id, userId, dueDate',
      goals: '++id, userId, targetDate',
    });
  }
}

export const db = new FinoraDB();
```

---

### Step 3: Notification Context

**File: `frontend/src/contexts/NotificationContext.tsx`**

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import { db, INotification } from '../lib/db';
import { useAuth } from './AuthContext';
import { useRealtimeSocket } from '../hooks/useRealtimeSocket';
import { api } from '../services/api';

interface NotificationContextType {
  notifications: INotification[];
  unreadCount: number;
  isLoading: boolean;
  
  // Actions
  loadNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  showToast: (notification: INotification) => void;
}

const NotificationContext = React.createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { socket, isConnected } = useRealtimeSocket();
  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Load notifications from local DB on mount
  useEffect(() => {
    if (user?.id) {
      loadNotifications();
    }
  }, [user?.id]);

  // Set up real-time listeners when socket connects
  useEffect(() => {
    if (!socket || !isConnected || !user?.id) return;

    console.log('[Notification] Setting up real-time listeners');

    // Subscribe to notifications
    socket.emit('subscribe:notifications');

    // Listen for new notifications
    const handleNewNotification = (notification: INotification) => {
      console.log('[Notification] Received real-time notification:', notification);
      
      // Add to local DB
      db.notifications.add(notification);
      
      // Update UI
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      
      // Show toast
      showToast(notification);
    };

    // Listen for sync deltas
    const handleSyncDelta = async (delta: {
      timestamp: number;
      sourceDevice: string;
      entities: any[];
    }) => {
      console.log('[Sync] Received delta:', delta);
      
      // Merge delta entities into local DB
      for (const entity of delta.entities) {
        if (entity.type === 'notification') {
          await db.notifications.put(entity.payload);
        }
      }
      
      // Refresh notifications UI
      await loadNotifications();
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('sync:delta', handleSyncDelta);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('sync:delta', handleSyncDelta);
    };
  }, [socket, isConnected, user?.id]);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      
      // Get from local DB first
      const localNotifications = await db.notifications
        .where('userId')
        .equals(user.id)
        .reverse()
        .toArray();

      setNotifications(localNotifications);
      setUnreadCount(localNotifications.filter(n => !n.isRead).length);

      // Also try to sync with server (non-blocking)
      try {
        const response = await api.get('/notifications?limit=50');
        if (response?.success) {
          // Bulk update local DB
          await db.notifications.bulkPut(response.data);
          
          // Update UI with server data
          setNotifications(response.data);
          setUnreadCount(response.data.filter((n: INotification) => !n.isRead).length);
        }
      } catch (syncError) {
        // Use local data if server fetch fails
        console.warn('[Notification] Failed to sync with server:', syncError);
      }
    } catch (error) {
      console.error('[Notification] Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user?.id) return;

    try {
      // Update local DB optimistically
      const notification = await db.notifications.get(id);
      if (!notification) return;

      const updated: INotification = {
        ...notification,
        isRead: true,
        readAt: new Date(),
        syncStatus: 'pending',
      };

      await db.notifications.put(updated);

      // Queue for sync
      await db.syncQueue.add({
        id: crypto.randomUUID(),
        userId: user.id,
        deviceId: getDeviceId(),
        entityType: 'notification',
        entityId: id,
        operation: 'ACKNOWLEDGE',
        status: 'pending',
        retryCount: 0,
        createdAt: new Date(),
      });

      // Update UI immediately
      setNotifications(prev =>
        prev.map(n => n.id === id ? updated : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));

      // Sync to server (non-blocking)
      try {
        await api.patch(`/notifications/${id}/read`);
        
        // Mark as synced
        await db.notifications.update(id, { syncStatus: 'synced' });
        await db.syncQueue.where('entityId').equals(id).delete();
      } catch (error) {
        console.warn('[Notification] Server sync failed, will retry later:', error);
      }
    } catch (error) {
      console.error('[Notification] Failed to mark as read:', error);
    }
  }, [user?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Get all unread notifications
      const unread = await db.notifications
        .where('userId')
        .equals(user.id)
        .and(n => !n.isRead)
        .toArray();

      if (unread.length === 0) return;

      const now = new Date();

      // Batch update local DB
      await db.notifications.bulkUpdate(
        unread.map(n => ({
          key: n.id,
          changes: { isRead: true, readAt: now, syncStatus: 'pending' as const },
        }))
      );

      // Queue sync operations
      await db.syncQueue.bulkAdd(
        unread.map(n => ({
          id: crypto.randomUUID(),
          userId: user.id,
          deviceId: getDeviceId(),
          entityType: 'notification',
          entityId: n.id,
          operation: 'ACKNOWLEDGE' as const,
          status: 'pending' as const,
          retryCount: 0,
          createdAt: new Date(),
        }))
      );

      // Update UI
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);

      // Sync to server (non-blocking)
      try {
        await api.patch('/notifications/read-all');
        
        // Mark all as synced
        await db.notifications.bulkUpdate(
          unread.map(n => ({
            key: n.id,
            changes: { syncStatus: 'synced' as const },
          }))
        );
        await db.syncQueue.bulkDelete(
          unread.map(n => n.id)
        );
      } catch (error) {
        console.warn('[Notification] Server sync failed, will retry later:', error);
      }
    } catch (error) {
      console.error('[Notification] Failed to mark all as read:', error);
    }
  }, [user?.id]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!user?.id) return;

    try {
      // Soft delete in local DB
      await db.notifications.update(id, {
        syncStatus: 'pending',
      });

      // Queue for sync
      await db.syncQueue.add({
        id: crypto.randomUUID(),
        userId: user.id,
        deviceId: getDeviceId(),
        entityType: 'notification',
        entityId: id,
        operation: 'DELETE',
        status: 'pending',
        retryCount: 0,
        createdAt: new Date(),
      });

      // Update UI
      setNotifications(prev => prev.filter(n => n.id !== id));

      // Sync to server (non-blocking)
      try {
        await api.delete(`/notifications/${id}`);
        await db.notifications.delete(id);
        await db.syncQueue.where('entityId').equals(id).delete();
      } catch (error) {
        console.warn('[Notification] Server sync failed, will retry later:', error);
      }
    } catch (error) {
      console.error('[Notification] Failed to delete notification:', error);
    }
  }, [user?.id]);

  const showToast = (notification: INotification) => {
    // TODO: Trigger toast notification UI
    console.log('[Toast]', notification.title, notification.message);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        loadNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        showToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = React.useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}

function getDeviceId(): string {
  // Retrieve or generate device ID
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}
```

---

### Step 4: Real-time Socket Hook

**File: `frontend/src/hooks/useRealtimeSocket.ts`**

```typescript
import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

interface UseRealtimeSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
}

export function useRealtimeSocket(): UseRealtimeSocketReturn {
  const { token, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!token || !user?.id) {
      // Disconnect if no auth
      if (socketRef.current?.connected) {
        socketRef.current.disconnect();
      }
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Initialize socket connection
      const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
        auth: {
          token,
          deviceId: localStorage.getItem('deviceId') || crypto.randomUUID(),
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        setIsConnected(true);
        setIsConnecting(false);
      });

      socket.on('disconnect', () => {
        console.log('[Socket] Disconnected');
        setIsConnected(false);
      });

      socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err);
        setError(err);
        setIsConnecting(false);
      });

      socket.on('error', (err) => {
        console.error('[Socket] Error:', err);
        setError(new Error(err));
      });

      socketRef.current = socket;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[Socket] Failed to initialize:', error);
      setError(error);
      setIsConnecting(false);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token, user?.id]);

  return {
    socket: socketRef.current,
    isConnected,
    isConnecting,
    error,
  };
}
```

---

### Step 5: Sync Queue Worker Hook

**File: `frontend/src/hooks/useSyncWorker.ts`**

```typescript
import { useEffect, useState } from 'react';
import { db, ISyncQueueItem } from '../lib/db';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface UseSyncWorkerOptions {
  enabled?: boolean;
  interval?: number; // milliseconds
  batchSize?: number;
}

export function useSyncWorker(options: UseSyncWorkerOptions = {}) {
  const {
    enabled = true,
    interval = 30000, // 30 seconds
    batchSize = 50,
  } = options;

  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Sync queue items to server
  const syncQueue = async () => {
    if (!user?.id || !enabled) return;

    try {
      setIsSyncing(true);
      setError(null);

      // Get pending items
      const pendingItems = await db.syncQueue
        .where({ status: 'pending', userId: user.id })
        .limit(batchSize)
        .toArray();

      if (pendingItems.length === 0) {
        setLastSyncTime(new Date());
        return;
      }

      console.log(`[SyncWorker] Syncing ${pendingItems.length} items`);

      // Mark as processing
      await db.syncQueue.bulkUpdate(
        pendingItems.map(item => ({
          key: item.id,
          changes: { status: 'processing' as const },
        }))
      );

      // Batch send to server
      const payload = {
        entities: pendingItems.map(item => ({
          type: item.entityType,
          id: item.entityId,
          operation: item.operation,
          payload: item.data ? JSON.parse(item.data) : {},
        })),
        deviceId: localStorage.getItem('deviceId'),
      };

      const response = await api.post('/sync/batch', payload);

      if (response?.success) {
        // Mark as synced
        await db.syncQueue.bulkUpdate(
          pendingItems.map(item => ({
            key: item.id,
            changes: { status: 'synced' as const },
          }))
        );

        console.log(`[SyncWorker] Successfully synced ${pendingItems.length} items`);
      } else {
        throw new Error('Sync failed');
      }

      setLastSyncTime(new Date());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[SyncWorker] Sync error:', error);
      setError(error);

      // Increment retry count for failed items
      const pendingItems = await db.syncQueue
        .where({ status: 'processing', userId: user.id })
        .toArray();

      await db.syncQueue.bulkUpdate(
        pendingItems.map(item => ({
          key: item.id,
          changes: {
            status: item.retryCount < 3 ? 'pending' : 'failed',
            retryCount: item.retryCount + 1,
          } as any,
        }))
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Set up interval-based sync
  useEffect(() => {
    if (!enabled || !user?.id) return;

    // Initial sync
    syncQueue();

    // Interval sync
    const intervalId = setInterval(syncQueue, interval);

    return () => clearInterval(intervalId);
  }, [enabled, user?.id, interval]);

  return {
    isSyncing,
    lastSyncTime,
    error,
    syncNow: syncQueue,
  };
}
```

---

### Step 6: Device Registration Hook

**File: `frontend/src/hooks/useDeviceRegistration.ts`**

```typescript
import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../config/logger';

export function useDeviceRegistration() {
  const { token } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!token) return;

    const registerDevice = async () => {
      try {
        // Get or create device ID
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
          deviceId = crypto.randomUUID();
          localStorage.setItem('deviceId', deviceId);
        }

        // Get FCM token (if available - requires Firebase setup)
        let fcmToken: string | undefined;
        try {
          if ('serviceWorker' in navigator && 'caches' in window) {
            const messaging = (window as any).firebase?.messaging?.();
            if (messaging) {
              fcmToken = await messaging.getToken({
                vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
              });
            }
          }
        } catch (fcmError) {
          logger.warn('Failed to get FCM token', { fcmError });
        }

        // Get device info
        const deviceType = /android/i.test(navigator.userAgent)
          ? 'android'
          : /iphone|ipad|ipod/i.test(navigator.userAgent)
          ? 'ios'
          : 'web';

        const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';

        // Register device
        const response = await api.post('/auth/devices/register', {
          deviceId,
          deviceName: `${navigator.platform} - ${new Date().toLocaleDateString()}`,
          deviceType,
          appVersion,
          fcmToken,
          publicKey: null, // Optional: for E2E encryption
        });

        if (response?.success) {
          logger.info('Device registered successfully', {
            deviceId,
            deviceType,
          });
          setIsRegistered(true);
          setError(null);
        } else {
          throw new Error('Device registration failed');
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Failed to register device', { error });
        setError(error);
        // Don't throw - allow app to continue even if registration fails
      }
    };

    registerDevice();
  }, [token]);

  return { isRegistered, error };
}
```

---

## Part 3: UI Components

### Step 7: Notification Badge Component

**File: `frontend/src/components/NotificationBadge.tsx`**

```typescript
import { useNotifications } from '../contexts/NotificationContext';
import styles from './NotificationBadge.module.css';

export function NotificationBadge() {
  const { unreadCount } = useNotifications();

  if (unreadCount === 0) return null;

  return (
    <div className={styles.badge}>
      {unreadCount > 99 ? '99+' : unreadCount}
    </div>
  );
}
```

**File: `frontend/src/components/NotificationBadge.module.css`**

```css
.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #ff4444;
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}
```

### Step 8: Notification Panel Component

**File: `frontend/src/components/NotificationPanel.tsx`**

```typescript
import { useNotifications } from '../contexts/NotificationContext';
import { useState } from 'react';
import styles from './NotificationPanel.module.css';

export function NotificationPanel() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.container}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
      >
        🔔 {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button
                className={styles.markAllRead}
                onClick={() => markAllAsRead()}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className={styles.list}>
            {isLoading && <p>Loading...</p>}
            {!isLoading && notifications.length === 0 && (
              <p className={styles.empty}>No notifications</p>
            )}

            {notifications.map(notif => (
              <div
                key={notif.id}
                className={`${styles.item} ${notif.isRead ? styles.read : styles.unread}`}
                onClick={() => !notif.isRead && markAsRead(notif.id)}
              >
                <div className={styles.content}>
                  <p className={styles.title}>{notif.title}</p>
                  <p className={styles.message}>{notif.message}</p>
                  <small className={styles.time}>
                    {new Date(notif.createdAt).toLocaleString()}
                  </small>
                </div>

                {!notif.isRead && (
                  <div className={styles.unreadIndicator} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Part 4: App Initialization

### Step 9: Update App Root Component

**File: `frontend/src/App.tsx`**

```typescript
import { NotificationProvider } from './contexts/NotificationContext';
import { useDeviceRegistration } from './hooks/useDeviceRegistration';
import { useSyncWorker } from './hooks/useSyncWorker';
import { NotificationPanel } from './components/NotificationPanel';

function AppContent() {
  // Register device on app load
  useDeviceRegistration();

  // Start background sync worker
  useSyncWorker({ enabled: true, interval: 30000 });

  return (
    <div className="app">
      <NotificationPanel />
      {/* Rest of app */}
    </div>
  );
}

export function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}
```

---

## Testing Frontend Integration

### Manual Testing

```bash
# 1. Open app in two browser tabs
# 2. Tab A: Send a friend request
# 3. Observe: Tab B receives notification in real-time

# 4. Mark notification as read in Tab B
# 5. Observe: Tab A syncs and marks as read automatically

# 6. Close Tab B (go offline)
# 7. Tab A: Add to group expense
# 8. Open Tab B
# 9. Observe: Tab B catches up with sync delta

# 10. Check browser console for sync logs
```

### Browser DevTools Checks

```javascript
// Check local notifications in console
await db.notifications.toArray()

// Check sync queue status
await db.syncQueue.toArray()

// Check device registration
localStorage.getItem('deviceId')

// Monitor Socket.IO events
socket.onAny((event, data) => console.log(event, data))
```

---

## Performance Optimization Tips

1. **Virtualize Long Lists**: Use `react-window` for notification lists > 100 items
2. **Debounce Sync**: Don't sync on every change; use 5-30 second intervals
3. **Index Optimization**: Ensure Dexie indexes match query patterns
4. **Memory Management**: Clear old notifications after 30 days
5. **Compression**: Use MessagePack for Socket.IO payloads

---

## Security Checklist (Frontend)

- ✅ Never log sensitive data (emails, amounts) to console
- ✅ Validate notification deepLinks before navigation
- ✅ Use HTTPS only in production
- ✅ Implement certificate pinning for API calls
- ✅ Clear auth tokens on app unload
- ✅ Encrypt sensitive Dexie entries
- ✅ Use CSP headers to prevent XSS
- ✅ Sanitize notification message HTML

---

## Next Steps

1. **Test frontend integration** with local backend
2. **Monitor performance** during high notification volume
3. **Implement PWA push notifications** (optional)
4. **Add notification preferences UI**
5. **Implement notification throttling** to prevent spam
6. **Add retry UI** for failed syncs

---

**Continue to Phase 5 Security** for OAuth 2.0 and E2E encryption setup.
