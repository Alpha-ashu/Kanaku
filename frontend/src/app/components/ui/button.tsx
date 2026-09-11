import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { motion, HTMLMotionProps } from 'framer-motion';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none font-display tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary: 'bg-slate-950 text-white hover:bg-slate-800 shadow-sm active:bg-slate-900',
        secondary: 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 shadow-2xs',
        outline: 'border border-slate-200 bg-white shadow-2xs hover:bg-slate-50 hover:text-slate-900',
        ghost: 'hover:bg-slate-100/80 hover:text-slate-900 text-slate-600',
        glass: 'bg-white/80 backdrop-blur-xl border border-white/60 text-slate-800 hover:bg-white shadow-sm',
        link: 'text-blue-600 underline-offset-4 hover:underline',
        destructive: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
      },
      size: {
        default: 'h-9 px-3.5 sm:px-4 py-2 text-xs sm:text-sm',
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 sm:h-10 md:h-11 px-3.5 sm:px-5 md:px-6 text-xs sm:text-sm font-bold',
        lg: 'h-11 sm:h-12 px-5 sm:px-8 text-sm sm:text-base font-bold',
        icon: 'h-9 w-9 sm:h-10 sm:w-10 p-0',
      },
      rounded: {
        default: 'rounded-full',
        full: 'rounded-full',
        none: 'rounded-none',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      rounded: 'default',
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
