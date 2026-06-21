
import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { db } from '@/lib/database';
import { 
 Edit2, Landmark, CreditCard, Banknote, Wallet, 
 ArrowLeft, Check, Save, X, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { updateAccountWithBackendSync } from '@/lib/auth-sync-integration';
import { setAccountTargetBalance } from '@/lib/transactionAggregation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const accountTypes = [
 { id: 'bank', label: 'Bank', icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-50' },
 { id: 'card', label: 'Card', icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-50' },
 { id: 'wallet', label: 'Wallet', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
 { id: 'cash', label: 'Cash', icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' },
];

const CARD_NETWORKS = [
 { id: 'visa', label: 'Visa' },
 { id: 'mastercard', label: 'Mastercard' },
 { id: 'rupay', label: 'RuPay' },
 { id: 'amex', label: 'Amex' },
];

const CARD_COLORS = [
 { id: 'blue', bg: 'bg-blue-600', label: 'Blue' },
 { id: 'purple', bg: 'bg-purple-600', label: 'Purple' },
 { id: 'emerald', bg: 'bg-emerald-600', label: 'Emerald' },
 { id: 'rose', bg: 'bg-rose-600', label: 'Rose' },
 { id: 'amber', bg: 'bg-amber-600', label: 'Amber' },
 { id: 'slate', bg: 'bg-slate-800', label: 'Dark' },
];

export const EditAccount: React.FC<{ accountId?: number }> = ({ accountId: propAccountId }) => {
 const { setCurrentPage, currency, refreshData, accounts } = useApp();
 const [account, setAccount] = useState<any>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const accountId = propAccountId || Number(localStorage.getItem('editAccountId'));

 useEffect(() => {
 if (!accountId) {
 setLoading(false);
 return;
 }
 db.accounts.get(accountId).then((acc) => {
 setAccount(acc);
 setLoading(false);
 });

 return () => {
 localStorage.removeItem('editAccountId');
 };
 }, [accountId]);

 const handleSubmit = async (e?: React.FormEvent) => {
 if (e) e.preventDefault();
 if (!account) return;

 if (!account.name.trim()) {
 toast.error('Account name is required');
 return;
 }

 setSaving(true);
 try {
 await updateAccountWithBackendSync(account.id, {
 name: account.name,
 type: account.type,
 balance: account.balance,
 subType: account.subType,
 colorId: account.colorId,
 });
 // Balance is derived (openingBalance + ledger). Anchor the opening balance
 // so the entered "Current Balance" resolves exactly under the derived model.
 await setAccountTargetBalance(account.id, account.balance);
 toast.success('Account updated successfully!');
 refreshData();
 setCurrentPage('accounts');
 } catch (error: any) {
 console.error('Failed to update account:', error);
 toast.error('Failed to update account');
 } finally {
 setSaving(false);
 }
 };

 if (loading) {
 return (
 <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
 <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
 <p className="text-slate-500 font-medium animate-pulse">Loading account details...</p>
 </div>
 );
 }

 if (!account) {
 return (
 <div className="flex flex-col items-center justify-center h-[80vh] p-6 text-center">
 <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
 <Info size={32} className="text-slate-400" />
 </div>
 <h3 className="text-xl font-bold text-slate-900">Account Not Found</h3>
 <p className="text-slate-500 mt-2 mb-6 max-w-xs">The account you're trying to edit doesn't exist or has been deleted.</p>
 <button data-testid="edit-account-go-back" 
 onClick={() => setCurrentPage('accounts')}
 className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
 >
 Go Back
 </button>
 </div>
 );
 }

 return (
 <div className="min-h-screen bg-white flex flex-col">
 {/* Header Section */}
 <div className="px-4 sm:px-6 lg:px-8 xl:px-12 pt-6 lg:pt-8 pb-4">
 <div className="flex items-center gap-4 mb-2">
 <button data-testid="edit-account-back"
 onClick={() => setCurrentPage('accounts')}
 title="Back"
 className="lg:!hidden p-2.5 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200 text-slate-600"
 >
 <ArrowLeft size={20} />
 </button>
 <div>
 <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Edit Account</h1>
 <p className="text-slate-500 font-medium text-sm sm:text-base">Update your payment source details</p>
 </div>
 </div>
 </div>

 {/* Main Content - Scrollable Area */}
 <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 xl:px-12 pb-48">
 <div className="max-w-3xl mx-auto space-y-6">
 
 {/* Visual Card Preview (Optional, but looks premium) */}
 <motion.div 
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className={cn(
"w-full h-48 sm:h-56 rounded-[32px] p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between text-white",
 account.colorId === 'blue' ? 'bg-gradient-to-br from-blue-600 to-indigo-700' :
 account.colorId === 'purple' ? 'bg-gradient-to-br from-purple-600 to-violet-700' :
 account.colorId === 'emerald' ? 'bg-gradient-to-br from-emerald-600 to-teal-700' :
 account.colorId === 'rose' ? 'bg-gradient-to-br from-rose-600 to-pink-700' :
 account.colorId === 'amber' ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
 account.colorId === 'slate' ? 'bg-gradient-to-br from-slate-700 to-slate-900' :
 account.type === 'bank' ? 'bg-gradient-to-br from-blue-600 to-indigo-700' :
 account.type === 'card' ? 'bg-gradient-to-br from-purple-600 to-violet-700' :
 account.type === 'wallet' ? 'bg-gradient-to-br from-emerald-600 to-teal-700' :
 'bg-gradient-to-br from-slate-700 to-slate-900'
 )}
 >
 <div className="absolute top-0 right-0 p-8 opacity-20">
 {account.type === 'bank' && <Landmark size={80} />}
 {account.type === 'card' && <CreditCard size={80} />}
 {account.type === 'wallet' && <Wallet size={80} />}
 {account.type === 'cash' && <Banknote size={80} />}
 </div>
 
 <div className="relative z-10">
 <p className="text-white/60 text-xs font-bold uppercase tracking-[0.2em] mb-1">Account Balance</p>
 <h2 className="text-3xl sm:text-4xl font-black tracking-tight">{currency} {account.balance?.toLocaleString() || '0'}</h2>
 </div>

 <div className="relative z-10 flex items-end justify-between">
 <div>
 <p className="text-white/60 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Account Name</p>
 <h3 className="text-lg font-bold truncate max-w-[200px]">{account.name || 'Untitled Account'}</h3>
 </div>
 <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-white/20">
 {account.type}
 </div>
 </div>
 </motion.div>

 {/* Edit Form Card */}
 <div className="bg-white rounded-[32px] border border-slate-200/60 p-6 sm:p-10 shadow-sm space-y-8">
 
 {/* Account Name */}
 <div className="space-y-3">
 <label className="block text-sm font-bold text-slate-900 ml-1">
 Account Name <span className="text-rose-500">*</span>
 </label>
 <div className="relative group">
 <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-slate-900">
 <Edit2 size={18} />
 </div>
 <input data-testid="edit-account-e-g-hdfc-salary"
 type="text"
 value={account.name}
 onChange={(e) => setAccount({ ...account, name: e.target.value })}
 placeholder="e.g. HDFC Salary Account"
 className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-bold text-slate-900 placeholder:text-slate-400"
 required
 />
 </div>
 </div>

 {/* Account Type Grid */}
 <div className="space-y-3">
 <label className="block text-sm font-bold text-slate-900 ml-1">
 Account Type
 </label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 {accountTypes.map((type) => {
 const Icon = type.icon;
 const isSelected = account.type === type.id;
 return (
 <button data-testid={`edit-account-button-${type.id}`}
 key={type.id}
 type="button"
 onClick={() => setAccount({ ...account, type: type.id })}
 className={cn(
"flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 group",
 isSelected 
 ?"bg-slate-900 border-slate-900 text-white shadow-lg scale-[1.02]" 
 :"bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50"
 )}
 >
 <div className={cn(
"w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
 isSelected ?"bg-white/10" : type.bg
 )}>
 <Icon size={20} className={isSelected ?"text-white" : type.color} />
 </div>
 <span className="text-xs font-bold uppercase tracking-wider">{type.label}</span>
 {isSelected && (
 <div className="absolute top-2 right-2">
 <Check size={12} className="text-white" />
 </div>
 )}
 </button>
 );
 })}
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {/* Opening Balance Input */}
 <div className="space-y-3">
 <label className="block text-sm font-bold text-slate-900 ml-1">
 Opening Balance
 </label>
 <div className="relative group">
 <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900 font-bold text-sm">
 {currency}
 </div>
 <input data-testid="edit-account-opening-balance"
 type="number"
 step="0.01"
 value={account.openingBalance || ''}
 onChange={(e) => setAccount({ ...account, openingBalance: parseFloat(e.target.value) || 0 })}
 aria-label="Opening balance"
 className="w-full pl-16 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-bold text-slate-900"
 />
 </div>
 </div>

 {/* Current Balance Input */}
 <div className="space-y-3">
 <label className="block text-sm font-bold text-slate-900 ml-1">
 Current Balance
 </label>
 <div className="relative group">
 <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900 font-bold text-sm">
 {currency}
 </div>
 <input data-testid="edit-account-current-balance"
 type="number"
 step="0.01"
 value={account.balance || ''}
 onChange={(e) => setAccount({ ...account, balance: parseFloat(e.target.value) || 0 })}
 aria-label="Current balance"
 className="w-full pl-16 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-bold text-slate-900"
 />
 </div>
 </div>
 </div>

 {/* Network & Design (Only for Card/Bank) */}
 {(account.type === 'card' || account.type === 'bank') && (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-3">
 <label className="block text-sm font-bold text-slate-900 ml-1">Payment Network</label>
 <div className="flex flex-wrap gap-2">
 {CARD_NETWORKS.map((network) => (
 <button data-testid={`edit-account-button-2-${network.id}`}
 key={network.id}
 type="button"
 onClick={() => setAccount({ ...account, subType: network.id })}
 className={cn(
"px-4 py-2 rounded-xl border-2 transition-all font-bold text-xs",
 account.subType === network.id 
 ?"bg-slate-900 border-slate-900 text-white" 
 :"bg-white border-slate-100 text-slate-500 hover:border-slate-200"
 )}
 >
 {network.label}
 </button>
 ))}
 </div>
 </div>

 <div className="space-y-3">
 <label className="block text-sm font-bold text-slate-900 ml-1">Card Theme</label>
 <div className="flex flex-wrap gap-3">
 {CARD_COLORS.map((color) => (
 <button data-testid={`edit-account-button-3-${color.id}`}
 key={color.id}
 type="button"
 onClick={() => setAccount({ ...account, colorId: color.id })}
 className={cn(
"w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center",
 color.bg,
 account.colorId === color.id ?"border-slate-900 ring-2 ring-slate-900/20" :"border-transparent"
 )}
 >
 {account.colorId === color.id && <Check size={14} className="text-white" />}
 </button>
 ))}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Floating Action Bar (Bottom Fixed) */}
 <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 sm:p-6 z-50">
 <div className="max-w-3xl mx-auto flex gap-3 sm:gap-4">
 <button data-testid="edit-account-button-4"
 type="button"
 onClick={() => setCurrentPage('accounts')}
 className="flex-1 sm:flex-none sm:px-10 py-4 border-2 border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
 >
 <X size={18} />
 <span>Cancel</span>
 </button>
 <button data-testid="edit-account-button-5"
 onClick={() => handleSubmit()}
 disabled={saving}
 className="flex-[2] sm:flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
 >
 {saving ? (
 <>
 <Loader2 size={18} className="animate-spin" />
 <span>Saving...</span>
 </>
 ) : (
 <>
 <Save size={18} />
 <span>Save Changes</span>
 </>
 )}
 </button>
 </div>
 </div>
 </div>
 );
};

const Loader2 = ({ size, className }: { size: number, className: string }) => (
 <svg 
 width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}
 >
 <path d="M21 12a9 9 0 1 1-6.219-8.56" />
 </svg>
);
