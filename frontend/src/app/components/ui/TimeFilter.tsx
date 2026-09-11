import React from 'react';
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
    <div
      data-testid={testId}
      className={cn(
        'inline-flex items-center justify-center p-1 sm:p-1.5 bg-[#F4F6F9] border border-slate-200/50 rounded-full shadow-2xs gap-1 max-w-full overflow-x-auto scrollbar-hide',
        className
      )}
    >
      {filterOptions.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            data-testid={`time-filter-button-${option.id}`}
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              'px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-black transition-all duration-200 whitespace-nowrap select-none cursor-pointer focus:outline-none',
              isActive
                ? 'bg-[#0F172A] text-white shadow-md shadow-slate-900/15'
                : 'text-[#3B4861] hover:text-slate-900 hover:bg-slate-200/50'
            )}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
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
        const dayOffset = (now.getDay() + 6) % 7;
        startOfWeek.setDate(now.getDate() - dayOffset);
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
export const getPeriodLabel = (period: TimeFilterPeriod, referenceDate: Date = new Date()): string => {
  const ref = toLocalDate(referenceDate) || new Date();
  switch (period) {
    case 'daily':
      return ref.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    case 'weekly': {
      const startOfWeek = new Date(ref);
      const dayOffset = (ref.getDay() + 6) % 7;
      startOfWeek.setDate(ref.getDate() - dayOffset);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    case 'monthly':
      return ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    case 'yearly':
      return ref.getFullYear().toString();
    default:
      return '';
  }
};
