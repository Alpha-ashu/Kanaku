import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOptionalApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { sidebarMenuItems, NavigationItem } from '@/app/constants/navigation';
import { canAccessPage, FeatureVisibility } from '@/lib/featureFlags';


export const useSharedMenu = () => {
  const app = useOptionalApp();
  const { role } = useAuth();
  const currentPage = app?.currentPage ?? 'dashboard';
  const setCurrentPage = app?.setCurrentPage ?? (() => { });
  const visibleFeatures = (app?.visibleFeatures ?? {}) as FeatureVisibility;
  const [orderedItems, setOrderedItems] = useState<NavigationItem[]>([]);

  const menuOrderKey = useMemo(() => `sidebar_menu_order_${role}`, [role]);

  // Filter menu items based on RBAC and user's feature visibility preferences
  const visibleMenuItems = useMemo(() => {

    return sidebarMenuItems.filter(item => {
      // 1. Role-based check (if item has roles defined)
      if (item.roles && item.roles.length > 0) {
        if (!item.roles.includes(role)) return false;
      }

      // Special case: Admin/Manager core panels are ALWAYS visible to their respective roles to prevent lockouts
      if (['admin', 'admin-feature-panel', 'admin-ai', 'ai-management', 'manager-advisor-verification', 'advisor-verification'].includes(item.id) && role === 'admin') return true;
      if (['advisor-verification', 'manager-advisor-verification'].includes(item.id) && role === 'manager') return true;

      return canAccessPage(item.id, visibleFeatures);
    });

  }, [role, visibleFeatures]);

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
