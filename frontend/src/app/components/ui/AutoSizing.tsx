import React, { ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// ─── Viewport Hook (JS-level responsive info) ───────────────────────────────
type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ViewportInfo {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isMobile: boolean;   // < 768px
  isTablet: boolean;   // 768–1024px
  isDesktop: boolean;  // > 1024px
  isCompact: boolean;  // < 480px
}

export const useViewport = (): ViewportInfo => {
  const getInfo = (): ViewportInfo => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bp: Breakpoint =
      w < 480  ? 'xs' :
      w < 640  ? 'sm' :
      w < 768  ? 'md' :
      w < 1024 ? 'lg' :
      w < 1280 ? 'xl' : '2xl';
    return {
      width: w,
      height: h,
      breakpoint: bp,
      isMobile: w < 768,
      isTablet: w >= 768 && w < 1024,
      isDesktop: w >= 1024,
      isCompact: w < 480,
    };
  };

  const [info, setInfo] = useState<ViewportInfo>(getInfo);

  useEffect(() => {
    let rafId: number;
    const handler = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setInfo(getInfo()));
    };
    window.addEventListener('resize', handler, { passive: true });
    return () => {
      window.removeEventListener('resize', handler);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return info;
};

// ─── PageShell ────────────────────────────────────────────────────────────────
interface PageShellProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}
export const PageShell: React.FC<PageShellProps> = ({
  children,
  className = '',
  scrollable = true,
}) => (
  <div className={cn('page-shell', className)}>
    <div className={cn(scrollable ? 'page-content-area' : 'flex-1 overflow-hidden')}>
      {children}
    </div>
  </div>
);

// ─── AutoContainer ────────────────────────────────────────────────────────────
interface AutoContainerProps {
  children: ReactNode;
  className?: string;
  size?: 'compact' | 'normal' | 'spacious';
}
export const AutoContainer: React.FC<AutoContainerProps> = ({
  children,
  className = '',
  size = 'normal',
}) => {
  const sizeClasses = {
    compact: 'fluid-section',
    normal: 'fluid-container',
    spacious: 'fluid-section',
  };
  return (
    <div className={cn(sizeClasses[size], className)}>
      {children}
    </div>
  );
};

// ─── AutoGrid ────────────────────────────────────────────────────────────────
interface AutoGridProps {
  children: ReactNode;
  className?: string;
  density?: 'compact' | 'normal' | 'spacious' | 'stats';
  columns?: 1 | 2 | 3 | 4 | 'auto';
}
export const AutoGrid: React.FC<AutoGridProps> = ({
  children,
  className = '',
  density = 'normal',
  columns = 'auto',
}) => {
  const densityClasses = {
    compact: 'auto-grid-compact',
    normal: 'auto-grid',
    spacious: 'auto-grid-spacious',
    stats: 'auto-grid-stats',
  };
  const columnClasses: Record<1 | 2 | 3 | 4 | 'auto', string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    auto: '',
  };
  return (
    <div
      className={cn(
        densityClasses[density],
        columns !== 'auto' && columnClasses[columns],
        className,
      )}
    >
      {children}
    </div>
  );
};

