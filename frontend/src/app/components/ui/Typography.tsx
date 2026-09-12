import React from 'react';
import { cn } from '@/lib/utils';
import { FinancialAmount, type FinancialAmountProps } from './FinancialAmount';

export interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  as?: any;
}

/** Main h1 page title — uses global fluid clamp token (22–26px) */
export const PageTitle: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'h1',
  ...props
}) => (
  <Component
    className={cn('text-page-title text-slate-900 tracking-tight leading-tight truncate', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Section header inside a page or major content division (16–19px) */
export const SectionTitle: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'h2',
  ...props
}) => (
  <Component
    className={cn('text-section-title text-slate-900 tracking-tight font-bold', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Title of an individual card, widget, or list item (15px) */
export const CardTitle: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'h3',
  ...props
}) => (
  <Component
    className={cn('text-card-title text-slate-900 font-bold tracking-tight', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Standard body text (14px) */
export const BodyText: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'p',
  ...props
}) => (
  <Component
    className={cn('text-body text-slate-700 leading-relaxed font-normal', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Secondary, helper, or description text (13px) */
export const SecondaryText: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'p',
  ...props
}) => (
  <Component
    className={cn('text-body-sm text-slate-500 leading-normal font-medium', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Uppercase micro-label for categories, input headers, badges (11px) */
export const LabelText: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'span',
  ...props
}) => (
  <Component
    className={cn('text-label text-slate-400 font-black uppercase tracking-widest block', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Caption, timestamp, or metadata text (10px) */
export const CaptionText: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'span',
  ...props
}) => (
  <Component
    className={cn('text-caption text-slate-400 font-semibold tracking-wide', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Numeric metric values with tabular figures and negative tracking */
export const MetricValue: React.FC<TypographyProps> = ({
  children,
  className,
  as: Component = 'span',
  ...props
}) => (
  <Component
    className={cn('text-fin-md font-bold text-slate-900 tracking-tight tabular-nums', className)}
    {...props}
  >
    {children}
  </Component>
);

/** Standardized financial amount wrapper — auto-sizing, Indian formatting, colors */
export const CurrencyValue: React.FC<FinancialAmountProps> = (props) => (
  <FinancialAmount {...props} />
);

/** Reusable empty state box following Kanakku design guidelines */
export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 bg-white/60 dark:bg-slate-900/40 p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-2xs',
      className
    )}
  >
    <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3.5 shadow-2xs">
      {icon}
    </div>
    <h4 className="text-base font-bold text-slate-900 tracking-tight mb-1">{title}</h4>
    {description && (
      <p className="text-xs text-slate-500 font-medium max-w-xs leading-relaxed mb-4">
        {description}
      </p>
    )}
    {action && <div className="mt-1">{action}</div>}
  </div>
);
