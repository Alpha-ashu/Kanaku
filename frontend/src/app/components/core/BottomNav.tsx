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

  const handleNavigation = async (itemId: string) => {
    // Haptic feedback on native platforms
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch (error) {
        // Haptics not available
      }
    }

    if (itemId === 'quick-add') {
      onQuickAdd();
    } else {
      setCurrentPage(itemId);
    }
  };

  const isCompact = filteredNavigationItems.length <= 3;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pointer-events-none safe-area-padding bottom-nav-container"
    >
      <div className={cn(
        "mb-0 bg-white/95 backdrop-blur-lg border-0 rounded-[24px] shadow-lg pointer-events-auto flex items-center justify-center gap-0.5 h-16 ring-1 ring-black/10 relative overflow-hidden transition-all duration-300",
        isCompact ? "w-[280px]" : "mx-4 w-[calc(100%-32px)]"
      )}>
        {filteredNavigationItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isAction = item.isAction;

          if (isAction) {
            return (
              <motion.button
                key={`${item.id}-${index}`}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleNavigation(item.id)}
                className="flex items-center justify-center w-12 h-12 bg-black text-white rounded-full shadow-xl hover:shadow-2xl transition-all flex-shrink-0 -mx-1 z-20"
                title="Quick Add"
              >
                <Icon className="w-5 h-5" strokeWidth={2.5} />
              </motion.button>
            );
          }

          return (
            <button
              key={`${item.id}-${index}`}
              onClick={() => handleNavigation(item.id)}
              className={cn(
                "flex flex-col items-center justify-center h-full flex-1 min-w-0 transition-all duration-300 relative group px-1",
                isActive ? "text-white" : "text-gray-500 hover:text-gray-700"
              )}
              title={item.label}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabMobile"
                  className="absolute w-10 h-10 bg-slate-900 rounded-full z-0 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                className={cn("w-6 h-6 transition-all duration-300 z-10 relative", isActive && "scale-110")}
                strokeWidth={isActive ? 2.5 : 2}
                fill="none"
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};
