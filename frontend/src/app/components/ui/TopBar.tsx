import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Search, Bell, Menu, GripVertical, Wallet, Target, Users, CalendarClock, MessageSquare, CheckCircle2, AlertCircle, LogOut, Receipt, UserPlus, ListTodo } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/app/components/ui/sheet';
import { NavigationItem, headerMenuItems } from '@/app/constants/navigation';
import { NotificationPopup } from '@/app/components/ui/NotificationPopup';
import { useSharedMenu } from '@/hooks/useSharedMenu';
import { useAuth } from '@/contexts/AuthContext';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Notification as AppNotification } from '@/lib/database';
import { SyncStatusBar } from '@/app/components/ui/SyncStatusBar';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';

interface DraggablePageMenuItemProps {
 item: NavigationItem;
 isActive: boolean;
 onNavigate: (id: string) => void;
}

const DraggablePageMenuItem: React.FC<DraggablePageMenuItemProps> = ({
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
      className="relative animate-in fade-in slide-in-from-left-2 duration-200"
      whileDrag={{ scale: 1.02, zIndex: 50, backgroundColor: 'rgba(241, 245, 249, 0.8)' }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <button
        onClick={() => onNavigate(item.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1.5 transition-all duration-200 relative group text-left ${isActive
          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10 font-bold'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 font-medium'
        }`}
      >
        {isActive && (
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-500 rounded-full" />
        )}
        <div
          className={`cursor-grab active:cursor-grabbing touch-none p-1 -ml-1.5 rounded transition-colors ${
            isActive ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'
          }`}
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical size={15} />
        </div>
        <Icon size={18} className={`transition-transform duration-200 group-hover:scale-105 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-800'}`} />
        <span className="text-sm tracking-wide">{item.label}</span>
      </button>
    </Reorder.Item>
  );
};

export const TopBar: React.FC = () => {
  const { setCurrentPage, visibleFeatures, accounts, transactions } = useApp();
  const { orderedItems, handleReorder, handleNavigate, currentPage } = useSharedMenu();
  const { role, user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationPopupOpen, setNotificationPopupOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileVersion(prev => prev + 1);
    };
    window.addEventListener('PROFILE_UPDATED', handleProfileUpdate);
    return () => window.removeEventListener('PROFILE_UPDATED', handleProfileUpdate);
  }, []);

 React.useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent) => {
 if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
 e.preventDefault();
 searchInputRef.current?.focus();
 }
 if (e.key === 'Escape') {
 setIsFocused(false);
 setIsMobileSearchOpen(false);
 setSearchQuery('');
 }
 };
 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, []);

  const searchablePages = useMemo(() => {
    const getPageIcon = (id: string) => {
      return headerMenuItems.find(item => item.id === id)?.icon || Wallet;
    };

    const pages = [
      { id: 'dashboard', label: 'Dashboard', category: 'Navigation', icon: getPageIcon('dashboard'), description: 'Overview, net worth, and recent trends' },
      { id: 'transactions', label: 'Transactions', category: 'Navigation', icon: getPageIcon('transactions'), description: 'View history and add new transactions' },
      { id: 'accounts', label: 'Accounts', category: 'Navigation', icon: getPageIcon('accounts'), description: 'Banks, credit cards, wallets, and cash' },
      { id: 'goals', label: 'Goals', category: 'Navigation', icon: getPageIcon('goals'), description: 'Track savings targets and goals' },
      { id: 'loans', label: 'Loans & EMI', category: 'Navigation', icon: getPageIcon('loans'), description: 'Manage borrow, lend, and monthly EMI' },
      { id: 'investments', label: 'Investments', category: 'Navigation', icon: getPageIcon('investments'), description: 'Stock market portfolio and holdings' },
      { id: 'groups', label: 'Groups', category: 'Navigation', icon: getPageIcon('groups'), description: 'Split bills and shared expenses' },
      { id: 'user-profile', label: 'Profile & Settings', category: 'Navigation', icon: getPageIcon('user-profile'), description: 'Manage profile, security PIN, and avatars' },
    ];

    if (role === 'admin') {
      pages.push(
        { id: 'admin', label: 'Admin Console', category: 'Admin Tools', icon: getPageIcon('admin'), description: 'System monitoring & user role assignment' },
        { id: 'admin-feature-panel', label: 'Master Feature Matrix', category: 'Admin Tools', icon: getPageIcon('admin-feature-panel'), description: 'Manage global feature visibility and readiness' }
      );
    }
    if (role === 'admin' || role === 'manager') {
      pages.push(
        { id: 'ai-management', label: 'AI Management', category: 'Management Tools', icon: getPageIcon('ai-management'), description: 'Configure AI models and custom insights templates' },
        { id: 'advisor-verification', label: 'Advisor Verification', category: 'Management Tools', icon: getPageIcon('advisor-verification'), description: 'Verify and approve advisor applications' }
      );
    }

    return pages;
  }, [role]);

  const searchResults = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();
    if (!query) return [];

    const matchedPages = searchablePages.filter(p => 
      p.label.toLowerCase().includes(query) || 
      p.description.toLowerCase().includes(query) || 
      p.category.toLowerCase().includes(query)
    ).map(p => ({
      id: p.id,
      type: 'page',
      title: p.label,
      subtitle: p.category,
      description: p.description,
      icon: p.icon,
      action: () => {
        setCurrentPage(p.id);
        setSearchQuery('');
        setIsFocused(false);
        setIsMobileSearchOpen(false);
      }
    }));

    const matchedAccounts = (accounts ?? []).filter(a => 
      a.name.toLowerCase().includes(query) || 
      a.type.toLowerCase().includes(query) || 
      (a.subType && a.subType.toLowerCase().includes(query))
    ).slice(0, 4).map(a => ({
      id: String(a.id),
      type: 'account',
      title: a.name,
      subtitle: `Account (${a.type.toUpperCase()})`,
      description: `Current balance: ${a.currency} ${a.balance.toLocaleString()}`,
      icon: headerMenuItems.find(item => item.id === 'accounts')?.icon || Wallet,
      action: () => {
        setCurrentPage('accounts');
        setSearchQuery('');
        setIsFocused(false);
        setIsMobileSearchOpen(false);
      }
    }));

    const matchedTransactions = (transactions ?? []).filter(t => 
      (t.description && t.description.toLowerCase().includes(query)) || 
      (t.category && t.category.toLowerCase().includes(query)) || 
      t.type.toLowerCase().includes(query) ||
      String(t.amount).includes(query)
    ).slice(0, 6).map(t => ({
      id: String(t.id),
      type: 'transaction',
      title: t.description || t.category,
      subtitle: `Transaction (${t.category})`,
      description: `${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()} on ${new Date(t.date).toLocaleDateString()}`,
      icon: headerMenuItems.find(item => item.id === 'transactions')?.icon || Receipt,
      action: () => {
        setCurrentPage('transactions');
        setSearchQuery('');
        setIsFocused(false);
        setIsMobileSearchOpen(false);
      }
    }));

    return [...matchedPages, ...matchedAccounts, ...matchedTransactions];
  }, [debouncedSearchQuery, searchablePages, accounts, transactions, setCurrentPage]);

 const notifications = useLiveQuery(
 () => db.notifications.orderBy('createdAt').reverse().toArray(),
 [],
 ) ?? [];

 const supportedNotifications = useMemo(
 () => notifications.filter((notification) => (
 notification.type === 'emi'
 || notification.type === 'loan'
 || notification.type === 'goal'
 || notification.type === 'group'
 || notification.type === 'booking'
 || notification.type === 'message'
 || notification.type === 'session'
 || notification.type === 'friend_request'
 || notification.type === 'friend_accepted'
 || notification.type === 'todo_shared'
 )),
 [notifications],
 );

 const unreadNotificationsCount = useMemo(
 () => supportedNotifications.filter((notification) => !notification.isRead).length,
 [supportedNotifications],
 );

 const presentNotification = (notification: AppNotification) => {
 switch (notification.type) {
 case 'loan':
 return {
 icon: <Wallet size={18} className="text-red-600" />,
 color: 'text-red-600',
 bgColor: 'bg-red-50',
 };
 case 'goal':
 return {
 icon: <Target size={18} className="text-blue-600" />,
 color: 'text-blue-600',
 bgColor: 'bg-blue-50',
 };
 case 'group':
 return {
 icon: <Users size={18} className="text-violet-600" />,
 color: 'text-violet-600',
 bgColor: 'bg-violet-50',
 };
 case 'booking':
 return {
 icon: <CalendarClock size={18} className="text-emerald-600" />,
 color: 'text-emerald-600',
 bgColor: 'bg-emerald-50',
 };
 case 'message':
 return {
 icon: <MessageSquare size={18} className="text-sky-600" />,
 color: 'text-sky-600',
 bgColor: 'bg-sky-50',
 };
 case 'session':
 return {
 icon: <CheckCircle2 size={18} className="text-green-600" />,
 color: 'text-green-600',
 bgColor: 'bg-green-50',
 };
 case 'friend_request':
 return {
 icon: <UserPlus size={18} className="text-indigo-600" />,
 color: 'text-indigo-600',
 bgColor: 'bg-indigo-50',
 };
 case 'friend_accepted':
 return {
 icon: <Users size={18} className="text-teal-600" />,
 color: 'text-teal-600',
 bgColor: 'bg-teal-50',
 };
 case 'todo_shared':
 return {
 icon: <ListTodo size={18} className="text-purple-600" />,
 color: 'text-purple-600',
 bgColor: 'bg-purple-50',
 };
 default:
 return {
 icon: <AlertCircle size={18} className="text-orange-600" />,
 color: 'text-orange-600',
 bgColor: 'bg-orange-50',
 };
 }
 };

 const recentNotifications = useMemo(() => {
 return supportedNotifications.slice(0, 3).map((notification) => {
 const presentation = presentNotification(notification);
 return {
 id: String(notification.id ?? notification.remoteId ?? `${notification.title}-${notification.createdAt.toString()}`),
 type: notification.type,
 title: notification.title,
 description: notification.message,
 timestamp: new Date(notification.createdAt),
 icon: presentation.icon,
 color: presentation.color,
 bgColor: presentation.bgColor,
 };
 });
 }, [supportedNotifications]);

 const playNotificationSound = () => {
 try {
 const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
 const oscillator = audioContext.createOscillator();
 const gainNode = audioContext.createGain();

 oscillator.connect(gainNode);
 gainNode.connect(audioContext.destination);

 oscillator.frequency.value = 800;
 oscillator.type = 'sine';

 gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
 gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

 oscillator.start(audioContext.currentTime);
 oscillator.stop(audioContext.currentTime + 0.5);
 } catch (error) {
 console.error('Failed to play notification sound:', error);
 }
 };

 const handleNotificationClick = () => {
 setNotificationPopupOpen(true);
 if (unreadNotificationsCount > 0) {
 playNotificationSound();
 }
 };

 const handleProfileClick = () => {
 setCurrentPage('user-profile');
 };

 const handleViewAllNotifications = () => {
 setCurrentPage('notifications');
 };

 const handleMenuItemClick = (itemId: string) => {
 handleNavigate(itemId);
 setMobileMenuOpen(false);
 };

 return (
 <header className="fixed top-3 left-3 right-3 lg:top-4 lg:left-[112px] lg:right-6 z-[60] bg-white/80 backdrop-blur-2xl border border-slate-100 rounded-3xl shadow-lg shadow-slate-100/40 transition-all duration-300">
 {/* Notification Popup */}
 <NotificationPopup
 isOpen={notificationPopupOpen}
 onClose={() => setNotificationPopupOpen(false)}
 onViewAll={handleViewAllNotifications}
 notifications={recentNotifications}
 />

 {/* Top Header Row - Menu, Search, Bell, Profile */}
 <div className="flex items-center justify-between px-4 lg:px-6 h-16 w-full">
 {/* Left: Menu and Search */}
 <div className="flex items-center gap-2 md:gap-3 lg:gap-4 flex-1 max-w-2xl">
 {/* Mobile Menu Button */}
 <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
 <SheetTrigger asChild>
 <button className="lg:hidden p-2 -ml-2 hover:bg-gray-200 rounded-lg transition-colors" aria-label="Open navigation menu">
 <Menu size={24} className="text-gray-900" />
 </button>
 </SheetTrigger>

  {/* Logo & Name */}
  <div className="flex items-center gap-2 sm:gap-3 mr-2 sm:mr-4 shrink-0 lg:hidden">
    <KANAKULogo className="w-7 h-7 sm:w-8 sm:h-8" />
    <span className="text-sm sm:text-xl font-bold font-display text-gray-900 tracking-tight">KANAKU</span>
  </div>
 <SheetContent side="left" className="w-[270px] h-[calc(100vh-24px)] my-3 ml-3 rounded-[32px] bg-white border border-slate-100 shadow-2xl text-slate-900 z-[100] p-0 overflow-hidden flex flex-col focus:outline-none">
 <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
 <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
  <div className="flex flex-col h-full bg-white text-slate-900">
    {/* Header Block */}
    <div className="p-5 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-slate-900 p-2 flex items-center justify-center shadow-md shadow-slate-900/10">
          <KANAKULogo className="w-full h-full text-white" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-base font-black font-display tracking-tight text-slate-900 leading-none">KANAKU</h1>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Fintech Suite</span>
        </div>
      </div>
      <div className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[9px] font-bold text-indigo-600">
        v1.2.0
      </div>
    </div>

    {/* Navigation List */}
    <nav className="flex-1 px-4 py-2 overflow-y-auto scrollbar-hide">
      <Reorder.Group
        axis="y"
        values={orderedItems}
        onReorder={handleReorder}
        className="space-y-1"
      >
        {orderedItems.map((item) => (
          <DraggablePageMenuItem
            key={item.id}
            item={item}
            isActive={currentPage === item.id}
            onNavigate={handleMenuItemClick}
          />
        ))}
      </Reorder.Group>
    </nav>

    {/* Profile & Action Footer */}
    {(() => {
      const profileStr = typeof window !== 'undefined' ? localStorage.getItem('user_profile') : null;
      let displayName = 'User';
      let email = user?.email || 'user@KANAKU.com';
      let avatarUrl = '';
      let roleName = role ? role.toUpperCase() : 'USER';
      
      if (profileStr) {
        try {
          const profile = JSON.parse(profileStr);
          displayName = profile.full_name || profile.displayName || displayName;
          avatarUrl = profile.avatarUrl || '';
        } catch (e) {
          console.error("Error reading profile for drawer footer", e);
        }
      }

      return (
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl shadow-sm shadow-slate-100/50">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm shrink-0 flex items-center justify-center overflow-hidden shadow-sm shadow-indigo-100">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            {/* User Details */}
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-black text-slate-800 truncate">{displayName}</h3>
              <p className="text-[10px] text-slate-400 truncate font-semibold text-left">{email}</p>
              <div className="text-left mt-0.5">
                <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-500">
                  {roleName}
                </span>
              </div>
            </div>
            {/* Logout Button */}
            <button
              onClick={async () => {
                await signOut();
                setMobileMenuOpen(false);
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-all duration-200 shrink-0"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      );
    })()}
  </div>
 </SheetContent>
 </Sheet>

 <div className="relative flex-1 max-w-md group hidden md:block">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-hover:text-slate-600 transition-colors" />
 <input
 ref={searchInputRef}
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 onFocus={() => setIsFocused(true)}
 onBlur={() => setTimeout(() => setIsFocused(false), 200)}
 placeholder="Search transactions, assets..."
 className="KANAKU-search-bar"
 />
 {!searchQuery && (
 <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 border border-slate-200 px-1.5 py-0.5 rounded-md pointer-events-none group-hover:border-slate-300 transition-colors">
 ⌘K
 </span>
 )}

 {isFocused && searchQuery.trim() && (
 <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white/95 backdrop-blur-md border border-slate-100 rounded-[24px] shadow-2xl overflow-hidden z-50 max-h-[400px] overflow-y-auto scrollbar-hide py-3 animate-in fade-in slide-in-from-top-2 duration-200">
 {searchResults.length > 0 ? (
 <div className="space-y-4">
 {['page', 'account', 'transaction'].map((type) => {
 const matches = searchResults.filter(r => r.type === type);
 if (matches.length === 0) return null;
 
 const groupLabel = {
 page: 'Navigation & Tools',
 account: 'Assets & Accounts',
 transaction: 'Recent Transactions'
 }[type as 'page' | 'account' | 'transaction'];

 return (
 <div key={type} className="px-2">
 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 mb-2">{groupLabel}</p>
 <div className="space-y-1">
 {matches.map((result) => {
 const Icon = result.icon;
 return (
 <button
 key={result.id}
 onMouseDown={(e) => {
 e.preventDefault();
 result.action();
 }}
 className="w-full flex items-start gap-3 px-3 py-2 hover:bg-slate-50 rounded-2xl transition-colors text-left"
 >
 <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
 type === 'page' ? 'bg-indigo-50 text-indigo-600' :
 type === 'account' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
 }`}>
 <Icon size={16} />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-bold text-slate-900 truncate">{result.title}</p>
 <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{result.description}</p>
 </div>
 </button>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div className="py-8 text-center text-slate-400">
 <Search size={24} className="mx-auto mb-2 opacity-30" />
 <p className="text-xs font-bold">No matches found</p>
 <p className="text-[10px] text-slate-400 font-medium mt-0.5">Try searching for other words</p>
 </div>
 )}
 </div>
 )}
 </div>
 </div>

 {/* Right: Bell and Profile */}
 <div className="flex items-center gap-3 lg:gap-4 flex-shrink-0">
 {/* Sync status pill - hidden on very small screens to save space */}
 <div className="hidden sm:block">
 <SyncStatusBar compact />
 </div>

 {/* Mobile Search Button */}
 <button
 onClick={() => setIsMobileSearchOpen(true)}
 className="md:hidden rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm w-10 h-10 shrink-0 flex items-center justify-center transition-colors"
 aria-label="Search"
 >
 <Search size={20} />
 </button>

 {/* Notification Bell */}
 {visibleFeatures?.notifications !== false && (
 <motion.button
 whileTap={{ scale: 0.95 }}
 onClick={handleNotificationClick}
 className="relative rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm w-10 h-10 shrink-0 flex items-center justify-center transition-colors"
 >
 <Bell size={20} />
 {/* Unread Badge */}
 {unreadNotificationsCount > 0 && (
 <motion.div
 initial={{ scale: 0 }}
 animate={{ scale: 1 }}
 className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center"
 />
 )}
 </motion.button>
 )}

 {/* Profile Avatar */}
 {visibleFeatures?.userProfile !== false && (
 <motion.button
 whileTap={{ scale: 0.95 }}
 onClick={handleProfileClick}
 className="w-10 h-10 rounded-xl bg-gray-200 overflow-hidden shadow-sm shrink-0 hover:shadow-md transition-shadow flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm"
 >
 {(() => {
 try {
 const profileStr = localStorage.getItem('user_profile');
 if (profileStr) {
 const profile = JSON.parse(profileStr);
 if (profile.avatarUrl) {
 return <img src={profile.avatarUrl} alt="Profile" className="w-full h-full object-cover" />;
 }
 if (profile.full_name) {
 const names = profile.full_name.split(' ').filter(Boolean);
 const firstPart = names[0]?.[0] || '';
 const secondPart = names.length > 1 ? names[names.length - 1][0] : '';
 return <span>{firstPart}{secondPart}</span>;
 }
 if (profile.displayName) {
 const names = profile.displayName.split(' ').filter(Boolean);
 const firstPart = names[0]?.[0] || '';
 const secondPart = names.length > 1 ? names[names.length - 1][0] : '';
 return <span>{firstPart}{secondPart}</span>;
 }
 }
 } catch (e) {
 console.error("Error reading profile for avatar");
 }
 return <span>U</span>;
 })()}
 </motion.button>
 )}
 </div>
 </div>

 {/* Mobile Fullscreen Search Sheet */}
 {isMobileSearchOpen && (
 <div className="fixed inset-0 bg-white/95 backdrop-blur-xl z-[100] flex flex-col animate-in fade-in duration-200 text-slate-900">
 <div className="flex items-center gap-3 p-4 border-b border-slate-100">
 <Search className="text-slate-400 w-5 h-5" />
 <input
 autoFocus
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search transactions, assets..."
 className="flex-1 bg-slate-50 border-none rounded-xl h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-100 font-semibold text-slate-900"
 />
 <button
 onClick={() => {
 setIsMobileSearchOpen(false);
 setSearchQuery('');
 }}
 className="text-xs font-black uppercase text-slate-500 hover:text-slate-900 px-2"
 >
 Cancel
 </button>
 </div>
 
 <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide pb-24">
 {searchQuery.trim() ? (
 searchResults.length > 0 ? (
 <div className="space-y-6">
 {['page', 'account', 'transaction'].map((type) => {
 const matches = searchResults.filter(r => r.type === type);
 if (matches.length === 0) return null;
 
 const groupLabel = {
 page: 'Navigation & Tools',
 account: 'Assets & Accounts',
 transaction: 'Recent Transactions'
 }[type as 'page' | 'account' | 'transaction'];

 return (
 <div key={type} className="space-y-2">
 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{groupLabel}</p>
 <div className="space-y-1 bg-white rounded-3xl p-2 border border-slate-100/50">
 {matches.map((result) => {
 const Icon = result.icon;
 return (
 <button
 key={result.id}
 onClick={result.action}
 className="w-full flex items-start gap-3.5 px-3 py-3 hover:bg-slate-100/50 active:bg-slate-100 rounded-2xl transition-colors text-left"
 >
 <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
 type === 'page' ? 'bg-indigo-50 text-indigo-600' :
 type === 'account' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
 }`}>
 <Icon size={18} />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold text-slate-900 truncate">{result.title}</p>
 <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{result.description}</p>
 </div>
 </button>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div className="py-20 text-center text-slate-400">
 <Search size={32} className="mx-auto mb-3 opacity-30" />
 <p className="text-sm font-bold text-slate-900">No matches found</p>
 <p className="text-xs text-slate-400 font-medium mt-1">Try searching for something else</p>
 </div>
 )
 ) : (
 <div className="py-20 text-center text-slate-400">
 <Search size={32} className="mx-auto mb-3 opacity-30 animate-pulse text-indigo-500" />
 <p className="text-sm font-bold text-slate-900">Search anything in KANAKU</p>
 <p className="text-xs text-slate-400 font-medium mt-1">Type matching words for accounts, transactions, or pages</p>
 </div>
 )}
 </div>
 </div>
 )}
 </header>
 );
};

