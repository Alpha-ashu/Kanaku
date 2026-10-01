import React from 'react';
import { IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The KANAKU coin: a gold disc with a rupee mark (1 coin = ₹1). Used wherever a
 * coin amount is shown — the top bar, the wallet balance, coin packages.
 * Lucide's `Coins` glyph reads as a chain link at these sizes.
 */
const SIZES = {
  xs: { box: 'w-5 h-5', icon: 11, ring: 'inset-[2px]' },
  sm: { box: 'w-7 h-7', icon: 13, ring: 'inset-[3px]' },
  md: { box: 'w-8 h-8', icon: 15, ring: 'inset-[3px]' },
  lg: { box: 'w-10 h-10', icon: 18, ring: 'inset-[4px]' },
} as const;

export const CoinMark: React.FC<{ size?: keyof typeof SIZES; className?: string }> = ({ size = 'md', className }) => {
  const s = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex items-center justify-center rounded-full shrink-0 text-amber-900',
        'bg-gradient-to-br from-amber-200 via-amber-400 to-amber-500',
        'shadow-[inset_0_-2px_0_rgba(180,83,9,0.35),0_1px_2px_rgba(15,23,42,0.15)]',
        s.box,
        className,
      )}
    >
      <span className={cn('absolute rounded-full border border-amber-50/70', s.ring)} />
      <IndianRupee size={s.icon} strokeWidth={2.75} className="relative" />
    </span>
  );
};

export default CoinMark;
