/**
 * Toast Notification Manager Hook
 * Provides simple API for showing toast notifications throughout the app
 */

import { useState, useCallback, useId } from 'react';
import { ToastNotification } from '@/components/shared/NotificationToast';
import { v4 as uuidv4 } from 'uuid';

export interface UseToastReturn {
  toasts: ToastNotification[];
  success: (title: string, message: string, duration?: number) => string;
  error: (title: string, message: string, duration?: number) => string;
  info: (title: string, message: string, duration?: number) => string;
  warning: (title: string, message: string, duration?: number) => string;
  custom: (toast: Omit<ToastNotification, 'id'>) => string;
  close: (id: string) => void;
  clear: () => void;
}

/**
 * Hook for managing toast notifications
 */
export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  /**
   * Add a new toast
   */
  const addToast = useCallback(
    (notification: Omit<ToastNotification, 'id'>): string => {
      const id = uuidv4();
      const toast: ToastNotification = {
        ...notification,
        id,
        duration: notification.duration ?? 5000, // Default 5 seconds
      };

      setToasts((prev) => [...prev, toast]);

      // Auto-remove after duration (if not persistent)
      if ((toast.duration ?? 0) > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, toast.duration);
      }

      return id;
    },
    []
  );

  /**
   * Show success toast
   */
  const success = useCallback(
    (title: string, message: string, duration?: number): string => {
      return addToast({
        title,
        message,
        type: 'success',
        duration,
      });
    },
    [addToast]
  );

  /**
   * Show error toast
   */
  const error = useCallback(
    (title: string, message: string, duration?: number): string => {
      return addToast({
        title,
        message,
        type: 'error',
        duration: duration ?? 0, // Errors are persistent by default
      });
    },
    [addToast]
  );

  /**
   * Show info toast
   */
  const info = useCallback(
    (title: string, message: string, duration?: number): string => {
      return addToast({
        title,
        message,
        type: 'info',
        duration,
      });
    },
    [addToast]
  );

  /**
   * Show warning toast
   */
  const warning = useCallback(
    (title: string, message: string, duration?: number): string => {
      return addToast({
        title,
        message,
        type: 'warning',
        duration,
      });
    },
    [addToast]
  );

  /**
   * Show custom toast
   */
  const custom = useCallback(
    (notification: Omit<ToastNotification, 'id'>): string => {
      return addToast(notification);
    },
    [addToast]
  );

  /**
   * Close a specific toast
   */
  const close = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Clear all toasts
   */
  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    success,
    error,
    info,
    warning,
    custom,
    close,
    clear,
  };
}

export type { ToastNotification };
