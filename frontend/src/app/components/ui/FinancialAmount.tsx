/**
 * FinancialAmount
 * Single source-of-truth for rendering financial numbers across the app.
 *
 * Features:
 *   - Indian number format (Rs1,23,45,678) by default for INR
 *   - Auto-sizing: observes container width, picks smallest fitting tier
 *   - Compact fallback (Rs12.3Cr / Rs1.2L) when number is still too long
 *   - Negative numbers shown in red/rose with - prefix
 *   - Zero shown in muted slate
 */

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getCurrencySymbol, normalizeCurrencyCode, getCurrencyLocale } from '@/lib/currencyUtils';

export type FinancialSize = 'xl' | 'lg' | 'md' | 'sm' | 'xs' | '2xs' | 'auto';
export type FinancialFormat = 'indian' | 'international' | 'compact' | 'auto-compact';

export interface FinancialAmountProps {
  value: number;
  currency?: string;
  size?: FinancialSize;
  format?: FinancialFormat;
  showSign?: boolean;
  colorize?: boolean;
  decimals?: number;
  className?: string;
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3';
}

export function formatIndianNumber(value: number, decimals = 2): string {
  const absVal = Math.abs(value);
  const fixed = absVal.toFixed(decimals);
  const [integer, decimal] = fixed.split('.');
  let result = '';
  const len = integer.length;
  if (len <= 3) {
    result = integer;
  } else {
    result = integer.slice(-3);
    let remaining = integer.slice(0, -3);
    while (remaining.length > 2) {
      result = remaining.slice(-2) + ',' + result;
      remaining = remaining.slice(0, -2);
    }
    result = remaining + ',' + result;
  }
  return decimals > 0 ? result + '.' + decimal : result;
}

export function formatCompactINR(value: number, decimals = 2): string {
  const absVal = Math.abs(value);
  if (absVal >= 1_00_00_00_000) {
    const cr = absVal / 1_00_00_000;
    return (cr >= 100 ? Math.round(cr).toLocaleString('en-IN') : cr.toFixed(1)) + 'Cr';
  }
  if (absVal >= 1_00_00_000) {
    const cr = absVal / 1_00_00_000;
    return cr.toFixed(cr >= 10 ? 1 : 2) + 'Cr';
  }
  if (absVal >= 1_00_000) {
    const l = absVal / 1_00_000;
    return l.toFixed(l >= 10 ? 1 : 2) + 'L';
  }
  return formatIndianNumber(absVal, decimals);
}

function formatInternational(value: number, currency: string, decimals: number): string {
  const code = normalizeCurrencyCode(currency);
  try {
    return new Intl.NumberFormat(getCurrencyLocale(code), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.abs(value));
  } catch {
    return Math.abs(value).toFixed(decimals);
  }
}

function getFormattedNumber(value: number, currency: string, format: FinancialFormat, decimals: number): string {
  const code = normalizeCurrencyCode(currency);
  const isINR = code === 'INR';
  switch (format) {
    case 'compact':
      if (isINR) return formatCompactINR(value, decimals);
      try {
        return new Intl.NumberFormat(getCurrencyLocale(code), { notation: 'compact', maximumSignificantDigits: 3 }).format(Math.abs(value));
      } catch { return formatInternational(value, code, decimals); }
    case 'international':
      return formatInternational(value, code, decimals);
    case 'indian':
    case 'auto-compact':
    default:
      if (isINR) return formatIndianNumber(Math.abs(value), decimals);
      return formatInternational(value, code, decimals);
  }
}

const TIER_ORDER: Array<Exclude<FinancialSize, 'auto'>> = ['xl', 'lg', 'md', 'sm', 'xs', '2xs'];
const TIER_PX: Record<string, number> = { xl: 40, lg: 28, md: 20, sm: 16, xs: 14, '2xs': 12 };
const TIER_CHAR_LIMIT: Record<string, number> = { xl: 12, lg: 13, md: 14, sm: 13, xs: 13, '2xs': 14 };

function pickTier(containerWidth: number, formattedStr: string): Exclude<FinancialSize, 'auto'> {
  const charCount = formattedStr.length;
  for (const tier of TIER_ORDER) {
    const estWidth = charCount * TIER_PX[tier] * 0.62;
    if (estWidth <= containerWidth && charCount <= TIER_CHAR_LIMIT[tier]) return tier;
  }
  return '2xs';
}

const SIZE_CLASS: Record<string, string> = {
  xl: 'text-fin-xl', lg: 'text-fin-lg', md: 'text-fin-md',
  sm: 'text-fin-sm', xs: 'text-fin-xs', '2xs': 'text-fin-2xs',
};

export const FinancialAmount: React.FC<FinancialAmountProps> = ({
  value, currency = 'INR', size = 'auto', format = 'indian',
  showSign = false, colorize = false, decimals, className, as: Tag = 'span',
}) => {
  const wrapperRef = useRef<HTMLElement>(null);
  const [resolvedSize, setResolvedSize] = useState<Exclude<FinancialSize, 'auto'>>('md');
  const [useCompact, setUseCompact] = useState(false);
  const code = normalizeCurrencyCode(currency);
  const symbol = getCurrencySymbol(code);
  const isNegative = value < 0;
  const isZero = value === 0;
  const effectiveDecimals = decimals !== undefined ? decimals : (Number.isInteger(value) ? 0 : 2);
  const effectiveFormat = (format === 'auto-compact' && useCompact) ? 'compact' : format;
  const numStr = getFormattedNumber(value, code, effectiveFormat, effectiveDecimals);

  useEffect(() => {
    if (size !== 'auto') {
      setResolvedSize(size as Exclude<FinancialSize, 'auto'>);
      return;
    }
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width || el.offsetWidth;
      if (!w) return;
      const fullStr = symbol + numStr;
      const chosen = pickTier(w, fullStr);
      setResolvedSize(chosen);
      if (chosen === '2xs' && fullStr.length > 14 && format === 'auto-compact') setUseCompact(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size, numStr, symbol, format]);

  const effectiveTier = size === 'auto' ? resolvedSize : (size as Exclude<FinancialSize, 'auto'>);
  const sizeClass = SIZE_CLASS[effectiveTier] || SIZE_CLASS['md'];
  let colorClass = '';
  if (colorize) {
    if (isZero) colorClass = 'text-slate-400';
    else if (isNegative) colorClass = 'text-rose-600';
    else colorClass = 'text-emerald-600';
  }
  const signPrefix = showSign && !isNegative && !isZero ? '+' : isNegative ? String.fromCharCode(8722) : '';

  return (
    <Tag ref={wrapperRef as any} className={cn(sizeClass, colorClass, 'inline-flex items-baseline gap-[0.1em] whitespace-nowrap', className)}>
      <span className="opacity-80" style={{ fontSize: '0.75em', fontWeight: 'inherit' }}>{signPrefix}{symbol}</span>
      <span>{numStr}</span>
    </Tag>
  );
};

export const FinancialAmountHero: React.FC<Omit<FinancialAmountProps, 'size'>> = (props) => (
  <FinancialAmount {...props} size="xl" />
);

export const FinancialAmountAuto: React.FC<Omit<FinancialAmountProps, 'size' | 'format'>> = (props) => (
  <FinancialAmount {...props} size="auto" format="auto-compact" />
);

export default FinancialAmount;
