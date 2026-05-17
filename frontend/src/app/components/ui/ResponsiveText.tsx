import React from 'react';

interface ResponsiveTextProps {
 children: React.ReactNode;
 className?: string;
 size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
 weight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
 align?: 'left' | 'center' | 'right' | 'justify';
 as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
}

export const ResponsiveText: React.FC<ResponsiveTextProps> = ({
 children,
 className = '',
 size = 'base',
 weight = 'normal',
 align = 'left',
 as = 'p'
}) => {
 const textClasses = [
 `responsive-text-${size}`,
 `font-${weight}`,
 `text-${align}`,
 className
 ].filter(Boolean).join(' ');

 const Tag = as;

 return (
 <Tag className={textClasses}>
 {children}
 </Tag>
 );
};

export default ResponsiveText;
