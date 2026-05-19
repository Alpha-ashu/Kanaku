
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/app/components/ui/button';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { backendService } from '@/lib/backend-api';
import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { db } from '@/lib/database';
import { TrendingUp, Loader2, RefreshCw, ChevronLeft, ArrowLeft, Check, Search, Calendar, Wallet, AlignLeft, Info, Plus, ArrowUpRight, BarChart3, Globe, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { searchStocks, fetchStockQuote, StockQuote, StockSearchResult, displaySymbol } from '@/lib/stockApi';
import { formatNativeMoney, getCurrencySymbol, normalizeCurrencyCode } from '@/lib/currencyUtils';
import { fetchCurrencyConversionRate } from '@/lib/investmentUtils';
import { inferInvestmentTypeFromText } from '@/lib/voiceExpenseParser';
import { takeVoiceDraft, VOICE_INVESTMENT_DRAFT_KEY, type VoiceInvestmentDraft } from '@/lib/voiceDrafts';

import '@/styles/premium-transactions.css';

// --- Constants ---
type InvestmentFormType = 'stocks' | 'bonds' | 'mutual-funds' | 'real-estate' | 'crypto' | 'other';

const INVESTMENT_TYPES = [
 { key: 'stocks', label: 'Stocks', icon: '' },
 { key: 'crypto', label: 'Crypto', icon: '' },
 { key: 'mutual-funds', label: 'Funds', icon: '' },
 { key: 'real-estate', label: 'Property', icon: '' },
 { key: 'bonds', label: 'Bonds', icon: '' },
 { key: 'other', label: 'Other', icon: '' },
];

const PENDING_INVESTMENT_DRAFT_KEY = 'pendingInvestmentDraft';

// --- Sub-components ---

const AssetTypeGrid = ({ 
 selectedType, 
 onSelect 
}: { 
 selectedType: string, 
 onSelect: (type: InvestmentFormType) => void 
}) => {
 return (
 <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-3 gap-2 max-h-[160px] overflow-y-auto no-scrollbar p-1">
 {INVESTMENT_TYPES.map(type => (
 <div 
 key={type.key}
 onClick={() => onSelect(type.key as InvestmentFormType)}
 className={cn(
"flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all cursor-pointer group",
 selectedType === type.key ?"bg-indigo-600 shadow-lg shadow-indigo-200" :"bg-slate-50 hover:bg-slate-100"
 )}
 >
 <div className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-lg", selectedType === type.key ?"bg-white/20" :"bg-white group-hover:bg-slate-50")}>
 {type.icon}
 </div>
 <span className={cn("text-[9px] font-black uppercase tracking-tight text-center leading-none", selectedType === type.key ?"text-white" :"text-slate-500")}>
 {type.label}
 </span>
 </div>
 ))}
 </div>
 );
};

export const AddInvestment: React.FC = () => {
 const { accounts, setCurrentPage, currency, refreshData } = useApp();
 const activeAccounts = accounts.filter(a => a.isActive);
 
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [formData, setFormData] = useState({
 name: '',
 type: 'stocks' as InvestmentFormType,
 quantity: 0,
 purchasePrice: 0,
 currentPrice: 0,
 date: new Date().toISOString().split('T')[0],
 broker: '',
 description: '',
 fundingAccountId: activeAccounts[0]?.id || 0,
 purchaseFees: 0,
 });

 const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
 const [searching, setSearching] = useState(false);
 const [showSuggestions, setShowSuggestions] = useState(false);
 const [fetchingPrice, setFetchingPrice] = useState(false);
 const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
 const [quoteSnapshot, setQuoteSnapshot] = useState<any>(null);
 const searchTimer = useRef<any>(null);

 const isMarketAsset = formData.type === 'stocks' || formData.type === 'crypto';
 const assetCurrencyCode = quoteSnapshot?.currencyCode || normalizeCurrencyCode(currency);
 const assetCurrency = getCurrencySymbol(assetCurrencyCode);
 const livePrice = quoteSnapshot?.currentPrice || formData.currentPrice;

 // Effects & Handlers
 useEffect(() => {
 const draft = takeVoiceDraft<VoiceInvestmentDraft>(VOICE_INVESTMENT_DRAFT_KEY);
 if (draft) {
 setFormData(prev => ({ ...prev, name: draft.description || '', purchasePrice: draft.amount || 0 }));
 }
 }, []);

 const handleSelectStock = async (stock: StockSearchResult) => {
 const nextType = stock.symbol.endsWith('-USD') ? 'crypto' : (formData.type === 'crypto' ? 'crypto' : 'stocks');
 setSelectedSymbol(stock.symbol);
 setFormData(prev => ({ ...prev, name: displaySymbol(stock.symbol), type: nextType }));
 setShowSuggestions(false);
 
 setFetchingPrice(true);
 try {
 const quote = await fetchStockQuote(stock.symbol, nextType === 'crypto' ? 'crypto' : undefined);
 if (quote) {
 setQuoteSnapshot({ currentPrice: quote.lastPrice, currencyCode: normalizeCurrencyCode(quote.currencyCode || quote.currency) });
 setFormData(prev => ({ ...prev, currentPrice: quote.lastPrice, purchasePrice: prev.purchasePrice || quote.lastPrice }));
 }
 } finally {
 setFetchingPrice(false);
 }
 };

 useEffect(() => {
 if (!isMarketAsset || !formData.name || formData.name.length < 2 || !showSuggestions) return;
 setSearching(true);
 if (searchTimer.current) clearTimeout(searchTimer.current);
 searchTimer.current = setTimeout(async () => {
 const results = await searchStocks(formData.name, formData.type === 'crypto' ? 'crypto' : undefined);
 setSearchResults(results);
 setSearching(false);
 }, 300);
 }, [formData.name, formData.type, isMarketAsset, showSuggestions]);

 const handleSubmit = async () => {
 if (!formData.name.trim()) { toast.error('Enter asset name'); return; }
 if (formData.quantity <= 0) { toast.error('Enter quantity'); return; }
 if (formData.purchasePrice <= 0) { toast.error('Enter purchase price'); return; }
 
 setIsSubmitting(true);
 try {
 // Map and Save logic preserved from original
 const assetTypeMap: any = { stocks: 'stock', crypto: 'crypto', bonds: 'other', 'mutual-funds': 'other', 'real-estate': 'other', other: 'other' };
 const buyFxRate = await fetchCurrencyConversionRate(assetCurrencyCode, currency);
 const totalPurchaseCost = (formData.purchasePrice * formData.quantity * buyFxRate) + formData.purchaseFees;

 const saved = await backendService.createInvestment({
 assetType: assetTypeMap[formData.type],
 assetName: selectedSymbol || formData.name,
 quantity: formData.quantity,
 buyPrice: formData.purchasePrice,
 currentPrice: livePrice,
 totalInvested: totalPurchaseCost,
 currentValue: livePrice * formData.quantity * buyFxRate,
 profitLoss: (livePrice * formData.quantity * buyFxRate) - totalPurchaseCost,
 purchaseDate: new Date(formData.date),
 lastUpdated: new Date(),
 updatedAt: new Date(),
 broker: formData.broker,
 description: formData.description,
 assetCurrency: assetCurrencyCode,
 baseCurrency: currency,
 buyFxRate,
 fundingAccountId: formData.fundingAccountId,
 purchaseFees: formData.purchaseFees,
 });

 toast.success('Investment added successfully');
 refreshData();
 setCurrentPage('investments');
 } catch (e) {
 toast.error('Failed to save investment');
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
 <ChevronLeft size={20} />
 </button>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Add Investment</h1>
 </div>
 
 <div className="flex items-center gap-3">
 <button onClick={() => setCurrentPage('investments')} className="hidden sm:block text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest px-4">Cancel</button>
 <button 
 onClick={handleSubmit}
 disabled={isSubmitting || !formData.quantity}
 className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
 >
 {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
 Add to Portfolio
 </button>
 </div>
 </div>
 </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 pb-32 lg:pb-5">
 
 {/* Left Column: context & types (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-3 lg:overflow-y-auto">
 
 <div className="premium-glass-card p-4 space-y-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Asset Category</label>
 <AssetTypeGrid selectedType={formData.type} onSelect={t => setFormData(prev => ({ ...prev, type: t }))} />
 </div>

 <div className="space-y-1 relative">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Asset Search / Name</label>
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input 
 type="text" 
 value={formData.name} 
 onChange={e => { setFormData(prev => ({ ...prev, name: e.target.value })); setShowSuggestions(true); }} 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" 
 placeholder={isMarketAsset ?"Search Symbol (AAPL, BTC...)" :"Asset Name"} 
 />
 {fetchingPrice && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" size={12} />}
 </div>

 {/* Autocomplete Suggestions */}
 {showSuggestions && (searchResults.length > 0 || searching) && (
 <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
 {searching ? <div className="p-4 text-center text-[9px] font-black text-slate-300 uppercase tracking-widest">Searching Market...</div> : 
 searchResults.slice(0, 5).map(r => (
 <button key={r.symbol} onClick={() => handleSelectStock(r)} className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
 <div className="text-left">
 <p className="text-xs font-black text-slate-900">{displaySymbol(r.symbol)}</p>
 <p className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[180px]">{r.companyName}</p>
 </div>
 <ArrowUpRight size={14} className="text-slate-300" />
 </button>
 ))
 }
 </div>
 )}
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Broker / Platform</label>
 <div className="relative">
 <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input type="text" value={formData.broker} onChange={e => setFormData(prev => ({ ...prev, broker: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" placeholder="e.g. Robinhood" />
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Investment Date</label>
 <div className="relative">
 <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input type="date" value={formData.date} onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs" />
 </div>
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Notes</label>
 <textarea value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs min-h-[60px] resize-none" placeholder="Long term holding..." />
 </div>
 </div>

 {/* Account Source Card */}
 <div className="premium-glass-card p-4 space-y-3">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Payment Account</label>
 <SearchableDropdown
 options={activeAccounts.map(a => ({
 value: String(a.id),
 label: a.name,
 description: `${currency} ${a.balance.toLocaleString()}`,
 icon: <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 font-black text-[8px]">{(a.type || 'BK').substring(0, 2).toUpperCase()}</div>
 }))}
 value={String(formData.fundingAccountId)}
 onChange={val => setFormData(prev => ({ ...prev, fundingAccountId: parseInt(val) }))}
 placeholder="Select Account"
 className="h-12 rounded-xl border-none bg-slate-50 font-bold text-xs"
 />
 </div>
 </div>

 {/* Right Column: Financials (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-4 lg:overflow-y-auto">
 
 {/* Main Financial Input Card */}
 <div className="premium-glass-card p-5 bg-white relative overflow-hidden">
 <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full" />
 <div className="grid grid-cols-2 gap-6">
 <div className="flex flex-col items-center">
 <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">Quantity</span>
 <input 
 type="number" 
 value={formData.quantity || ''} 
 onChange={e => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
 className="bg-transparent text-3xl font-black text-slate-900 outline-none w-full text-center tracking-tighter" 
 placeholder="0.00"
 />
 </div>
 <div className="flex flex-col items-center border-l border-slate-100">
 <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">Buy Price ({assetCurrency})</span>
 <input 
 type="number" 
 value={formData.purchasePrice || ''} 
 onChange={e => setFormData(prev => ({ ...prev, purchasePrice: parseFloat(e.target.value) || 0 }))}
 className="bg-transparent text-3xl font-black text-slate-900 outline-none w-full text-center tracking-tighter" 
 placeholder="0.00"
 />
 </div>
 </div>
 </div>

 <div className="premium-glass-card p-4 space-y-4">
 <div className="flex items-center justify-between">
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Brokerage / Fees ({currency})</label>
 <input type="number" value={formData.purchaseFees || ''} onChange={e => setFormData(prev => ({ ...prev, purchaseFees: parseFloat(e.target.value) || 0 }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-xs" placeholder="0" />
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Asset Subtotal</p>
 <p className="text-xl font-black text-slate-900">{assetCurrency} {(formData.quantity * formData.purchasePrice).toLocaleString()}</p>
 </div>
 </div>

 {/* Live Market Insights (if market asset) */}
 {isMarketAsset && selectedSymbol && (
 <div className="p-3 bg-indigo-50 border border-indigo-100/50 rounded-xl flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0"><BarChart3 size={16} className="text-white" /></div>
 <div className="flex-1">
 <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Live Market Pulse</p>
 <p className="text-[10px] font-bold text-slate-700">Currently trading at <span className="text-indigo-600">{assetCurrency} {livePrice.toLocaleString()}</span></p>
 </div>
 </div>
 )}

 <div className="p-3 bg-slate-900 rounded-xl text-white flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Shield size={16} className="text-indigo-400" /></div>
 <div>
 <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Portfolio Exposure</p>
 <p className="text-[10px] font-bold">This {formData.type} asset adds to your wealth mix.</p>
 </div>
 </div>
 </div>
 </div>

 {/* Final Investment Summary Footer */}
 <div className="mt-auto p-4 bg-indigo-600 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-indigo-100">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><TrendingUp size={16} className="text-white" /></div>
 <div>
 <p className="text-[8px] font-black text-white/60 uppercase">Total Investment</p>
 <p className="text-[10px] font-black truncate max-w-[120px]">{formData.name || 'New Asset'}</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black text-white/60 uppercase">Total Capital</p>
 <p className="text-lg font-black tracking-tighter">{currency} {((formData.quantity * formData.purchasePrice) + formData.purchaseFees).toLocaleString()}</p>
 </div>
 </div>
 </div>
 </main>
 </div>
 );
};
