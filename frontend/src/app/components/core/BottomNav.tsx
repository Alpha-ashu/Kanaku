import React from 'react';
import {
 Home,
 Wallet,
 Receipt,
 TrendingUp,
 PieChart,
 Plus
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { canAccessPage } from '@/lib/featureFlags';


const navigationItems = [
 { id: 'dashboard', label: 'Home', icon: Home },
 { id: 'accounts', label: 'Accounts', icon: Wallet },
 { id: 'quick-add', label: '', icon: Plus, isAction: true },
 { id: 'transactions', label: 'Activity', icon: Receipt },
 { id: 'reports', label: 'Reports', icon: PieChart },
];

interface BottomNavProps {
 onQuickAdd: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onQuickAdd }) => {
 const { currentPage, setCurrentPage, visibleFeatures } = useApp();

 const filteredNavigationItems = navigationItems.filter(item => {
 if (item.id === 'quick-add') return true;
 return canAccessPage(item.id, visibleFeatures);
 });


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
 <div className="mx-6 mb-0 w-full bg-white/40 backdrop-blur-3xl border-0 rounded-[24px] shadow-md pointer-events-auto flex items-center justify-around h-20 ring-1 ring-black/5 relative overflow-hidden">
 {filteredNavigationItems.map((item) => {
 const Icon = item.icon;
 const isActive = currentPage === item.id;
 const isAction = item.isAction;

 if (isAction) {
 return (
 <motion.button
 key={item.id}
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
 key={item.id}
 onClick={() => handleNavigation(item.id)}
 className={cn(
"flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 relative group",
 isActive ?"text-black" :"text-gray-400 hover:text-gray-600"
 )}
 >
 {isActive && (
 <motion.div
 layoutId="activeTabMobile"
 className="absolute -top-3 w-8 h-1 bg-black rounded-b-lg shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
 transition={{ type:"spring", stiffness: 400, damping: 30 }}
 />
 )}
 <Icon
 className={cn("w-6 h-6 mb-1 transition-transform", isActive &&"scale-110")}
 strokeWidth={isActive ? 2.5 : 2}
 fill={isActive ?"currentColor" :"none"}
 />
 </button>
 );
 })}
 </div>
 </nav>
 );
};
