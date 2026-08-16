import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePullToRefresh, UsePullToRefreshOptions } from '@/hooks/usePullToRefresh';

export interface PullToRefreshProps extends UsePullToRefreshOptions {
  children: React.ReactNode;
  className?: string;
  indicatorClassName?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  children,
  onRefresh,
  pullThreshold = 65,
  maxPullDistance = 85,
  resistance = 0.4,
  disabled = false,
  className,
  indicatorClassName,
}) => {
  const {
    containerRef,
    isPulling,
    pullDistance,
    isReady,
    isRefreshing,
  } = usePullToRefresh({
    onRefresh,
    pullThreshold,
    maxPullDistance,
    resistance,
    disabled,
  });

  const progress = Math.min(pullDistance / pullThreshold, 1);
  const showIndicator = isPulling || isRefreshing || pullDistance > 0;

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full overflow-visible', className)}
    >
      {/* Pull Indicator Badge */}
      <AnimatePresence>
        {showIndicator && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{
              opacity: 1,
              y: Math.max(pullDistance - 15, 10),
              scale: isReady ? 1.08 : Math.max(0.85, progress),
            }}
            exit={{ opacity: 0, y: -20, scale: 0.8 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
            className={cn(
              'absolute left-1/2 -translate-x-1/2 z-40 flex items-center justify-center shadow-lg rounded-full pointer-events-none transition-colors duration-200',
              isReady || isRefreshing
                ? 'bg-indigo-600 text-white shadow-indigo-200'
                : 'bg-white text-slate-700 border border-slate-200/80 shadow-slate-200',
              indicatorClassName
            )}
            style={{
              width: 40,
              height: 40,
              top: 0,
            }}
          >
            {isRefreshing ? (
              <RefreshCw
                size={18}
                className="animate-spin text-white"
              />
            ) : (
              <motion.div
                animate={{
                  rotate: isReady ? 180 : progress * 180,
                }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <ArrowDown size={18} />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content wrapper with slight transform on pull */}
      <div
        style={{
          transform: isPulling || isRefreshing ? `translateY(${Math.min(pullDistance * 0.4, 35)}px)` : 'none',
          transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};
