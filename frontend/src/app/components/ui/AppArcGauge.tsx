import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface AppArcGaugeProps {
  /** Current numerical value */
  value: number;
  /** Maximum/Target numerical value */
  max: number;
  /** Primary label displayed prominently in the center, e.g. "460 / 1600" or "₹24,500 / ₹50,000" */
  centerValue?: React.ReactNode;
  /** Secondary label below the center value, e.g. "Calories" or "Monthly Budget" */
  subtitle?: string;
  /** Size of gauge in pixels */
  size?: number;
  /** Thickness of the arc line in pixels */
  strokeWidth?: number;
  /** Color of the progress stroke. Defaults to dark charcoal #18181B */
  strokeColor?: string;
  /** Track background color. Defaults to #E5E7EB */
  trackColor?: string;
  /** Show a knob indicator circle at the tip of the progress arc */
  showKnob?: boolean;
  /** Optional action/icon button in the upper right, e.g. an Edit pencil icon */
  actionButton?: React.ReactNode;
  className?: string;
}

export const AppArcGauge: React.FC<AppArcGaugeProps> = ({
  value,
  max,
  centerValue,
  subtitle,
  size = 220,
  strokeWidth = 16,
  strokeColor = '#18181B',
  trackColor = '#E5E7EB',
  showKnob = true,
  actionButton,
  className,
}) => {
  const percentage = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));

  // The arc sweeps 240 degrees (from 150deg to 390deg), opening at the bottom
  const startAngle = 150;
  const endAngle = 390;
  const totalSweep = endAngle - startAngle; // 240 deg

  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Convert polar coordinates to Cartesian
  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (cx: number, cy: number, r: number, startA: number, endA: number) => {
    const start = polarToCartesian(cx, cy, r, endA);
    const end = polarToCartesian(cx, cy, r, startA);
    const largeArcFlag = endA - startA <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  // Full track path
  const trackPath = describeArc(center, center, radius, startAngle, endAngle);

  // Circumference for stroke-dasharray animation
  const totalLength = (2 * Math.PI * radius * totalSweep) / 360;
  const currentSweepAngle = startAngle + (percentage / 100) * totalSweep;
  const knobPos = polarToCartesian(center, center, radius, currentSweepAngle);

  return (
    <div className={cn('relative flex flex-col items-center justify-center select-none', className)}>
      {actionButton && (
        <div className="absolute top-0 right-2 z-10">
          {actionButton}
        </div>
      )}

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {/* Background Track */}
          <path
            d={trackPath}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Progress Arc */}
          <motion.path
            d={trackPath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={{ strokeDashoffset: totalLength }}
            animate={{ strokeDashoffset: totalLength * (1 - percentage / 100) }}
            strokeDasharray={totalLength}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />

          {/* Knob Circle Indicator at Tip */}
          {showKnob && percentage > 0 && (
            <motion.circle
              cx={knobPos.x}
              cy={knobPos.y}
              r={strokeWidth * 0.45}
              fill="#FFFFFF"
              stroke={strokeColor}
              strokeWidth={3}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, duration: 0.25 }}
              className="drop-shadow-xs"
            />
          )}
        </svg>

        {/* Center Contents */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4 pt-2">
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
            {centerValue ?? `${Math.round(value)} / ${Math.round(max)}`}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm font-medium text-slate-400 mt-1.5 tracking-tight">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
