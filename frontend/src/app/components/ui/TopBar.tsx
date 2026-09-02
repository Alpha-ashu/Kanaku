import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/contexts/AppContext';
import { Search, Bell, Menu, GripVertical, Wallet, LogOut, Receipt } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/app/components/ui/sheet';
import { NavigationItem, headerMenuItems } from '@/app/constants/navigation';
import { NotificationPopup } from '@/app/components/ui/NotificationPopup';
import { useSharedMenu } from '@/hooks/useSharedMenu';
import { useAuth } from '@/contexts/AuthContext';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/database';
import { getNotificationPresentation } from '@/lib/notificationPresentation';
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
      <button data-testid="top-bar-button"
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
  const { setCurrentPage, visibleFeatures, accounts, transactions, currency } = useApp();
  const { orderedItems, handleReorder, handleNavigate, currentPage } = useSharedMenu();
  const { role, user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationPopupOpen, setNotificationPopupOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setIsSearchPending(false);
    }, 200);
    if (searchQuery !== debouncedSearchQuery) setIsSearchPending(true);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click-outside closes the search dropdown (replaces flaky onBlur+setTimeout)
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
        setActiveResultIndex(-1);
      }
    };
    if (isSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearchOpen]);

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
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsMobileSearchOpen(false);
        setSearchQuery('');
        setActiveResultIndex(-1);
      }
      if (e.key === 'ArrowDown' && isSearchOpen) {
        e.preventDefault();
        setActiveResultIndex(prev => prev + 1);
      }
      if (e.key === 'ArrowUp' && isSearchOpen) {
        e.preventDefault();
        setActiveResultIndex(prev => Math.max(-1, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

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

  const formatAmount = (amount: number, type: string) => {
    const sign = type === 'income' ? '+' : '-';
    return `${sign}${currency ?? 'INR'} ${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

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
        setIsSearchOpen(false);
        setIsMobileSearchOpen(false);
        setActiveResultIndex(-1);
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
      subtitle: `${a.type.toUpperCase()} Account`,
      description: `Balance: ${a.currency ?? currency ?? 'INR'} ${Number(a.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: headerMenuItems.find(item => item.id === 'accounts')?.icon || Wallet,
      action: () => {
        setCurrentPage('accounts');
        setSearchQuery('');
        setIsSearchOpen(false);
        setIsMobileSearchOpen(false);
        setActiveResultIndex(-1);
      }
    }));

    const matchedTransactions = (transactions ?? []).filter(t =>
      (t.description && t.description.toLowerCase().includes(query)) ||
      (t.merchant && t.merchant.toLowerCase().includes(query)) ||
      (t.category && t.category.toLowerCase().includes(query)) ||
      t.type.toLowerCase().includes(query) ||
      String(t.amount).includes(query)
    ).slice(0, 6).map(t => ({
      id: String(t.id),
      type: 'transaction',
      title: t.merchant || t.description || t.category,
      subtitle: `${t.category}${t.merchant && t.description ? ` · ${t.description}` : ''}`,
      description: `${formatAmount(Number(t.amount), t.type)} · ${new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}`,
      icon: headerMenuItems.find(item => item.id === 'transactions')?.icon || Receipt,
      action: () => {
        setCurrentPage('transactions');
        setSearchQuery('');
        setIsSearchOpen(false);
        setIsMobileSearchOpen(false);
        setActiveResultIndex(-1);
      }
    }));

    return [...matchedPages, ...matchedAccounts, ...matchedTransactions];
  }, [debouncedSearchQuery, searchablePages, accounts, transactions, setCurrentPage, currency]);

 const notifications = useLiveQuery(
 () => db.notifications.orderBy('createdAt').reverse().toArray(),
 [],
 ) ?? [];

 // `type` is free-text server-side (see Notification.type's doc comment in
 // lib/database.ts) — this used to filter down to a stale 10-value allowlist,
 // which silently hid loan_reminder/budget_alert/group_expense/new_booking
 // (and more) notifications from the bell icon and its unread badge. Every
 // notification is shown now; presentation for an unrecognised type falls
 // back safely via getNotificationPresentation. See
 // lib/notificationPresentation.tsx for the full incident writeup.
 const unreadNotificationsCount = useMemo(
 () => notifications.filter((notification) => !notification.isRead).length,
 [notifications],
 );

 const recentNotifications = useMemo(() => {
 return notifications.slice(0, 3).map((notification) => {
 const presentation = getNotificationPresentation(notification.type);
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
 }, [notifications]);

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
    setCurrentPage(itemId);
    setMobileMenuOpen(false);
  };
 // the viewport edge. `top-3` alone put it underneath the iOS Dynamic Island /
 // notch and the Android status bar, so the logo and the menu button were
 // partly unreadable and partly untappable on every notched device. The
 // left/right insets matter too, for landscape on notched phones.
 // `.mobile-main` already reserves header-height + safe-area-inset-top for the
 // content below, so pushing the header down by the same inset keeps the two in
 // agreement rather than opening a gap.
  return (
    <header
      className="fixed top-[calc(env(safe-area-inset-top,0px)+0.75rem)] left-[calc(env(safe-area-inset-left,0px)+0.75rem)] right-[calc(env(safe-area-inset-right,0px)+0.75rem)] lg:top-4 lg:left-[112px] lg:right-6 z-[60] bg-white/80 backdrop-blur-2xl border border-slate-100 rounded-3xl shadow-lg shadow-slate-100/40 transition-shadow duration-150 transform-gpu will-change-transform mobile-topbar-stable"
      style={{
        WebkitTransform: 'translate3d(0, 0, 0)',
        transform: 'translate3d(0, 0, 0)',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
      }}
    >
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
  <button data-testid="top-bar-open-navigation-menu" onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 -ml-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer" aria-label="Open navigation menu">
  <Menu size={24} className="text-gray-900" />
  </button>
 </SheetTrigger>

  {/* Logo & Name */}
  <div className="flex items-center gap-2 sm:gap-3 mr-2 sm:mr-4 shrink-0 lg:hidden">
    <KANAKULogo className="w-7 h-7 sm:w-8 sm:h-8" />
    <span className="text-sm sm:text-xl font-bold font-display text-gray-900 tracking-tight">KANAKU</span>
  </div>
 {/* Sized with dvh, not vh: on mobile Safari `100vh` is the viewport with the
     browser chrome *retracted*, so the panel was taller than the screen —
     which pushed the first nav item under the panel header and cut the account
     row off the bottom edge. dvh tracks the actually-visible viewport, and the
     safe-area insets keep the rounded panel clear of the status bar, the home
     indicator and (in landscape) the notch. */}
 <SheetContent side="left" className="w-[270px] h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] mb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] ml-[calc(env(safe-area-inset-left,0px)+0.75rem)] rounded-[32px] bg-white border border-slate-100 shadow-2xl text-slate-900 z-[100] p-0 overflow-hidden flex flex-col focus:outline-none">
 <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
 <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
  <div className="flex flex-col h-full bg-white text-slate-900">
    {/* Header Block */}
    <div className="p-5 border-b border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3">
        <KANAKULogo className="w-8 h-8" />
        <h1 className="text-xl font-bold font-display tracking-tight text-slate-900">KANAKU</h1>
      </div>
    </div>

    {/* Navigation List — Direct touch buttons for instant mobile navigation */}
    <nav className="flex-1 px-3 py-2 overflow-y-auto scrollbar-hide space-y-1">
      {orderedItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => handleMenuItemClick(item.id)}
            data-testid={`drawer-nav-${item.id}-button`}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors duration-150 text-left font-medium text-sm select-none ${
              isActive
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
            }`}
          >
            <Icon size={18} className={isActive ? 'text-white' : 'text-slate-500'} />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>

    {/* Profile & Action Footer */}
    {(() => {
      const profileStr = typeof window !== 'undefined' ? localStorage.getItem('user_profile') : null;
      let displayName = 'User';
      const email = user?.email || 'user@KANAKU.com';
      let avatarUrl = '';
      const roleName = role ? role.toUpperCase() : 'USER';
      
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
              {avatarUrl && avatarUrl.startsWith('http') ? (
                <>
                  <span className="absolute z-0">{displayName.charAt(0).toUpperCase()}</span>
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover relative z-10" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                </>
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
            <button data-testid="top-bar-sign-out"
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

 <div ref={searchContainerRef} className="relative flex-1 max-w-md group hidden md:block">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-hover:text-slate-600 transition-colors" />
 <input data-testid="top-bar-search-transactions-assets"
 ref={searchInputRef}
 type="text"
 id="topbar-search-desktop"
 name="topbar-search-desktop"
 value={searchQuery}
 onChange={(e) => {
   setSearchQuery(e.target.value);
   if (e.target.value.trim()) setIsSearchOpen(true);
 }}
 onFocus={() => {
   setIsSearchOpen(true);
   setActiveResultIndex(-1);
 }}
 onKeyDown={(e) => {
   if (e.key === 'Enter' && activeResultIndex >= 0 && searchResults[activeResultIndex]) {
     e.preventDefault();
     searchResults[activeResultIndex].action();
   }
 }}
 placeholder="Search transactions, accounts, pages..."
 className="KANAKU-search-bar"
 />
 {!searchQuery && (
 <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 border border-slate-200 px-1.5 py-0.5 rounded-md pointer-events-none group-hover:border-slate-300 transition-colors">
 ⌘K
 </span>
 )}
 {isSearchPending && searchQuery.trim() && (
 <span className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4">
 <span className="animate-spin block w-3.5 h-3.5 border-2 border-slate-200 border-t-indigo-500 rounded-full" />
 </span>
 )}

  {isSearchOpen && searchQuery.trim() && (
    <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] shadow-2xl overflow-hidden z-50 overflow-y-auto scrollbar-hide py-3 animate-in fade-in slide-in-from-top-2 duration-200" style={{ maxHeight: 'min(400px, 60vh)' }}>
      {searchResults.length > 0 ? (
 <div className="space-y-4">
 <div className="px-4 pb-1 flex items-center justify-between">
 <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
 </div>
 {(['page', 'account', 'transaction'] as const).map((type) => {
 const matches = searchResults.filter(r => r.type === type);
 if (matches.length === 0) return null;

 const groupLabel = {
 page: 'Navigation & Tools',
 account: 'Assets & Accounts',
 transaction: 'Recent Transactions'
 }[type];

 return (
 <div key={type} className="px-2">
 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 mb-2">{groupLabel}</p>
                <div className="space-y-0.5">
                  {matches.map((result) => {
                    const globalIdx = searchResults.indexOf(result);
                    const Icon = result.icon;
                    const isActive = globalIdx === activeResultIndex;
                    return (
                      <button data-testid={`top-bar-button-2-${result.id}`}
                        key={result.id}
                        onMouseEnter={() => setActiveResultIndex(globalIdx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          result.action();
                        }}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left ${
                          isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          type === 'page' ? 'bg-indigo-50 text-indigo-600' :
                          type === 'account' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate leading-tight">{result.title}</p>
                          <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5 leading-tight">{result.description}</p>
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
          <p className="text-xs font-bold text-slate-700">No results for "{searchQuery}"</p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">Try a different search term</p>
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
          <button data-testid="top-bar-search"
            onClick={() => setIsMobileSearchOpen(true)}
            className="md:hidden rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm w-10 h-10 shrink-0 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Search"
          >
            <Search size={20} />
          </button>

          {/* Notification Bell */}
          {visibleFeatures?.notifications !== false && (
            <motion.button data-testid="top-bar-button-3"
              whileTap={{ scale: 0.95 }}
              onClick={handleNotificationClick}
              aria-label="Notifications"
              className="relative rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm w-10 h-10 shrink-0 flex items-center justify-center transition-colors cursor-pointer"
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
            <motion.button data-testid="top-bar-button-4"
              whileTap={{ scale: 0.95 }}
              onClick={handleProfileClick}
              aria-label="User profile"
              className="w-10 h-10 rounded-xl bg-gray-200 overflow-hidden shadow-sm shrink-0 hover:shadow-md transition-shadow flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm cursor-pointer"
            >
              {(() => {
                let initials = 'U';
                try {
                  const profileStr = localStorage.getItem('user_profile');
                  if (profileStr) {
                    const profile = JSON.parse(profileStr);
                    const name = profile.full_name || profile.displayName || user?.email || 'U';
                    const names = name.split(' ').filter(Boolean);
                    initials = (names[0]?.[0] || 'U') + (names.length > 1 ? names[names.length - 1][0] : '');
                  } else {
                    initials = user?.email?.charAt(0).toUpperCase() || 'U';
                  }
                } catch (e) {
                  initials = user?.email?.charAt(0).toUpperCase() || 'U';
                }
                return (
                  <>
                    <span className="absolute z-0">{initials.toUpperCase()}</span>
                    {(() => {
                      try {
                        const profileStr = localStorage.getItem('user_profile');
                        if (profileStr) {
                          const profile = JSON.parse(profileStr);
                          if (profile.avatarUrl?.startsWith('http')) {
                            return (
                              <img
                                src={profile.avatarUrl}
                                alt=""
                                className="w-full h-full object-cover relative z-10"
                                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                              />
                            );
                          }
                        }
                      } catch (avatarErr) {
                        console.debug('[TopBar] Failed to parse avatar URL from profileStr:', avatarErr);
                      }
                      return null;
                    })()}
                  </>
                );
              })()}
            </motion.button>
          )}
        </div>
      </div>

      {/* Mobile Fullscreen Search Sheet Portalized to document.body */}
      {isMobileSearchOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-white dark:bg-slate-900 z-[9999] flex flex-col animate-in fade-in duration-200 text-slate-900 dark:text-slate-100 pointer-events-auto h-[100dvh] w-screen overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-white dark:bg-slate-900 shrink-0">
            <Search className="text-slate-400 w-5 h-5 shrink-0" />
            <input data-testid="top-bar-search-transactions-assets-2"
              autoFocus
              type="text"
              id="topbar-search-mobile"
              name="topbar-search-mobile"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transactions, assets..."
              className="flex-1 bg-slate-50 border-none rounded-xl h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-100 font-semibold text-slate-900 dark:text-slate-100 dark:bg-slate-800"
            />
            <button data-testid="top-bar-cancel"
              onClick={() => {
                setIsMobileSearchOpen(false);
                setSearchQuery('');
              }}
              className="text-xs font-black uppercase text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 cursor-pointer shrink-0"
            >
              Cancel
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide bg-slate-50/50 dark:bg-slate-950/50" style={{ paddingBottom: 'calc(var(--bottom-reserved-space) + 16px)' }}>
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
                        <div className="space-y-1 bg-white dark:bg-slate-900 rounded-3xl p-2 border border-slate-100 dark:border-slate-800 shadow-xs">
                          {matches.map((result) => {
                            const Icon = result.icon;
                            return (
                              <button data-testid={`top-bar-button-5-${result.id}`}
                                key={result.id}
                                onClick={() => {
                                  setIsMobileSearchOpen(false);
                                  result.action();
                                }}
                                className="w-full flex items-start gap-3.5 px-3 py-3 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 active:bg-slate-100 rounded-2xl transition-colors text-left cursor-pointer"
                              >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  type === 'page' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400' :
                                  type === 'account' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                                }`}>
                                  <Icon size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{result.title}</p>
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
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">No matches found</p>
                  <p className="text-xs text-slate-400 font-medium mt-1">Try searching for something else</p>
                </div>
              )
            ) : (
              <div className="py-20 text-center text-slate-400">
                <Search size={32} className="mx-auto mb-3 opacity-30 animate-pulse text-indigo-500" />
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Search anything in KANAKU</p>
                <p className="text-xs text-slate-400 font-medium mt-1">Type matching words for accounts, transactions, or pages</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};
