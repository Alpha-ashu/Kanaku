import React, { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { ChevronLeft, ChevronRight, Plus, X, Clock, CheckCircle2, AlertCircle, Calendar as CalendarIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { Button } from '@/app/components/ui/button';
import { TimeFilter, TimeFilterPeriod, filterByTimePeriod } from '@/app/components/ui/TimeFilter';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
 'January', 'February', 'March', 'April', 'May', 'June',
 'July', 'August', 'September', 'October', 'November', 'December'
];

interface Reminder {
 id: string;
 date: Date;
 title: string;
 description?: string;
 type: 'task' | 'event' | 'reminder' | 'goal';
 status: 'pending' | 'in-progress' | 'completed';
 dueDate: Date;
 completedDate?: Date;
}

interface DailyActivityItem {
 id: string;
 type: 'income' | 'expense' | 'transfer' | 'reminder' | 'emi';
 title: string;
 description?: string;
 amount?: number;
 status?: string;
 time?: string;
 icon: string;
 color: string;
 accountName?: string;
 category?: string;
}

export const Calendar: React.FC = () => {
 const { transactions, currency, accounts } = useApp();
 const [currentDate, setCurrentDate] = useState(new Date());
 const [selectedDate, setSelectedDate] = useState<Date | null>(null);
 const [showReminderModal, setShowReminderModal] = useState(false);
 const [reminders, setReminders] = useState<Reminder[]>([]);
 const [timePeriod, setTimePeriod] = useState<TimeFilterPeriod>('monthly');
 const [newReminder, setNewReminder] = useState({
 title: '',
 description: '',
 type: 'task' as const,
 date: new Date(),
 });

 // Filter transactions by selected time period
 const filteredTransactions = useMemo(() => {
 return filterByTimePeriod(transactions, timePeriod, currentDate);
 }, [transactions, timePeriod, currentDate]);

 // Calculate summary stats for filtered transactions
 const summaryStats = useMemo(() => {
 const income = filteredTransactions
 .filter((t) => t.type === 'income')
 .reduce((sum, t) => sum + t.amount, 0);
 const expense = filteredTransactions
 .filter((t) => t.type === 'expense')
 .reduce((sum, t) => sum + t.amount, 0);
 return {
 income,
 expense,
 total: income - expense,
 };
 }, [filteredTransactions]);

 const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
 const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
 const startDate = new Date(monthStart);
 startDate.setDate(startDate.getDate() - monthStart.getDay());

 // Group transactions by date
 const transactionsByDate = useMemo(() => {
 const grouped: { [key: string]: typeof transactions } = {};
 filteredTransactions.forEach((transaction) => {
 if (!transaction.date) return;
 const date = new Date(transaction.date);
 const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
 if (!grouped[dateKey]) {
 grouped[dateKey] = [];
 }
 grouped[dateKey].push(transaction);
 });
 return grouped;
 }, [filteredTransactions]);

 // Group reminders by date
 const remindersByDate = useMemo(() => {
 const grouped: { [key: string]: Reminder[] } = {};
 reminders.forEach((reminder) => {
 const date = new Date(reminder.dueDate);
 const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
 if (!grouped[dateKey]) {
 grouped[dateKey] = [];
 }
 grouped[dateKey].push(reminder);
 });
 return grouped;
 }, [reminders]);

 const calendarDays = useMemo(() => {
 const days: Date[] = [];
 const daysInMonth = monthEnd.getDate();
 // Padding from previous month to start on the correct day of week
 const leadingPadding = monthStart.getDay();

 // We only need (leadingPadding + daysInMonth) total blocks, and maybe trail to fill the last row
 const totalBlocks = Math.ceil((leadingPadding + daysInMonth) / 7) * 7;

 for (let i = 0; i < totalBlocks; i++) {
 const date = new Date(startDate);
 date.setDate(date.getDate() + i);
 days.push(date);
 }
 return days;
 }, [startDate, monthStart, monthEnd]);

 const handlePrevMonth = () => {
 setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
 };

 const handleNextMonth = () => {
 setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
 };

 const handleToday = () => {
 const today = new Date();
 setCurrentDate(today);
 setSelectedDate(today);
 };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(Math.abs(amount), currency, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const formatSignedCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      signDisplay: 'always' as any,
    });
  };

 const getDateKey = (date: Date) => {
 return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
 };

 const hasActivity = (date: Date) => {
 const key = getDateKey(date);
 return (transactionsByDate[key]?.length > 0 || remindersByDate[key]?.length > 0);
 };

 const getDailyStats = (date: Date) => {
 const key = getDateKey(date);
 const dayTransactions = transactionsByDate[key] || [];
 const income = dayTransactions
 .filter((t) => t.type === 'income')
 .reduce((sum, t) => sum + t.amount, 0);
 const expense = dayTransactions
 .filter((t) => t.type === 'expense')
 .reduce((sum, t) => sum + t.amount, 0);
 return {
 income,
 expense,
 total: income - expense,
 };
 };

 const getDailyActivities = (date: Date): DailyActivityItem[] => {
 const key = getDateKey(date);
 const activities: DailyActivityItem[] = [];

 // Add transactions
 (transactionsByDate[key] || []).forEach((transaction) => {
 const typeColors: { [key: string]: { icon: string; color: string } } = {
 expense: { icon: '', color: 'from-red-500 to-pink-500' },
 income: { icon: '', color: 'from-green-500 to-emerald-500' },
 transfer: { icon: '', color: 'from-blue-500 to-cyan-500' },
 };
 const typeInfo = typeColors[transaction.type] || { icon: '', color: 'from-gray-500 to-slate-500' };
 const account = accounts.find(a => String(a.id) === String(transaction.accountId));

 activities.push({
 id: String(transaction.id),
 type: transaction.type as 'income' | 'expense' | 'transfer',
 title: transaction.description,
 amount: transaction.amount,
 icon: typeInfo.icon,
 color: typeInfo.color,
 time: new Date(transaction.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
 accountName: account?.name,
 category: transaction.category,
 });
 });

 // Add reminders
 (remindersByDate[key] || []).forEach((reminder) => {
 const typeIcons: { [key: string]: string } = {
 task: '',
 event: '',
 reminder: '',
 goal: '',
 };
 const statusColors: { [key: string]: string } = {
 pending: 'from-yellow-500 to-orange-500',
 'in-progress': 'from-blue-500 to-purple-500',
 completed: 'from-green-500 to-emerald-500',
 };

 activities.push({
 id: reminder.id,
 type: 'reminder',
 title: reminder.title,
 description: reminder.description,
 status: reminder.status,
 icon: typeIcons[reminder.type],
 color: statusColors[reminder.status],
 });
 });

 return activities.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
 };

 const addReminder = () => {
 if (!newReminder.title.trim()) return;

 const reminder: Reminder = {
 id: `reminder-${Date.now()}`,
 date: newReminder.date,
 dueDate: newReminder.date,
 title: newReminder.title,
 description: newReminder.description,
 type: newReminder.type,
 status: 'pending',
 };

 setReminders([...reminders, reminder]);
 setNewReminder({ title: '', description: '', type: 'task', date: new Date() });
 setShowReminderModal(false);
 };

 const updateReminderStatus = (id: string, status: 'pending' | 'in-progress' | 'completed') => {
 setReminders(
 reminders.map((r) =>
 r.id === id
 ? { ...r, status, completedDate: status === 'completed' ? new Date() : undefined }
 : r
 )
 );
 };

 const rescheduleReminder = (id: string, newDate: Date) => {
 setReminders(reminders.map((r) => (r.id === id ? { ...r, dueDate: newDate } : r)));
 };

 const deleteReminder = (id: string) => {
 setReminders(reminders.filter((r) => r.id !== id));
 };

 const today = new Date();
 const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
 const summaryAmountClass = 'w-full text-center text-[clamp(0.98rem,1.55vw,1.55rem)] font-bold tracking-[-0.03em] leading-tight tabular-nums break-words [overflow-wrap:anywhere]';
 const summaryCardClass = 'rounded-[20px] px-3 py-4 sm:px-4 sm:py-4.5 shadow-sm transition-transform hover:-translate-y-0.5 min-w-0';

 return (
 <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6 w-full space-y-4 sm:space-y-5">
 {/* App Header */}
 <PageHeader
 title="Calendar"
 subtitle="Track activities, reminders & transactions"
 icon={<CalendarIcon size={20} className="sm:w-6 sm:h-6" />}
 >
 <div className="flex items-center gap-2 sm:gap-3">
 <Button
 variant="secondary"
 onClick={handleToday}
 className="shadow-sm border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs sm:text-sm h-9 sm:h-10 px-3 sm:px-4"
 >
 Today
 </Button>
 <Button
 onClick={() => setShowReminderModal(true)}
 className="shadow-lg bg-black text-white hover:bg-gray-900 text-xs sm:text-sm h-9 sm:h-10 px-3 sm:px-4"
 >
 <Plus size={14} className="sm:w-[18px] sm:h-[18px] mr-1 sm:mr-2" />
 <span className="hidden sm:inline">Add Reminder</span>
 <span className="inline sm:hidden">Add</span>
 </Button>
 </div>
 </PageHeader>

 {/* Time Filter */}
 <div className="flex justify-start">
 <TimeFilter value={timePeriod} onChange={setTimePeriod} />
 </div>

 {/* Summary Stats Row */}
 <div className="grid grid-cols-3 gap-3 sm:gap-4">
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 className={cn(summaryCardClass, 'bg-emerald-50/80')}
 >
 <div className="space-y-2 min-w-0">
 <p className="text-center text-base sm:text-xl font-semibold text-emerald-600">Income</p>
 <div className="min-h-[2.2rem] sm:min-h-[2.5rem] flex items-center justify-center">
 <p className={cn(summaryAmountClass, 'text-emerald-700')}>
 {formatSignedCurrency(summaryStats.income)}
 </p>
 </div>
 </div>
 </motion.div>

 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 className={cn(summaryCardClass, 'bg-rose-50/80')}
 >
 <div className="space-y-2 min-w-0">
 <p className="text-center text-base sm:text-xl font-semibold text-red-600">Expense</p>
 <div className="min-h-[2.2rem] sm:min-h-[2.5rem] flex items-center justify-center">
 <p className={cn(summaryAmountClass, 'text-red-700')}>
 {formatSignedCurrency(-summaryStats.expense)}
 </p>
 </div>
 </div>
 </motion.div>

 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.2 }}
 className={cn(summaryCardClass, 'bg-blue-50/80')}
 >
 <div className="space-y-2 min-w-0">
 <p className="text-center text-base sm:text-xl font-semibold text-blue-600">Net</p>
 <div className="min-h-[2.2rem] sm:min-h-[2.5rem] flex items-center justify-center">
 <p className={cn(
 summaryAmountClass,
 summaryStats.total >= 0 ? 'text-blue-700' : 'text-orange-700'
 )}>
 {formatSignedCurrency(summaryStats.total)}
 </p>
 </div>
 </div>
 </motion.div>
 </div>

 {/* Calendar Card */}
 <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden max-w-[980px] mx-auto">
 {/* Month Navigation */}
 <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-3 sm:px-5 py-3 flex items-center justify-between">
 <button
 onClick={handlePrevMonth}
 className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
 title="Previous month"
 >
 <ChevronLeft size={20} className="text-white" />
 </button>
 <div className="text-center">
 <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">
 {MONTHS[currentDate.getMonth()]}
 </h2>
 <p className="text-[11px] text-gray-400 mt-0.5">{currentDate.getFullYear()}</p>
 </div>
 <button
 onClick={handleNextMonth}
 className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
 title="Next month"
 >
 <ChevronRight size={20} className="text-white" />
 </button>
 </div>

 {/* Calendar Grid */}
 <div className="p-2.5 sm:p-3.5 lg:p-4">
 {/* Day Headers */}
 <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-2.5">
 {DAYS.map((day) => (
 <div key={day} className="text-center font-medium text-gray-400 text-[11px] sm:text-xs py-1.5">
 {day}
 </div>
 ))}
 </div>

 {/* Calendar Days */}
 <div className="grid grid-cols-7 gap-1 sm:gap-1.5 lg:gap-1.5">
 <AnimatePresence>
 {calendarDays.map((date, index) => {
 const isToday = getDateKey(date) === getDateKey(today);
 const isSelected = selectedDate && getDateKey(date) === getDateKey(selectedDate);
 const isCurrentMonth_ =
 date.getMonth() === currentDate.getMonth()
 && date.getFullYear() === currentDate.getFullYear();
 const hasAct = hasActivity(date);

 return (
 <motion.button
 key={`${getDateKey(date)}-${index}`}
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.9 }}
 onClick={() => {
 setSelectedDate(date);
 if (!isCurrentMonth_) {
 setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
 }
 }}
 className={cn(
 'w-full h-[clamp(2.7rem,4.8vh,3.85rem)] rounded-xl transition-all duration-200 flex flex-col items-center justify-center relative group',
 isSelected
 ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/30 font-bold z-10'
 : isToday
 ? 'bg-gray-900 text-white shadow-md font-bold'
 : isCurrentMonth_
 ? 'bg-white hover:bg-gray-100 text-gray-700 hover:shadow-sm'
 : 'bg-white/70 text-gray-300 hover:bg-gray-100/80',
 'text-sm'
 )}
 title={date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
 >
 {date.getDate()}

 {/* Activity Indicator */}
 {hasAct && !isSelected && (
 <div className="absolute bottom-1.5 sm:bottom-2 flex gap-0.5">
 <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-pink-500 shadow-sm shadow-pink-500/50" />
 </div>
 )}
 {hasAct && isSelected && (
 <div className="absolute bottom-1.5 sm:bottom-2 flex gap-0.5">
 <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white shadow-sm" />
 </div>
 )}
 </motion.button>
 );
 })}
 </AnimatePresence>
 </div>
 </div>
 </div>

 {/* Daily Activity Timeline */}
 <AnimatePresence mode="wait">
 {selectedDate && (
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -20 }}
 className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
 >
 {/* Header */}
 <div className="bg-gradient-to-r from-gray-50 to-white px-4 sm:px-6 py-4 border-b border-gray-100">
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
 {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
 </h2>
 <p className="text-xs text-gray-500 mt-0.5">Activity Summary</p>
 </div>
 <button
 onClick={() => setSelectedDate(null)}
 className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center"
 title="Close"
 >
 <X size={18} className="text-gray-500" />
 </button>
 </div>
 </div>

 <div className="p-4 sm:p-6">
 {/* Daily Stats Summary */}
 {(() => {
 const dailyStats = getDailyStats(selectedDate);
 return (
 <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
 <div className="bg-green-50 rounded-xl p-3 text-center">
 <p className="text-xs text-green-600 font-medium mb-1">Income</p>
 <p className="text-sm sm:text-base font-bold text-green-700">
 +{formatCurrency(dailyStats.income)}
 </p>
 </div>
 <div className="bg-red-50 rounded-xl p-3 text-center">
 <p className="text-xs text-red-600 font-medium mb-1">Expense</p>
 <p className="text-sm sm:text-base font-bold text-red-700">
 -{formatCurrency(dailyStats.expense)}
 </p>
 </div>
 <div className={cn(
"rounded-xl p-3 text-center",
 dailyStats.total >= 0 ?"bg-blue-50" :"bg-orange-50"
 )}>
 <p className={cn(
"text-xs font-medium mb-1",
 dailyStats.total >= 0 ?"text-blue-600" :"text-orange-600"
 )}>Net</p>
 <p className={cn(
"text-sm sm:text-base font-bold",
 dailyStats.total >= 0 ?"text-blue-700" :"text-orange-700"
 )}>
 {dailyStats.total >= 0 ? '+' : ''}{formatCurrency(dailyStats.total)}
 </p>
 </div>
 </div>
 );
 })()}

 {/* Transactions List */}
 {getDailyActivities(selectedDate).length > 0 ? (
 <div className="space-y-3">
 {getDailyActivities(selectedDate).map((activity, idx) => (
 <motion.div
 key={activity.id}
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: idx * 0.05 }}
 className={cn(
 'flex items-center gap-3 p-3 sm:p-4 rounded-xl transition-colors',
 activity.type === 'reminder'
 ? 'bg-purple-50 border border-purple-100'
 : 'bg-white hover:bg-gray-100'
 )}
 >
 <div className={cn(
 'w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0',
 activity.type === 'expense' ? 'bg-red-100' :
 activity.type === 'income' ? 'bg-green-100' :
 activity.type === 'transfer' ? 'bg-blue-100' : 'bg-purple-100'
 )}>
 {activity.icon}
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">{activity.title}</p>
 <div className="flex items-center gap-2 mt-0.5 flex-wrap">
 {activity.category && (
 <span className="text-xs px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-200">
 {activity.category}
 </span>
 )}
 {activity.accountName && (
 <span className="text-xs text-gray-400">- {activity.accountName}</span>
 )}
 </div>
 </div>
 <div className="text-right flex-shrink-0">
 {activity.amount && (
 <p className={cn(
 'font-bold text-sm sm:text-base',
 activity.type === 'expense' ? 'text-red-600' : 'text-green-600'
 )}>
 {activity.type === 'expense' ? '-' : '+'}{formatCurrency(activity.amount)}
 </p>
 )}
 {activity.time && (
 <p className="text-xs text-gray-400 mt-0.5">{activity.time}</p>
 )}
 </div>
 </motion.div>
 ))}
 </div>
 ) : (
 <div className="text-center py-8">
 <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
 <CalendarIcon size={24} className="text-gray-400" />
 </div>
 <p className="text-gray-500 font-medium">No activities for this day</p>
 <button
 onClick={() => setShowReminderModal(true)}
 className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-2 text-sm"
 >
 <Plus size={16} /> Add Reminder
 </button>
 </div>
 )}
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Add Reminder Modal */}
 <AnimatePresence>
 {showReminderModal && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
 onClick={() => setShowReminderModal(false)}
 >
 <motion.div
 initial={{ scale: 0.95, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0.95, opacity: 0 }}
 onClick={(e) => e.stopPropagation()}
 className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md"
 >
 <div className="flex items-center justify-between mb-6">
 <h3 className="text-2xl font-bold text-gray-900">Add Reminder</h3>
 <button
 type="button"
 onClick={() => setShowReminderModal(false)}
 className="p-1 hover:bg-gray-100 rounded-lg"
 aria-label="Close add reminder modal"
 title="Close add reminder modal"
 >
 <X size={24} />
 </button>
 </div>

 <div className="space-y-4">
 <div>
 <label htmlFor="reminder-title" className="block text-sm font-semibold text-gray-900 mb-2">Title</label>
 <input
 id="reminder-title"
 type="text"
 value={newReminder.title}
 onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
 placeholder="Add reminder title"
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
 />
 </div>

 <div>
 <label htmlFor="reminder-description" className="block text-sm font-semibold text-gray-900 mb-2">Description (Optional)</label>
 <textarea
 id="reminder-description"
 value={newReminder.description}
 onChange={(e) => setNewReminder({ ...newReminder, description: e.target.value })}
 placeholder="Add details"
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none h-20"
 />
 </div>

 <div>
 <label htmlFor="reminder-type" className="block text-sm font-semibold text-gray-900 mb-2">Type</label>
 <select
 id="reminder-type"
 value={newReminder.type}
 onChange={(e) => setNewReminder({ ...newReminder, type: e.target.value as any })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
 >
 <option value="task">Task</option>
 <option value="event">Event</option>
 <option value="reminder">Reminder</option>
 <option value="goal">Goal</option>
 </select>
 </div>

 <div>
 <label htmlFor="reminder-date" className="block text-sm font-semibold text-gray-900 mb-2">Date</label>
 <input
 id="reminder-date"
 type="date"
 value={newReminder.date.toISOString().split('T')[0]}
 onChange={(e) => setNewReminder({ ...newReminder, date: new Date(e.target.value) })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
 />
 </div>

 <div className="flex gap-3 pt-4">
 <button
 onClick={() => setShowReminderModal(false)}
 className="flex-1 px-4 py-2 rounded-lg bg-gray-200 text-gray-900 font-semibold hover:bg-gray-300 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={addReminder}
 className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold hover:from-pink-600 hover:to-rose-600 transition-colors"
 >
 Add
 </button>
 </div>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
};
