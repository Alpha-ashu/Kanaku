import * as React from 'react';
import { cn } from '@/lib/utils';
import { motion, HTMLMotionProps } from 'framer-motion';

interface CardProps extends HTMLMotionProps<"div"> {
 variant?: 'default' | 'glass' | 'mesh-pink' | 'mesh-green' | 'mesh-purple' | 'mesh-red' | 'flat';
 noPadding?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
 ({ className, variant = 'default', noPadding = false, children, ...props }, ref) => {
 const variants = {
 default: 'bg-white/70 backdrop-blur-md border border-white/40 shadow-sm',
 glass: 'bg-white/40 backdrop-blur-xl border border-white/20 shadow-xl shadow-black/5',
 'mesh-pink': 'bg-mesh-pink text-white shadow-colored-pink border-none',
 'mesh-green': 'bg-mesh-green text-white shadow-colored-green border-none',
 'mesh-purple': 'bg-mesh-purple text-white shadow-colored-purple border-none',
 'mesh-red': 'bg-mesh-red text-white shadow-colored-red border-none',
 flat: 'bg-transparent border-none shadow-none',
 };

 return (
 <motion.div
 ref={ref}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.3, ease: 'easeOut' }}
 className={cn(
 'rounded-[30px] overflow-hidden relative',
 variants[variant],
 !noPadding && 'p-6',
 className
 )}
 {...props}
 >
 {children}
 </motion.div>
 );
 }
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
 HTMLDivElement,
 React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
 <div
 ref={ref}
 className={cn('flex flex-col space-y-1.5 p-6', className)}
 {...props}
 />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
 HTMLParagraphElement,
 React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
 <h3
 ref={ref}
 className={cn(
 'text-2xl font-semibold leading-none tracking-tight',
 className
 )}
 {...props}
 />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
 HTMLParagraphElement,
 React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
 <p
 ref={ref}
 className={cn('text-sm text-text-secondary', className)}
 {...props}
 />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
 HTMLDivElement,
 React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
 <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
 HTMLDivElement,
 React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
 <div
 ref={ref}
 className={cn('flex items-center p-6 pt-0', className)}
 {...props}
 />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
