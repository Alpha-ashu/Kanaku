
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { saveAccountWithBackendSync } from '@/lib/auth-sync-integration';
import { Wallet, Landmark, CreditCard, Banknote, Smartphone, Check, ArrowLeft, Globe2, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { BankLogo } from '@/app/components/ui/BankLogo';
import { BANKS_BY_COUNTRY } from '@/constants/banks';
import { cn } from '@/lib/utils';

import '@/styles/premium-transactions.css';

// --- Constants ---
const accountTypes = [
 { id: 'bank', label: 'Bank', icon: Landmark },
 { id: 'card', label: 'Credit Card', icon: CreditCard },
 { id: 'cash', label: 'Cash', icon: Banknote },
 { id: 'wallet', label: 'Wallet', icon: Wallet },
];

const CARD_NETWORKS = [
 { id: 'visa', label: 'Visa', color: 'text-blue-600' },
 { id: 'mastercard', label: 'Mastercard', color: 'text-orange-500' },
 { id: 'rupay', label: 'RuPay', color: 'text-blue-800' },
 { id: 'amex', label: 'Amex', color: 'text-sky-500' },
 { id: 'diners', label: 'Diners Club', color: 'text-indigo-900' },
];

const WalletLogo: React.FC<{ wallet: string }> = ({ wallet }) => {
 switch (wallet.toLowerCase()) {
 case 'paytm':
 return <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-black text-[#002E6E]">Pay</span><span className="text-[10px] font-black text-[#00BAF2]">tm</span></div>;
 case 'phonepe':
 return <div className="w-full h-full flex items-center justify-center bg-[#5f259f] rounded-lg text-white font-black text-[8px]">PhonePe</div>;
 case 'google pay':
 return <div className="flex items-center gap-0.5 font-bold text-[10px]"><span className="text-blue-500">G</span><span className="text-red-500">P</span><span className="text-yellow-500">a</span><span className="text-green-500">y</span></div>;
 case 'amazon pay':
 return <div className="flex flex-col items-center bg-[#232F3E] px-2 py-1 rounded text-white italic font-black text-[7px]">amazon<span className="text-orange-400 not-italic">pay</span></div>;
 case 'apple pay':
 return <div className="flex items-center gap-1 font-bold text-black"><div className="w-3 h-3 bg-black rounded-full" /><span className="text-[10px]">Pay</span></div>;
 case 'samsung pay':
 return <div className="text-[#034ea2] font-black text-[10px] italic">SAMSUNG <span className="not-italic font-bold">pay</span></div>;
 case 'mobikwik':
 return <div className="text-[#00529b] font-black text-[10px] italic">MobiKwik</div>;
 case 'freecharge':
 return <div className="text-[#ff5a5f] font-black text-[10px]">freecharge</div>;
 case 'airtel money':
 return <div className="text-red-600 font-black text-[9px]">airtel <span className="font-light">money</span></div>;
 default:
 return <Wallet size={16} className="text-slate-400" />;
 }
};

const INDIAN_WALLETS = [
 { name: 'Paytm', color: 'border-[#00BAF2]/20 hover:bg-[#00BAF2]/5' },
 { name: 'PhonePe', color: 'border-[#5f259f]/20 hover:bg-[#5f259f]/5' },
 { name: 'Google Pay', color: 'border-slate-200 hover:bg-slate-50' },
 { name: 'Amazon Pay', color: 'border-orange-200 hover:bg-orange-50' },
 { name: 'Apple Pay', color: 'border-black/20 hover:bg-black/5' },
 { name: 'Samsung Pay', color: 'border-[#034ea2]/20 hover:bg-[#034ea2]/5' },
 { name: 'Mobikwik', color: 'border-[#00529b]/20 hover:bg-[#00529b]/5' },
 { name: 'Freecharge', color: 'border-[#ff5a5f]/20 hover:bg-[#ff5a5f]/5' },
 { name: 'Airtel Money', color: 'border-red-200 hover:bg-red-50' },
 { name: 'Others', color: 'border-slate-100 hover:bg-slate-50' },
];

const QUICK_BALANCE_PRESETS = [0, 1000, 5000, 10000];

// --- Components ---
const CardNetworkLogo: React.FC<{ network: string }> = ({ network }) => {
 switch (network) {
 case 'visa':
 return <span className="text-[10px] font-black italic text-blue-700 tracking-tighter">VISA</span>;
 case 'mastercard':
 return (
 <div className="flex -space-x-1.5">
 <div className="w-3 h-3 rounded-full bg-[#EB001B] opacity-90" />
 <div className="w-3 h-3 rounded-full bg-[#F79E1B] opacity-90" />
 </div>
 );
 case 'rupay':
 return (
 <div className="flex items-center">
 <span className="text-[9px] font-black text-blue-800">Ru</span>
 <span className="text-[9px] font-black text-orange-500">Pay</span>
 </div>
 );
 case 'amex':
 return <div className="px-1 py-0.5 bg-sky-500 rounded-sm text-[7px] font-bold text-white leading-none">AMEX</div>;
 case 'diners':
 return <div className="w-4 h-4 rounded-full border-2 border-indigo-900 flex items-center justify-center text-[6px] font-black text-indigo-900">D</div>;
 default:
 return <CreditCard size={14} />;
 }
};

export const AddAccount: React.FC = () => {
 const { setCurrentPage, currency, refreshData, accounts } = useApp();
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [formData, setFormData] = useState({
 name: '',
 balance: '',
 type: 'bank' as 'bank' | 'card' | 'cash' | 'wallet',
 subType: 'savings'
 });
 const [provider, setProvider] = useState('');
 const [userCountry, setUserCountry] = useState('India');
 const [selectedColor, setSelectedColor] = useState({ id: 'midnight', bg: 'bg-[#0F172A]', glow: 'bg-indigo-500/10' });

 const CARD_COLORS = [
 { id: 'midnight', bg: 'bg-[#0F172A]', glow: 'bg-indigo-500/10', color: '#0F172A' },
 { id: 'emerald', bg: 'bg-[#064E3B]', glow: 'bg-emerald-500/10', color: '#064E3B' },
 { id: 'rose', bg: 'bg-[#4C0519]', glow: 'bg-rose-500/10', color: '#4C0519' },
 { id: 'amber', bg: 'bg-[#451A03]', glow: 'bg-amber-500/10', color: '#451A03' },
 { id: 'violet', bg: 'bg-[#2E1065]', glow: 'bg-violet-500/10', color: '#2E1065' },
 { id: 'blue', bg: 'bg-[#1E3A8A]', glow: 'bg-blue-500/10', color: '#1E3A8A' },
 ];

 useEffect(() => {
 try {
 const profile = JSON.parse(localStorage.getItem('user_profile') || '{}');
 if (profile?.country) setUserCountry(profile.country);
 } catch { }
 }, []);

 const bankOptions = useMemo(() => {
 const list = BANKS_BY_COUNTRY[userCountry] || BANKS_BY_COUNTRY['India'] || [];
 const base = list.map(b => ({
 value: b.name,
 label: b.name,
 description: b.type,
 icon: <BankLogo bank={b} size="xs" />
 }));
 return [...base, { value: 'Others', label: 'Others', description: 'Manually specify provider', icon: <Globe2 size={14} className="text-slate-400" /> }];
 }, [userCountry]);

 const walletOptions = useMemo(() => {
 const base = INDIAN_WALLETS.map(w => ({
 value: w.name,
 label: w.name,
 description: w.type,
 icon: <Wallet size={14} className="text-indigo-500" />
 }));
 return [...base, { value: 'Others', label: 'Others', description: 'Manually specify provider', icon: <Globe2 size={14} className="text-slate-400" /> }];
 }, []);

 const handleSubmit = async () => {
 const resolvedName = formData.name.trim() || (formData.type === 'cash' ? 'Cash Wallet' : provider);
 if (!resolvedName) { toast.error('Enter an account name'); return; }

 setIsSubmitting(true);
 try {
 await saveAccountWithBackendSync({
 name: resolvedName,
 type: formData.type,
 subType: formData.subType,
 colorId: selectedColor.id,
 customColor: selectedColor.id === 'custom' ? selectedColor.color : undefined,
 provider: provider || null,
 country: userCountry === 'Default' ? null : userCountry,
 openingBalance: parseFloat(formData.balance) || 0,
 balance: parseFloat(formData.balance) || 0,
 currency,
 isActive: true,
 updatedAt: new Date(),
 updatedBy: null, // Dexie handles this or auth-sync-integration
 });
 toast.success('Account created');
 refreshData();
 setCurrentPage('accounts');
 } catch (e) {
 toast.error('Failed to create account');
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div className="flex flex-col min-h-screen bg-white">

 {/* Header - Stays at top with Glassmorphism */}
 <header className="flex-shrink-0 px-4 lg:px-10 py-5 bg-white/80 backdrop-blur-2xl border-b border-slate-100/50 z-30 sticky top-0 shadow-sm shadow-slate-200/30">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('accounts')} className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ArrowLeft size={20} />
 </button>
 <div className="flex flex-col">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">New Account</h1>
 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 hidden sm:block">Configuration & Setup</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <button
 onClick={handleSubmit}
 disabled={isSubmitting}
 className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
 >
 {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
 Create Account
 </button>
 </div>
 </div>
 </header>

 {/* Main Single-Page Content Area - Flexible and Scrollable */}
 <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 xl:p-8 pb-32 lg:pb-8">
 <div className="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-12 items-start">

 {/* Left Column: Configuration (xl:col-7) */}
 <div className="xl:col-span-7 flex flex-col gap-6 order-2 xl:order-1 w-full">
 <div className="premium-glass-card p-4 space-y-4">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">1. Asset Type</label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
 {accountTypes.map(t => (
 <button key={t.id} onClick={() => setFormData(prev => ({ ...prev, type: t.id as any }))} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl transition-all", formData.type === t.id ?"bg-indigo-600 text-white shadow-lg shadow-indigo-100" :"bg-slate-50 text-slate-400 hover:bg-slate-100")}>
 <t.icon size={20} />
 <span className="text-[9px] font-black uppercase">{t.label}</span>
 </button>
 ))}
 </div>
 </div>

 {formData.type !== 'cash' && (
 <div className="space-y-4 pt-2">
 {formData.type !== 'wallet' && (
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">
 2. {formData.type === 'wallet' ? 'Wallet Provider' : 'Institution / Provider'}
 </label>

 <div className="w-full md:max-w-md">
 {(formData.type === 'bank' || formData.type === 'card') ? (
 <SearchableDropdown
 options={bankOptions}
 value={provider}
 onChange={(val) => {
 if (val === 'Others') setProvider('');
 else setProvider(val);
 }}
 placeholder={formData.type === 'card' ?"Search Issuing Bank..." :"Search Indian Banks..."}
 searchPlaceholder="e.g. HDFC, SBI..."
 className="w-full"
 renderTrigger={(selected) => (
 <div className="relative w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs flex items-center gap-2 cursor-pointer hover:bg-slate-100 transition-colors">
 <Landmark className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 {selected ? (
 <div className="flex items-center gap-2">
 {selected.icon}
 <span>{selected.label}</span>
 </div>
 ) : (
 <span className="text-slate-400">{formData.type === 'card' ? 'Select Issuing Bank' : 'Select Bank'}</span>
 )}
 </div>
 )}
 />
 ) : (
 <div className="relative">
 <Landmark className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input
 type="text"
 value={provider}
 onChange={e => setProvider(e.target.value)}
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs"
 placeholder="Bank or Wallet Name"
 />
 </div>
 )}
 </div>
 </div>
 )}

 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">3. Custom Label (Optional)</label>
 <div className="relative w-full md:max-w-md">
 <Wallet className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
 <input type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" placeholder="e.g. My Savings" />
 </div>
 </div>

 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full pt-2">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">
 4. {formData.type === 'card' ? 'Card Network' : formData.type === 'wallet' ? 'Select Wallet Brand' : 'Account Category'}
 </label>

 {formData.type === 'wallet' ? (
 <div className="grid grid-cols-5 sm:grid-cols-8 gap-1 pt-1 w-full md:max-w-md">
 {INDIAN_WALLETS.map(w => (
 <button
 key={w.name}
 onClick={() => {
 if (w.name === 'Others') setProvider('');
 else setProvider(w.name);
 setFormData(prev => ({ ...prev, subType: w.name.toLowerCase() }));
 }}
 className={cn(
"aspect-[4/3] flex flex-col items-center justify-center gap-2 rounded-2xl border-1 transition-all p-1",
 provider === w.name || (w.name === 'Others' && !provider)
 ?"bg-white border-indigo-500 shadow-md scale-105"
 : cn("bg-white border-transparent", w.color)
 )}
 >
 <div className="w-full flex-1 flex items-center justify-center overflow-hidden">
 <WalletLogo wallet={w.name} />
 </div>
 </button>
 ))}
 </div>
 ) : (
 <div className="flex flex-wrap gap-2 w-full md:w-auto">
 {formData.type === 'card' ? (
 CARD_NETWORKS.map(net => (
 <button
 key={net.id}
 onClick={() => setFormData(prev => ({ ...prev, subType: net.id }))}
 className={cn(
"flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black transition-all border",
 formData.subType === net.id
 ?"bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm"
 :"bg-white border-slate-100 text-slate-400 hover:border-slate-200"
 )}
 >
 <CardNetworkLogo network={net.id} />
 {net.label}
 </button>
 ))
 ) : (
 [
 { id: 'savings', label: 'Saving' },
 { id: 'current', label: 'Current' },
 { id: 'fd', label: 'FD' },
 { id: 'salary', label: 'Salary' },
 { id: 'joint', label: 'Joint' },
 ].map(st => (
 <button
 key={st.id}
 onClick={() => setFormData(prev => ({ ...prev, subType: st.id }))}
 className={cn(
"px-3 py-2 rounded-xl text-[10px] font-bold transition-all border",
 formData.subType === st.id
 ?"bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm"
 :"bg-white border-slate-100 text-slate-400 hover:border-slate-200"
 )}
 >
 {st.label}
 </button>
 ))
 )}
 </div>
 )}
 </div>
 </div>
 )}
 </div>

 </div>

 {/* Right Column: Financials (xl:col-5) */}
 <div className="xl:col-span-5 flex flex-col gap-6 order-1 xl:order-2 w-full">

 {/* Preview Card + Palette - Order 1 on Mobile, Order 2 on Desktop */}
 <div className="order-1 lg:order-2 flex flex-col gap-3">
 {/* Large Preview Card */}
 <div
 className={cn("p-8 rounded-[2.5rem] text-white relative overflow-hidden flex flex-col justify-between min-h-[240px] shadow-2xl shadow-indigo-500/20 group border border-white/5 transition-all duration-500", selectedColor.bg !== 'custom' ? selectedColor.bg :"")}
 style={selectedColor.bg === 'custom' ? { backgroundColor: selectedColor.color } : {}}
 >
 {/* Decorative Elements */}
 <div className={cn("absolute top-0 right-0 w-64 h-64 blur-[80px] rounded-full -mr-20 -mt-20 group-hover:opacity-100 transition-all duration-700 opacity-60", selectedColor.glow)} />
 <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 blur-[60px] rounded-full -ml-20 -mb-20" />

 {/* Card Pattern Overlay */}
 <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

 <div className="flex justify-between items-start relative z-10">
 <div className="flex flex-col gap-1.5">
 <div className="w-14 h-14 rounded-2xl bg-white/5 backdrop-blur-xl flex items-center justify-center border border-white/10 shadow-xl group-hover:scale-110 transition-transform duration-500">
 {React.createElement(accountTypes.find(t => t.id === formData.type)?.icon || Wallet, { size: 28, className:"text-indigo-300" })}
 </div>
 </div>

 {/* Chip Icon - Conditional */}
 {formData.type === 'card' && (
 <div className="w-12 h-9 bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 rounded-lg relative overflow-hidden shadow-lg border border-amber-500/20">
 <div className="absolute inset-0 opacity-40">
 <div className="absolute top-1/2 left-0 w-full h-[1px] bg-black/20" />
 <div className="absolute top-0 left-1/2 w-[1px] h-full bg-black/20" />
 <div className="absolute top-1/4 left-0 w-full h-[1px] bg-black/20" />
 <div className="absolute top-3/4 left-0 w-full h-[1px] bg-black/20" />
 </div>
 <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
 </div>
 )}
 </div>

 <div className="space-y-6 relative z-10">
 <div className="flex flex-col gap-1">
 <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Account / Institution</p>
 <p className="text-xl font-bold tracking-tight truncate max-w-[300px] text-white/90">
 {formData.name || provider || 'New Account'}
 </p>
 </div>

 <div className="flex justify-between items-end">
 <div className="space-y-1">
 <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Available Balance</p>
 <div className="flex items-baseline gap-2.5">
 <span className="text-lg font-black text-indigo-400">{currency}</span>
 <span className="text-4xl font-black tracking-tighter tabular-nums text-white">
 {Number(formData.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </span>
 </div>
 </div>

 <div className="flex flex-col items-end gap-2">
 <div className="flex items-center gap-2">
 <CardNetworkLogo network={formData.subType} />
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Color Palette Section */}
 <div className="premium-glass-card p-5 mt-2 relative overflow-hidden">
 {/* Hue Spectrum Indicator - Only visible when custom is active */}
 {selectedColor.id === 'custom' && (
 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 animate-pulse opacity-70" />
 )}
 
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full mb-6">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">Choose Card Aesthetic</label>
 <div className="flex flex-wrap items-center gap-3 md:gap-4">
 {CARD_COLORS.map(color => (
 <button
 key={color.id}
 type="button"
 onClick={() => setSelectedColor(color)}
 className={cn(
"w-10 h-10 md:w-12 md:h-12 rounded-full border-2 transition-all relative flex items-center justify-center shadow-sm hover:scale-105 active:scale-90",
 selectedColor.id === color.id ?"border-indigo-500 scale-110 shadow-lg shadow-indigo-500/20" :"border-white hover:border-slate-100"
 )}
 style={{ backgroundColor: color.color }}
 >
 {selectedColor.id === color.id && (
 <div className="w-2.5 h-2.5 bg-white rounded-full shadow-md z-10" />
 )}
 </button>
 ))}
 </div>
 </div>

 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
 <div className="flex items-center justify-between w-full md:w-auto gap-4">
 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Custom Spectrum</span>
 <div
 className="w-4 h-4 rounded-full shadow-sm border border-white shrink-0"
 style={{ backgroundColor: selectedColor.id === 'custom' ? selectedColor.color : '#6366f1' }}
 />
 </div>
 <div className="relative h-2 w-full max-w-md rounded-full bg-slate-100 group cursor-pointer">
 <input
 type="range"
 min="0"
 max="360"
 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
 onChange={(e) => {
 const hue = e.target.value;
 setSelectedColor({
 id: 'custom',
 bg: `custom`,
 glow: 'bg-white/10',
 color: `hsl(${hue}, 70%, 50%)`
 });
 }}
 />
 <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#ff0000] via-[#ffff00] via-[#00ff00] via-[#00ffff] via-[#0000ff] via-[#ff00ff] to-[#ff0000] z-10" />
 {/* Slider Thumb Replacement */}
 {selectedColor.id === 'custom' && (
 <div
 className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-indigo-500 shadow-lg z-30 pointer-events-none transition-all"
 style={{ left: `calc(${(parseInt(selectedColor.color.match(/\d+/)?.[0] || '0') / 360) * 100}% - 8px)` }}
 />
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Balance Input Card - Order 2 on Mobile, Order 1 on Desktop */}
 <div className="premium-glass-card p-8 bg-white/80 backdrop-blur-2xl relative overflow-hidden flex flex-col items-center order-2 lg:order-1 group border-indigo-50/50">
 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
 <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/5 blur-[50px] rounded-full group-hover:bg-indigo-500/10 transition-colors duration-700" />

 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full mb-6">
 <div className="flex flex-col">
 <span className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.3em]">Setup Initial Capital</span>
 <h3 className="text-sm font-bold text-slate-800">Opening Balance</h3>
 </div>
 <div className="h-px flex-1 bg-slate-100 hidden md:block mx-4" />
 <div className="flex items-center gap-2 text-slate-400">
 <Info size={14} />
 <span className="text-[10px] font-bold uppercase tracking-wider">Starting Amount</span>
 </div>
 </div>

 <div className="relative flex items-center justify-center w-full py-6 px-4 rounded-3xl bg-white border border-slate-100/50 group-focus-within:border-indigo-200 group-focus-within:bg-white transition-all duration-300">
 <div className="flex items-center justify-center gap-3 w-full max-w-full">
 <span className="text-xl md:text-2xl font-black text-indigo-300 select-none shrink-0">{currency}</span>
 <input
 type="number"
 value={formData.balance}
 onChange={e => setFormData(prev => ({ ...prev, balance: e.target.value }))}
 className="bg-transparent text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 outline-none w-full min-w-0 text-center tracking-tighter placeholder:text-slate-200"
 placeholder="0.00"
 autoFocus
 />
 </div>
 <div className="absolute inset-x-8 bottom-2 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/0 to-transparent group-focus-within:via-indigo-500/30 transition-all duration-500" />
 </div>

 <div className="w-full mt-8 flex flex-col gap-3">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
 <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 shrink-0">Quick Balance Presets</p>
 <div className="flex-1 h-[1px] bg-slate-100 hidden md:block" />
 <div className="text-[10px] font-bold text-indigo-500/60 uppercase tracking-widest hidden md:block">Add to balance</div>
 </div>
 <div className="flex justify-center gap-2">
 {QUICK_BALANCE_PRESETS.filter(p => p > 0).map(amt => (
 <button
 key={amt}
 onClick={() => setFormData(prev => ({ ...prev, balance: String((Number(prev.balance) || 0) + amt) }))}
 className="flex-1 px-4 py-3 bg-white border border-slate-100 rounded-2xl text-xs font-black text-slate-500 hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md hover:shadow-indigo-500/5 transition-all active:scale-95"
 >
 +{amt.toLocaleString()}
 </button>
 ))}
 </div>
 </div>

 </div>
 </div>
 </div>
 </main>
 </div>
 );
};
