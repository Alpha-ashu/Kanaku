import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOptionalApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { sidebarMenuItems, NavigationItem } from '@/app/constants/navigation';
import { canAccessPage } from '@/lib/featureFlags';


const MENU_ORDER_KEY = 'sidebar_menu_order';

export const useSharedMenu = () => {
  const app = useOptionalApp();
  const { role } = useAuth();
  const [orderedItems, setOrderedItems] = useState<NavigationItem[]>([]);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const currentPage = app?.currentPage ?? 'dashboard';
  const setCurrentPage = app?.setCurrentPage ?? (() => { });
  const visibleFeatures = app?.visibleFeatures ?? ({} as Record<string, boolean>);

  // Listen for admin feature updates to refresh menu
  useEffect(() => {
    const handleAdminUpdate = () => {
      console.log(' useSharedMenu: Admin feature update detected, refreshing menu');
      setUpdateTrigger(prev => prev + 1);
    };

    // BroadcastChannel for cross-tab sync
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel('feature_settings_channel');
      broadcastChannel.addEventListener('message', (event) => {
        if (event.data.type === 'FEATURE_UPDATE') {
          handleAdminUpdate();
        }
      });
    } catch {
      // BroadcastChannel not supported
    }

    window.addEventListener('adminFeatureUpdate', handleAdminUpdate);
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'admin_global_feature_settings') {
        handleAdminUpdate();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('adminFeatureUpdate', handleAdminUpdate);
      window.removeEventListener('storage', handleStorageChange);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  }, []);

  // Filter menu items based on RBAC and user's feature visibility preferences
  const visibleMenuItems = useMemo(() => {

    return sidebarMenuItems.filter(item => {
      // 1. Role-based check (if item has roles defined)
      if (item.roles && item.roles.length > 0) {
        if (!item.roles.includes(role)) return false;
      }

      // 2. Feature-based check (uses centralized mapping)
      // Special case: Admin items are ALWAYS visible to admins to prevent lockouts
      if (['admin-feature-panel', 'admin-ai', 'manager-advisor-verification'].includes(item.id) && role === 'admin') return true;

      return canAccessPage(item.id, visibleFeatures);
    });

  }, [role, visibleFeatures, updateTrigger]);

  // Load saved order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem(MENU_ORDER_KEY);
    if (savedOrder) {
      try {
        const orderIds: string[] = JSON.parse(savedOrder);
        // Reorder visible items based on saved order
        const reordered = [...visibleMenuItems].sort((a, b) => {
          const indexA = orderIds.indexOf(a.id);
          const indexB = orderIds.indexOf(b.id);
          // If item not in saved order, put it at the end
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
        setOrderedItems(reordered);
      } catch {
        setOrderedItems(visibleMenuItems);
      }
    } else {
      setOrderedItems(visibleMenuItems);
    }
  }, [visibleMenuItems]);

  // Save order to localStorage whenever it changes
  const handleReorder = useCallback((newOrder: NavigationItem[]) => {
    setOrderedItems(newOrder);
    const orderIds = newOrder.map(item => item.id);
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(orderIds));
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('menuOrderChanged', { detail: newOrder }));
  }, []);

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
