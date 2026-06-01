/**
 * Notification Center Component
 * Displays all notifications in a dropdown panel
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, Trash2 } from 'lucide-react';
import { useNotifications, Notification } from '@/lib/notification-context';

interface NotificationCenterProps {
  badge?: boolean;
}

/**
 * Notification Item Component
 */
function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const getTypeStyles = () => {
    switch (notification.type) {
      case 'sync':
        return 'border-l-4 border-l-blue-500 bg-blue-50';
      case 'reminder':
        return 'border-l-4 border-l-orange-500 bg-orange-50';
      case 'friendship':
        return 'border-l-4 border-l-purple-500 bg-purple-50';
      case 'group':
        return 'border-l-4 border-l-green-500 bg-green-50';
      case 'transaction':
        return 'border-l-4 border-l-indigo-500 bg-indigo-50';
      default:
        return 'border-l-4 border-l-gray-500 bg-gray-50';
    }
  };

  const getPriorityStyles = () => {
    switch (notification.priority) {
      case 'high':
        return 'text-red-600 font-semibold';
      case 'low':
        return 'text-gray-600';
      default:
        return 'text-gray-700';
    }
  };

  return (
    <div
      className={`
        p-4 border-b hover:bg-gray-100 transition-colors
        ${getTypeStyles()}
        ${isDeleting ? 'opacity-50' : 'opacity-100'}
      `}
    >
      <div className="flex items-start gap-3">
        {!notification.isRead && (
          <div className="mt-1 w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold text-sm ${getPriorityStyles()}`}>
            {notification.title}
          </h4>

          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {notification.message}
          </p>

          <p className="text-xs text-gray-500 mt-2">
            {new Date(notification.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!notification.isRead && (
            <button
              onClick={() => onMarkAsRead(notification.id)}
              className="p-1 hover:bg-blue-200 rounded transition-colors"
              title="Mark as read"
              disabled={isDeleting}
            >
              <Check className="w-4 h-4 text-blue-600" />
            </button>
          )}

          <button
            onClick={async () => {
              setIsDeleting(true);
              await onDelete(notification.id);
            }}
            className="p-1 hover:bg-red-200 rounded transition-colors"
            title="Delete notification"
            disabled={isDeleting}
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Notification Center Component
 */
export function NotificationCenter({ badge = true }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  } = useNotifications();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-200 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-6 h-6 text-gray-700" />

        {badge && unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b flex items-center justify-between bg-gray-50">
            <h2 className="font-semibold text-gray-900">Notifications</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              aria-label="Close notifications panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Bar */}
          {notifications.length > 0 && (
            <div className="p-2 border-b flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <button
                onClick={() => clearAllNotifications()}
                className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onDelete={deleteNotification}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { Notification };
