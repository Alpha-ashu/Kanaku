import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface AppTrendChartProps {
  data: Array<{ label: string; value: number; [key: string]: any }>;
  dataKey?: string;
  badgeLabel?: string;
  badgeValue?: string | number;
  height?: number;
  currencyPrefix?: string;
  className?: string;
}

export const AppTrendChart: React.FC<AppTrendChartProps> = ({
  data,
  dataKey = 'value',
  badgeLabel,
  badgeValue,
  height = 180,
  currencyPrefix = '',
  className,
}) => {
  const gradientId = React.useId();

  return (
    <div className={cn('relative w-full', className)}>
      {/* Optional Floating Top Value Badge (e.g. 84% in Reference Screen 3) */}
      {(badgeValue !== undefined || badgeLabel) && (
        <div className="flex items-center justify-between mb-2">
          {badgeLabel && (
            <span className="text-xs font-semibold text-slate-400">{badgeLabel}</span>
          )}
          {badgeValue !== undefined && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#8B5CF6] text-white shadow-xs">
              {badgeValue}
            </span>
          )}
        </div>
      )}

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.32} />
                <stop offset="60%" stopColor="#C4B5FD" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#EDE9FE" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="#F1F5F9"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="#94A3B8"
              fontSize={11}
              fontWeight={600}
              tickLine={false}
              axisLine={false}
              dy={6}
            />
            <YAxis
              stroke="#94A3B8"
              fontSize={10}
              fontWeight={500}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${currencyPrefix}${v}`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg">
                      {currencyPrefix}
                      {Number(payload[0].value).toLocaleString()}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="#8B5CF6"
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              activeDot={{
                r: 6,
                fill: '#8B5CF6',
                stroke: '#FFFFFF',
                strokeWidth: 3,
                className: 'drop-shadow-sm',
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
