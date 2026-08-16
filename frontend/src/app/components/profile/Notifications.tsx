import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Trash2,
  ExternalLink,
  Check,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { db, type Notification } from '@/lib/database';
import {
  clearNotificationRecords,
  deleteNotificationRecord,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/lib/notifications';
import { getNotificationPresentation } from '@/lib/notificationPresentation';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { InfiniteScrollFooter } from '@/app/components/ui/InfiniteScrollFooter';

/**
 * Curated filter tabs. Each maps to every real backend type string that
 * means the same thing to a user (e.g. the backend emits both `loan` and
 * `loan_reminder` for loan-related notices) — this is display grouping only,
 * NOT the allowlist that used to hide/delete anything outside it. See
 * lib/notificationPresentation.tsx for the full incident writeup.
 */
const FILTER_TYPE_GROUPS: Record<string, string[]> = {
  loan: ['loan', 'emi', 'loan_reminder'],
  goal: ['goal'],
  group: ['group', 'group_expense'],
  session: ['session'],
  budget: ['budget_alert'],
  booking: ['booking', 'new_booking'],
};

const getTimeAgo = (date: Date) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export const Notifications: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [filterType, setFilterType] = useState<'all' | Notification['type']>('all');

  const notifications = useLiveQuery(
    () => db.notifications.orderBy('createdAt').reverse().toArray(),
    [],
  ) ?? [];

  const filteredNotifications = useMemo(() => {
    if (filterType === 'all') return notifications;
    const matchTypes = FILTER_TYPE_GROUPS[filterType] ?? [filterType];
    return notifications.filter((notification) => matchTypes.includes(notification.type));
  }, [filterType, notifications]);

  const {
    visibleItems: visibleNotifications,
    hasMore,
    isLoadingMore,
    error: infiniteScrollError,
    retry: retryLoadMore,
    sentinelRef,
    totalCount,
  } = useInfiniteScroll({
    items: filteredNotifications,
    pageSize: 15,
    initialPageSize: 15,
    resetDeps: [filterType],
    getItemKey: (item) => item.id ?? `${item.title}-${item.createdAt.toString()}`,
  });

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const filters: Array<{ label: string; value: string }> = [
    { label: 'All', value: 'all' },
    { label: 'Loan', value: 'loan' },
    { label: 'Goal', value: 'goal' },
    { label: 'Group', value: 'group' },
    { label: 'Budget', value: 'budget' },
    { label: 'Booking', value: 'booking' },
    { label: 'Session', value: 'session' },
  ];

  const handleOpenNotification = async (notification: Notification) => {
    if (notification.id) {
      await markNotificationAsRead(notification.id);
    }

    if (notification.deepLink) {
      const [path, query] = notification.deepLink.split('?');
      setCurrentPage(path.replace('/', ''));

      if (query) {
        const params = new URLSearchParams(query);
        params.forEach((value, key) => {
          localStorage.setItem(`deepLink_${key}`, value);
        });
      }
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    await deleteNotificationRecord(id);
    toast.success('Notification removed');
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead();
    toast.success('All notifications marked as read');
  };

  const handleClearAll = async () => {
    await clearNotificationRecords();
    toast.success('All notifications cleared');
  };

  return (
    <CenteredLayout maxWidth="max-w-4xl">
      <div className="space-y-6 pb-28">
        {/* Modern Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl border border-indigo-500/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
                <Bell size={20} />
              </span>
              <h1 className="text-2xl font-black tracking-tight">Notifications</h1>
            </div>
            <p className="text-slate-300 text-xs sm:text-sm mt-1">
              {unreadCount > 0
                ? `You have ${unreadCount} unread update${unreadCount > 1 ? 's' : ''}`
                : 'All clear! You are completely up to date.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                data-testid="notifications-mark-all-read-button"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Check size={14} />
                Mark All Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                data-testid="notifications-clear-all-button"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 transition-all active:scale-95 cursor-pointer"
              >
                <Trash2 size={14} />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          {filters.map((filter) => {
            const isActive = filterType === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => setFilterType(filter.value)}
                data-testid={`notifications-filter-tab-${filter.value}`}
                className={`px-4 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md scale-105'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {/* Notification Cards List */}
        <div className="space-y-3">
          {visibleNotifications.length > 0 ? (
            <AnimatePresence mode="popLayout">
              {visibleNotifications.map((notification, index) => {
                const presentation = getNotificationPresentation(notification.type);
                const isUnread = !notification.isRead;

                return (
                  <motion.div
                    key={notification.id ?? `${notification.title}-${notification.createdAt.toString()}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.02 }}
                    data-testid={`notifications-card-select-${notification.id}`}
                    className={`bg-white rounded-2xl p-5 shadow-sm border transition-all duration-200 hover:shadow-md relative overflow-hidden group ${
                      isUnread
                        ? `border-slate-300/90 ${presentation.borderAccent}`
                        : 'border-slate-200/60 opacity-90'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon container */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${presentation.iconBg}`}>
                        {presentation.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                                {notification.title}
                              </h3>
                              {isUnread && (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${presentation.badgeBg}`}>
                                  Unread
                                </span>
                              )}
                            </div>
                            <p className="text-slate-600 text-xs sm:text-sm mt-1 leading-relaxed">
                              {notification.message}
                            </p>
                          </div>

                          <button
                            onClick={() => handleDelete(notification.id)}
                            data-testid={`notifications-delete-button-${notification.id}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            aria-label="Delete notification"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* Metadata & Actions Bar */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-3 text-slate-400 font-medium">
                            <span>{getTimeAgo(notification.createdAt)}</span>
                            {notification.category && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px]">
                                {notification.category}
                              </span>
                            )}
                            {notification.source === 'supabase' && (
                              <span className="inline-flex items-center gap-1 text-indigo-600 font-bold text-[10px]">
                                <Sparkles size={10} /> Realtime
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isUnread && (
                              <button
                                onClick={() => notification.id && markNotificationAsRead(notification.id)}
                                data-testid={`notifications-mark-read-button-${notification.id}`}
                                className="px-3 py-1.5 rounded-xl font-bold text-xs text-indigo-600 hover:bg-indigo-50 border border-indigo-200/80 transition-all active:scale-95 cursor-pointer"
                              >
                                Mark Read
                              </button>
                            )}
                            {notification.deepLink && (
                              <button
                                onClick={() => handleOpenNotification(notification)}
                                data-testid={`notifications-open-button-${notification.id}`}
                                className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all active:scale-95 cursor-pointer"
                              >
                                Open
                                <ExternalLink size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-12 text-center border border-slate-200/70 shadow-sm"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 mx-auto flex items-center justify-center mb-4 border border-indigo-100 shadow-inner">
                <Bell size={28} />
              </div>
              <h3 className="text-slate-900 font-black text-lg">
                {filterType === 'all' ? 'No notifications yet' : `No ${filterType} notifications`}
              </h3>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
                Realtime alerts, EMI due dates, and goal milestones will appear here as they trigger.
              </p>
            </motion.div>
          )}

          {filteredNotifications.length > 0 && (
            <InfiniteScrollFooter
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              error={infiniteScrollError}
              onRetry={retryLoadMore}
              sentinelRef={sentinelRef}
              totalCount={totalCount}
              loadingText="Loading more updates..."
              endOfListText="All notifications caught up"
            />
          )}
        </div>
      </div>
    </CenteredLayout>
  );
};
