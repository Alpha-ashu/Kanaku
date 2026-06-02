import React, { useState } from 'react';
// import { getCountryAndCurrencySymbol } from '@/lib/countryCurrency';
import { Bell, Search, Menu, X, GripVertical } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/database';
import { clearNotificationRecords, markNotificationAsRead } from '@/lib/notifications';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/app/components/ui/sheet';
import { NavigationItem } from '@/app/constants/navigation';
import { useSharedMenu } from '@/hooks/useSharedMenu';
import { Reorder, useDragControls } from 'framer-motion';
import { KANKULogo } from '@/app/components/ui/KANKULogo';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

interface DraggableMobileMenuItemProps {
 item: NavigationItem;
 isActive: boolean;
 onNavigate: (id: string) => void;
}

const DraggableMobileMenuItem: React.FC<DraggableMobileMenuItemProps> = ({
 item,
 isActive,
 onNavigate,
}) => {
 const Icon = item.icon;
 const dragControls = useDragControls();

 return (
 <Reorder.Item
 value={item}
 dragListener={false}
 dragControls={dragControls}
 className="relative"
 whileDrag={{ scale: 1.02, zIndex: 50, backgroundColor: 'rgba(255,255,255,0.1)' }}
 transition={{ type:"spring", stiffness: 300, damping: 25 }}
 >
 <button
 onClick={() => onNavigate(item.id)}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${isActive
 ? 'bg-accent-secondary/10 text-accent-secondary'
 : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
 }`}
 >
 <div
 className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-2"
 onPointerDown={(e) => dragControls.start(e)}
 >
 <GripVertical size={16} className="text-slate-400" />
 </div>
 <Icon size={20} />
 <span className="font-medium">{item.label}</span>
 </button>
 </Reorder.Item>
 );
};

export const Header: React.FC = () => {
 // const { icon } = getCountryAndCurrencySymbol();
 const { totalBalance, currency, setCurrentPage, visibleFeatures } = useApp();
 const { orderedItems, handleReorder, handleNavigate, currentPage } = useSharedMenu();
 const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 const [notificationsOpen, setNotificationsOpen] = useState(false);

 const unreadNotifications = useLiveQuery(
 () => db.notifications.filter(n => !n.isRead).count(),
 []
 ) || 0;

 const notifications = useLiveQuery(
 () => db.notifications.toCollection().reverse().limit(10).toArray(),
 []
 ) || [];

 const handleMarkAsRead = async (notification: any) => {
 // Mark as read
 await markNotificationAsRead(notification.id);

 // Navigate if deepLink exists
 if (notification.deepLink) {
 // Parse deepLink like"/calendar?session=123" or"/advisor-workspace"
 const [path, query] = notification.deepLink.split('?');
 setCurrentPage(path.replace('/', ''));

 // If there are query params, store them for the component
 if (query) {
 const params = new URLSearchParams(query);
 params.forEach((value, key) => {
 localStorage.setItem(`deepLink_${key}`, value);
 });
 }
 }

 setNotificationsOpen(false);
 };

 const handleClearAll = async () => {
 await clearNotificationRecords();
 setNotificationsOpen(false);
 };

 const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

 const handleMenuItemClick = (itemId: string) => {
 handleNavigate(itemId);
 setMobileMenuOpen(false);
 };

 return (
 <header className="bg-white border-b border-gray-100 px-4 lg:px-8 py-4 sticky top-0 z-10 shadow-sm flex items-center justify-between">
 <>
 {/* Dynamic Logo */}
 <KANKULogo className="h-8 w-8 mr-3 drop-shadow-sm" />
 
 <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
 <SheetTrigger asChild>
 <button className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Open navigation menu" aria-label="Open navigation menu">
 <Menu size={24} className="text-slate-700" />
 </button>
 </SheetTrigger>
 <SheetContent side="left" className="w-[280px] p-0 bg-white border-r border-slate-100 text-slate-900">
 <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
 <SheetDescription className="sr-only">Main navigation menu with links to all app sections</SheetDescription>
 <div className="flex flex-col h-full bg-white">
 <div className="p-6 border-b border-slate-100">
 <KANKULogo className="h-10 w-10 mb-4" />
 <h1 className="text-2xl font-black text-indigo-600 tracking-tight">KANKU</h1>
 </div>
...
 <nav className="flex-1 p-4 overflow-y-auto">
 <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-2">Navigation</p>
 <Reorder.Group
 axis="y"
 values={orderedItems}
 onReorder={handleReorder}
 className="space-y-1"
 >
 {orderedItems.map((item) => (
 <DraggableMobileMenuItem
 key={item.id}
 item={item}
 isActive={currentPage === item.id}
 onNavigate={handleMenuItemClick}
 />
 ))}
 </Reorder.Group>
 </nav>

 <div className="p-4 border-t border-slate-100">
 <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl text-slate-900">
 <p className="text-sm font-bold">Privacy First</p>
 <p className="text-xs mt-1 text-slate-500">Your data stays on your device</p>
 </div>
 </div>
 </div>
 </SheetContent>
 </Sheet>

 <div className="flex items-center gap-4 flex-1">
 <div className="relative flex-1 max-w-md hidden md:block">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
 <input
 type="text"
 placeholder="Search anything..."
 className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 placeholder-slate-400 transition-all text-sm"
 />
 </div>
 </div>

 <div className="flex items-center gap-4 lg:gap-6">
 <div className="text-right hidden sm:block">
 <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Total Balance</p>
 <p className="text-lg font-black text-slate-900 leading-none mt-1">{formatCurrency(totalBalance)}</p>
 </div>

 {visibleFeatures?.notifications !== false && (
 <div className="relative">
 <button
 onClick={() => setNotificationsOpen(!notificationsOpen)}
 className="relative p-2 hover:bg-white/5 rounded-full transition-colors"
 >
 <Bell size={20} className="text-text-secondary" />
 {unreadNotifications > 0 && (
 <span className="absolute top-1 right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
 {unreadNotifications}
 </span>
 )}
 </button>

 {/* Notifications Dropdown */}
 {notificationsOpen && (
 <div className="absolute right-0 mt-3 w-80 bg-white border border-slate-100 rounded-2xl shadow-2xl z-50 overflow-hidden ring-1 ring-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
 <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
 <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs">Notifications</h3>
 <button
 onClick={() => setNotificationsOpen(false)}
 className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
 title="Close notifications"
 >
 <X size={16} />
 </button>
 </div>

 <div className="max-h-96 overflow-y-auto">
 {notifications.length === 0 ? (
 <div className="p-10 text-center text-slate-300">
 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
 <Bell size={32} className="opacity-20" />
 </div>
 <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Quiet in here</p>
 </div>
 ) : (
 <div className="divide-y divide-slate-50">
 {notifications.map((notification) => (
 <div
 key={notification.id}
 className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors ${!notification.isRead ? 'bg-indigo-50/30' : ''
 }`}
 onClick={() => handleMarkAsRead(notification)}
 >
 <div className="flex items-start gap-3">
 {!notification.isRead && (
 <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2 flex-shrink-0 shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
 )}
 <div className="flex-1 min-w-0">
 <p className="text-sm font-bold text-slate-900 leading-snug">
 {notification.title}
 </p>
 <p className="text-xs text-slate-500 mt-1 leading-relaxed">
 {notification.message}
 </p>
 <p className="text-[9px] text-slate-400 mt-2 font-black uppercase tracking-widest">
 {new Date(notification.createdAt).toLocaleDateString()}
 </p>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {notifications.length > 0 && (
 <div className="p-3 border-t border-slate-100 bg-white">
 <button
 onClick={handleClearAll}
 className="w-full py-2.5 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm"
 title="Clear all notifications"
 >
 Clear All
 </button>
 </div>
 )}
 </div>
 )}
 </div>
 )}
 </div>
 </>
 </header>
 );
};


