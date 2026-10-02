import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOptionalApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { sidebarMenuItems, NavigationItem } from '@/app/constants/navigation';
import { canAccessPage, FeatureVisibility } from '@/lib/featureFlags';


// Payments & Wallets is permission-based for managers: by design they hold no
// finance permission until an admin grants one, and the page was offered anyway
// with every tab answering 403. One fetch per session, shared by every caller.
const FINANCE_PERMISSIONS = ['finance.read', 'team.wallets.read', 'team.payments.read', 'security.read'];
let managerPermissions: Promise<string[] | null> | null = null;
const loadManagerPermissions = () => {
  managerPermissions ??= import('@/lib/backend-api')
    .then(({ backendService }) => backendService.api.get('/manager/permissions'))
    .then((res) => (Array.isArray(res.data?.data?.permissions) ? res.data.data.permissions as string[] : null))
    .catch(() => { managerPermissions = null; return null; });
  return managerPermissions;
};

export const useSharedMenu = () => {
  const app = useOptionalApp();
  const { role } = useAuth();
  const currentPage = app?.currentPage ?? 'dashboard';
  const setCurrentPage = app?.setCurrentPage ?? (() => { });
  const visibleFeatures = (app?.visibleFeatures ?? {}) as FeatureVisibility;
  const [orderedItems, setOrderedItems] = useState<NavigationItem[]>([]);
  // null = not known (yet, or the call failed): keep offering the page.
  const [financeAllowed, setFinanceAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (role !== 'manager') return undefined;
    let cancelled = false;
    void loadManagerPermissions().then((perms) => {
      if (!cancelled && perms) setFinanceAllowed(perms.some((p) => FINANCE_PERMISSIONS.includes(p)));
    });
    return () => { cancelled = true; };
  }, [role]);

  const menuOrderKey = useMemo(() => `sidebar_menu_order_${role}`, [role]);

  // Filter menu items based on RBAC and user's feature visibility preferences
  const visibleMenuItems = useMemo(() => {
    const aiCapabilities = app?.aiCapabilities;

    return sidebarMenuItems.filter(item => {
      // 1. Role-based check (if item has roles defined)
      if (item.roles && item.roles.length > 0) {
        if (!item.roles.includes(role)) return false;
      }

      // Special case: Admin/Manager core panels are ALWAYS visible to their respective roles to prevent lockouts
      if (['admin', 'admin-feature-panel', 'admin-ai', 'ai-management', 'manager-advisor-verification', 'advisor-verification', 'admin-finance'].includes(item.id) && role === 'admin') return true;
      if (item.id === 'admin-finance' && role === 'manager') return financeAllowed !== false;
      if (['advisor-verification', 'manager-advisor-verification', 'manager-team'].includes(item.id) && role === 'manager') return true;

      // Gate AI insights based on the aiAutomation system status
      if (item.id === 'ai-insights' && aiCapabilities?.aiAutomation?.enabled === false) {
        return false;
      }

      return canAccessPage(item.id, visibleFeatures);
    });

  }, [role, visibleFeatures, app?.aiCapabilities, financeAllowed]);

  // Load saved order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem(menuOrderKey);
    if (savedOrder) {
      try {
        const orderIds: string[] = JSON.parse(savedOrder);
        // Reorder visible items based on saved order
        const reordered = [...visibleMenuItems].sort((a, b) => {
          const indexA = orderIds.indexOf(a.id);
          const indexB = orderIds.indexOf(b.id);
          
          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
          }

          // Fallback to default index in sidebarMenuItems if either or both are not in savedOrder
          const defaultIndexA = sidebarMenuItems.findIndex(item => item.id === a.id);
          const defaultIndexB = sidebarMenuItems.findIndex(item => item.id === b.id);

          if (indexA === -1 && indexB === -1) {
            return defaultIndexA - defaultIndexB;
          }

          if (indexA === -1) {
            return defaultIndexA - defaultIndexB;
          }

          if (indexB === -1) {
            return defaultIndexA - defaultIndexB;
          }

          return 0;
        });
        setOrderedItems(reordered);
      } catch {
        setOrderedItems(visibleMenuItems);
      }
    } else {
      setOrderedItems(visibleMenuItems);
    }
  }, [visibleMenuItems, menuOrderKey]);

  // Save order to localStorage whenever it changes
  const handleReorder = useCallback((newOrder: NavigationItem[]) => {
    setOrderedItems(newOrder);
    const orderIds = newOrder.map(item => item.id);
    localStorage.setItem(menuOrderKey, JSON.stringify(orderIds));
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('menuOrderChanged', { detail: newOrder }));
  }, [menuOrderKey]);

  // Listen for order changes from other components
  useEffect(() => {
    const handleOrderChange = (event: CustomEvent<NavigationItem[]>) => {
      setOrderedItems(event.detail);
    };

    window.addEventListener('menuOrderChanged', handleOrderChange as EventListener);
    return () => {
      window.removeEventListener('menuOrderChanged', handleOrderChange as EventListener);
    };
  }, []);

  const handleNavigate = useCallback((id: string) => {
    setCurrentPage(id);
  }, [setCurrentPage]);

  return {
    orderedItems,
    handleReorder,
    handleNavigate,
    currentPage,
  };
};
