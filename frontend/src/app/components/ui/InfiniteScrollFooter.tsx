import React from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InfiniteScrollFooterProps {
  hasMore: boolean;
  isLoadingMore: boolean;
  error?: string | null;
  onRetry?: () => void;
  sentinelRef?: (node: HTMLElement | null) => void;
  totalCount?: number;
  loadingText?: string;
  endOfListText?: string;
  className?: string;
  showEndOfList?: boolean;
}

export const InfiniteScrollFooter: React.FC<InfiniteScrollFooterProps> = ({
  hasMore,
  isLoadingMore,
  error,
  onRetry,
  sentinelRef,
  totalCount = 0,
  loadingText = 'Loading more...',
  endOfListText = "You've reached the end",
  className,
  showEndOfList = true,
}) => {
  return (
    <div className={cn('w-full py-4 flex flex-col items-center justify-center', className)}>
      {/* Invisible Sentinel Target for IntersectionObserver */}
      {sentinelRef && (
        <div
          ref={sentinelRef}
          className="h-1 w-full pointer-events-none opacity-0"
          aria-hidden="true"
        />
      )}

      {/* Loading More State */}
      {isLoadingMore && (
        <div
          className="flex items-center gap-2 py-2 px-4 rounded-full bg-slate-50 border border-slate-200/60 shadow-xs animate-in fade-in zoom-in-95 duration-150"
          data-testid="infinite-scroll-loading"
        >
          <Loader2 size={15} className="animate-spin text-indigo-600" />
          <span className="text-xs font-bold text-slate-600">{loadingText}</span>
        </div>
      )}

      {/* Error State with Retry Button */}
      {error && !isLoadingMore && (
        <div
          className="flex flex-col items-center gap-2 py-2 px-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 max-w-sm animate-in fade-in"
          data-testid="infinite-scroll-error"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <AlertCircle size={14} className="text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-extrabold uppercase tracking-wide transition-colors active:scale-95 shadow-xs"
              data-testid="infinite-scroll-retry-button"
            >
              <RefreshCw size={12} />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* End of List State */}
      {!hasMore && !isLoadingMore && !error && showEndOfList && totalCount > 0 && (
        <div
          className="flex items-center gap-3 w-full max-w-xs px-4 text-slate-400 py-1"
          data-testid="infinite-scroll-end-of-list"
        >
          <div className="h-px bg-slate-200/80 flex-1" />
          <span className="text-[11px] font-semibold tracking-tight text-slate-400 select-none">
            {endOfListText}
          </span>
          <div className="h-px bg-slate-200/80 flex-1" />
        </div>
      )}
    </div>
  );
};
