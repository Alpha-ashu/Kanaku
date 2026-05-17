import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { motion, HTMLMotionProps } from 'framer-motion';

const buttonVariants = cva(
 'inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none font-display tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
 {
 variants: {
 variant: {
 primary: 'bg-black text-white hover:bg-black/90 shadow-[0_4px_14px_0_rgba(0,0,0,0.39)]',
 secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
 outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
 ghost: 'hover:bg-accent hover:text-accent-foreground',
 glass: 'bg-white/10 backdrop-blur-lg border border-white/20 text-white hover:bg-white/20 shadow-glass',
 link: 'text-primary underline-offset-4 hover:underline',
 destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
 },
 size: {
 default: 'h-9 px-4 py-2',
 sm: 'h-8 rounded-md px-3 text-xs',
 md: 'h-10 rounded-xl px-8',
 lg: 'h-12 rounded-2xl px-10 text-base',
 icon: 'h-9 w-9 p-0',
 },
 rounded: {
 default:"rounded-xl",
 full:"rounded-full",
 none:"rounded-none"
 }
 },
 defaultVariants: {
 variant: 'primary',
 size: 'md',
 rounded: 'default'
 },
 }
);

export interface ButtonProps
 extends HTMLMotionProps<"button">,
 VariantProps<typeof buttonVariants> {
 isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
 ({ className, variant, size, rounded, isLoading, children, disabled, ...props }, ref) => {
 return (
 <motion.button
 ref={ref}
 whileTap={{ scale: 0.95 }}
 whileHover={{ scale: 1.02 }}
 transition={{ type:"spring", stiffness: 400, damping: 10 }}
 className={cn(buttonVariants({ variant, size, rounded, className }))}
 disabled={disabled || isLoading}
 {...props}
 >
 {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
 {children as any}
 </motion.button>
 );
 }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
