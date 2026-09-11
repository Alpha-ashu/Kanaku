import React, { useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { toLocalDateKey } from '@/lib/dateUtils';
import type { TimeFilterPeriod } from './TimeFilter';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface AppDateStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  period?: TimeFilterPeriod;
  daysCount?: number;
  className?: string;
}

const getWeekdayLabel = (date: Date): string => {
  const day = date.getDay();
  switch (day) {
    case 0: return 'SUN';
    case 1: return 'MON';
    case 2: return 'TUE';
    case 3: return 'WED'; // Correct abbreviation for Wednesday
    case 4: return 'THU';
    case 5: return 'FRI';
    case 6: return 'SAT';
    default: return '';
  }
};

export const AppDateStrip: React.FC<AppDateStripProps> = ({
  selectedDate,
  onSelectDate,
  period = 'daily',
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handlePrev = () => {
    const d = new Date(selectedDate || new Date());
    if (period === 'weekly') {
      d.setDate(d.getDate() - 7);
    } else if (period === 'monthly') {
      d.setMonth(d.getMonth() - 1);
    } else if (period === 'yearly') {
      d.setFullYear(d.getFullYear() - 1);
    } else {
      d.setDate(d.getDate() - 1);
    }
    onSelectDate(d);
  };

  const handleNext = () => {
    const d = new Date(selectedDate || new Date());
    if (period === 'weekly') {
      d.setDate(d.getDate() + 7);
    } else if (period === 'monthly') {
      d.setMonth(d.getMonth() + 1);
    } else if (period === 'yearly') {
      d.setFullYear(d.getFullYear() + 1);
    } else {
      d.setDate(d.getDate() + 1);
    }
    onSelectDate(d);
  };

  // 1. Daily items: scrollable strip around selected date
  const dailyItems = useMemo(() => {
    const list: { key: string; date: Date; topLabel: string; mainLabel: string; isWeekend: boolean; isSelected: boolean }[] = [];
    const base = new Date(selectedDate || new Date());
    for (let i = -5; i <= 6; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const isSelected = toLocalDateKey(d) === toLocalDateKey(selectedDate);
      const day = d.getDay();
      list.push({
        key: `day-${toLocalDateKey(d)}`,
        date: d,
        topLabel: getWeekdayLabel(d),
        mainLabel: d.getDate().toString(),
        isWeekend: day === 0 || day === 6,
        isSelected,
      });
    }
    return list;
  }, [selectedDate?.getFullYear(), selectedDate?.getMonth(), selectedDate?.getDate()]);

  // 2. Weekly items: Exactly 7 days (Monday through Sunday) of the active week
  const weeklyItems = useMemo(() => {
    const list: { key: string; date: Date; topLabel: string; mainLabel: string; isWeekend: boolean; isSelected: boolean }[] = [];
    const base = new Date(selectedDate || new Date());
    const startOfWeek = new Date(base);
    // Standard Monday-start week: Monday = 0, Tuesday = 1, ... Sunday = 6
    const dayOffset = (base.getDay() + 6) % 7;
    startOfWeek.setDate(base.getDate() - dayOffset);
    startOfWeek.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const isSelected = toLocalDateKey(d) === toLocalDateKey(selectedDate);
      const day = d.getDay();
      list.push({
        key: `week-day-${toLocalDateKey(d)}`,
        date: d,
        topLabel: getWeekdayLabel(d),
        mainLabel: d.getDate().toString(),
        isWeekend: day === 0 || day === 6,
        isSelected,
      });
    }
    return list;
  }, [selectedDate?.getFullYear(), selectedDate?.getMonth(), selectedDate?.getDate()]);

  // 3. Monthly items
  const monthlyItems = useMemo(() => {
    const list: { key: string; date: Date; topLabel: string; mainLabel: string; isWeekend: boolean; isSelected: boolean }[] = [];
    const year = selectedDate ? selectedDate.getFullYear() : new Date().getFullYear();
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1);
      const isSelected = selectedDate ? (selectedDate.getMonth() === m && selectedDate.getFullYear() === year) : false;
      list.push({
        key: `month-${year}-${m}`,
        date: d,
        topLabel: year.toString(),
        mainLabel: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        isWeekend: false,
        isSelected,
      });
    }
    return list;
  }, [selectedDate?.getFullYear(), selectedDate?.getMonth()]);

  // 4. Yearly items
  const yearlyItems = useMemo(() => {
    const list: { key: string; date: Date; topLabel: string; mainLabel: string; isWeekend: boolean; isSelected: boolean }[] = [];
    const currentYear = selectedDate ? selectedDate.getFullYear() : new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 3; y++) {
      const d = new Date(y, 0, 1);
      const isSelected = selectedDate ? selectedDate.getFullYear() === y : false;
      list.push({
        key: `year-${y}`,
        date: d,
        topLabel: 'YEAR',
        mainLabel: y.toString(),
        isWeekend: false,
        isSelected,
      });
    }
    return list;
  }, [selectedDate?.getFullYear()]);

  const items = useMemo(() => {
    switch (period) {
      case 'weekly':
        return weeklyItems;
      case 'monthly':
        return monthlyItems;
      case 'yearly':
        return yearlyItems;
      case 'daily':
      default:
        return dailyItems;
    }
  }, [period, dailyItems, weeklyItems, monthlyItems, yearlyItems]);

  // Auto scroll to selected date on mount or change (except for weekly which fits all 7 days)
  useEffect(() => {
    if (period === 'weekly') return;
    if (!scrollRef.current) return;
    const timeout = setTimeout(() => {
      const selectedEl = scrollRef.current?.querySelector('[data-selected="true"]');
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }, 40);
    return () => clearTimeout(timeout);
  }, [selectedDate, period]);

  const showChevrons = true;

  return (
    <div
      className={cn(
        'w-full flex items-center justify-center select-none py-1',
        className
      )}
    >
      <div className="flex items-center justify-center gap-1.5 sm:gap-3 md:gap-4 max-w-full">
        {showChevrons && (
          <button
            type="button"
            onClick={handlePrev}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100/90 active:scale-90 transition-all shrink-0 cursor-pointer border border-slate-200/60 hover:border-slate-300 shadow-2xs"
            title="Previous"
            aria-label="Previous"
          >
            <ChevronLeft size={18} className="stroke-[2.5]" />
          </button>
        )}

        <div
          ref={scrollRef}
          className={cn(
            'flex items-center py-2 px-1',
            period === 'weekly'
              ? 'justify-center overflow-visible gap-1.5 sm:gap-3 md:gap-5'
              : 'justify-start sm:justify-center overflow-x-auto scrollbar-none snap-x gap-2 sm:gap-4 lg:gap-6'
          )}
        >
          {items.map((item) => {
            if (item.isSelected) {
              return (
                <button
                  key={item.key}
                  type="button"
                  data-selected="true"
                  onClick={() => onSelectDate(item.date)}
                  className="relative flex flex-col items-center justify-center bg-[#0F172A] rounded-[22px] sm:rounded-[24px] py-2.5 sm:py-3 px-3 sm:px-4 min-w-[48px] sm:min-w-[56px] shadow-xl shadow-slate-950/20 snap-center shrink-0 cursor-pointer transition-all duration-200 focus:outline-none z-10"
                >
                  <span className="text-[#FF2D78] font-black text-[10px] sm:text-xs tracking-wider uppercase leading-none">
                    {item.topLabel}
                  </span>
                  <span className="text-white font-black text-base sm:text-lg leading-tight mt-1.5 whitespace-nowrap">
                    {item.mainLabel}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D78] mt-1 shadow-xs shadow-pink-500/50" />
                </button>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                data-selected="false"
                onClick={() => onSelectDate(item.date)}
                className="flex flex-col items-center justify-center min-w-[38px] sm:min-w-[46px] py-2.5 sm:py-3 px-1.5 sm:px-2 rounded-[20px] cursor-pointer transition-all duration-150 snap-center shrink-0 hover:bg-slate-100/70 active:scale-95 focus:outline-none"
              >
                <span
                  className={cn(
                    'font-black text-[10px] sm:text-xs tracking-wider uppercase leading-none transition-colors',
                    item.isWeekend ? 'text-[#FF2D55]' : 'text-[#94A3B8]'
                  )}
                >
                  {item.topLabel}
                </span>
                <span className="text-[#64748B] font-bold text-base sm:text-lg leading-tight mt-1.5 tracking-tight whitespace-nowrap">
                  {item.mainLabel}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-transparent mt-1" />
              </button>
            );
          })}
        </div>

        {showChevrons && (
          <button
            type="button"
            onClick={handleNext}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100/90 active:scale-90 transition-all shrink-0 cursor-pointer border border-slate-200/60 hover:border-slate-300 shadow-2xs"
            title="Next"
            aria-label="Next"
          >
            <ChevronRight size={18} className="stroke-[2.5]" />
          </button>
        )}
      </div>
    </div>
  );
};
