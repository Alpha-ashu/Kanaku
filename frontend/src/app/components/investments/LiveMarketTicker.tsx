import React, { useEffect, useRef, useState } from 'react';
import { Activity, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchMultipleQuotes, getStockDataSetupHint, hasDirectStockProvider, StockQuote } from '@/lib/stockApi';
import { buildFlashItems, formatFlashPrice, getFlashAssets, inferCountryFromCurrency, type FlashItem, type FlashTone } from '@/lib/marketFlash';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';

const FLASH_REFRESH_MS = 6_000;

function readSelectedCountry(currency: string) {
 try {
 const rawProfile = localStorage.getItem('user_profile');
 if (rawProfile) {
 const profile = JSON.parse(rawProfile);
 if (typeof profile.country === 'string' && profile.country.trim()) {
 return profile.country;
 }
 }

 const rawSettings = localStorage.getItem('user_settings');
 if (rawSettings) {
 const settings = JSON.parse(rawSettings);
 if (typeof settings.country === 'string' && settings.country.trim()) {
 return settings.country;
 }
 }
 } catch {
 // Fall back to currency-derived locale.
 }

 return inferCountryFromCurrency(currency);
}

function getBadgeToneClasses(tone: FlashTone) {
 switch (tone) {
 case 'bullish':
 return 'bg-emerald-50 text-emerald-700';
 case 'bearish':
 return 'bg-rose-50 text-rose-700';
 case 'commodity':
 return 'bg-amber-50 text-amber-700';
 case 'forex':
 return 'bg-sky-50 text-sky-700';
 case 'crypto':
 return 'bg-violet-50 text-violet-700';
 case 'global':
 return 'bg-indigo-50 text-indigo-700';
 default:
 return 'bg-slate-100 text-slate-700';
 }
}

function renderChangePill(item: FlashItem) {
 const isPositive = item.quote.percentChange >= 0;

 return (
 <span
 className={cn(
 'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold',
 isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
 )}
 >
 {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
 {isPositive ? '+' : ''}
 {item.quote.percentChange.toFixed(2)}%
 </span>
 );
}

export const LiveMarketTicker: React.FC = () => {
 const { currency } = useApp();
 const [quotes, setQuotes] = useState<Record<string, StockQuote | null>>({});
 const [userCountry, setUserCountry] = useState(() => readSelectedCountry(currency));
 const [loading, setLoading] = useState(true);
 const [setupHint, setSetupHint] = useState<string | null>(null);
 const loadInFlight = useRef(false);

 useEffect(() => {
 const syncCountry = () => {
 setUserCountry(readSelectedCountry(currency));
 };

 syncCountry();
 window.addEventListener('storage', syncCountry);
 window.addEventListener('focus', syncCountry);

 return () => {
 window.removeEventListener('storage', syncCountry);
 window.removeEventListener('focus', syncCountry);
 };
 }, [currency]);

 useEffect(() => {
 let active = true;

 const loadQuotes = async () => {
 if (loadInFlight.current) {
 return;
 }

 loadInFlight.current = true;
 const hint = getStockDataSetupHint();
 if (hint && !hasDirectStockProvider()) {
 if (active) {
 setSetupHint(hint);
 setLoading(false);
 }
 loadInFlight.current = false;
 return;
 }

 const { assets } = getFlashAssets(userCountry, currency);
 try {
 const data = await fetchMultipleQuotes(assets.map(asset => asset.symbol));
 if (!active) {
 return;
 }

 setQuotes(data);
 setSetupHint(null);
 } catch (error) {
 console.error('Failed to load live market ticker quotes:', error);
 } finally {
 loadInFlight.current = false;
 if (active) {
 setLoading(false);
 }
 }
 };

 setLoading(true);
 loadQuotes();
 const interval = setInterval(loadQuotes, FLASH_REFRESH_MS);

 return () => {
 active = false;
 clearInterval(interval);
 };
 }, [currency, userCountry]);

 const { assets, countryLabel } = getFlashAssets(userCountry, currency);
 const items = buildFlashItems(quotes, assets, countryLabel);
 const repeatedItems = items.length > 0 ? [...items, ...items] : [];

 return (
 <div className="flex overflow-hidden border-y border-gray-200 bg-[#f8f9fc] py-3">
 <div className="z-10 flex flex-shrink-0 items-center gap-2 border-r border-gray-200 bg-[#f8f9fc] px-4 text-xs font-bold uppercase tracking-[0.24em] text-gray-500">
 <Activity size={14} className="text-gray-400" />
 Market Flash
 <span className="hidden rounded-full bg-white px-2 py-1 text-[10px] tracking-[0.18em] text-gray-400 sm:inline-flex">
 {countryLabel} + Global
 </span>
 </div>

 <div className="relative flex flex-1 overflow-hidden">
 {loading && items.length === 0 ? (
 <div className="flex min-h-[32px] items-center gap-2 px-4 text-sm font-medium text-gray-500">
 <Loader2 size={14} className="animate-spin text-gray-400" />
 Loading live market pulse...
 </div>
 ) : items.length === 0 ? (
 <div className="flex min-h-[32px] items-center px-4 text-sm font-medium text-gray-500">
 {setupHint || 'Live movers are unavailable right now.'}
 </div>
 ) : (
 <div className="live-market-flash-track">
 {repeatedItems.map((item, index) => (
 <div
 key={`${item.id}-${index}`}
 className="inline-flex min-w-max items-center gap-3 border-r border-gray-200 px-5"
 >
 <span className={cn(
 'rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
 getBadgeToneClasses(item.tone),
 )}>
 {item.badge}
 </span>
 <span className="font-display text-sm font-bold text-gray-900">{item.displayLabel || item.label}</span>
 <span className="text-sm font-semibold tabular-nums text-gray-700">
 {formatFlashPrice(item)}
 </span>
 {renderChangePill(item)}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
};
