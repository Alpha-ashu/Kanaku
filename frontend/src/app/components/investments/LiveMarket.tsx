import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 TrendingUp, TrendingDown, RefreshCw, Search, X, Plus,
 Activity, BarChart2, ChevronRight, Wifi, WifiOff, Clock, ChevronLeft,
} from 'lucide-react';
import {
 fetchStockQuote, fetchMultipleQuotes, searchStocks, setStockProxyDisabled,
 formatMarketCap, formatPrice, getCacheAge, getCachedQuotes, getDefaultWatchlist, displaySymbol, getStockDataSetupHint,
 StockQuote, StockSearchResult, MarketCategory, MARKET_LABELS,
} from '@/lib/stockApi';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const AUTO_REFRESH_MS = 8_000;
const PAGE_SIZE = 15;
const PENDING_INVESTMENT_DRAFT_KEY = 'pendingInvestmentDraft';

const MARKET_TABS: MarketCategory[] = ['all', 'nse', 'bse', 'us', 'forex', 'crypto', 'commodity'];

/* Helpers */
const fmt = (n: number) =>
 new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtCurrency = (n: number, currency: string = 'INR') => {
 if (currency === '$') {
 return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
 }
 return fmt(n);
};

const PriceTag: React.FC<{ value: number; suffix?: string; size?: 'sm' | 'md' | 'lg' }> = ({
 value, suffix = '', size = 'md',
}) => {
 const positive = value >= 0;
 const cls = cn(
 'font-bold tabular-nums',
 positive ? 'text-emerald-600' : 'text-rose-600',
 size === 'lg' && 'text-xl',
 size === 'md' && 'text-sm',
 size === 'sm' && 'text-xs',
 );
 return (
 <span className={cls}>
 {positive ? '+' : ''}{fmt(value)}{suffix}
 </span>
 );
};

/* Stock card (list row) */
const StockRow: React.FC<{
 quote: StockQuote;
 onClick: (q: StockQuote) => void;
}> = ({ quote, onClick }) => {
 const positive = quote.change >= 0;
 const cur = quote.currency || 'INR';
 return (
 <motion.button
 layout
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 onClick={() => onClick(quote)}
 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
 >
 {/* Icon */}
 <div className={cn(
 'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold',
 positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
 )}>
 {displaySymbol(quote.symbol).slice(0, 2)}
 </div>

 {/* Name */}
 <div className="flex-1 min-w-0">
 <p className="font-bold text-gray-900 text-sm truncate">{displaySymbol(quote.symbol)}</p>
 <p className="text-xs text-gray-400 truncate">{quote.exchange} {quote.companyName}</p>
 </div>

 {/* Price */}
 <div className="text-right shrink-0">
 <p className="font-bold text-gray-900 text-sm tabular-nums">{cur}{fmtCurrency(quote.lastPrice, cur)}</p>
 <div className="flex items-center justify-end gap-1">
 {positive ? (
 <TrendingUp size={11} className="text-emerald-500" />
 ) : (
 <TrendingDown size={11} className="text-rose-500" />
 )}
 <PriceTag value={quote.percentChange} suffix="%" size="sm" />
 </div>
 </div>

 <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
 </motion.button>
 );
};

