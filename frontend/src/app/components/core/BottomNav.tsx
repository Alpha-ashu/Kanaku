import React from 'react';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  TrendingUp,
  Plus,
  ShieldCheck,
  Brain,
  Shield,
  Target,
  BarChart3,
  ToggleRight,
  Contact,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { canAccessPage } from '@/lib/featureFlags';

interface NavigationItem {
  id: string;
  label: string;
  icon: any;
  isAction?: boolean;
}

const getNavigationItems = (role: string): NavigationItem[] => {
  switch (role) {
    case 'admin':
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'admin-feature-panel', label: 'Feature Panel', icon: ToggleRight },
        { id: 'advisor-verification', label: 'Verification', icon: ShieldCheck },
        { id: 'quick-add', label: '', icon: Plus, isAction: true },
        { id: 'ai-management', label: 'AI Manage', icon: Brain },
        { id: 'admin', label: 'Admin Console', icon: Shield },
      ];
    case 'manager':
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'quick-add', label: '', icon: Plus, isAction: true },
        { id: 'advisor-verification', label: 'Verification', icon: ShieldCheck },
      ];
    case 'advisor':
      return [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'accounts', label: 'Accounts', icon: Wallet },
        { id: 'transactions', label: 'Activity', icon: Receipt },
        { id: 'quick-add', label: '', icon: Plus, isAction: true },
        { id: 'client-management', label: 'Clients', icon: Contact },
        { id: 'investments', label: 'Invest', icon: TrendingUp },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ];
    case 'user':
    default:
      return [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'accounts', label: 'Accounts', icon: Wallet },
        { id: 'transactions', label: 'Activity', icon: Receipt },
        { id: 'quick-add', label: '', icon: Plus, isAction: true },
        { id: 'goals', label: 'Goals', icon: Target },
        { id: 'investments', label: 'Invest', icon: TrendingUp },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ];
  }
};

interface BottomNavProps {
  onQuickAdd: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onQuickAdd }) => {
  const { currentPage, setCurrentPage, visibleFeatures } = useApp();
  const { role } = useAuth();

  const filteredNavigationItems = React.useMemo(() => {
    const items = getNavigationItems(role);
    return items.filter(item => {
      if (item.id === 'quick-add') return true;
      return canAccessPage(item.id, visibleFeatures);
    });
  }, [role, visibleFeatures]);

  const handleNavigation = (itemId: string) => {
    // Non-blocking haptic feedback — never await native bridge on UI path
    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }

    if (itemId === 'quick-add') {
      onQuickAdd();
    } else {
      setCurrentPage(itemId);
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* The pill floats above the safe-area zone */}
      <div className="mx-2 sm:mx-4 mb-2 sm:mb-3 bg-white/95 backdrop-blur-xl border border-blue-100/80 rounded-2xl shadow-2xl shadow-blue-950/10 pointer-events-auto flex items-center justify-between px-1.5 sm:px-2 h-16 relative overflow-visible">
        {filteredNavigationItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isAction = item.isAction;

          if (isAction) {
            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigation(item.id);
                }}
                className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 active:from-blue-700 active:to-indigo-700 text-white rounded-full shadow-xl shadow-blue-500/35 active:scale-90 transition-transform shrink-0 mx-1 z-30 focus:outline-none -mt-3 border-2 border-white cursor-pointer"
                title="Quick Add"
                aria-label="Quick Add"
                data-testid="nav-quick-add-button"
              >
                <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
              </button>
            );
          }

          return (
            <button
              key={`${item.id}-${index}`}
              type="button"
              onClick={() => handleNavigation(item.id)}
              data-testid={`nav-${item.id}-button`}
              className={cn(
                "flex flex-col items-center justify-center h-[50px] flex-1 min-w-0 rounded-xl transition-all duration-200 relative py-1 px-1 focus:outline-none select-none cursor-pointer",
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : "text-slate-500 hover:text-blue-600 hover:bg-blue-50/50"
              )}
            >
              <Icon
                className={cn("w-5 h-5 transition-transform duration-150 mb-0.5", isActive ? "scale-105 text-white" : "text-slate-500")}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span className={cn(
                "text-[10px] tracking-tight truncate max-w-full leading-tight",
                isActive ? "font-bold text-white" : "font-medium text-slate-500"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
