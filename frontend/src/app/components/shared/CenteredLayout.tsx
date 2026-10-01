import React, { useCallback } from 'react';
import { PullToRefresh } from '@/app/components/ui/PullToRefresh';
import { useOptionalApp } from '@/contexts/AppContext';
import { backendSyncService } from '@/lib/backend-sync-service';
import { cn } from '@/lib/utils';

/**
 * The one page frame every screen uses, for every role: full width up to
 * 1920px, the same side gutters and the same top spacing. Pages put their
 * content straight inside it — no extra max-width wrapper narrowing a page.
 * A full-bleed bar (sticky header, tab strip) lines its content up with the
 * page by using PAGE_GUTTERS inside it.
 */
export const PAGE_GUTTERS = 'max-w-[1920px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10';
export const PAGE_FRAME_WIDTH = `${PAGE_GUTTERS} flex flex-col flex-1`;
export const PAGE_FRAME_SPACING = 'pt-4 sm:pt-5 lg:pt-6 lg:pb-10';
export const PAGE_CONTAINER_CLASS = `${PAGE_FRAME_WIDTH} ${PAGE_FRAME_SPACING}`;

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
        PAGE_FRAME_WIDTH,
        maxWidth !== 'max-w-[1920px]' && maxWidth,
        fullHeight ? 'min-h-0 h-full overflow-hidden' : PAGE_FRAME_SPACING,
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

