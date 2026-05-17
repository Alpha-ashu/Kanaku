import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
 variant?: 'rectangular' | 'circular' | 'text';
 width?: string | number;
 height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
 className,
 variant = 'rectangular',
 width,
 height,
 ...props
}) => {
 return (
 <div
 className={cn(
"bg-gray-200/50 backdrop-blur-sm animate-pulse",
 {
 'rounded-2xl': variant === 'rectangular',
 'rounded-full': variant === 'circular',
 'rounded-md h-4': variant === 'text',
 },
 className
 )}
 style={{ width, height }}
 {...props}
 />
 );
};

export const DashboardSkeleton = () => {
 return (
 <div className="p-6 lg:p-10 max-w-[1600px] mx-auto space-y-8">
 {/* Header Skeleton */}
 <div className="flex justify-between items-center mb-8">
 <div className="space-y-2">
 <Skeleton variant="text" width={200} height={32} />
 <Skeleton variant="text" width={100} />
 </div>
 <div className="flex gap-4">
 <Skeleton variant="circular" width={48} height={48} />
 <Skeleton variant="circular" width={48} height={48} />
 </div>
 </div>

 <div className="grid grid-cols-12 gap-8">
 <div className="col-span-12 lg:col-span-8 space-y-8">
 {/* Cards Carousel Skeleton */}
 <div className="flex gap-6 overflow-hidden">
 <Skeleton width={340} height={200} className="shrink-0" />
 <Skeleton width={340} height={200} className="shrink-0" />
 <Skeleton width={340} height={200} className="shrink-0" />
 </div>

 {/* Stats Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
 <Skeleton height={200} />
 <Skeleton height={200} />
 </div>

 {/* Chart Skeleton */}
 <Skeleton height={300} />
 </div>

 <div className="col-span-12 lg:col-span-4 space-y-8">
 <Skeleton height={600} />
 <Skeleton height={200} />
 </div>
 </div>
 </div>
 );
};
