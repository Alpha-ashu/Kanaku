
import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { ChevronLeft, Loader2, TrendingUp, TrendingDown, Sparkles, ArrowLeft, Check, Weight, Shield, MapPin, Search, Calendar, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { takeVoiceDraft, VOICE_INVESTMENT_DRAFT_KEY, type VoiceInvestmentDraft } from '@/lib/voiceDrafts';

import '@/styles/premium-transactions.css';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';

// --- Constants ---
const GOLD_TYPES = [
 { id: 'gold', label: 'Pure Gold', icon: '' },
 { id: 'jewelry', label: 'Jewelry', icon: '' },
 { id: 'coin', label: 'Gold Coin', icon: '' },
] as const;

const PURITY_PRESETS = [
 { label: '24K', value: 99.9 },
 { label: '22K', value: 91.67 },
 { label: '18K', value: 75 },
 { label: '14K', value: 58.5 },
];

const UNIT_OPTIONS = [
 { value: 'gram', label: 'Gram' },
 { value: 'ounce', label: 'Ounce' },
 { value: 'kg', label: 'Kilogram' },
];

export const AddGold: React.FC = () => {
 const { setCurrentPage, currency, refreshData } = useApp();
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [formData, setFormData] = useState({
 type: 'gold' as 'gold' | 'jewelry' | 'coin',
 quantity: 0,
 unit: 'gram' as 'gram' | 'ounce' | 'kg',
 purchasePrice: 0,
 currentPrice: 0,
 purchaseDate: new Date().toISOString().split('T')[0],
 purityPercentage: 99.9,
 location: 'safe-deposit-box',
 certificateNumber: '',
 notes: '',
 });

 useEffect(() => {
 const draft = takeVoiceDraft<VoiceInvestmentDraft>(VOICE_INVESTMENT_DRAFT_KEY);
 if (draft) {
 setFormData(prev => ({ ...prev, purchasePrice: draft.amount || 0, notes: draft.description || '' }));
 }
 }, []);

 const totalValue = formData.quantity * formData.currentPrice;
 const totalInvestment = formData.quantity * formData.purchasePrice;
 const gainLoss = totalValue - totalInvestment;
 const gainPct = totalInvestment > 0 ? (gainLoss / totalInvestment) * 100 : 0;
 const hasGain = gainLoss >= 0;

 const handleSubmit = async () => {
 if (formData.quantity <= 0) { toast.error('Enter quantity'); return; }
 if (formData.purchasePrice <= 0) { toast.error('Enter purchase price'); return; }
 
 setIsSubmitting(true);
 try {
 await backendService.createGold({
 ...formData,
 purchaseDate: new Date(formData.purchaseDate),
 createdAt: new Date(),
 updatedAt: new Date(),
 });
 toast.success('Gold entry added');
 refreshData();
 setCurrentPage('investments');
 } catch (e) {
 toast.error('Failed to save entry');
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div className="flex flex-col min-h-screen bg-white">

 {/* Header */}
 <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('investments')} className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ArrowLeft size={20} />
 </button>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Add Gold Asset</h1>
 </div>
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('investments')} className="hidden sm:block text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest px-4">Cancel</button>
 <button 
 onClick={handleSubmit}
 disabled={isSubmitting || !formData.quantity}
 className="bg-amber-500 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-600 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
 >
 {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
 Save Gold
 </button>
 </div>
 </div>
 </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 pb-32 lg:pb-5">
 
 {/* Left Column: context (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-3 lg:overflow-y-auto">
 <div className="premium-glass-card p-4 space-y-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">1. Gold Category</label>
 <div className="grid grid-cols-3 gap-2">
 {GOLD_TYPES.map(t => (
 <button key={t.id} onClick={() => setFormData(prev => ({ ...prev, type: t.id as any }))} className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all", formData.type === t.id ?"bg-amber-500 text-white shadow-lg shadow-amber-100" :"bg-slate-50 text-slate-400 hover:bg-slate-100")}>
 <span className="text-xl">{t.icon}</span>
 <span className="text-[9px] font-black uppercase tracking-tighter">{t.label}</span>
 </button>
 ))}
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">2. Purity Profile</label>
 <div className="flex gap-2">
 <div className="flex-1 grid grid-cols-4 gap-1.5">
 {PURITY_PRESETS.map(p => (
 <button key={p.label} onClick={() => setFormData(prev => ({ ...prev, purityPercentage: p.value }))} className={cn("py-2 rounded-lg text-[9px] font-black uppercase transition-all", formData.purityPercentage === p.value ?"bg-slate-900 text-white" :"bg-slate-50 text-slate-400")}>
 {p.label}
 </button>
 ))}
 </div>
 <div className="w-20 relative">
 <input type="number" value={formData.purityPercentage} onChange={e => setFormData(prev => ({ ...prev, purityPercentage: parseFloat(e.target.value) || 0 }))} className="w-full h-full bg-slate-50 border-none rounded-lg text-center font-black text-[10px]" />
 <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-300">%</span>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4 pt-2">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Storage Location</label>
 <div className="relative">
 <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input type="text" value={formData.location} onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" placeholder="Locker, Safe..." />
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Purchase Date</label>
 <div className="relative">
 <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input type="date" value={formData.purchaseDate} onChange={e => setFormData(prev => ({ ...prev, purchaseDate: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs" />
 </div>
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Certificate / Notes</label>
 <textarea value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs min-h-[60px] resize-none" placeholder="Cert #12345..." />
 </div>
 </div>
 
 <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0"><Shield size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Purity Verification</p>
 <p className="text-[10px] font-bold text-amber-900/60">Enter accurate purity for correct valuation.</p>
 </div>
 </div>
 </div>

 {/* Right Column: Financials (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-3 lg:overflow-y-auto">
 
 {/* Main Financial Input Card */}
 <div className="premium-glass-card p-6 bg-white relative overflow-hidden flex flex-col items-center">
 <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full" />
 <div className="flex items-center gap-3 mb-4">
 {UNIT_OPTIONS.map(u => (
 <button key={u.value} onClick={() => setFormData(prev => ({ ...prev, unit: u.value as any }))} className={cn("px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all", formData.unit === u.value ?"bg-slate-900 text-white" :"bg-slate-50 text-slate-400")}>{u.label}</button>
 ))}
 </div>
 <div className="flex flex-col items-center">
 <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">Weight ({formData.unit})</span>
 <input 
 type="number" 
 value={formData.quantity || ''} 
 onChange={e => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
 className="bg-transparent text-5xl font-black text-slate-900 outline-none w-full text-center tracking-tighter" 
 placeholder="0.00"
 />
 </div>
 </div>

 <div className="premium-glass-card p-4 space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Buy Price / {formData.unit}</label>
 <div className="relative">
 <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">{currency}</span>
 <input type="number" value={formData.purchasePrice || ''} onChange={e => setFormData(prev => ({ ...prev, purchasePrice: parseFloat(e.target.value) || 0 }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-8 pr-3 font-bold text-xs" />
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Live Price / {formData.unit}</label>
 <div className="relative">
 <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">{currency}</span>
 <input type="number" value={formData.currentPrice || ''} onChange={e => setFormData(prev => ({ ...prev, currentPrice: parseFloat(e.target.value) || 0 }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-8 pr-3 font-bold text-xs" />
 </div>
 </div>
 </div>

 {/* Gain/Loss Preview */}
 {formData.quantity > 0 && formData.purchasePrice > 0 && (
 <div className={cn("p-4 rounded-2xl flex items-center justify-between", hasGain ?"bg-emerald-500 text-white shadow-lg shadow-emerald-100" :"bg-rose-500 text-white shadow-lg shadow-rose-100")}>
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
 {hasGain ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
 </div>
 <div>
 <p className="text-[8px] font-black uppercase opacity-60">Value Gain</p>
 <p className="text-xl font-black tracking-tighter">{currency} {Math.abs(gainLoss).toLocaleString()}</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black uppercase opacity-60">Performance</p>
 <p className="text-xs font-black">{hasGain ? '+' : '-'}{Math.abs(gainPct).toFixed(1)}%</p>
 </div>
 </div>
 )}
 </div>

 {/* Final Investment Summary Footer */}
 <div className="mt-auto p-4 bg-amber-500 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-amber-100">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><Sparkles size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-white/60 uppercase">Total Gold Asset</p>
 <p className="text-[10px] font-black truncate max-w-[120px]">{formData.quantity} {formData.unit}s</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black text-white/60 uppercase">Market Value</p>
 <p className="text-lg font-black tracking-tighter">{currency} {(formData.quantity * (formData.currentPrice || formData.purchasePrice)).toLocaleString()}</p>
 </div>
 </div>
 </div>
 </main>
 <FloatingSaveBar
   onSave={handleSubmit}
   onDiscard={() => setCurrentPage('investments')}
   isSaving={isSubmitting}
   saveLabel="Add Gold Asset"
   accentClass="from-amber-500 to-amber-600"
 />
 </div>
 );
};
