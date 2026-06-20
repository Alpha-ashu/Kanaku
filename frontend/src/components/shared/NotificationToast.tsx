/**
 * Notification Toast Component
 * Displays temporary notifications at the bottom of the screen
 */

import React, { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // milliseconds, 0 = persistent
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationToastProps {
  notification: ToastNotification;
  onClose: (id: string) => void;
}

/**
 * Toast Notification Component
 */
export function NotificationToast({
  notification,
  onClose,
}: NotificationToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!notification.duration || notification.duration === 0) {
      return; // Persistent notification
    }

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        onClose(notification.id);
      }, 300); // Match animation duration
    }, notification.duration);

    return () => clearTimeout(timer);
  }, [notification.duration, notification.id, onClose]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getTextColor = () => {
    switch (notification.type) {
      case 'success':
        return 'text-green-900';
      case 'error':
        return 'text-red-900';
      case 'warning':
        return 'text-yellow-900';
      case 'info':
      default:
        return 'text-blue-900';
    }
  };

  return (
    <div
      className={`
        transform transition-all duration-300 ease-out
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
        rounded-lg border shadow-md p-4 flex items-start gap-3
        ${getBackgroundColor()}
      `}
    >
      {getIcon()}

      <div className="flex-1 min-w-0">
        <h3 className={`font-semibold text-sm ${getTextColor()}`}>
          {notification.title}
        </h3>
        <p className={`text-sm mt-1 ${getTextColor()} opacity-90`}>
          {notification.message}
        </p>

        {notification.action && (
          <button data-testid="notification-toast-button"
            onClick={notification.action.onClick}
            className={`
              text-sm font-medium mt-2
              px-3 py-1 rounded
              ${notification.type === 'success' && 'bg-green-200 hover:bg-green-300 text-green-900'}
              ${notification.type === 'error' && 'bg-red-200 hover:bg-red-300 text-red-900'}
              ${notification.type === 'warning' && 'bg-yellow-200 hover:bg-yellow-300 text-yellow-900'}
              ${notification.type === 'info' && 'bg-blue-200 hover:bg-blue-300 text-blue-900'}
              transition-colors
            `}
          >
            {notification.action.label}
          </button>
        )}
      </div>

      <button data-testid="notification-toast-dismiss-notification"
        onClick={() => {
          setIsExiting(true);
          setTimeout(() => {
            onClose(notification.id);
          }, 300);
        }}
        className="flex-shrink-0 p-1 hover:bg-black/10 rounded transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Toast Container Component
 */
interface NotificationContainerProps {
  notifications: ToastNotification[];
  onClose: (id: string) => void;
}

export function NotificationContainer({
  notifications,
  onClose,
}: NotificationContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={onClose}
        />
      ))}
    </div>
  );
}