/* Detail panel */
const StockDetail: React.FC<{
 quote: StockQuote;
 onClose: () => void;
 onAddToPortfolio: (quote: StockQuote) => void;
}> = ({ quote, onClose, onAddToPortfolio }) => {
 const positive = quote.change >= 0;
 const cur = quote.currency || 'INR';
 const subtitle = quote.sector && quote.sector !== 'Unknown'
 ? `${quote.exchange} ${quote.sector}`
 : quote.marketState
 ? `${quote.exchange} ${quote.marketState === 'open' ? 'Market Open' : 'Market Closed'}`
 : quote.exchange;
 const pct52 = quote.yearHigh > 0
 ? ((quote.lastPrice - quote.yearLow) / (quote.yearHigh - quote.yearLow)) * 100
 : 0;

 const rows = [
 { label: 'Open', value: `${cur}${fmtCurrency(quote.open, cur)}` },
 { label: 'Prev Close', value: `${cur}${fmtCurrency(quote.previousClose, cur)}` },
 { label:"Day's High", value: `${cur}${fmtCurrency(quote.dayHigh, cur)}` },
 { label:"Day's Low", value: `${cur}${fmtCurrency(quote.dayLow, cur)}` },
 { label: '52W High', value: `${cur}${fmtCurrency(quote.yearHigh, cur)}` },
 { label: '52W Low', value: `${cur}${fmtCurrency(quote.yearLow, cur)}` },
 { label: 'P/E Ratio', value: quote.peRatio ? `${fmt(quote.peRatio)}x` : '-' },
 { label: 'EPS', value: quote.eps ? `${cur}${fmtCurrency(quote.eps, cur)}` : '-' },
 { label: 'Div Yield', value: quote.dividendYield ? `${fmt(quote.dividendYield)}%` : '-' },
 { label: 'Market Cap', value: formatMarketCap(quote.marketCap, cur) },
 {
 label: 'Volume',
 value: new Intl.NumberFormat('en-IN').format(quote.volume)
 },
 { label: 'Market', value: quote.marketState === 'open' ? ' Open' : quote.marketState === 'closed' ? ' Closed' : '-' },
 ];

 return (
 <motion.div
 key="detail"
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: 20 }}
 className="flex flex-col h-full"
 >
 {/* Header */}
 <div className={cn(
 'px-5 pt-5 pb-6 relative overflow-hidden',
 positive ? 'bg-gradient-to-br from-emerald-600 to-teal-500' : 'bg-gradient-to-br from-rose-600 to-pink-500'
 )}>
 <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
 <div className="flex items-center gap-3 mb-4 relative">
 <button
 type="button"
 onClick={onClose}
 aria-label={`Close ${quote.companyName} details`}
 title={`Close ${quote.companyName} details`}
 className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
 >
 <X size={16} className="text-white" />
 </button>
 <div className="flex-1 min-w-0">
 <p className="text-white/70 text-xs font-bold">{subtitle}</p>
 <h3 className="text-white font-display font-bold text-lg leading-tight truncate">{quote.companyName}</h3>
 </div>
 <div className="flex flex-col-reverse items-end gap-2 shrink-0 sm:flex-row sm:items-center">
 <button
 type="button"
 onClick={() => onAddToPortfolio(quote)}
 aria-label={`Add ${quote.companyName} to portfolio`}
 title={`Add ${quote.companyName} to portfolio`}
 className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
 >
 <Plus size={13} />
 Add
 </button>
 <span className="text-xs font-bold bg-white/20 text-white px-2 py-1 rounded-lg">
 {displaySymbol(quote.symbol)}
 </span>
 </div>
 </div>
 <div className="relative">
 <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-0.5">Current Price</p>
 <p className="text-white text-4xl font-display font-bold">{cur}{fmtCurrency(quote.lastPrice, cur)}</p>
 <div className="flex items-center gap-2 mt-1">
 {positive ? <TrendingUp size={14} className="text-white/80" /> : <TrendingDown size={14} className="text-white/80" />}
 <span className="text-white/80 text-sm font-semibold">
 {positive ? '+' : ''}{cur}{fmtCurrency(Math.abs(quote.change), cur)} ({positive ? '+' : ''}{fmt(quote.percentChange)}%)
 </span>
 </div>
 </div>
 </div>

 {/* 52W Range bar */}
 <div className="px-5 py-4 border-b border-gray-100">
 <div className="flex justify-between text-xs text-gray-400 mb-1.5">
 <span>52W Low {cur}{fmtCurrency(quote.yearLow, cur)}</span>
 <span>52W High {cur}{fmtCurrency(quote.yearHigh, cur)}</span>
 </div>
 <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
 <svg
 className="block h-full w-full"
 viewBox="0 0 100 2"
 preserveAspectRatio="none"
 aria-hidden="true"
 >
 <rect width="100" height="2" className="fill-gray-100" />
 <rect
 width={Math.min(100, Math.max(2, pct52))}
 height="2"
 rx="1"
 className={cn(positive ? 'fill-emerald-500' : 'fill-rose-500')}
 />
 </svg>
 </div>
 <p className="text-xs text-gray-400 mt-1 text-center">
 {cur}{fmtCurrency(quote.lastPrice, cur)} - {pct52.toFixed(0)}% from 52W low
 </p>
 </div>

 {/* Stats grid */}
 <div className="flex-1 overflow-y-auto p-5">
 <div className="grid grid-cols-2 gap-3">
 {rows.map(({ label, value }) => (
 <div key={label} className="bg-white rounded-xl px-3 py-2.5">
 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
 <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
 </div>
 ))}
 </div>
 <p className="text-xs text-gray-400 text-center mt-4">
 Last updated: {quote.lastUpdate} Data via backend proxy or Twelve Data
 </p>
 </div>
 </motion.div>
 );
};

