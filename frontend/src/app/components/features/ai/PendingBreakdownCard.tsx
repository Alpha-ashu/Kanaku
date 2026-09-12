import React from 'react';
import { motion } from 'framer-motion';

export interface BreakdownItem {
  label: string;
  percentage: number;
  color: string;
  amount?: number;
}

export interface PendingBreakdownCardProps {
  title?: string;
  items?: BreakdownItem[];
  currencySymbol?: string;
  className?: string;
}

const DEFAULT_BREAKDOWN: BreakdownItem[] = [
  { label: 'Food', percentage: 36, color: 'from-[#8B7FF8] to-[#7C66FF]', amount: 480 },
  { label: 'Shopping', percentage: 26, color: 'from-[#6EA8FE] to-[#518EF8]', amount: 350 },
  { label: 'Transport', percentage: 17, color: 'from-[#4FD1C5] to-[#38B2AC]', amount: 230 },
  { label: 'Bills', percentage: 14, color: 'from-[#F6AD55] to-[#ED8936]', amount: 190 },
];

export const PendingBreakdownCard: React.FC<PendingBreakdownCardProps> = ({
  title = 'Pending Breakdown',
  items = DEFAULT_BREAKDOWN,
  currencySymbol = '£',
  className = '',
}) => {
  const maxPercent = Math.max(...items.map((i) => i.percentage), 40);

  return (
    <div
      className={`w-full max-w-[320px] bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-[0_8px_25px_-4px_rgba(112,144,176,0.08)] select-none ${className}`}
    >
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
          {title}
        </h4>
        <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
          This Month
        </span>
      </div>

      {/* Chart Grid */}
      <div className="flex items-end justify-between gap-2.5 sm:gap-3.5 h-36 pt-2 pb-1 px-1">
        {items.map((item, idx) => {
          const heightPercent = Math.round((item.percentage / maxPercent) * 100);

          return (
            <div key={item.label} className="flex-1 flex flex-col items-center h-full justify-end">
              {/* Column Track with Diagonal Hatching */}
              <div
                className="w-full relative rounded-xl sm:rounded-2xl overflow-hidden flex flex-col justify-end"
                style={{
                  height: '110px',
                  background:
                    'repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 4px, #F8FAFC 4px, #F8FAFC 9px)',
                  border: '1px solid #E2E8F0',
                }}
              >
                {/* Colored Fill Bar */}
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPercent}%` }}
                  transition={{ duration: 0.8, delay: idx * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  className={`w-full rounded-xl sm:rounded-2xl bg-gradient-to-t ${item.color} flex flex-col items-center justify-start pt-1.5 shadow-xs`}
                >
                  {/* Percentage Value */}
                  <span className="text-[10px] sm:text-[11px] font-extrabold text-white tracking-tight drop-shadow-xs">
                    {item.percentage}%
                  </span>
                </motion.div>
              </div>

              {/* Label */}
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 mt-2 truncate max-w-full text-center">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PendingBreakdownCard;
