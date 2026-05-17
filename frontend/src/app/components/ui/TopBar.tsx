import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Search, Bell, Menu, GripVertical, Wallet, Target, Users, CalendarClock, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/app/components/ui/sheet';
import { NavigationItem } from '@/app/constants/navigation';
import { NotificationPopup } from '@/app/components/ui/NotificationPopup';
import { useSharedMenu } from '@/hooks/useSharedMenu';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Notification as AppNotification } from '@/lib/database';
import { SyncStatusBar } from '@/app/components/ui/SyncStatusBar';
import { KANKULogo } from '@/app/components/ui/KANKULogo';

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
            className="relative"
            whileDrag={{ scale: 1.02, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.05)' }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
            <button
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-colors ${isActive
                    ? 'bg-black text-white shadow-lg'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
            >
                <div
                    className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-2"
                    onPointerDown={(e) => dragControls.start(e)}
                >
                    <GripVertical size={16} className="text-gray-400" />
                </div>
                <Icon size={20} />
                <span className="font-bold text-sm">{item.label}</span>
            </button>
        </Reorder.Item>
    );
};

export const TopBar: React.FC = () => {
    const { setCurrentPage, visibleFeatures } = useApp();
    const { orderedItems, handleReorder, handleNavigate, currentPage } = useSharedMenu();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [notificationPopupOpen, setNotificationPopupOpen] = useState(false);

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
        <header className="fixed top-0 left-0 right-0 z-[60] bg-white/70 backdrop-blur-xl border-b border-white/20 shadow-sm shadow-slate-200/20 transition-all duration-300">
            {/* Notification Popup */}
            <NotificationPopup
                isOpen={notificationPopupOpen}
                onClose={() => setNotificationPopupOpen(false)}
                onViewAll={handleViewAllNotifications}
                notifications={recentNotifications}
            />

            {/* Top Header Row - Menu, Search, Bell, Profile */}
            <div className="layout-container layout-header flex items-center justify-between px-4 lg:px-8">
                {/* Left: Menu and Search */}
                <div className="flex items-center gap-2 md:gap-3 lg:gap-4 flex-1 max-w-2xl">
                    {/* Mobile Menu Button */}
                    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <button className="lg:hidden p-2 -ml-2 hover:bg-gray-200 rounded-lg transition-colors" aria-label="Open navigation menu">
                                <Menu size={24} className="text-gray-900" />
                            </button>
                        </SheetTrigger>

                        {/* Desktop Logo & Name */}
                        <div className="hidden lg:flex items-center gap-3 mr-4">
                            <KANKULogo className="w-8 h-8" />
                            <span className="text-xl font-bold font-display text-gray-900 tracking-tight">KANKU</span>
                        </div>
                        <SheetContent side="left" className="w-[280px] p-0 bg-white border-r border-gray-100 text-gray-900 z-[100]">
                            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                            <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
                            <div className="flex flex-col h-full">
                                <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                                    <KANKULogo className="w-8 h-8" />
                                    <h1 className="text-2xl font-bold font-display text-gray-900">KANKU</h1>
                                </div>

                                <nav className="flex-1 p-4 overflow-y-auto scrollbar-hide">
                                    <p className="text-xs text-gray-400 mb-3 px-2">Drag to reorder menu items</p>
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
                            </div>
                        </SheetContent>
                    </Sheet>

                    <div className="relative flex-1 max-w-md group hidden md:block">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-hover:text-slate-600 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search transactions, assets..."
                            className="KANKU-search-bar"
                        />
                    </div>
                </div>

                {/* Right: Bell and Profile */}
                <div className="flex items-center gap-3 lg:gap-4 flex-shrink-0">
                    {/* Sync status pill - hidden on very small screens to save space */}
                    <div className="hidden sm:block">
                        <SyncStatusBar compact />
                    </div>

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
        </header>
    );
};

