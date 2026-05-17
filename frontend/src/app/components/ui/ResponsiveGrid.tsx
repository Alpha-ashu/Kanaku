import React from 'react';

interface ResponsiveGridProps {
 children: React.ReactNode;
 className?: string;
 cols?: 1 | 2 | 3 | 4 | 'auto';
 gap?: 'sm' | 'md' | 'lg';
 minColWidth?: '200px' | '280px' | '320px' | '400px';
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
 children,
 className = '',
 cols = 'auto',
 gap = 'md',
 minColWidth = '280px'
}) => {
 const gridClasses = [
 'responsive-grid',
 className
 ].filter(Boolean).join(' ');

 const gridStyles: React.CSSProperties = {};

 // Override grid template columns if specified
 if (cols !== 'auto') {
 gridStyles.gridTemplateColumns = `repeat(${cols}, 1fr)`;
 }

 // Override min column width if specified
 if (minColWidth !== '280px') {
 gridStyles.gridTemplateColumns = `repeat(auto-fit, minmax(${minColWidth}, 1fr))`;
 }

 // Override gap if specified
 const gaps = {
 sm: '0.5rem',
 md: '1rem',
 lg: '2rem'
 };
 gridStyles.gap = gaps[gap];

 return (
 <div className={gridClasses} style={gridStyles}>
 {children}
 </div>
 );
};

export default ResponsiveGrid;
