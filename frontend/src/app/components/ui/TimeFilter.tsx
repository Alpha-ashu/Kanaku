import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toLocalDate, toLocalDateKey } from '@/lib/dateUtils';

export type TimeFilterPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface TimeFilterProps {
 value: TimeFilterPeriod;
 onChange: (period: TimeFilterPeriod) => void;
 className?: string;
 testId?: string;
}

const filterOptions: { id: TimeFilterPeriod; label: string }[] = [
 { id: 'daily', label: 'Daily' },
 { id: 'weekly', label: 'Weekly' },
 { id: 'monthly', label: 'Monthly' },
 { id: 'yearly', label: 'Yearly' },
];

export const TimeFilter: React.FC<TimeFilterProps> = ({ value, onChange, className, testId }) => {
 return (
 <div data-testid={testId} className={cn('flex items-center justify-center gap-1 sm:gap-2 p-1.5 bg-gray-100/80 backdrop-blur-sm rounded-2xl w-full max-w-md mx-auto overflow-x-auto scrollbar-hide', className)}>
 {filterOptions.map((option) => (
 <button data-testid={`time-filter-button-${option.id}`}
 key={option.id}
 onClick={() => onChange(option.id)}
 className={cn(
 'relative flex-1 sm:flex-initial flex items-center justify-center px-3 py-2 sm:px-6 sm:py-2.5 rounded-[12px] text-xs sm:text-sm font-semibold transition-all duration-300 whitespace-nowrap',
 value === option.id
 ? 'text-white'
 : 'text-gray-600 hover:bg-gray-200/50'
 )}
 >
 {value === option.id && (
 <motion.div
 layoutId="timeFilterPill"
 className="absolute inset-0 bg-gradient-to-r from-pink-500 to-rose-500 rounded-[12px] shadow-sm shadow-pink-200 z-0"
 transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
 />
 )}
 <span className="relative z-10">{option.label}</span>
 </button>
 ))}
 </div>
 );
};

// Helper function to filter transactions by time period
export const filterByTimePeriod = <T extends { date: Date | string }>(
 items: T[],
 period: TimeFilterPeriod,
 referenceDate: Date = new Date()
): T[] => {
 const refKey = toLocalDateKey(referenceDate);
 if (!refKey) return items;

 const now = toLocalDate(referenceDate)!;

 return items.filter((item) => {
 const itemKey = toLocalDateKey(item.date);
 if (!itemKey) return false;

 switch (period) {
 case 'daily':
 return itemKey === refKey;
 case 'weekly': {
 const itemDate = toLocalDate(item.date)!;
 const startOfWeek = new Date(now);
 startOfWeek.setDate(now.getDate() - now.getDay());
 startOfWeek.setHours(0, 0, 0, 0);
 const endOfWeek = new Date(startOfWeek);
 endOfWeek.setDate(startOfWeek.getDate() + 7);
 return itemDate >= startOfWeek && itemDate < endOfWeek;
 }
 case 'monthly': {
 const itemDate = toLocalDate(item.date)!;
 return (
 itemDate.getMonth() === now.getMonth() &&
 itemDate.getFullYear() === now.getFullYear()
 );
 }
 case 'yearly': {
 const itemDate = toLocalDate(item.date)!;
 return itemDate.getFullYear() === now.getFullYear();
 }
 default:
 return true;
 }
 });
};

// Helper to get period label for display
export const getPeriodLabel = (period: TimeFilterPeriod): string => {
 const now = new Date();
 switch (period) {
 case 'daily':
 return now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
 case 'weekly':
 const startOfWeek = new Date(now);
 startOfWeek.setDate(now.getDate() - now.getDay());
 const endOfWeek = new Date(startOfWeek);
 endOfWeek.setDate(startOfWeek.getDate() + 6);
 return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
 case 'monthly':
 return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
 case 'yearly':
 return now.getFullYear().toString();
 default:
 return '';
 }
};
