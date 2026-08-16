import React, { useCallback } from 'react';
import { PullToRefresh } from '@/app/components/ui/PullToRefresh';
import { useOptionalApp } from '@/contexts/AppContext';
import { backendSyncService } from '@/lib/backend-sync-service';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  showHeader?: boolean;
  showBottomNav?: boolean;
  className?: string;
  onRefresh?: () => Promise<any> | void;
  enablePullToRefresh?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title,
  showHeader = true,
  showBottomNav = true,
  className = '',
  onRefresh,
  enablePullToRefresh = true,
}) => {
  const app = useOptionalApp();

  const handleDefaultRefresh = useCallback(async () => {
    try {
      if (onRefresh) {
        await Promise.resolve(onRefresh());
        return;
      }
      await backendSyncService.syncWithBackend();
      if (app?.refreshData) {
        app.refreshData();
      }
    } catch (err) {
      console.error('[AppLayout] Refresh error:', err);
    }
  }, [onRefresh, app]);

  return (
    <div className="w-full min-h-screen flex flex-col overflow-x-hidden bg-white">
      {/* Header/Navbar - Only show if enabled */}
      {showHeader && (
        <header className="flex-shrink-0 bg-white border-b border-gray-200">
          <div className="px-4 py-4">
            {title && (
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            )}
          </div>
        </header>
      )}

      {/* Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto pb-24">
        {enablePullToRefresh ? (
          <PullToRefresh onRefresh={handleDefaultRefresh} className={className}>
            {children}
          </PullToRefresh>
        ) : (
          <div className={className}>{children}</div>
        )}
      </main>

      {/* Bottom Navigation - Only show if enabled */}
      {showBottomNav && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
          {/* BottomNav component will be rendered here */}
        </div>
      )}
    </div>
  );
};

// Section wrapper for consistent spacing
export const AppSection: React.FC<{
 children: React.ReactNode;
 className?: string;
}> = ({ children, className = '' }) => {
 return (
 <section className={`px-4 pt-6 space-y-6 ${className}`}>
 {children}
 </section>
 );
};

// Unified card component
export const AppCard: React.FC<{
 children: React.ReactNode;
 className?: string;
}> = ({ children, className = '' }) => {
 return (
 <div 
   className={`w-full rounded-[16px] bg-white ${className}`}
   style={{ 
     boxShadow: '0px 1px 2px rgba(0,0,0,0.04), 0px 4px 12px rgba(0,0,0,0.06)',
     border: '1px solid rgba(0,0,0,0.04)'
   }}
 >
 {children}
 </div>
 );
};

// Content wrapper for pages
export const PageContent: React.FC<{
 children: React.ReactNode;
 className?: string;
}> = ({ children, className = '' }) => {
 return (
 <div className={`space-y-6 ${className}`}>
 {children}
 </div>
 );
};
