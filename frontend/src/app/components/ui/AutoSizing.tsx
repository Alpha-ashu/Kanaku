import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AutoContainerProps {
 children: ReactNode;
 className?: string;
 size?: 'compact' | 'normal' | 'spacious';
}

export const AutoContainer: React.FC<AutoContainerProps> = ({ 
 children, 
 className = '', 
 size = 'normal'
}) => {
 const sizeClasses = {
 compact: 'fluid-section',
 normal: 'fluid-container',
 spacious: 'fluid-section'
 };

 return (
 <div className={cn(sizeClasses[size], className)}>
 {children}
 </div>
 );
};

interface AutoGridProps {
 children: ReactNode;
 className?: string;
 density?: 'compact' | 'normal' | 'spacious';
 columns?: 1 | 2 | 3 | 4 | 'auto';
}

export const AutoGrid: React.FC<AutoGridProps> = ({ 
 children, 
 className = '', 
 density = 'normal',
 columns = 'auto'
}) => {
 const densityClasses = {
 compact: 'auto-grid-compact',
 normal: 'auto-grid',
 spacious: 'auto-grid-spacious'
 };

 const columnClasses = {
 1: 'grid-cols-1',
 2: 'grid-cols-1 sm:grid-cols-2',
 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
 4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
 auto: ''
 };

 return (
 <div className={cn(
 densityClasses[density], 
 columns !== 'auto' && columnClasses[columns],
 className
 )}>
 {children}
 </div>
 );
};

interface AutoCardProps {
 children: ReactNode;
 className?: string;
 size?: 'compact' | 'normal' | 'spacious';
 height?: 'min' | 'medium' | 'large' | 'full';
 aspect?: 'square' | 'video' | 'photo';
 variant?: string;
 onClick?: () => void;
}

export const AutoCard: React.FC<AutoCardProps> = ({ 
 children, 
 className = '', 
 size = 'normal',
 height,
 aspect,
 variant,
 onClick
}) => {
 const sizeClasses = {
 compact: 'auto-card-compact',
 normal: 'auto-card',
 spacious: 'auto-card-spacious'
 };

 const heightClasses = {
 min: 'auto-height-min',
 medium: 'auto-height-medium',
 large: 'auto-height-large',
 full: 'auto-height-full'
 };

 const aspectClasses = {
 square: 'aspect-square',
 video: 'aspect-video',
 photo: 'aspect-photo'
 };

 return (
 <div 
 className={cn(
 sizeClasses[size],
 height && heightClasses[height],
 aspect && aspectClasses[aspect],
 className
 )}
 onClick={onClick}
 >
 {children}
 </div>
 );
};

interface AutoTextProps {
 children: ReactNode;
 className?: string;
 size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
 as?: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span';
}

export const AutoText: React.FC<AutoTextProps> = ({ 
 children, 
 className = '', 
 size = 'base',
 as = 'p'
}) => {
 const sizeClasses = {
 xs: 'auto-text-xs',
 sm: 'auto-text-sm',
 base: 'auto-text-base',
 lg: 'auto-text-lg',
 xl: 'auto-text-xl',
 '2xl': 'auto-text-2xl',
 '3xl': 'auto-text-3xl'
 };

 const Tag = as;

 return (
 <Tag className={cn(sizeClasses[size], className)}>
 {children}
 </Tag>
 );
};

interface AutoButtonProps {
 children: ReactNode;
 className?: string;
 size?: 'sm' | 'normal' | 'lg';
 variant?: 'primary' | 'secondary' | 'outline';
 onClick?: () => void;
}

export const AutoButton: React.FC<AutoButtonProps> = ({ 
 children, 
 className = '', 
 size = 'normal',
 variant = 'primary',
 onClick
}) => {
 const sizeClasses = {
 sm: 'auto-btn-sm',
 normal: 'auto-btn',
 lg: 'auto-btn-lg'
 };

 const variantClasses = {
 primary: 'bg-blue-600 text-white hover:bg-blue-700',
 secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
 outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
 };

 return (
 <button 
 className={cn(
 sizeClasses[size],
 variantClasses[variant],
 'transition-colors duration-200 font-medium',
 className
 )}
 onClick={onClick}
 >
 {children}
 </button>
 );
};

interface AutoIconProps {
 icon: React.ReactNode;
 className?: string;
 size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
}

export const AutoIcon: React.FC<AutoIconProps> = ({ 
 icon, 
 className = '', 
 size = 'base'
}) => {
 const sizeClasses = {
 xs: 'auto-icon-xs',
 sm: 'auto-icon-sm',
 base: 'auto-icon-base',
 lg: 'auto-icon-lg',
 xl: 'auto-icon-xl'
 };

 return (
 <div className={cn(sizeClasses[size], 'flex-shrink-0', className)}>
 {icon}
 </div>
 );
};

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
 wrap = false
}) => {
 const directionClasses = {
 row: 'auto-flex',
 column: 'auto-flex-column'
 };

 const alignClasses = {
 start: 'items-start',
 center: 'items-center',
 end: 'items-end',
 stretch: 'items-stretch'
 };

 const justifyClasses = {
 start: 'justify-start',
 center: 'justify-center',
 end: 'justify-end',
 between: 'justify-between',
 around: 'justify-around'
 };

 const gapClasses = {
 '1': 'auto-gap-1',
 '2': 'auto-gap-2',
 '3': 'auto-gap-3',
 '4': 'auto-gap-4',
 '6': 'auto-gap-6'
 };

 const baseClass = direction === 'row' && align === 'center' ? 'auto-flex-center' : 
 direction === 'column' ? 'auto-flex-column' : 'auto-flex';

 return (
 <div className={cn(
 baseClass,
 alignClasses[align],
 justifyClasses[justify],
 gapClasses[gap],
 wrap && 'flex-wrap',
 className
 )}>
 {children}
 </div>
 );
};

interface AutoChartProps {
 children: ReactNode;
 className?: string;
 size?: 'small' | 'normal' | 'large';
}

export const AutoChart: React.FC<AutoChartProps> = ({ 
 children, 
 className = '', 
 size = 'normal'
}) => {
 const sizeClasses = {
 small: 'auto-chart-small',
 normal: 'auto-chart',
 large: 'auto-chart-large'
 };

 return (
 <div className={cn(sizeClasses[size], 'w-full', className)}>
 {children}
 </div>
 );
};

// Helper hook for responsive sizing
export const useAutoSizing = () => {
 const getResponsiveClass = (type: string, size: string) => {
 const classes = {
 text: {
 xs: 'auto-text-xs',
 sm: 'auto-text-sm',
 base: 'auto-text-base',
 lg: 'auto-text-lg',
 xl: 'auto-text-xl',
 '2xl': 'auto-text-2xl',
 '3xl': 'auto-text-3xl'
 },
 icon: {
 xs: 'auto-icon-xs',
 sm: 'auto-icon-sm',
 base: 'auto-icon-base',
 lg: 'auto-icon-lg',
 xl: 'auto-icon-xl'
 },
 button: {
 sm: 'auto-btn-sm',
 normal: 'auto-btn',
 lg: 'auto-btn-lg'
 },
 card: {
 compact: 'auto-card-compact',
 normal: 'auto-card',
 spacious: 'auto-card-spacious'
 }
 };

 return classes[type]?.[size] || '';
 };

 return { getResponsiveClass };
};
