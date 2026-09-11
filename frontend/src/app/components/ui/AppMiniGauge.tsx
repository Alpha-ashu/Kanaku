import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type MiniGaugeTone = 'peach' | 'lavender' | 'mint' | 'sky';

export interface AppMiniGaugeProps {
  value: string | number;
  label: string;
  subLabel?: string;
  progressPercent?: number; // 0 to 100
  tone?: MiniGaugeTone;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const TONE_CONFIG: Record<MiniGaugeTone, {
  stroke: string;
  track: string;
  badgeBg: string;
  badgeText: string;
}> = {
  peach: {
    stroke: '#F97316',
    track: '#FFE4D6',
    badgeBg: '#FFF4EC',
    badgeText: '#EA580C',
  },
  lavender: {
    stroke: '#8B5CF6',
    track: '#EDE9FE',
    badgeBg: '#F5F3FF',
    badgeText: '#7C3AED',
  },
  mint: {
    stroke: '#10B981',
    track: '#D1FAE5',
    badgeBg: '#ECFDF5',
    badgeText: '#059669',
  },
  sky: {
    stroke: '#3B82F6',
    track: '#DBEAFE',
    badgeBg: '#EFF6FF',
    badgeText: '#2563EB',
  },
};

export const AppMiniGauge: React.FC<AppMiniGaugeProps> = ({
  value,
  label,
  subLabel,
  progressPercent = 65,
  tone = 'lavender',
  icon,
  onClick,
  className,
}) => {
  const config = TONE_CONFIG[tone];
  const size = 64;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const validPercent = Math.max(0, Math.min(100, progressPercent));
  const offset = circumference - (validPercent / 100) * circumference;

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3.5 sm:p-4 rounded-[24px] bg-white border border-slate-100/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] flex flex-col justify-between items-center text-center transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
        className
      )}
    >
      {/* Top Value & Label */}
      <div className="w-full mb-3">
        <p className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight truncate">
          {value}
        </p>
        <p className="text-[11px] sm:text-xs font-medium text-slate-400 truncate mt-0.5">
          {label}
        </p>
        {subLabel && (
          <span
            className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full"
            style={{ backgroundColor: config.badgeBg, color: config.badgeText }}
          >
            {subLabel}
          </span>
        )}
      </div>

      {/* Circular Progress Ring with Center Icon */}
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={config.track}
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={config.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            strokeLinecap="round"
          />
        </svg>

        {/* Centered Icon or Dot */}
        <div
          className="absolute inset-0 flex items-center justify-center text-xs"
          style={{ color: config.stroke }}
        >
          {icon ?? <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.stroke }} />}
        </div>
      </div>
    </div>
  );
};
