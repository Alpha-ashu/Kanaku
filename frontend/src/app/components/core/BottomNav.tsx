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
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pointer-events-none bottom-nav-container">
      <div className="mx-2 sm:mx-4 w-[calc(100%-16px)] sm:w-[calc(100%-32px)] bg-white/95 backdrop-blur-md border border-gray-200/80 rounded-2xl shadow-xl pointer-events-auto flex items-center justify-between px-1.5 sm:px-3 h-16 relative overflow-hidden">
        {filteredNavigationItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isAction = item.isAction;

          if (isAction) {
            return (
              <button
                key={`${item.id}-${index}`}
                onClick={() => handleNavigation(item.id)}
                className="flex items-center justify-center w-11 h-11 bg-slate-900 active:bg-black text-white rounded-full shadow-md active:scale-95 transition-transform shrink-0 mx-1 z-20 focus:outline-none"
                title="Quick Add"
                data-testid="nav-quick-add-button"
              >
                <Icon className="w-5 h-5" strokeWidth={2.5} />
              </button>
            );
          }

          return (
            <button
              key={`${item.id}-${index}`}
              onClick={() => handleNavigation(item.id)}
              data-testid={`nav-${item.id}-button`}
              className={cn(
                "flex flex-col items-center justify-center h-full flex-1 min-w-0 transition-colors duration-150 relative py-1 px-0.5 focus:outline-none select-none",
                isActive ? "text-slate-900 font-bold" : "text-gray-500 hover:text-gray-800"
              )}
            >
              {isActive && (
                <div className="absolute top-1 w-6 h-1 bg-slate-900 rounded-full" />
              )}
              <Icon
                className={cn("w-5 h-5 transition-transform duration-150 mb-0.5", isActive ? "scale-110 text-slate-900" : "text-gray-500")}
                strokeWidth={isActive ? 2.3 : 1.8}
              />
              <span className={cn(
                "text-[10px] tracking-tight truncate max-w-full leading-tight",
                isActive ? "font-black text-slate-900" : "font-medium text-gray-500"
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
