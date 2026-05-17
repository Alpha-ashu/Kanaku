import React from 'react';

interface ResponsiveContainerProps {
 children: React.ReactNode;
 className?: string;
 maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
 padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
 children,
 className = '',
 maxWidth = '2xl',
 padding = 'md'
}) => {
 const containerClasses = [
 'responsive-container',
 className
 ].filter(Boolean).join(' ');

 const containerStyles: React.CSSProperties = {};

 // Override max width if specified
 if (maxWidth !== '2xl') {
 const maxWidths = {
 sm: '640px',
 md: '768px',
 lg: '1024px',
 xl: '1280px',
 full: '100%'
 };
 containerStyles.maxWidth = maxWidths[maxWidth];
 }

 // Override padding if specified
 if (padding !== 'md') {
 const paddings = {
 none: '0',
 sm: '0.75rem',
 md: '1.5rem',
 lg: '2rem',
 xl: '3rem'
 };
 containerStyles.paddingLeft = paddings[padding];
 containerStyles.paddingRight = paddings[padding];
 }

 return (
 <div className={containerClasses} style={containerStyles}>
 {children}
 </div>
 );
};

export default ResponsiveContainer;
