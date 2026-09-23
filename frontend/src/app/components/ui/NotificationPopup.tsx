import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, TrendingDown, AlertCircle, Target, Gift, Zap, X } from 'lucide-react';
import type { Notification as AppNotification } from '@/lib/database';

export interface NotificationItem {
  id: string;
  dbId?: number;
  type: AppNotification['type'] | 'transaction' | 'reminder' | 'investment' | 'achievement' | string;
  title: string;
  description: string;
  timestamp: Date;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  deepLink?: string;
  category?: string;
}

interface NotificationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onViewAll: () => void;
  onNotificationClick?: (notification: NotificationItem) => void;
  notifications: NotificationItem[];
}

export const NotificationPopup: React.FC<NotificationPopupProps> = ({
  isOpen,
  onClose,
  onViewAll,
  onNotificationClick,
  notifications,
}) => {
 const recentNotifications = notifications.slice(0, 3);

 const getTimeAgo = (date: Date) => {
 const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

 if (seconds < 60) return 'just now';
 if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
 if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
 return `${Math.floor(seconds / 86400)}d ago`;
 };

 return (
 <AnimatePresence>
 {isOpen && (
 <>
 {/* Backdrop */}
 <motion.div data-testid="notification-popup-div"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={onClose}
 className="fixed inset-0 z-40"
 />

 {/* Popup */}
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: -10 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: -10 }}
 transition={{ type: 'spring', damping: 20, stiffness: 300 }}
 className="fixed top-16 right-4 lg:right-8 z-50 w-96 max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
 >
 {/* Header */}
 <div className="bg-gradient-to-r from-gray-900 to-black p-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Bell size={20} className="text-white" />
 <h3 className="text-white font-bold">Recent Notifications</h3>
 </div>
 <button data-testid="notification-popup-close-notifications-popup"
 type="button"
 onClick={onClose}
 className="text-white/60 hover:text-white transition-colors"
 aria-label="Close notifications popup"
 title="Close notifications popup"
 >
 <X size={20} />
 </button>
 </div>

 {/* Notifications List */}
 <div className="max-h-96 overflow-y-auto scrollbar-hide">
 {recentNotifications.length > 0 ? (
 <div className="divide-y divide-gray-100">
        {recentNotifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            role="button"
            tabIndex={0}
            onClick={() => onNotificationClick?.(notification)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNotificationClick?.(notification);
              }
            }}
            className={`p-4 hover:bg-slate-50/90 active:scale-[0.99] transition-all cursor-pointer select-none group border-b border-gray-50 last:border-b-0 ${notification.bgColor}`}
          >
            <div className="flex gap-3 items-start">
              {/* Icon */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-xs transition-transform group-hover:scale-105 ${
                notification.color.includes('text-red') ? 'bg-red-100 text-red-600' :
                notification.color.includes('text-orange') ? 'bg-orange-100 text-orange-600' :
                notification.color.includes('text-green') ? 'bg-green-100 text-green-600' :
                notification.color.includes('text-blue') ? 'bg-blue-100 text-blue-600' :
                notification.color.includes('text-purple') ? 'bg-purple-100 text-purple-600' :
                'bg-indigo-100 text-indigo-600'
              }`}>
                {notification.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="font-bold text-sm text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                    {notification.title}
                  </h4>
                  <span className="text-3xs font-semibold text-slate-400 shrink-0">
                    {getTimeAgo(notification.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                  {notification.description}
                </p>
                <div className="mt-2 flex items-center gap-1 text-3xs font-bold text-indigo-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>View details</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
 </div>
 ) : (
 <div className="p-8 text-center">
 <Bell size={32} className="mx-auto text-gray-300 mb-3" />
 <p className="text-gray-500 text-sm font-medium">No notifications yet</p>
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="bg-white border-t border-gray-100 p-4">
 <button data-testid="notification-popup-view-all-notifications"
 onClick={() => {
 onViewAll();
 onClose();
 }}
 className="w-full text-center font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-2 rounded-lg transition-colors text-sm"
 >
 View All Notifications
 </button>
 </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>
 );
};
