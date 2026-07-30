import React, { useState, useEffect, useRef } from 'react';
import { SubcategoryCode, FixedDepositDetailsV2 } from '@/types/investmentV2';
import { Search, Loader2, ArrowUpRight, Globe, Calendar, Building2, BarChart3, TrendingUp, Layers } from 'lucide-react';
import { searchStocks, fetchStockQuote, StockSearchResult, displaySymbol } from '@/lib/stockApi';
import { cn } from '@/lib/utils';
import { formatNativeMoney } from '@/lib/currencyUtils';

interface MarketAssetsFormProps {
  subcategory: SubcategoryCode;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  fdDetails: FixedDepositDetailsV2;
  setFdDetails: React.Dispatch<React.SetStateAction<FixedDepositDetailsV2>>;
  currency: string;
  onSelectQuote?: (quote: { currentPrice: number; symbol: string }) => void;
}

export const MarketAssetsForm: React.FC<MarketAssetsFormProps> = ({
  subcategory,
  formData,
  setFormData,
  fdDetails,
  setFdDetails,
  currency,
  onSelectQuote,
}) => {
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const searchTimer = useRef<any>(null);

  useEffect(() => {
    if ((subcategory !== 'stocks' && subcategory !== 'crypto' && subcategory !== 'etf' && subcategory !== 'mutual_funds') || !formData.name || formData.name.length < 2 || !showSuggestions) return;
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const results = await searchStocks(formData.name, subcategory === 'crypto' ? 'crypto' : undefined);
      setSearchResults(results);
      setSearching(false);
    }, 300);
  }, [formData.name, subcategory, showSuggestions]);

  const handleSelectStock = async (stock: StockSearchResult) => {
    setFormData((prev: any) => ({
      ...prev,
      name: displaySymbol(stock.symbol),
      symbol: stock.symbol,
      exchange: stock.exchange || prev.exchange || 'NSE',
    }));
    setShowSuggestions(false);

    setFetchingPrice(true);
    try {
      const quote = await fetchStockQuote(stock.symbol, subcategory === 'crypto' ? 'crypto' : undefined);
      if (quote) {
        setFormData((prev: any) => ({
          ...prev,
          currentPrice: quote.lastPrice,
          purchasePrice: prev.purchasePrice || quote.lastPrice,
        }));
        if (onSelectQuote) {
          onSelectQuote({ currentPrice: quote.lastPrice, symbol: stock.symbol });
        }
      }
    } finally {
      setFetchingPrice(false);
    }
  };

  if (subcategory === 'fd' || subcategory === 'rd') {
    return (
      <div className="space-y-4 bg-slate-50/80 border border-slate-200/80 p-5 rounded-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3">
          <Building2 size={16} className="text-indigo-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {subcategory === 'fd' ? 'Fixed Deposit Details' : 'Recurring Deposit Details'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Bank / Financial Institution</label>
            <input
              type="text"
              value={fdDetails.bankName || ''}
              onChange={e => {
                const bank = e.target.value;
                setFdDetails(prev => ({ ...prev, bankName: bank }));
                setFormData((prev: any) => ({ ...prev, name: `${bank} ${subcategory.toUpperCase()}`, broker: bank }));
              }}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="e.g. HDFC Bank, SBI"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Deposit Amount ({currency})</label>
            <input
              type="number"
              value={fdDetails.depositAmount || formData.purchasePrice || ''}
              onChange={e => {
                const val = parseFloat(e.target.value) || 0;
                setFdDetails(prev => ({ ...prev, depositAmount: val }));
                setFormData((prev: any) => ({ ...prev, purchasePrice: val, quantity: 1, currentPrice: val }));
              }}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="100000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Annual Interest Rate (%)</label>
            <input
              type="number"
              value={fdDetails.interestRate || ''}
              onChange={e => {
                const rate = parseFloat(e.target.value) || 0;
                setFdDetails(prev => ({ ...prev, interestRate: rate }));
              }}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="e.g. 7.5"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Compounding Type</label>
            <select
              value={fdDetails.compoundingType || 'quarterly'}
              onChange={e => setFdDetails(prev => ({ ...prev, compoundingType: e.target.value as any }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
            >
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
              <option value="half_yearly">Half Yearly</option>
              <option value="yearly">Yearly</option>
              <option value="simple">Simple Interest</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Start Date</label>
            <input
              type="date"
              value={fdDetails.startDate || formData.date || ''}
              onChange={e => {
                const d = e.target.value;
                setFdDetails(prev => ({ ...prev, startDate: d }));
                setFormData((prev: any) => ({ ...prev, date: d }));
              }}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Maturity Date</label>
            <input
              type="date"
              value={fdDetails.maturityDate || ''}
              onChange={e => setFdDetails(prev => ({ ...prev, maturityDate: e.target.value }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Estimated Maturity Amount ({currency})</label>
            <input
              type="number"
              value={fdDetails.maturityAmount || ''}
              onChange={e => {
                const amt = parseFloat(e.target.value) || 0;
                setFdDetails(prev => ({ ...prev, maturityAmount: amt }));
              }}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="e.g. 125000"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Symbol Search & Asset Name */}
      <div className="space-y-1.5 relative">
        <label className="text-xs font-semibold text-slate-700">
          {subcategory === 'stocks' ? 'Search Company / Symbol' :
           subcategory === 'crypto' ? 'Search Crypto Coin' :
           subcategory === 'mutual_funds' ? 'Mutual Fund Name / Scheme' :
           subcategory === 'forex' ? 'Currency Pair' :
           subcategory === 'commodities' ? 'Commodity Name' : 'Asset Search / Name'}
        </label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={formData.name || ''}
            onChange={e => {
              setFormData((prev: any) => ({ ...prev, name: e.target.value }));
              setShowSuggestions(true);
            }}
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
            placeholder={
              subcategory === 'stocks' ? 'Search Symbol (AAPL, RELIANCE, TCS...)' :
              subcategory === 'crypto' ? 'Search Coin (BTC, ETH, SOL...)' :
              subcategory === 'mutual_funds' ? 'e.g. HDFC Small Cap Fund' :
              subcategory === 'forex' ? 'e.g. USD/INR, EUR/USD' :
              subcategory === 'commodities' ? 'e.g. Crude Oil, Copper' : 'Enter Asset Name'
            }
          />
          {fetchingPrice && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-indigo-600" size={16} />}
        </div>

        {/* Autocomplete Suggestions Overlay */}
        {showSuggestions && (searchResults.length > 0 || searching) && (
          <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            {searching ? (
              <div className="p-4 text-center text-xs font-semibold text-slate-500">Searching market symbols...</div>
            ) : (
              searchResults.slice(0, 6).map(r => (
                <button
                  key={r.symbol}
                  type="button"
                  onClick={() => handleSelectStock(r)}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 text-left"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{displaySymbol(r.symbol)}</p>
                    <p className="text-xs font-medium text-slate-500 truncate max-w-[220px]">{r.companyName}</p>
                  </div>
                  <ArrowUpRight size={16} className="text-slate-400" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Additional market asset fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {subcategory === 'stocks' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Exchange</label>
              <input
                type="text"
                value={formData.exchange || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, exchange: e.target.value }))}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                placeholder="e.g. NSE, BSE, NASDAQ"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Market Region / Country</label>
              <select
                value={formData.country || 'IN'}
                onChange={e => setFormData((prev: any) => ({ ...prev, country: e.target.value }))}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
              >
                <option value="IN">Indian Market (NSE/BSE)</option>
                <option value="US">US Market (NASDAQ/NYSE)</option>
                <option value="OTHER">Other Global Markets</option>
              </select>
            </div>
          </>
        )}

        {(subcategory === 'crypto' || subcategory === 'forex') && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Exchange / Platform</label>
            <input
              type="text"
              value={formData.broker || ''}
              onChange={e => setFormData((prev: any) => ({ ...prev, broker: e.target.value }))}
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder={subcategory === 'crypto' ? 'e.g. Binance, CoinDCX' : 'e.g. Zerodha, Interactive Brokers'}
            />
          </div>
        )}
      </div>
    </div>
  );
};
