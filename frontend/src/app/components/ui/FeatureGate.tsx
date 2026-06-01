/**
 * FeatureGate — Declarative sub-feature access control component
 *
 * Usage:
 *   // Hide element when sub-feature is disabled (default)
 *   <FeatureGate module="accounts" feature="deleteAccount">
 *     <DeleteButton />
 *   </FeatureGate>
 *
 *   // Disable (greyed out) instead of hiding
 *   <FeatureGate module="accounts" feature="createAccount" mode="disable">
 *     <CreateButton />
 *   </FeatureGate>
 *
 *   // With custom fallback
 *   <FeatureGate module="reports" feature="pdfExport" fallback={<UpgradePrompt />}>
 *     <PdfExportButton />
 *   </FeatureGate>
 *
 *   // Module-level gate only (no child feature)
 *   <FeatureGate module="accounts">
 *     <AccountsPage />
 *   </FeatureGate>
 *
 * The gate reads directly from localStorage (admin_global_feature_settings) and
 * the current user role from AuthContext — zero prop-drilling required.
 */
import React, { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';

interface FeatureGateProps {
  /** Parent module key (e.g. 'accounts', 'reports') */
  module: string;
  /** Child feature key within the module (e.g. 'deleteAccount'). Omit for module-level gate. */
  feature?: string;
  /** Hide element (default) or render it disabled/greyed-out */
  mode?: 'hide' | 'disable';
  /** Rendered when the feature is disabled and mode === 'hide' */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  module: moduleKey,
  feature: childKey,
  mode = 'hide',
  fallback = null,
  children,
}) => {
  const { visibleFeatures, subFeatures } = useApp();

  const isEnabled = useMemo(() => {
    if (!childKey) {
      // Module-level gate: use visibleFeatures logic
      return (visibleFeatures as any)?.[moduleKey] !== false;
    }

    // Sub-feature gate: use subFeatures logic
    return subFeatures?.[moduleKey]?.[childKey] ?? true;
  }, [moduleKey, childKey, visibleFeatures, subFeatures]);

  if (!isEnabled) {
    if (mode === 'disable') {
      // Wrap children in a container that makes them visually disabled
      return (
        <div
          className="relative opacity-40 cursor-not-allowed pointer-events-none select-none"
          aria-disabled="true"
          title="This feature is currently disabled by your administrator"
        >
          {children}
        </div>
      );
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

/**
 * Hook version — returns whether a sub-feature is enabled for the current user.
 * Useful for conditional logic that doesn't involve JSX rendering.
 *
 * @example
 *   const canDelete = useFeatureGate('accounts', 'deleteAccount');
 *   if (!canDelete) return;
 *   await deleteAccount(id);
 */
export function useFeatureGate(moduleKey: string, childKey?: string): boolean {
  const { visibleFeatures, subFeatures } = useApp();

  return useMemo(() => {
    if (!childKey) {
      return (visibleFeatures as any)?.[moduleKey] !== false;
    }

    return subFeatures?.[moduleKey]?.[childKey] ?? true;
  }, [moduleKey, childKey, visibleFeatures, subFeatures]);
}

export default FeatureGate;