// ─── AutoCard ─────────────────────────────────────────────────────────────────
interface AutoCardProps {
  children: ReactNode;
  className?: string;
  size?: 'compact' | 'normal' | 'spacious';
  height?: 'min' | 'medium' | 'large' | 'full';
  aspect?: 'square' | 'video' | 'photo';
  onClick?: () => void;
}
export const AutoCard: React.FC<AutoCardProps> = ({
  children,
  className = '',
  size = 'normal',
  height,
  aspect,
  onClick,
}) => {
  const sizeClasses = {
    compact: 'auto-card-compact',
    normal: 'auto-card',
    spacious: 'auto-card-spacious',
  };
  const heightClasses = {
    min: 'auto-height-min',
    medium: 'auto-height-medium',
    large: 'auto-height-large',
    full: 'auto-height-full',
  };
  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    photo: 'aspect-photo',
  };
  return (
    <div
      className={cn(
        sizeClasses[size],
        height && heightClasses[height],
        aspect && aspectClasses[aspect],
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

// ─── AutoText ─────────────────────────────────────────────────────────────────
interface AutoTextProps {
  children: ReactNode;
  className?: string;
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'div';
}
export const AutoText: React.FC<AutoTextProps> = ({
  children,
  className = '',
  size = 'base',
  as = 'p',
}) => {
  const sizeClasses: Record<string, string> = {
    xs: 'auto-text-xs',
    sm: 'auto-text-sm',
    base: 'auto-text-base',
    lg: 'auto-text-lg',
    xl: 'auto-text-xl',
    '2xl': 'auto-text-2xl',
    '3xl': 'auto-text-3xl',
  };
  const Tag = as as keyof JSX.IntrinsicElements;
  return (
    <Tag className={cn(sizeClasses[size], className)}>
      {children}
    </Tag>
  );
};

// ─── AutoButton ───────────────────────────────────────────────────────────────
interface AutoButtonProps {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'normal' | 'lg';
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}
export const AutoButton: React.FC<AutoButtonProps> = ({
  children,
  className = '',
  size = 'normal',
  variant = 'primary',
  onClick,
  disabled,
  type = 'button',
}) => {
  const sizeClasses = { sm: 'auto-btn-sm', normal: 'auto-btn', lg: 'auto-btn-lg' };
  const variantClasses = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    outline:   'border border-gray-300 text-gray-700 hover:bg-gray-50',
    ghost:     'text-gray-600 hover:bg-gray-100',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        sizeClasses[size],
        variantClasses[variant],
        'transition-all duration-200 font-semibold',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

// ─── AutoIcon ─────────────────────────────────────────────────────────────────
interface AutoIconProps {
  icon: React.ReactNode;
  className?: string;
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
}
export const AutoIcon: React.FC<AutoIconProps> = ({
  icon,
  className = '',
  size = 'base',
}) => {
  const sizeClasses = {
    xs: 'auto-icon-xs',
    sm: 'auto-icon-sm',
    base: 'auto-icon-base',
    lg: 'auto-icon-lg',
    xl: 'auto-icon-xl',
  };
  return (
    <div className={cn(sizeClasses[size], 'flex-shrink-0', className)}>
      {icon}
    </div>
  );
};

// ─── AutoFlex ─────────────────────────────────────────────────────────────────
interface AutoFlexProps {
  children: ReactNode;
  className?: string;
  direction?: 'row' | 'column';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  gap?: '1' | '2' | '3' | '4' | '6';
  wrap?: boolean;
}
export const AutoFlex: React.FC<AutoFlexProps> = ({
  children,
  className = '',
  direction = 'row',
  align = 'start',
  justify = 'start',
  gap = '3',
  wrap = false,
}) => {
  const alignClasses  = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' };
  const justifyClasses = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between', around: 'justify-around' };
  const gapClasses    = { '1': 'auto-gap-1', '2': 'auto-gap-2', '3': 'auto-gap-3', '4': 'auto-gap-4', '6': 'auto-gap-6' };
  const baseClass =
    direction === 'column' ? 'auto-flex-column' :
    align === 'center' && justify === 'between' ? 'auto-flex-between' :
    align === 'center' ? 'auto-flex-center' : 'auto-flex';

  return (
    <div
      className={cn(
        baseClass,
        alignClasses[align],
        justifyClasses[justify],
        gapClasses[gap],
        wrap && 'flex-wrap',
        className,
      )}
    >
      {children}
    </div>
  );
};

// ─── AutoChart ────────────────────────────────────────────────────────────────
interface AutoChartProps {
  children: ReactNode;
  className?: string;
  size?: 'small' | 'normal' | 'large';
}
export const AutoChart: React.FC<AutoChartProps> = ({
  children,
  className = '',
  size = 'normal',
}) => {
  const sizeClasses = { small: 'auto-chart-small', normal: 'auto-chart', large: 'auto-chart-large' };
  return (
    <div className={cn(sizeClasses[size], 'w-full', className)}>
      {children}
    </div>
  );
};

// ─── Responsive helper hook ───────────────────────────────────────────────────
export const useAutoSizing = () => {
  const getResponsiveClass = (type: string, size: string) => {
    const classes: Record<string, Record<string, string>> = {
      text:   { xs: 'auto-text-xs', sm: 'auto-text-sm', base: 'auto-text-base', lg: 'auto-text-lg', xl: 'auto-text-xl', '2xl': 'auto-text-2xl', '3xl': 'auto-text-3xl' },
      icon:   { xs: 'auto-icon-xs', sm: 'auto-icon-sm', base: 'auto-icon-base', lg: 'auto-icon-lg', xl: 'auto-icon-xl' },
      button: { sm: 'auto-btn-sm', normal: 'auto-btn', lg: 'auto-btn-lg' },
      card:   { compact: 'auto-card-compact', normal: 'auto-card', spacious: 'auto-card-spacious' },
    };
    return classes[type]?.[size] || '';
  };
  return { getResponsiveClass };
};