/* Main component */
export const LiveMarket: React.FC = () => {
 const { setCurrentPage: setAppPage } = useApp();
 const [quotes, setQuotes] = useState<Record<string, StockQuote | null>>({});
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
 const [selected, setSelected] = useState<StockQuote | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
 const [searching, setSearching] = useState(false);
 const [isOnline, setIsOnline] = useState(navigator.onLine);
 const [activeMarket, setActiveMarket] = useState<MarketCategory>('all');
 const [watchlist, setWatchlist] = useState<string[]>(() => getDefaultWatchlist('all'));
 const [usingCache, setUsingCache] = useState(false);
 const [currentPage, setCurrentPageIndex] = useState(1);
 const [pageInput, setPageInput] = useState('1');

 const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
 const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 const openAddInvestmentDraft = useCallback((quote: StockQuote) => {
 const inferredType = quote.symbol.endsWith('-USD') || quote.exchange.toUpperCase() === 'CRYPTO'
 ? 'crypto'
 : 'stocks';

 const draft = {
 symbol: quote.symbol,
 displayName: displaySymbol(quote.symbol),
 companyName: quote.companyName,
 exchange: quote.exchange,
 type: inferredType,
 currentPrice: quote.lastPrice,
 currency: quote.currency,
 currencyCode: quote.currencyCode,
 marketState: quote.marketState ?? '',
 lastUpdate: quote.lastUpdate ?? '',
 };

 localStorage.setItem(PENDING_INVESTMENT_DRAFT_KEY, JSON.stringify(draft));
 setAppPage('add-investment');
 }, [setAppPage]);

 const resolveMarketHint = useCallback((symbol: string): MarketCategory | undefined => {
 if (activeMarket !== 'all') {
 return activeMarket;
 }

 if (symbol.endsWith('.NS')) return 'nse';
 if (symbol.endsWith('.BO')) return 'bse';
 if (symbol.endsWith('.US')) return 'us';
 if (symbol.endsWith('=X')) return 'forex';
 if (symbol.endsWith('-USD')) return 'crypto';
 if (symbol.endsWith('=F') || symbol === 'PETROL' || symbol === 'DIESEL' || symbol === 'LPG') return 'commodity';
 return undefined;
 }, [activeMarket]);

 /* Online/offline */
 useEffect(() => {
 const on = () => setIsOnline(true);
 const off = () => setIsOnline(false);
 window.addEventListener('online', on);
 window.addEventListener('offline', off);
 return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
 }, []);

 /* Market tab change */
 const handleMarketChange = useCallback((market: MarketCategory) => {
 setActiveMarket(market);
 const newWL = getDefaultWatchlist(market);
 setWatchlist(newWL);
 setCurrentPageIndex(1);
 setSelected(null);
 setSearchQuery('');
 setSearchResults([]);
 }, []);

 const totalPages = Math.max(1, Math.ceil(watchlist.length / PAGE_SIZE));
 const pageSymbols = useMemo(() => {
 const start = (currentPage - 1) * PAGE_SIZE;
 return watchlist.slice(start, start + PAGE_SIZE);
 }, [watchlist, currentPage]);
 const visiblePageNumbers = useMemo(() => {
 const windowSize = 5;
 const half = Math.floor(windowSize / 2);
 let start = Math.max(1, currentPage - half);
 let end = Math.min(totalPages, start + windowSize - 1);

 if (end - start + 1 < windowSize) {
 start = Math.max(1, end - windowSize + 1);
 }

 const pages: number[] = [];
 for (let page = start; page <= end; page += 1) {
 pages.push(page);
 }

 return pages;
 }, [currentPage, totalPages]);
 const mobilePageItems = useMemo(() => {
 if (totalPages <= 4) {
 return Array.from({ length: totalPages }, (_, index) => ({ type: 'page' as const, value: index + 1 }));
 }

 const candidatePages = Array.from(new Set([
 1,
 currentPage - 1,
 currentPage,
 currentPage + 1,
 totalPages,
 ]))
 .filter(page => page >= 1 && page <= totalPages)
 .sort((a, b) => a - b);

 const items: Array<{ type: 'page'; value: number } | { type: 'ellipsis'; key: string }> = [];

 for (let i = 0; i < candidatePages.length; i += 1) {
 const page = candidatePages[i];
 const prev = candidatePages[i - 1];

 if (typeof prev === 'number' && page - prev > 1) {
 items.push({ type: 'ellipsis', key: `ellipsis-${prev}-${page}` });
 }

 items.push({ type: 'page', value: page });
 }

 return items;
 }, [currentPage, totalPages]);

 useEffect(() => {
 if (currentPage > totalPages) {
 setCurrentPageIndex(totalPages);
 }
 }, [currentPage, totalPages]);

 useEffect(() => {
 setPageInput(String(currentPage));
 }, [currentPage]);

 const goToPage = useCallback(() => {
 const parsed = Number.parseInt(pageInput, 10);
 if (!Number.isFinite(parsed)) {
 setPageInput(String(currentPage));
 return;
 }

 const bounded = Math.min(totalPages, Math.max(1, parsed));
 setCurrentPageIndex(bounded);
 }, [pageInput, totalPages, currentPage]);

 /* Fetch quotes */
 const loadQuotes = useCallback(async (symbols: string[], isRefresh = false) => {
 const cached = getCachedQuotes(symbols);
 const cachedEntries = Object.entries(cached).filter(([, quote]) => quote);
 const hasCachedData = cachedEntries.length > 0;

 if (hasCachedData) {
 setQuotes(prev => ({
 ...prev,
 ...Object.fromEntries(cachedEntries),
 }));
 setUsingCache(true);
 if (!isRefresh) {
 setLoading(false);
 }
 }

 if (isRefresh) setRefreshing(true);
 else if (!hasCachedData) setLoading(true);

 try {
 const market = activeMarket === 'all' ? undefined : activeMarket;
 const data = await fetchMultipleQuotes(symbols, market);
 setQuotes(prev => ({ ...prev, ...data }));
 setSelected(prev => {
 if (!prev) return prev;
 return data[prev.symbol] ?? prev;
 });
 setLastRefreshed(new Date());
 const cacheAge = getCacheAge();
 const hasAnyQuote = Object.values(data).some(q => q !== null);
 setUsingCache(!navigator.onLine && hasAnyQuote && cacheAge !== null);
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }, [activeMarket]);

 useEffect(() => {
 loadQuotes(pageSymbols);
 refreshTimer.current = setInterval(() => loadQuotes(pageSymbols, true), AUTO_REFRESH_MS);
 return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
 }, [pageSymbols, loadQuotes]);

 /* Search debounce */
 useEffect(() => {
 if (searchTimer.current) clearTimeout(searchTimer.current);
 if (!searchQuery.trim()) { setSearchResults([]); return; }
 setSearching(true);
 searchTimer.current = setTimeout(async () => {
 const market = activeMarket === 'all' ? undefined : activeMarket;
 const results = await searchStocks(searchQuery.trim(), market);
 setSearchResults(results);
 setSearching(false);
 }, 220);
 return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
 }, [searchQuery, activeMarket]);

 const handleOpenSearchResult = useCallback(async (result: StockSearchResult) => {
 const sym = result.symbol;
 const marketHint = resolveMarketHint(sym);
 const currentQuote = quotes[sym] ?? await fetchStockQuote(sym, marketHint);

 setSearchQuery('');
 setSearchResults([]);
 setSearching(false);

 if (currentQuote) {
 setQuotes(prev => ({ ...prev, [sym]: currentQuote }));
 setSelected(currentQuote);
 return;
 }

 const isRupeeMarket = marketHint === 'nse' || marketHint === 'bse';
 setSelected({
 symbol: sym,
 companyName: result.companyName,
 exchange: result.exchange,
 currency: isRupeeMarket ? 'INR' : '$',
 currencyCode: isRupeeMarket ? 'INR' : 'USD',
 marketState: undefined,
 lastPrice: 0,
 change: 0,
 percentChange: 0,
 previousClose: 0,
 open: 0,
 dayHigh: 0,
 dayLow: 0,
 yearHigh: 0,
 yearLow: 0,
 volume: 0,
 marketCap: 0,
 peRatio: 0,
 dividendYield: 0,
 eps: 0,
 sector: 'Unknown',
 lastUpdate: new Date().toISOString(),
 });
 }, [quotes, resolveMarketHint]);

 /* Open add-investment with selected stock */
 const handleAddInvestment = async (result: StockSearchResult) => {
 const sym = result.symbol;
 setSearchQuery('');
 setSearchResults([]);

 const inferredType = sym.endsWith('-USD') || activeMarket === 'crypto' ? 'crypto' : 'stocks';
 const marketHint = resolveMarketHint(sym);
 const currentQuote = quotes[sym] ?? await fetchStockQuote(sym, marketHint);
 const draft = {
 symbol: sym,
 displayName: displaySymbol(sym),
 companyName: currentQuote?.companyName || result.companyName,
 exchange: currentQuote?.exchange || result.exchange,
 type: inferredType,
 currentPrice: currentQuote?.lastPrice ?? 0,
 currency: currentQuote?.currency ?? '',
 currencyCode: currentQuote?.currencyCode ?? '',
 marketState: currentQuote?.marketState ?? '',
 lastUpdate: currentQuote?.lastUpdate ?? '',
 };

 localStorage.setItem(PENDING_INVESTMENT_DRAFT_KEY, JSON.stringify(draft));
 setAppPage('add-investment');
 };

 /* Remove from watchlist */
 const handleRemove = (symbol: string) => {
 setWatchlist(prev => prev.filter(s => s !== symbol));
 setQuotes(prev => { const c = { ...prev }; delete c[symbol]; return c; });
 if (selected?.symbol === symbol) setSelected(null);
 };

 const defaultWL = getDefaultWatchlist(activeMarket);

 const loadedQuotes = pageSymbols
 .map(s => quotes[s])
 .filter((q): q is StockQuote => q !== null && q !== undefined);
 const setupHint = getStockDataSetupHint();

 const timeSince = lastRefreshed
 ? Math.round((Date.now() - lastRefreshed.getTime()) / 1000)
 : null;

 return (
 <div className="h-full flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
 {/* Top bar */}
 <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0">
 <div className="w-8 h-8 rounded-xl bg-black flex items-center justify-center">
 <Activity size={15} className="text-white" />
 </div>
 <div className="flex-1">
 <h2 className="font-display font-bold text-gray-900 text-sm">Live Market</h2>
 <div className="flex items-center gap-1.5">
 {isOnline ? (
 <Wifi size={10} className="text-emerald-500" />
 ) : (
 <WifiOff size={10} className="text-red-400" />
 )}
 <p className="text-[10px] text-gray-400">
 {!isOnline ? (
 'Offline - cached data'
 ) : usingCache ? (
 (() => {
 const age = getCacheAge();
 if (!age) return 'Cached data';
 const mins = Math.round(age / 60000);
 return mins < 1 ? 'Cached - just now' : `Cached - ${mins}m ago`;
 })()
 ) : (
 timeSince !== null ? `Updated ${timeSince}s ago Auto-refresh 8s` : 'Connecting...'
 )}
 </p>
 {usingCache && isOnline && (
 <Clock size={10} className="text-amber-400" />
 )}
 </div>
 </div>
 <button
 type="button"
 onClick={() => loadQuotes(pageSymbols, true)}
 disabled={refreshing || loading}
 aria-label="Refresh market data"
 className="w-8 h-8 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition-colors disabled:opacity-40"
 title="Refresh"
 >
 <RefreshCw size={14} className={cn('text-gray-500', refreshing && 'animate-spin')} />
 </button>
 </div>

 {/* Market filter tabs */}
 <div className="px-4 py-2 border-b border-gray-100 shrink-0 overflow-x-auto scrollbar-hide">
 <div className="flex gap-1.5 min-w-max">
 {MARKET_TABS.map((market) => (
 <button
 key={market}
 onClick={() => handleMarketChange(market)}
 className={cn(
 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap',
 activeMarket === market
 ? 'bg-gray-900 text-white shadow-sm'
 : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
 )}
 >
 {MARKET_LABELS[market]}
 </button>
 ))}
 </div>
 </div>

 {/* Search bar */}
 <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
 <div className="relative">
 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input
 type="text"
 value={searchQuery}
 onChange={e => setSearchQuery(e.target.value)}
 placeholder={`Search ${MARKET_LABELS[activeMarket]} stocks...`}
 className="w-full pl-8 pr-8 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 focus:bg-white transition-colors"
 />
 {searchQuery && (
 <button
 type="button"
 onClick={() => { setSearchQuery(''); setSearchResults([]); }}
 aria-label="Clear market search"
 title="Clear market search"
 className="absolute right-3 top-1/2 -translate-y-1/2"
 >
 <X size={13} className="text-gray-400" />
 </button>
 )}
 </div>

 {/* Search dropdown */}
 <AnimatePresence>
 {(searchResults.length > 0 || searching) && (
 <motion.div
 initial={{ opacity: 0, y: -4 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -4 }}
 className="absolute z-20 left-4 right-4 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden"
 >
 {searching && (
 <div className="p-3 text-xs text-gray-400 flex items-center gap-2">
 <RefreshCw size={11} className="animate-spin" /> Searching...
 </div>
 )}
 {searchResults.slice(0, 8).map(r => {
 return (
 <div
 key={r.symbol}
 className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 focus-within:bg-white"
 >
 <button
 type="button"
 onClick={() => void handleOpenSearchResult(r)}
 className="min-w-0 flex-1 text-left"
 >
 <p className="text-sm font-bold text-gray-900">
 {displaySymbol(r.symbol)}
 </p>
 <p className="text-xs text-gray-400 truncate">{r.companyName} {r.exchange}</p>
 </button>
 <button
 type="button"
 onClick={() => void handleAddInvestment(r)}
 className="shrink-0 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium hover:bg-gray-900 hover:text-white transition-colors"
 >
 + Add
 </button>
 </div>
 );
 })}
 </motion.div>
 )}
 </AnimatePresence>
 </div>

 {/* Content */}
 <div className="flex-1 relative overflow-hidden">
 <AnimatePresence mode="wait">
 {selected ? (
 <StockDetail
 key="detail"
 quote={selected}
 onClose={() => setSelected(null)}
 onAddToPortfolio={openAddInvestmentDraft}
 />
 ) : (
 <motion.div key="list" className="h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
 {loading && loadedQuotes.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-48 gap-3">
 <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
 <p className="text-xs text-gray-400">Fetching live prices...</p>
 </div>
 ) : !loading && loadedQuotes.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-48 gap-3">
 <Activity size={24} className="text-gray-300" />
 <p className="text-xs text-gray-500 font-medium">Unable to load market data</p>
 {setupHint && (
 <p className="max-w-[18rem] text-center text-[11px] text-gray-400">
 {setupHint}
 </p>
 )}
 <button
 onClick={() => { setStockProxyDisabled(false); loadQuotes(pageSymbols); }}
 className="text-xs bg-gray-900 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-gray-800 transition-colors"
 >
 Retry
 </button>
 </div>
 ) : (
 <div className="divide-y divide-gray-50 relative">
 {pageSymbols.map(symbol => {
 const q = quotes[symbol];
 if (!q) return (
 <div key={symbol}
 className="flex items-center justify-between px-4 py-3 opacity-50">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse" />
 <div>
 <div className="h-3 w-20 bg-gray-200 rounded animate-pulse mb-1.5" />
 <div className="h-2 w-14 bg-gray-100 rounded animate-pulse" />
 </div>
 </div>
 <button
 type="button"
 onClick={() => handleRemove(symbol)}
 aria-label={`Remove ${displaySymbol(symbol)} from watchlist`}
 title={`Remove ${displaySymbol(symbol)} from watchlist`}
 className="text-gray-300 hover:text-gray-500 p-1"
 >
 <X size={12} />
 </button>
 </div>
 );
 return (
 <div key={symbol} className="flex items-center group">
 <div className="flex-1 min-w-0">
 <StockRow quote={q} onClick={setSelected} />
 </div>
 {!defaultWL.includes(symbol) && (
 <button
 type="button"
 onClick={() => handleRemove(symbol)}
 aria-label={`Remove ${displaySymbol(symbol)} from watchlist`}
 title={`Remove ${displaySymbol(symbol)} from watchlist`}
 className="px-2 opacity-0 group-hover:opacity-100 transition-opacity"
 >
 <X size={13} className="text-gray-400 hover:text-red-500" />
 </button>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Footer */}
 <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <BarChart2 size={12} className="text-gray-300" />
 <p className="text-[10px] text-gray-400">
 {`Showing ${pageSymbols.length} of ${watchlist.length} symbols Auto-refresh every 8s`}
 </p>
 </div>

 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={() => setCurrentPageIndex(prev => Math.max(1, prev - 1))}
 disabled={currentPage <= 1}
 className="h-7 w-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
 aria-label="Previous market page"
 title="Previous page"
 >
 <ChevronLeft size={14} className="mx-auto" />
 </button>
 <div className="flex items-center gap-1 sm:hidden">
 {mobilePageItems.map((item) => {
 if (item.type === 'ellipsis') {
 return (
 <span key={item.key} className="px-1 text-[11px] text-gray-400">
 ...
 </span>
 );
 }

 return (
 <button
 key={`mobile-page-${item.value}`}
 type="button"
 onClick={() => setCurrentPageIndex(item.value)}
 className={cn(
 'h-7 min-w-7 rounded-lg border px-1 text-[11px] font-semibold transition-colors',
 currentPage === item.value
 ? 'border-gray-900 bg-gray-900 text-white'
 : 'border-gray-200 text-gray-500 hover:bg-gray-50',
 )}
 aria-label={`Go to page ${item.value}`}
 title={`Page ${item.value}`}
 >
 {item.value}
 </button>
 );
 })}
 </div>
 <div className="hidden items-center gap-1 sm:flex">
 {visiblePageNumbers.map((page) => (
 <button
 key={page}
 type="button"
 onClick={() => setCurrentPageIndex(page)}
 className={cn(
 'h-7 min-w-7 rounded-lg border px-1 text-[11px] font-semibold transition-colors',
 currentPage === page
 ? 'border-gray-900 bg-gray-900 text-white'
 : 'border-gray-200 text-gray-500 hover:bg-gray-50',
 )}
 aria-label={`Go to page ${page}`}
 title={`Page ${page}`}
 >
 {page}
 </button>
 ))}
 </div>
 <span className="min-w-[88px] text-center text-[11px] font-semibold text-gray-500">
 Page {currentPage} / {totalPages}
 </span>
 <button
 type="button"
 onClick={() => setCurrentPageIndex(prev => Math.min(totalPages, prev + 1))}
 disabled={currentPage >= totalPages}
 className="h-7 w-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
 aria-label="Next market page"
 title="Next page"
 >
 <ChevronRight size={14} className="mx-auto" />
 </button>
 <div className="hidden items-center gap-1 md:flex">
 <input
 type="number"
 min={1}
 max={totalPages}
 value={pageInput}
 onChange={(event) => setPageInput(event.target.value)}
 onKeyDown={(event) => {
 if (event.key === 'Enter') {
 goToPage();
 }
 }}
 className="h-7 w-14 rounded-lg border border-gray-200 px-2 text-[11px] font-semibold text-gray-600 outline-none focus:border-gray-400"
 aria-label="Jump to market page"
 title="Jump to page"
 />
 <button
 type="button"
 onClick={goToPage}
 className="h-7 rounded-lg border border-gray-200 px-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
 >
 Go
 </button>
 </div>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </div>
 );
};
