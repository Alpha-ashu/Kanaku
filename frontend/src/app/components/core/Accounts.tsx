import React, { useState, useMemo, useRef, useEffect, useCallback } from"react";
import { useApp } from"@/contexts/AppContext";
import { db } from"@/lib/database";
import {
 Plus,
 Wallet,
 CreditCard,
 Banknote,
 Smartphone,
 Edit2,
 Trash2,
 X,
 Receipt,
 TrendingUp,
 TrendingDown,
 Upload,
 ArrowUpRight,
 ArrowDownLeft,
 Repeat2,
 Landmark,
} from"lucide-react";

import { toast } from"sonner";
import { DeleteConfirmModal } from"@/app/components/shared/DeleteConfirmModal";
import { Card } from"@/app/components/ui/card";
import { Button } from"@/app/components/ui/button";
import { motion, AnimatePresence } from"framer-motion";
import { cn } from"@/lib/utils";
import { PageHeader } from"@/app/components/ui/PageHeader";
import { StatementImport } from"@/app/components/transactions/StatementImport";
import { formatLocalDate } from"@/lib/dateUtils";
import { CardNetworkLogo, getBankCardLogo } from"@/app/components/ui/AccountLogos";
import { CenteredLayout } from"@/app/components/shared/CenteredLayout";

type AssetType ="all" |"bank" |"card" |"wallet" |"cash";



const getCardStyle = (account: any) => {
 const CARD_COLORS = [
 { id: 'midnight', bg: 'bg-[#0F172A]', glow: 'bg-indigo-500/10', color: '#0F172A' },
 { id: 'emerald', bg: 'bg-[#064E3B]', glow: 'bg-emerald-500/10', color: '#064E3B' },
 { id: 'rose', bg: 'bg-[#4C0519]', glow: 'bg-rose-500/10', color: '#4C0519' },
 { id: 'amber', bg: 'bg-[#451A03]', glow: 'bg-amber-500/10', color: '#451A03' },
 { id: 'violet', bg: 'bg-[#2E1065]', glow: 'bg-violet-500/10', color: '#2E1065' },
 { id: 'blue', bg: 'bg-[#1E3A8A]', glow: 'bg-blue-500/10', color: '#1E3A8A' },
 ];

 const colorId = account.colorId || 'midnight';
 const matched = CARD_COLORS.find(c => c.id === colorId);

 if (colorId === 'custom' && account.customColor) {
 return {
 background: account.customColor,
 glow: 'bg-white/5'
 };
 }

 if (matched) {
 return {
 bgClass: matched.bg,
 glow: matched.glow
 };
 }

 // Fallback
 return {
 bgClass: 'bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e]',
 glow: 'bg-indigo-500/10'
 };
};

