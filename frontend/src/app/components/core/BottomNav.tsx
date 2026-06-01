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
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pointer-events-none safe-area-padding"
      style={{
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'transparent',
        height: 'auto',
        minHeight: '80px'
      }}
    >
      <div className={cn(
        "mb-0 bg-white/40 backdrop-blur-3xl border-0 rounded-[24px] shadow-md pointer-events-auto flex items-center justify-around h-20 ring-1 ring-black/5 relative overflow-hidden transition-all duration-300",
        isCompact ? "w-[260px]" : "mx-6 w-full"
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
                className="flex items-center justify-center w-14 h-14 bg-black text-white rounded-full shadow-xl hover:shadow-2xl transition-all relative z-10"
              >
                <Icon className="w-6 h-6" strokeWidth={2.5} />
              </motion.button>
            );
          }

          return (
            <button
              key={`${item.id}-${index}`}
              onClick={() => handleNavigation(item.id)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 relative group",
                isActive ? "text-black" : "text-gray-400 hover:text-gray-600"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabMobile"
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-slate-900 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                className={cn("w-6 h-6 mb-1 transition-transform", isActive && "scale-110")}
                strokeWidth={isActive ? 2.5 : 2}
                fill={isActive ? "currentColor" : "none"}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};
