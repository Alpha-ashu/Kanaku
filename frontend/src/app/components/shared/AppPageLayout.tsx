/**
 * AppPageLayout
 * Standard page wrapper for all Kanakku feature pages.
 *
 * Provides:
 *   - Consistent outer structure (app-page class)
 *   - Safe-area aware top padding via mobile-main
 *   - Standard horizontal gutters via app-page-body
 *   - Embedded PageHeader with standardised styling
 *   - Bottom nav clearance via mobile-safe-bottom
 *
 * Usage:
 *   <AppPageLayout title="Accounts" subtitle="Manage your accounts" showBack>
 *     {content}
 *   </AppPageLayout>
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/app/components/ui/PageHeader';

export interface AppPageLayoutProps {
  /** Main page title — rendered as h1 */
  title: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Show a back button. Default: true on non-dashboard pages (PageHeader default). */
  showBack?: boolean;
  /** Page to navigate back to (default: 'dashboard') */
  backTo?: string;
  /** Custom back handler */
  onBack?: () => void;
  /** Page icon shown before the title */
  icon?: React.ReactNode;
  /** Content for the right side of the header (actions, filters, etc.) */
  headerActions?: React.ReactNode;
  /** Page body content */
  children: React.ReactNode;
  /** Extra classes on the outer wrapper */
  className?: string;
  /** Extra classes on the content body area */
  bodyClassName?: string;
  /** If true, the body area won't get the default bottom padding */
  noBottomPad?: boolean;
  /** data-testid on the outer wrapper */
  testId?: string;
}

export const AppPageLayout: React.FC<AppPageLayoutProps> = ({
  title,
  subtitle,
  showBack,
  backTo,
  onBack,
  icon,
  headerActions,
  children,
  className,
  bodyClassName,
  noBottomPad = false,
  testId,
}) => {
  return (
    <div
      className={cn('app-page page-view', className)}
      data-testid={testId}
    >
      {/* Content area: top padding accounts for the fixed floating header */}
      <div className={cn(
        'app-page-body mobile-main',
        !noBottomPad && 'mobile-safe-bottom',
        bodyClassName
      )}>
        {/* Standard page header */}
        <PageHeader
          title={title}
          subtitle={subtitle}
          showBack={showBack}
          backTo={backTo}
          onBack={onBack}
          icon={icon}
        >
          {headerActions}
        </PageHeader>

        {/* Page body content */}
        {children}
      </div>
    </div>
  );
};

export default AppPageLayout;
