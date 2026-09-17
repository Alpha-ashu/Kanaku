import React, { useCallback } from 'react';
import { PullToRefresh } from '@/app/components/ui/PullToRefresh';
import { useOptionalApp } from '@/contexts/AppContext';
import { backendSyncService } from '@/lib/backend-sync-service';
import { cn } from '@/lib/utils';

export interface CenteredLayoutProps {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  containerClassName?: string;
  onRefresh?: () => Promise<any> | void;
  enablePullToRefresh?: boolean;
  noBottomPadding?: boolean;
  fullHeight?: boolean;
}

export const CenteredLayout: React.FC<CenteredLayoutProps> = ({ 
  children, 
  maxWidth = 'max-w-[1920px]',
  className,
  containerClassName,
  onRefresh,
  enablePullToRefresh = true,
  noBottomPadding = false,
  fullHeight = false,
}) => {
  const app = useOptionalApp();

  const handleDefaultRefresh = useCallback(async () => {
    try {
      if (onRefresh) {
        await Promise.resolve(onRefresh());
        return;
      }
      // Default global refresh: sync with backend and trigger local refresh
      await backendSyncService.syncWithBackend();
      if (app?.refreshData) {
        app.refreshData();
      }
    } catch (err) {
      console.error('[CenteredLayout] Refresh error:', err);
    }
  }, [onRefresh, app]);

  const content = (
    <div
      className={cn(
        maxWidth,
        'w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 flex flex-col flex-1',
        fullHeight ? 'min-h-0 h-full overflow-hidden' : 'pt-4 sm:pt-5 lg:pt-6 lg:pb-10',
        className
      )}
      style={noBottomPadding || fullHeight ? undefined : { paddingBottom: 'calc(var(--bottom-reserved-space) + 8px)' }}
    >
      {children}
    </div>
  );

  return (
    <div
      className={cn(
        'w-full bg-transparent flex flex-col justify-start items-center',
        fullHeight ? 'h-full min-h-0 max-h-full overflow-hidden' : 'min-h-screen overflow-x-hidden',
        containerClassName
      )}
    >
      {enablePullToRefresh ? (
        <PullToRefresh onRefresh={handleDefaultRefresh} className="flex-1 flex flex-col w-full">
          {content}
        </PullToRefresh>
      ) : (
        content
      )}
    </div>
  );
};

