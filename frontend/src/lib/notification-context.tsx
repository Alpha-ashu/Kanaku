/**
 * Notification Context & Provider
 * Global state management for notifications and reminders
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  try {
    const sbKey = Object.keys(localStorage).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (sbKey) {
      const sessionData = localStorage.getItem(sbKey);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        return session?.access_token || null;
      }
    }
  } catch (e) {
    console.warn('Failed to retrieve auth token:', e);
  }

  return null;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'sync' | 'reminder' | 'friendship' | 'group' | 'transaction' | string;
  priority: 'high' | 'normal' | 'low';
  deepLink?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

export interface NotificationContextType {
  // State
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: Error | null;

  // Methods
  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  getUnreadCount: () => Promise<number>;

  // Event handling
  onNotificationReceived: (notification: Notification) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

interface NotificationProviderProps {
  children: React.ReactNode;
  autoFetch?: boolean;
  pollingInterval?: number;
}

/**
 * Notification Provider Component
 */
export function NotificationProvider({
  children,
  autoFetch = true,
  pollingInterval = 60 * 1000, // 1 minute default
}: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [api] = useState(() => {
    const instance = axios.create({
      baseURL: API_BASE_URL,
    });

    // Add auth token to requests
    instance.interceptors.request.use((config) => {
      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    return instance;
  });

  /**
   * Fetch all notifications
   */
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<any>('/notifications');
      let data: Notification[] = [];
      
      if (Array.isArray(response.data)) {
        data = response.data;
      } else if (response.data && response.data.success && Array.isArray(response.data.data)) {
        data = response.data.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        data = response.data.data;
      }

      setNotifications(data);

      // Calculate unread count
      const unread = data.filter((n) => !n.isRead).length;
      setUnreadCount(unread);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  /**
   * Mark notification as read
   */
  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await api.put(`/notifications/${notificationId}/read`, {});

        // Update local state
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n
          )
        );

        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    },
    [api]
  );

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    try {
      await api.post('/notifications/mark-all-read', {});

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true }))
      );

      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, [api]);

  /**
   * Delete notification
   */
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      try {
        await api.delete(`/notifications/${notificationId}`);

        // Update local state
        const notification = notifications.find((n) => n.id === notificationId);
        setNotifications((prev) =>
          prev.filter((n) => n.id !== notificationId)
        );

        if (notification && !notification.isRead) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error('Failed to delete notification:', err);
      }
    },
    [api, notifications]
  );

  /**
   * Clear all notifications
   */
  const clearAllNotifications = useCallback(async () => {
    try {
      await api.delete('/notifications');

      // Update local state
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  }, [api]);

  /**
   * Get unread count
   */
  const getUnreadCount = useCallback(async (): Promise<number> => {
    try {
      const response = await api.get<any>('/notifications/unread/count');
      let count = 0;

      if (response.data && typeof response.data.unreadCount === 'number') {
        count = response.data.unreadCount;
      } else if (response.data && response.data.success && response.data.data && typeof response.data.data.unreadCount === 'number') {
        count = response.data.data.unreadCount;
      }

      setUnreadCount(count);
      return count;
    } catch (err) {
      console.error('Failed to get unread count:', err);
      return 0;
    }
  }, [api]);

  /**
   * Handle incoming notification (from push notifications)
   */
  const onNotificationReceived = useCallback(
    (notification: Notification) => {
      // Add to beginning of list
      setNotifications((prev) => [notification, ...prev]);

      if (!notification.isRead) {
        setUnreadCount((prev) => prev + 1);
      }

      console.log('Notification received:', notification);
    },
    []
  );

  /**
   * Initial fetch and polling setup
   */
  useEffect(() => {
    if (!autoFetch) {
      return;
    }

    // Fetch immediately
    fetchNotifications();

    // Poll for new notifications
    const pollingInterval_id = setInterval(() => {
      fetchNotifications();
    }, pollingInterval);

    return () => {
      clearInterval(pollingInterval_id);
    };
  }, [autoFetch, fetchNotifications, pollingInterval]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isLoading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    getUnreadCount,
    onNotificationReceived,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to use notification context
 */
export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error(
      'useNotifications must be used within a NotificationProvider'
    );
  }

  return context;
}

export { NotificationContext };
