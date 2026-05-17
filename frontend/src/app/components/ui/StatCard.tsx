/**
 * StatCard Component
 * Reusable card for displaying statistics
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Card } from './card';
import { cn } from '@/lib/utils';

interface StatCardProps {
 title: string;
 value: string | number;
 icon?: React.ReactNode;
 subtitle?: string;
 trend?: {
 value: number;
 isPositive: boolean;
 };
 variant?: 'default' | 'glass' | 'mesh-purple';
 delay?: number;
 className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
 title,
 value,
 icon,
 subtitle,
 trend,
 variant = 'glass',
 delay = 0,
 className,
}) => {
 return (
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4, delay }}
 >
 <Card
 variant={variant}
 className={cn(
 'p-6 relative overflow-hidden group hover:shadow-xl transition-all duration-300',
 className
 )}
 >
 <div className="relative z-10">
 {icon && (
 <div className={cn(
"w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-sm transition-colors",
 variant === 'mesh-purple' ? 'bg-white/20 backdrop-blur-md text-white' : 'bg-black text-white'
 )}>
 {icon}
 </div>
 )}
 <p className={cn(
"font-medium mb-1 text-sm uppercase tracking-wide",
 variant === 'mesh-purple' ? 'text-white/80' : 'text-gray-500'
 )}>
 {title}
 </p>
 <h3 className={cn(
"text-3xl font-display font-bold tracking-tight",
 variant === 'mesh-purple' ? 'text-white' : 'text-gray-900'
 )}>
 {value}
 </h3>
 {subtitle && (
 <p className={cn(
"text-sm mt-2",
 variant === 'mesh-purple' ? 'text-white/70' : 'text-gray-500'
 )}>
 {subtitle}
 </p>
 )}
 {trend && (
 <div className={cn(
"flex items-center gap-1 mt-2 text-sm font-medium",
 trend.isPositive ? 'text-green-500' : 'text-red-500'
 )}>
 <span>{trend.isPositive ? '' : ''}</span>
 <span>{Math.abs(trend.value)}%</span>
 </div>
 )}
 </div>
 {variant === 'mesh-purple' && (
 <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
 )}
 </Card>
 </motion.div>
 );
};
