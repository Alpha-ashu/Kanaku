import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import {
 Bell,
 CheckCircle2,
 AlertCircle,
 Wallet,
 Target,
 Users,
 MessageSquare,
 CalendarClock,
 Trash2,
 UserPlus,
 ListTodo,
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
import { PageHeader } from '@/app/components/ui/PageHeader';

const PRESENTATION: Record<Notification['type'], {
 icon: React.ReactNode;
 color: string;
 bgColor: string;
 softBg: string;
}> = {
 emi: {
 icon: <AlertCircle className="w-5 h-5" />,
 color: 'text-orange-600',
 bgColor: 'bg-orange-50 border-orange-200',
 softBg: 'bg-orange-100',
 },
 loan: {
 icon: <Wallet className="w-5 h-5" />,
 color: 'text-red-600',
 bgColor: 'bg-red-50 border-red-200',
 softBg: 'bg-red-100',
 },
 goal: {
 icon: <Target className="w-5 h-5" />,
 color: 'text-blue-600',
 bgColor: 'bg-blue-50 border-blue-200',
 softBg: 'bg-blue-100',
 },
 group: {
 icon: <Users className="w-5 h-5" />,
 color: 'text-violet-600',
 bgColor: 'bg-violet-50 border-violet-200',
 softBg: 'bg-violet-100',
 },
 booking: {
 icon: <CalendarClock className="w-5 h-5" />,
 color: 'text-emerald-600',
 bgColor: 'bg-emerald-50 border-emerald-200',
 softBg: 'bg-emerald-100',
 },
 message: {
 icon: <MessageSquare className="w-5 h-5" />,
 color: 'text-sky-600',
 bgColor: 'bg-sky-50 border-sky-200',
 softBg: 'bg-sky-100',
 },
 session: {
 icon: <CheckCircle2 className="w-5 h-5" />,
 color: 'text-green-600',
 bgColor: 'bg-green-50 border-green-200',
 softBg: 'bg-green-100',
 },
 friend_request: {
 icon: <UserPlus className="w-5 h-5" />,
 color: 'text-indigo-600',
 bgColor: 'bg-indigo-50 border-indigo-200',
 softBg: 'bg-indigo-100',
 },
 friend_accepted: {
 icon: <Users className="w-5 h-5" />,
 color: 'text-teal-600',
 bgColor: 'bg-teal-50 border-teal-200',
 softBg: 'bg-teal-100',
 },
 todo_shared: {
 icon: <ListTodo className="w-5 h-5" />,
 color: 'text-purple-600',
 bgColor: 'bg-purple-50 border-purple-200',
 softBg: 'bg-purple-100',
 },
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

 const supportedNotifications = useMemo(
 () => notifications.filter((notification) => (
 notification.type === 'emi'
 || notification.type === 'loan'
 || notification.type === 'goal'
 || notification.type === 'group'
 || notification.type === 'booking'
 || notification.type === 'message'
 || notification.type === 'session'
 || notification.type === 'friend_request'
 || notification.type === 'friend_accepted'
 || notification.type === 'todo_shared'
 )),
 [notifications],
 );

 const filteredNotifications = useMemo(() => {
 if (filterType === 'all') return supportedNotifications;
 return supportedNotifications.filter((notification) => notification.type === filterType);
 }, [filterType, supportedNotifications]);

 const unreadCount = useMemo(
 () => supportedNotifications.filter((notification) => !notification.isRead).length,
 [supportedNotifications],
 );

 const filters: Array<{ label: string; value: 'all' | Notification['type'] }> = [
 { label: 'All', value: 'all' },
 { label: 'Loan', value: 'loan' },
 { label: 'EMI', value: 'emi' },
 { label: 'Goal', value: 'goal' },
 { label: 'Group', value: 'group' },
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
 toast.success('Notification deleted');
 };

 const handleMarkAllAsRead = async () => {
 await markAllNotificationsAsRead();
 toast.success('All notifications marked as read');
 };

 const handleClearAll = async () => {
 await clearNotificationRecords();
 toast.success('Notifications cleared');
 };

 return (
 <div className="w-full min-h-screen bg-white pb-32 lg:pb-8">
 <div className="max-w-3xl mx-auto">
 <div className="px-4 lg:px-0 pt-6 lg:pt-10">
 <PageHeader
 title="Notifications"
 subtitle={unreadCount > 0 ? `You have ${unreadCount} unread notifications` : 'Everything is caught up'}
 icon={<Bell size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="dashboard"
 />
 </div>

 <div className="px-4 lg:px-0 mt-8 flex flex-wrap gap-3">
 {unreadCount > 0 && (
 <button
 onClick={handleMarkAllAsRead}
 data-testid="notifications-mark-all-read-button"
 className="bg-black hover:bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold transition-colors text-sm shadow-lg"
 >
 Mark All as Read
 </button>
 )}
 {supportedNotifications.length > 0 && (
 <button
 onClick={handleClearAll}
 data-testid="notifications-clear-all-button"
 className="bg-white hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-xl font-semibold transition-colors text-sm border border-gray-200"
 >
 Clear All
 </button>
 )}
 </div>

 <div className="px-4 lg:px-0 mt-6 overflow-x-auto scrollbar-hide">
 <div className="flex gap-2">
 {filters.map((filter) => (
 <button
 key={filter.value}
 onClick={() => setFilterType(filter.value)}
 data-testid={`notifications-filter-tab-${filter.value}`}
 className={`px-4 py-2 rounded-full whitespace-nowrap font-semibold transition-colors text-sm ${
 filterType === filter.value
 ? 'bg-black text-white shadow-lg'
 : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
 }`}
 >
 {filter.label}
 </button>
 ))}
 </div>
 </div>

 <div className="px-4 lg:px-0 mt-8 space-y-4">
 {filteredNotifications.length > 0 ? (
 <AnimatePresence mode="popLayout">
 {filteredNotifications.map((notification, index) => {
 const presentation = PRESENTATION[notification.type] ?? PRESENTATION.group;
 return (
 <motion.div
 key={notification.id ?? `${notification.title}-${notification.createdAt.toString()}`}
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -20 }}
 transition={{ delay: index * 0.04 }}
 data-testid={`notifications-card-select-${notification.id}`}
 className={`border rounded-xl p-4 lg:p-6 transition-all duration-300 ${presentation.bgColor} ${!notification.isRead ? 'ring-2 ring-black/80' : ''}`}
 >
 <div className="flex gap-4">
 <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${presentation.softBg} ${presentation.color}`}>
 {presentation.icon}
 </div>

 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-3">
 <button
 type="button"
 onClick={() => handleOpenNotification(notification)}
 className="flex-1 text-left"
 >
 <h3 className="font-semibold text-gray-900 text-sm lg:text-base">
 {notification.title}
 {!notification.isRead && (
 <span className="ml-2 inline-block w-2.5 h-2.5 bg-blue-600 rounded-full" />
 )}
 </h3>
 <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
 <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
 <span>{getTimeAgo(notification.createdAt)}</span>
 {notification.category && <span>{notification.category}</span>}
 {notification.source === 'supabase' && <span>Realtime</span>}
 </div>
 </button>

 <div className="flex-shrink-0 text-right">
 <button
 onClick={() => handleDelete(notification.id)}
 data-testid={`notifications-delete-button-${notification.id}`}
 className="text-gray-400 hover:text-red-600 transition-colors"
 aria-label="Delete notification"
 >
 <Trash2 size={16} />
 </button>
 </div>
 </div>

 <div className="mt-4 flex gap-3">
 {!notification.isRead && (
 <button
 onClick={() => notification.id && markNotificationAsRead(notification.id)}
 data-testid={`notifications-mark-read-button-${notification.id}`}
 className="bg-white hover:bg-white text-blue-600 border border-blue-200 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
 >
 Mark Read
 </button>
 )}
 {notification.deepLink && (
 <button
 onClick={() => handleOpenNotification(notification)}
 data-testid={`notifications-open-button-${notification.id}`}
 className="bg-black hover:bg-gray-900 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
 >
 Open
 </button>
 )}
 </div>
 </div>
 </div>
 </motion.div>
 );
 })}
 </AnimatePresence>
 ) : (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 className="text-center py-12"
 >
 <Bell size={48} className="mx-auto text-gray-300 mb-4" />
 <p className="text-gray-500 text-lg font-medium">
 {filterType === 'all' ? 'No notifications yet' : `No ${filterType} notifications`}
 </p>
 <p className="text-gray-400 text-sm mt-2">Realtime notifications will appear here.</p>
 </motion.div>
 )}
 </div>
 </div>
 </div>
 );
};

