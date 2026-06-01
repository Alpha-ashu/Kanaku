import React, { useId } from 'react';

export const KANKULogo = ({ className = "w-10 h-10" }: { className?: string }) => {
  const uniqueId = useId().replace(/:/g, '-');
  const topGradId = `KANKU-top-${uniqueId}`;
  const rightGradId = `KANKU-right-${uniqueId}`;
  const bottomGradId = `KANKU-bottom-${uniqueId}`;
  const leftGradId = `KANKU-left-${uniqueId}`;

  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={topGradId} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
        <linearGradient id={rightGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={bottomGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id={leftGradId} x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      <g style={{ mixBlendMode: 'normal' }}>
        <path d="M 50 65 Q 95 35, 50 0 Q 5 35, 50 65 Z" fill={`url(#${topGradId})`} opacity="0.9" />
        <path d="M 35 50 Q 65 5, 100 50 Q 65 95, 35 50 Z" fill={`url(#${rightGradId})`} opacity="0.9" />
        <path d="M 50 35 Q 5 65, 50 100 Q 95 65, 50 35 Z" fill={`url(#${bottomGradId})`} opacity="0.9" />
        <path d="M 65 50 Q 35 95, 0 50 Q 35 5, 65 50 Z" fill={`url(#${leftGradId})`} opacity="0.9" />
      </g>
    </svg>
  );
};