export const Accounts: React.FC = () => {
 const { accounts, transactions, currency, setCurrentPage } = useApp();
 const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
 null,
 );
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [accountToDelete, setAccountToDelete] = useState<{
 id: number;
 name: string;
 } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [activeTab, setActiveTab] = useState<AssetType>("all");
 const [statementImportOpen, setStatementImportOpen] = useState<{
 accountId: number;
 accountName: string;
 accountType: string;
 } | null>(null);
 const [showTransactionTypeModal, setShowTransactionTypeModal] = useState(false);
 const [activeCardAccountId, setActiveCardAccountId] = useState<number | null>(null);
 // Edit modal state
 const [editModalOpen, setEditModalOpen] = useState(false);
 const [editingAccount, setEditingAccount] = useState<{
 id: number;
 name: string;
 type: string;
 balance: number;
 openingBalance?: number;
 isActive: boolean;
 subType?: string;
 colorId?: string;
 customColor?: string;
 } | null>(null);
 const [isSavingEdit, setIsSavingEdit] = useState(false);
 const [isDesktop, setIsDesktop] = useState(false);

 React.useEffect(() => {
 const mediaQuery = window.matchMedia('(min-width: 1024px)');
 setIsDesktop(mediaQuery.matches);
 const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
 if (mediaQuery.addEventListener) {
 mediaQuery.addEventListener('change', handler);
 return () => mediaQuery.removeEventListener('change', handler);
 } else {
 mediaQuery.addListener(handler);
 return () => mediaQuery.removeListener(handler);
 }
 }, []);

 const handleEditAccount = (account: typeof accounts[0], e: React.MouseEvent) => {
 e.stopPropagation();
 setEditingAccount({
 id: account.id!,
 name: account.name,
 type: account.type,
 balance: account.balance,
 openingBalance: account.openingBalance,
 isActive: account.isActive ?? true,
 subType: account.subType,
 colorId: account.colorId,
 customColor: account.customColor,
 });
 setEditModalOpen(true);
 };

 const handleSaveEdit = async () => {
 if (!editingAccount) return;
 setIsSavingEdit(true);
 try {
 await db.accounts.update(editingAccount.id, {
 name: editingAccount.name,
 type: editingAccount.type as any,
 balance: editingAccount.balance,
 openingBalance: editingAccount.openingBalance,
 isActive: editingAccount.isActive,
 subType: editingAccount.subType,
 colorId: editingAccount.colorId,
 customColor: editingAccount.customColor,
 });
 queueRecordUpsertSync('accounts', editingAccount.id);
 toast.success('Account updated!');
 setEditModalOpen(false);
 setEditingAccount(null);
 } catch (err) {
 console.error('Failed to update account:', err);
 toast.error('Failed to update account. Please try again.');
 } finally {
 setIsSavingEdit(false);
 }
 };
 const carouselRef = useRef<HTMLDivElement>(null);
 const mobileCarouselRef = useRef<HTMLDivElement>(null);
 // Separate ref maps so mobile and desktop don't overwrite each other
 const cardRefs = useRef<Record<number, HTMLDivElement | null>>({}); // desktop
 const mobileCardRefs = useRef<Record<number, HTMLDivElement | null>>({}); // mobile
 const isClickScrolling = useRef(false);

 // Filter accounts based on active tab
 const filteredAccounts = useMemo(() => {
 if (activeTab ==="all") return accounts;
 return accounts.filter((a) => a.type === activeTab);
 }, [accounts, activeTab]);

 const tabs = [
 { id:"all", label:"All Assets", icon: TrendingUp },
 { id:"bank", label:"Banks", icon: Landmark },
 { id:"card", label:"Cards", icon: CreditCard },
 { id:"wallet", label:"Digital", icon: Wallet },
 { id:"cash", label:"Cash", icon: Banknote },
 ];

 // Auto-select first account on load and when the filtered list changes
 useEffect(() => {
 if (filteredAccounts.length > 0) {
 // If no account is selected OR the current selection is NOT in the filtered list
 if (selectedAccountId === null || !filteredAccounts.find(a => a.id === selectedAccountId)) {
 setSelectedAccountId(filteredAccounts[0].id!);
 }
 } else {
 // Category is empty, clear selection to prevent leakage of unrelated transactions
 setSelectedAccountId(null);
 }
 }, [filteredAccounts]);

 // Keep a ref so scroll handlers can read selectedAccountId without re-subscribing
 const selectedAccountIdRef = useRef<number | null>(null);
 useEffect(() => {
 selectedAccountIdRef.current = selectedAccountId;
 }, [selectedAccountId]);

 //"EUR"EUR Desktop scroll listener"EUR"EUR
 useEffect(() => {
 const carousel = carouselRef.current;
 if (!carousel) return;

 const handleScroll = () => {
 if (isClickScrolling.current) return;
 const center = carousel.scrollLeft + carousel.clientWidth / 2;
 let closest: { id: number; dist: number } | null = null;
 filteredAccounts.forEach((account) => {
 const el = cardRefs.current[account.id!];
 if (!el) return;
 const dist = Math.abs((el.offsetLeft + el.offsetWidth / 2) - center);
 if (!closest || dist < closest.dist) closest = { id: account.id!, dist };
 });
 if (closest && closest.id !== selectedAccountIdRef.current) {
 setSelectedAccountId(closest.id);
 }
 };

 carousel.addEventListener("scroll", handleScroll, { passive: true });
 const t = setTimeout(handleScroll, 150);
 return () => { carousel.removeEventListener("scroll", handleScroll); clearTimeout(t); };
 }, [filteredAccounts]);

 //"EUR"EUR Mobile scroll listener (index-based EUR" stride = full clientWidth)"EUR"EUR
 useEffect(() => {
 const carousel = mobileCarouselRef.current;
 if (!carousel) return;

 const handleMobileScroll = () => {
 if (isClickScrolling.current) return;
 // Each card slot is exactly one clientWidth wide (w-screen wrapper, no gap)
 const stride = carousel.clientWidth;
 if (stride === 0) return;
 const idx = Math.round(carousel.scrollLeft / stride);
 const clamped = Math.max(0, Math.min(filteredAccounts.length - 1, idx));
 const account = filteredAccounts[clamped];
 if (account && account.id !== selectedAccountIdRef.current) {
 setSelectedAccountId(account.id!);
 }
 };

 carousel.addEventListener("scroll", handleMobileScroll, { passive: true });
 const t = setTimeout(handleMobileScroll, 150);
 return () => { carousel.removeEventListener("scroll", handleMobileScroll); clearTimeout(t); };
 }, [filteredAccounts]);

 const handleCardClick = (id: number) => {
 isClickScrolling.current = true;
 setSelectedAccountId(id);
 const index = filteredAccounts.findIndex(a => a.id === id);

 // Mobile: each slot is exactly one clientWidth, so stride = clientWidth
 const mobileCarousel = mobileCarouselRef.current;
 if (mobileCarousel) {
 mobileCarousel.scrollTo({ left: index * mobileCarousel.clientWidth, behavior:"smooth" });
 }

 // Desktop: scroll the card element into view
 const cardEl = cardRefs.current[id];
 if (cardEl) {
 cardEl.scrollIntoView({ behavior:"smooth", block:"nearest", inline:"center" });
 }

 setTimeout(() => { isClickScrolling.current = false; }, 700);
 };


 const currencyFormatter = useMemo(() => (
 new Intl.NumberFormat("en-US", { style:"currency", currency })
 ), [currency]);

 const formatCurrency = useCallback(
 (amount: number) => currencyFormatter.format(amount),
 [currencyFormatter]
 );

 const handleDeleteAccount = (id: number, name: string) => {
 setAccountToDelete({ id, name });
 setDeleteModalOpen(true);
 };

 const confirmDeleteAccount = async () => {
 if (!accountToDelete) return;
 setIsDeleting(true);
 try {
 await db.accounts.delete(accountToDelete.id);
 toast.success("Account deleted successfully");
 setDeleteModalOpen(false);
 setAccountToDelete(null);
 if (selectedAccountId === accountToDelete.id) {
 setSelectedAccountId(null);
 }
 } catch (error) {
 console.error("Error deleting account:", error);
 toast.error("Failed to delete account");
 } finally {
 setIsDeleting(false);
 }
 };

 const getAccountIcon = (type: string) => {
 switch (type) {
 case"bank":
 return <Landmark size={20} />;
 case"card":
 return <CreditCard size={20} />;
 case"cash":
 return <Banknote size={20} />;
 case"wallet":
 return <Wallet size={20} />;
 default:
 return <Wallet size={20} />;
 }
 };




 const totalBalance = useMemo(() => (
 accounts.filter((a) => a.isActive).reduce((sum, a) => sum + a.balance, 0)
 ), [accounts]);

 const selectedAccount = useMemo(
 () => accounts.find((a) => a.id === selectedAccountId),
 [accounts, selectedAccountId]
 );
 const accountTransactions = useMemo(() => {
 if (!selectedAccountId) return [];
 // Strict filtering by account ID (both source and target for transfers)
 return transactions
 .filter((t) => t.accountId === selectedAccountId || t.transferToAccountId === selectedAccountId)
 .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
 }, [transactions, selectedAccountId]);

 return (
 <CenteredLayout>
 <div className="w-full">
 <div className="pb-4 lg:pb-6">
 <PageHeader
 title="Accounts"
 subtitle="Manage your wallets and payment sources"
 >
 <Button
 onClick={() => setCurrentPage("add-account")}
 className="shadow-lg bg-gray-900 hover:bg-gray-800 text-white h-12 px-6 rounded-2xl font-bold flex items-center gap-2"
 >
 <Plus size={18} />
 <span>Add Account</span>
 </Button>
 </PageHeader>
 </div>

 {/* Tab Navigation */}
 <div className="w-full mb-6">
 <div className="flex w-full bg-gray-100/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/40 shadow-sm">
 {tabs.map((tab) => {
 const Icon = tab.icon;
 const isActive = activeTab === tab.id;
 
 const getLabel = (label: string) => {
 if (label === 'All Assets') return isActive ? 'All Assets' : 'All';
 return label;
 };

 return (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id as AssetType)}
 className={cn(
 'relative flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 py-2 sm:py-2.5 rounded-xl transition-all duration-300 font-bold',
 isActive 
 ? 'text-white shadow-md' 
 : 'bg-transparent text-slate-500 hover:text-slate-700'
 )}
 >
 {isActive && (
 <motion.div 
 layoutId="activeTabPillAccounts"
 className="absolute inset-0 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl z-0"
 transition={{ type:"spring", bounce: 0.2, duration: 0.6 }}
 />
 )}
 <span className="relative z-10 flex items-center justify-center gap-2">
 <Icon 
 size={14} 
 className={cn(
"transition-all duration-300",
 isActive ?"text-white scale-110" :"text-slate-400"
 )} 
 />
 <AnimatePresence mode="wait">
 {isActive && (
 <motion.span
 initial={{ width: 0, opacity: 0 }}
 animate={{ width: 'auto', opacity: 1 }}
 exit={{ width: 0, opacity: 0 }}
 className="overflow-hidden whitespace-nowrap"
 >
 <span className="text-[10px] sm:text-xs font-bold ml-1">
 {tab.label}
 </span>
 </motion.span>
 )}
 </AnimatePresence>
 
 {/* Keep labels visible on desktop even if not active for better UX */}
 {!isActive && (
 <span className="hidden sm:inline text-xs text-slate-500 ml-1">
 {tab.label}
 </span>
 )}
 </span>
 </button>
 );
 })}
 </div>
 </div>

 {/* --- New User Prompt --- Only shown when no accounts exist */}
 {accounts.length === 0 && (
 <motion.div
 initial={{ opacity: 0, y: -12 }}
 animate={{ opacity: 1, y: 0 }}
 className="mx-4 sm:mx-6 lg:mx-8 xl:mx-12 mb-4 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white p-5 shadow-lg"
 >
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <p className="font-bold text-lg">
 Set up your first account
 </p>
 <p className="text-sm text-purple-100 mt-1">
 Add your bank account, wallet, or cash to start tracking your
 finances.
 </p>
 <ul className="mt-3 space-y-1 text-sm text-purple-100">
 <li>- Salary / Savings bank account</li>
 <li>- Credit / Debit card</li>
 <li>- UPI wallet or Cash</li>
 </ul>
 </div>
 <button
 onClick={() => setCurrentPage("add-account")}
 className="shrink-0 mt-1 bg-white text-purple-700 hover:bg-purple-50 font-semibold text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
 >
 + Add Account
 </button>
 </div>
 </motion.div>
 )}

 
 {!isDesktop && (
 <>
 <div
 ref={mobileCarouselRef}
 className="flex overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide touch-scroll"
 >
 {filteredAccounts.map((account) => {
 const isActive = selectedAccountId === account.id;
 return (
 <div
 key={account.id}
 ref={(el) => { if (el) mobileCardRefs.current[account.id!] = el; }}
 className="snap-start shrink-0 w-screen px-4 [scroll-snap-stop:always]"
 >
 <div
 className={cn(
 'transition-all duration-300 ease-in-out',
 isActive ? 'scale-100 opacity-100' : 'scale-95 opacity-70'
 )}
 >
 <Card
 variant={isActive ?"flat" :"default"}
 className={cn(
"w-full h-[200px] sm:h-[215px] relative overflow-hidden shrink-0 transition-all duration-300 rounded-[30px] cursor-pointer outline-none focus:ring-0",
 isActive
 ?"border-0 shadow-[0_20px_50px_rgba(91,33,182,0.4)]"
 :"shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]",
 !account.isActive &&"opacity-60 grayscale",
 )}
 onClick={() => handleCardClick(account.id!)}
 tabIndex={-1}
 >
 {/* Card gradient background */}
 {isActive && (
 <div className="absolute inset-0">
 <div
 className={cn(
"absolute inset-0 transition-colors duration-500",
 getCardStyle(account).bgClass
 )}
 style={getCardStyle(account).background ? { backgroundColor: getCardStyle(account).background } : {}}
 />
 {/* Glowing orbs */}
 <div className="absolute -top-12 -right-12 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl" />
 <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-blue-600/25 rounded-full blur-3xl" />
 <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-pink-500/20 rounded-full blur-2xl" />
 {/* Shimmer diagonal lines */}
 <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 210" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
 <line x1="-50" y1="280" x2="350" y2="-80" stroke="white" strokeOpacity="0.04" strokeWidth="40" />
 <line x1="50" y1="280" x2="450" y2="-80" stroke="white" strokeOpacity="0.03" strokeWidth="30" />
 </svg>
 </div>
 )}

 <div className="relative z-10 p-5 sm:p-6 h-full flex flex-col">
 {/* Top row */}
 <div className="flex justify-between items-start mb-auto">
 <div className="flex items-center gap-2.5">
 <div className={cn(
"w-7 h-7 rounded-full flex items-center justify-center",
 isActive ?"bg-white/10 text-white/80" :"bg-gray-100 text-gray-500"
 )}>
 <div className="scale-[0.7]">{getAccountIcon(account.type)}</div>
 </div>
 <div className="drop-shadow-md rounded-lg overflow-hidden">
 {getBankCardLogo(account.name, isActive, 'sm')}
 </div>
 </div>

 {/* Right: actions or network logo */}
 <div className="flex items-center gap-1.5">
 {isActive ? (
 <>
 <button
 onClick={(e) => handleEditAccount(account, e)}
 className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90 border border-white/10"
 aria-label={`Edit ${account.name} account`}
 title="Edit"
 ><Edit2 size={11} /></button>
 <button
 onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id!, account.name); }}
 className="w-7 h-7 flex items-center justify-center rounded-full bg-red-500/40 hover:bg-red-500/70 text-white transition-all active:scale-90 border border-red-400/20"
 aria-label={`Delete ${account.name} account`}
 title="Delete"
 ><Trash2 size={11} /></button>
 </>
 ) : (
 /* Mastercard-style rings for inactive */
 <div className="flex -space-x-2 opacity-40">
 <div className="w-7 h-7 rounded-full border-2 border-gray-400 bg-gray-300" />
 <div className="w-7 h-7 rounded-full border-2 border-gray-400 bg-gray-200" />
 </div>
 )}
 </div>
 </div>
 
 <div className="flex justify-between items-end mt-auto pt-3">
 <div className="min-w-0 pr-2">
 <h3 className={cn(
"font-black text-xl sm:text-2xl tracking-tight truncate max-w-[180px] sm:max-w-[240px]",
 isActive ?"text-white" :"text-slate-900"
 )}>
 {account.name}
 </h3>
 <div className="flex items-center gap-2 mt-1">
 <p className={cn(
"text-sm font-bold",
 isActive ?"text-white/80" :"text-slate-600"
 )}>
 {formatCurrency(account.balance)}
 </p>
 </div>
 </div>

 {/* Network Logo at bottom right */}
 {isActive && account.subType && (
 <div className="absolute bottom-4 right-4 pointer-events-none opacity-80 scale-75 origin-bottom-right">
 <CardNetworkLogo network={account.subType} />
 </div>
 )}

 <div className="flex gap-1.5 flex-shrink-0">
 <Button size="sm"
 onClick={(e) => {
 e.stopPropagation();
 setActiveCardAccountId(account.id!);
 setShowTransactionTypeModal(true);
 }}
 className="inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none font-display tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xl shadow-lg bg-black text-white hover:bg-gray-900 text-xs h-8 px-3">
 <Plus size={11} className="mr-0.5" />Add
 </Button>
 {(account.type === 'bank' || account.type === 'card') && (
 <Button size="sm"
 onClick={(e) => { e.stopPropagation(); setStatementImportOpen({ accountId: account.id!, accountName: account.name, accountType: account.type }); }}
 className={cn(
"h-7 px-2.5 rounded-full text-[10px] font-semibold",
 isActive
 ?"bg-white/20 hover:bg-white/30 text-white border border-white/20"
 :"bg-blue-600 text-white hover:bg-blue-700"
 )}>
 <Upload size={11} className="mr-0.5" />Import
 </Button>
 )}
 </div>
 </div>
 </div>
 </Card>
 </div>
 </div>
 );
 })}
 </div>
 
 
 {filteredAccounts.length > 1 && (
 <motion.div 
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 className="flex flex-col items-center justify-center -mt-1 mb-5"
 >
 <div className="flex gap-2 justify-center items-center h-5 mb-1.5">
 {filteredAccounts.map((account) => (
 <button
 key={`dot-mobile-${account.id}`}
 onClick={() => handleCardClick(account.id!)}
 className={cn(
"appearance-none border-0 outline-none shadow-none rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 m-0 p-0 min-w-0 min-h-0 leading-none",
 selectedAccountId === account.id 
 ?"!w-10 !h-2.5 bg-gradient-to-r from-pink-500 to-rose-500"
 :"!w-2.5 !h-2.5 bg-gray-300 hover:bg-gray-400"
 )}
 type="button"
 aria-label={`Go to account ${account.name}`}
 title={`Go to account ${account.name}`}
 />
 ))}
 </div>
 <div className="flex items-center text-[10px] text-gray-400 font-medium tracking-[0.22em] uppercase">
 <span className="animate-[pulse_2s_ease-in-out_infinite] mr-2"></span> 
 Swipe to explore 
 <span className="animate-[pulse_2s_ease-in-out_infinite] ml-2">'</span>
 </div>
 </motion.div>
 )}

 </>
 )}

 
 {isDesktop && (
 <>
 <div className="relative">
 {/* Carousel Container */}
 <div
 ref={carouselRef}
 className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide scroll-smooth touch-scroll [scroll-padding-left:50%] [scroll-padding-right:50%]"
 >
 {/* Left spacer EUR" allows first card to snap to center */}
 <div
 className="shrink-0 w-[calc(50%-210px)] min-w-8"
 aria-hidden
 />
 {filteredAccounts.map((account) => {
 const isActive = selectedAccountId === account.id;
 return (
 <div
 key={account.id}
 ref={(el) => {
 if (el) cardRefs.current[account.id!] = el;
 }}
 className="snap-center shrink-0 [scroll-snap-align:center] [scroll-snap-stop:always]"
 >
 <div
 className={cn(
 'transition-all duration-300 ease-in-out',
 isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-50'
 )}
 >
 <Card
 variant="flat"
 className={cn(
"w-[420px] h-[230px] relative overflow-hidden shrink-0 transition-all duration-300 rounded-[24px] cursor-pointer group outline-none focus:ring-0",
 isActive
 ?"border-0 shadow-[0_24px_60px_rgba(91,33,182,0.4)]"
 :"bg-white border border-gray-200 shadow-[0_4px_20px_rgba(0,0,0,0.07)]",
 !account.isActive &&"opacity-60 grayscale",
 )}
 onClick={() => handleCardClick(account.id!)}
 tabIndex={-1}
 >
 {/* Gradient background */}
 {isActive && (
 <div className="absolute inset-0">
 <div
 className={cn(
"absolute inset-0 transition-colors duration-500",
 getCardStyle(account).bgClass
 )}
 style={getCardStyle(account).background ? { backgroundColor: getCardStyle(account).background } : {}}
 />
 <div className="absolute -top-16 -right-16 w-56 h-56 bg-purple-500/25 rounded-full blur-3xl" />
 <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl" />
 <div className="absolute top-1/2 right-1/3 w-28 h-28 bg-pink-500/15 rounded-full blur-2xl" />
 <svg className="absolute inset-0 w-full h-full" viewBox="0 0 420 230" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
 <line x1="-60" y1="330" x2="400" y2="-100" stroke="white" strokeOpacity="0.04" strokeWidth="50" />
 <line x1="60" y1="330" x2="520" y2="-100" stroke="white" strokeOpacity="0.03" strokeWidth="35" />
 </svg>
 </div>
 )}

 <div className="relative z-10 p-6 h-full flex flex-col">
 {/* Top row */}
 <div className="flex justify-between items-start">
 <div className="flex items-center gap-3">
 <div className={cn(
"w-9 h-9 rounded-full flex items-center justify-center",
 isActive ?"bg-white/10 text-white/80" :"bg-gray-100 text-gray-500"
 )}>
 <div className="p-1 rounded-lg bg-white/10 backdrop-blur-md">
 {getAccountIcon(account.type)}
 </div>
 </div>
 <div className="drop-shadow-lg rounded-lg overflow-hidden">
 {getBankCardLogo(account.name, isActive, 'md')}
 </div>
 </div>

 <div className="flex items-center gap-2">
 {isActive ? (
 <>
 <motion.span
 initial={{ opacity: 0, scale: 0.8 }}
 animate={{ opacity: 1, scale: 1 }}
 className="text-[10px] font-bold tracking-widest text-emerald-300 border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 rounded-full"
 >
 - ACTIVE
 </motion.span>
 <button
 onClick={(e) => handleEditAccount(account, e)}
 className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90 border border-white/10"
 aria-label={`Edit ${account.name} account`}
 title="Edit"
 ><Edit2 size={13} /></button>
 <button
 onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id!, account.name); }}
 className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/40 hover:bg-red-500/70 text-white transition-all active:scale-90 border border-red-400/20"
 aria-label={`Delete ${account.name} account`}
 title="Delete"
 ><Trash2 size={13} /></button>
 </>
 ) : (
 <div className="flex -space-x-3 opacity-30">
 <div className="w-9 h-9 rounded-full border-2 border-gray-400 bg-gray-300" />
 <div className="w-9 h-9 rounded-full border-2 border-gray-400 bg-gray-200" />
 </div>
 )}
 </div>
 </div>

 {/* Balance */}
 <div className="mt-4">
 <p className={cn(
"text-[10px] font-semibold tracking-[0.22em] uppercase mb-1",
 isActive ?"text-white/45" :"text-gray-400"
 )}>Balance</p>
 <p className={cn(
"text-[32px] font-bold tracking-tight leading-none",
 isActive ?"text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]" :"text-gray-900"
 )}>
 {formatCurrency(account.balance)}
 </p>
 </div>

 {/* Bottom: name + buttons */}
 <div className="flex justify-between items-end mt-auto">
 <div className="min-w-0 pr-4">
 <p className={cn(
"text-[9px] font-semibold tracking-[0.18em] uppercase mb-0.5",
 isActive ?"text-white/45" :"text-gray-400"
 )}>Account Holder</p>
 <h3 className={cn(
"font-semibold text-lg tracking-wide truncate max-w-[200px]",
 isActive ?"text-white" :"text-gray-800"
 )}>{account.name}</h3>
 </div>

 {/* Network logo at bottom right (Desktop) */}
 {isActive && account.subType && (
 <div className="ml-auto mr-4 mb-1 opacity-90 scale-110">
 <CardNetworkLogo network={account.subType} />
 </div>
 )}

 <div className="flex gap-2 flex-shrink-0">
 <Button size="sm"
 onClick={(e) => {
 e.stopPropagation();
 setActiveCardAccountId(account.id!);
 setShowTransactionTypeModal(true);
 }}
 className="inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none font-display tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xl shadow-lg bg-black text-white hover:bg-gray-900 text-xs sm:text-sm h-9 sm:h-10 px-3 sm:px-4">
 <Plus size={13} className="mr-1" />Add
 </Button>
 {(account.type === 'bank' || account.type === 'card') && (
 <Button size="sm"
 onClick={(e) => { e.stopPropagation(); setStatementImportOpen({ accountId: account.id!, accountName: account.name, accountType: account.type }); }}
 className={cn(
"h-7 px-2.5 rounded-full text-[10px] font-semibold",
 isActive
 ?"bg-white/20 hover:bg-white/30 text-white border border-white/20"
 :"bg-blue-600 text-white hover:bg-blue-700"
 )}>
 <Upload size={11} className="mr-0.5" />Import
 </Button>
 )}
 </div>
 </div>
 </div>
 </Card>
 </div>
 </div>
 );
 })}
 {/* Right spacer EUR" allows last card to snap to center */}
 <div
 className="shrink-0 w-[calc(50%-210px)] min-w-8"
 aria-hidden
 />
 </div>

 {/* Swipe Guide & Dot Indicators */}
 {filteredAccounts.length > 1 && (
 <motion.div 
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 className="flex flex-col items-center justify-center -mt-1 mb-6 md:mb-8"
 >
 <div className="flex gap-2 justify-center items-center h-5 mb-1.5">
 {filteredAccounts.map((account) => (
 <button
 key={`dot-${account.id}`}
 onClick={() => handleCardClick(account.id!)}
 className={cn(
"appearance-none border-0 outline-none shadow-none rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 m-0 p-0 min-w-0 min-h-0 leading-none",
 selectedAccountId === account.id 
 ?"!w-10 !h-2.5 bg-gradient-to-r from-pink-500 to-rose-500" 
 :"!w-2.5 !h-2.5 bg-gray-300 hover:bg-gray-400"
 )}
 type="button"
 aria-label={`Go to account ${account.name}`}
 title={`Go to account ${account.name}`}
 />
 ))}
 </div>
 <div className="flex items-center text-[10px] sm:text-xs text-gray-400 font-medium tracking-[0.22em] uppercase">
 <span className="animate-[pulse_2s_ease-in-out_infinite] mr-2"></span> 
 Swipe to explore 
 <span className="animate-[pulse_2s_ease-in-out_infinite] ml-2">'</span>
 </div>
 </motion.div>
 )}

 {/* Transaction History - Subscribed to Carousel Scroll */}
 <AnimatePresence mode="wait">
 {selectedAccount && (
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 20 }}
 className="mt-4 w-full px-2 sm:px-0"
 >
 <Card className="bg-white/80 backdrop-blur-xl border-white/60 overflow-hidden shadow-2xl">
 <div className="max-h-[400px] sm:max-h-[500px] overflow-y-auto">
 <table className="w-full">
 <thead className="bg-white/80 sticky top-0 z-10 backdrop-blur-sm">
 <tr>
 <th className="px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
 Date
 </th>
 <th className="px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
 Description
 </th>
 <th className="hidden md:table-cell px-8 py-5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
 Category
 </th>
 <th className="px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
 Amount
 </th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {accountTransactions.length > 0 ? (
 accountTransactions.map((t) => (
 <tr
 key={t.id}
 className="hover:bg-blue-50/50 transition-colors"
 >
 <td className="px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-5 text-xs sm:text-sm font-medium text-gray-500">
 {formatLocalDate(t.date,"en-US", {
 month:"short",
 day:"numeric",
 })}
 </td>
 <td className="px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-5 text-xs sm:text-sm font-bold text-gray-900">
 {t.description}
 </td>
 <td className="hidden md:table-cell px-8 py-5">
 <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white border border-gray-200 text-gray-700 shadow-sm">
 {t.category}
 </span>
 </td>
 <td
 className={cn(
"px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-5 text-xs sm:text-sm font-bold text-right",
 (t.type ==="income" || (t.type ==="transfer" && t.transferToAccountId === selectedAccountId))
 ?"text-emerald-600"
 :"text-gray-900",
 )}
 >
 {(t.type ==="income" || (t.type ==="transfer" && t.transferToAccountId === selectedAccountId)) ?"+" :"-"}
 {formatCurrency(t.amount)}
 </td>
 </tr>
 ))
 ) : (
 <tr>
 <td
 colSpan={4}
 className="px-3 sm:px-4 md:px-8 py-8 sm:py-12 md:py-16 text-center text-gray-500"
 >
 <div className="flex flex-col items-center justify-center opacity-50">
 <Receipt size={48} className="mb-4" />
 <p className="font-medium text-lg">
 No transactions found
 </p>
 <p className="text-sm">
 Start spending to see activity here!
 </p>
 </div>
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </Card>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </>
 )}
 
 <div className="lg:hidden mt-6">
 {selectedAccount && (
 <Card className="bg-white/80 backdrop-blur-xl border-white/60 overflow-hidden shadow-2xl">
 <div className="max-h-[400px] overflow-y-auto">
 <div className="block lg:hidden">
 {accountTransactions.length > 0 ? (
 accountTransactions.slice(0, 10).map((t) => (
 <div
 key={t.id}
 className="flex items-center justify-between gap-3 p-4 border-b border-gray-100 last:border-none hover:bg-white transition-colors"
 >
 <div className="flex items-center gap-3 min-w-0">
 <div
 className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.type ==="income" ?"bg-green-50 text-green-600" :"bg-red-50 text-red-600"}`}
 >
 {t.type ==="income" ? (
 <TrendingUp size={18} />
 ) : (
 <TrendingDown size={18} />
 )}
 </div>
 <div className="min-w-0">
 <p className="font-semibold text-gray-900 text-sm">
 {t.description}
 </p>
 <p className="text-xs text-gray-500 mt-0.5">
 {t.category} EUR{""}
 {formatLocalDate(t.date,"en-US", {
 day:"numeric",
 month:"short",
 })}
 </p>
 </div>
 </div>
 <span
 className={`font-semibold text-sm whitespace-nowrap flex-shrink-0 ${(t.type ==="income" || (t.type ==="transfer" && t.transferToAccountId === selectedAccountId)) ?"text-green-600" :"text-gray-900"}`}
 >
 {(t.type ==="income" || (t.type ==="transfer" && t.transferToAccountId === selectedAccountId)) ?"+" :"-"}
 {formatCurrency(t.amount)}
 </span>
 </div>
 ))
 ) : (
 <div className="p-8 text-center text-gray-400 text-sm">
 <Receipt size={48} className="mx-auto mb-4 opacity-50" />
 <p className="font-medium text-lg">
 No transactions found
 </p>
 <p className="text-sm">
 Start spending to see activity here!
 </p>
 </div>
 )}
 </div>
 </div>
 </Card>
 )}
 </div>
 </div>

 <DeleteConfirmModal
 isOpen={deleteModalOpen}
 title="Delete Account"
 message="This account will be permanently deleted. All associated transaction records will remain unchanged."
 itemName={accountToDelete?.name}
 isLoading={isDeleting}
 onConfirm={confirmDeleteAccount}
 onCancel={() => {
 setDeleteModalOpen(false);
 setAccountToDelete(null);
 }}
 />

 {/* Edit Account Modal */}
 <AnimatePresence>
 {editModalOpen && editingAccount && (
 <motion.div
 className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 >
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-black/60 backdrop-blur-sm"
 onClick={() => { setEditModalOpen(false); setEditingAccount(null); }}
 />
 {/* Sheet */}
 <motion.div
 className="relative bg-white rounded-t-[32px] sm:rounded-[32px] w-full sm:max-w-md shadow-2xl z-10 max-h-[90vh] flex flex-col overflow-hidden"
 initial={{ y:"100%", opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y:"100%", opacity: 0 }}
 transition={{ type: 'spring', damping: 25, stiffness: 200 }}
 >
 {/* Handle for mobile */}
 <div className="flex justify-center pt-4 pb-2 sm:hidden">
 <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
 </div>

 {/* Header */}
 <div className="flex items-center justify-between px-8 pt-4 pb-4 border-b border-slate-50">
 <div>
 <h2 className="text-xl font-black text-slate-900 tracking-tight">Edit Account</h2>
 <p className="text-xs text-slate-500 font-medium mt-0.5">Update your account details</p>
 </div>
 <button
 onClick={() => { setEditModalOpen(false); setEditingAccount(null); }}
 className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-90"
 >
 <X size={18} />
 </button>
 </div>

 {/* Scrollable Form Content */}
 <div className="px-8 pt-6 pb-32 space-y-6 overflow-y-auto scrollbar-hide">
 {/* Account Name */}
 <div className="space-y-2">
 <label className="block text-xs font-bold text-slate-900 ml-1 uppercase tracking-wider">Account Name</label>
 <input
 type="text"
 value={editingAccount.name}
 onChange={(e) => setEditingAccount(prev => prev ? { ...prev, name: e.target.value } : null)}
 className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 outline-none text-sm font-bold text-slate-900 transition-all"
 placeholder="e.g. HDFC Savings"
 />
 </div>

 {/* Account Type Grid Selector */}
 <div className="space-y-2">
 <label className="block text-xs font-bold text-slate-900 ml-1 uppercase tracking-wider">Account Type</label>
 <div className="grid grid-cols-2 gap-3">
 {[
 { id: 'bank', label: 'Bank', icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-50' },
 { id: 'card', label: 'Card', icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-50' },
 { id: 'wallet', label: 'Wallet', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
 { id: 'cash', label: 'Cash', icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' },
 ].map((type) => {
 const Icon = type.icon;
 const isSelected = editingAccount.type === type.id;
 return (
 <button
 key={type.id}
 onClick={() => setEditingAccount(prev => prev ? { ...prev, type: type.id } : null)}
 className={cn(
"flex items-center gap-3 p-3 rounded-2xl border-2 transition-all group relative overflow-hidden",
 isSelected 
 ?"bg-slate-900 border-slate-900 text-white shadow-md" 
 :"bg-white border-slate-100 text-slate-500 hover:border-slate-200"
 )}
 >
 <div className={cn(
"w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
 isSelected ?"bg-white/10" : type.bg
 )}>
 <Icon size={16} className={isSelected ?"text-white" : type.color} />
 </div>
 <span className="text-xs font-bold">{type.label}</span>
 </button>
 );
 })}
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 {/* Opening Balance */}
 <div className="space-y-2">
 <label className="block text-xs font-bold text-slate-900 ml-1 uppercase tracking-wider">Opening Balance ({currency})</label>
 <input
 type="number"
 value={editingAccount.openingBalance || ''}
 onChange={(e) => setEditingAccount(prev => prev ? { ...prev, openingBalance: parseFloat(e.target.value) || 0 } : null)}
 className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 outline-none text-sm font-bold text-slate-900 transition-all"
 placeholder="0.00"
 step="0.01"
 />
 </div>

 {/* Balance */}
 <div className="space-y-2">
 <label className="block text-xs font-bold text-slate-900 ml-1 uppercase tracking-wider">Current Balance ({currency})</label>
 <input
 type="number"
 value={editingAccount.balance}
 onChange={(e) => setEditingAccount(prev => prev ? { ...prev, balance: parseFloat(e.target.value) || 0 } : null)}
 className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 outline-none text-sm font-bold text-slate-900 transition-all"
 placeholder="0.00"
 step="0.01"
 />
 </div>
 </div>

 {/* Active toggle */}
 <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
 <div>
 <p className="text-sm font-bold text-slate-900">Active Account</p>
 <p className="text-[10px] text-slate-500 font-medium">Show this account in your portfolio</p>
 </div>
 <button
 onClick={() => setEditingAccount(prev => prev ? { ...prev, isActive: !prev.isActive } : null)}
 className={cn(
"relative w-12 h-6.5 rounded-full transition-all duration-300 shadow-inner",
 editingAccount.isActive ?"bg-slate-900" :"bg-slate-200"
 )}
 >
 <div
 className={cn(
"absolute top-1 left-1 w-4.5 h-4.5 bg-white rounded-full shadow-md transition-transform duration-300",
 editingAccount.isActive ?"translate-x-5.5" :"translate-x-0"
 )}
 />
 </button>
 </div>
 </div>

 {/* Fixed Actions Footer - Inside Modal but absolutely positioned */}
 <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/95 backdrop-blur-md border-t border-slate-50 z-20">
 <div className="flex gap-3">
 <button
 onClick={() => { setEditModalOpen(false); setEditingAccount(null); }}
 className="flex-1 py-4 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
 >
 Cancel
 </button>
 <button
 onClick={handleSaveEdit}
 disabled={isSavingEdit || !editingAccount.name.trim()}
 className="flex-[1.5] py-4 rounded-2xl bg-slate-900 text-white text-sm font-bold shadow-xl shadow-slate-900/20 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
 >
 {isSavingEdit ? (
 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 ) : (
 <>Save Changes</>
 )}
 </button>
 </div>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Statement Import Modal */}
 {statementImportOpen && (
 <StatementImport
 accountId={statementImportOpen.accountId}
 accountName={statementImportOpen.accountName}
 accountType={statementImportOpen.accountType}
 onSuccess={() => {
 setStatementImportOpen(null);
 window.location.reload();
 }}
 onCancel={() => setStatementImportOpen(null)}
 />
 )}

 {/* Transaction Type Picker Modal */}
 {showTransactionTypeModal && (
 <div
 className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6"
 onClick={() => setShowTransactionTypeModal(false)}
 >
 <motion.div
 initial={{ scale: 0.95, opacity: 0, y: 20 }}
 animate={{ scale: 1, opacity: 1, y: 0 }}
 exit={{ scale: 0.95, opacity: 0, y: 20 }}
 onClick={(event) => event.stopPropagation()}
 className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-6 sm:p-8 w-full max-w-md shadow-2xl border border-white/50 max-h-[calc(100vh-2rem)] overflow-y-auto"
 >
 <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-1">New Transaction</h3>
 <p className="text-slate-500 font-medium mb-8">What kind of transaction is this?</p>

 <div className="space-y-3">
 {[
 { type: 'expense', label: 'Expense', desc: 'Money spent', color: 'bg-rose-50 text-rose-700 hover:bg-rose-100', icon: ArrowDownLeft },
 { type: 'income', label: 'Income', desc: 'Money received', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', icon: ArrowUpRight },
 { type: 'transfer', label: 'Transfer', desc: 'Move between accounts', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100', icon: Repeat2 },
 ].map((opt) => (
 <button
 key={opt.type}
 onClick={() => {
 setShowTransactionTypeModal(false);
 if (activeCardAccountId) {
 localStorage.setItem('quickAccountId', String(activeCardAccountId));
 }
 if (opt.type === 'transfer') {
 setCurrentPage('transfer');
 } else {
 localStorage.setItem('quickFormType', opt.type);
 setCurrentPage('add-transaction');
 }
 }}
 className={cn(
"w-full p-4 flex items-center gap-4 rounded-2xl transition-all border border-transparent hover:scale-[1.02] active:scale-[0.98]",
 opt.color
 )}
 >
 <div className="w-12 h-12 bg-white/80 rounded-xl flex items-center justify-center shadow-sm shrink-0">
 <opt.icon size={22} />
 </div>
 <div className="text-left">
 <p className="font-bold text-lg leading-tight">{opt.label}</p>
 <p className="text-sm opacity-80 font-medium leading-tight">{opt.desc}</p>
 </div>
 </button>
 ))}
 </div>

 <Button
 variant="ghost"
 className="w-full mt-6 rounded-xl hover:bg-slate-100 text-slate-500 font-bold"
 onClick={() => setShowTransactionTypeModal(false)}
 >
 Cancel
 </Button>
 </motion.div>
 </div>
 )}
 </CenteredLayout>
 );
};




