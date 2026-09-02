import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/database';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Plus, Scan, RefreshCw, ChevronRight,
  Home, Building2, Briefcase, Gem, Lock, MapPin,
  Users, Gift, ShoppingBag, Loader2
} from 'lucide-react';
import { fetchMetalPrices, MetalPrices } from '@/lib/metalPriceService';
import { formatCurrencyAmount, getCurrencySymbol } from '@/lib/currencyUtils';
import { fetchCurrencyConversionRate } from '@/lib/investmentUtils';

// ─── Types ────────────────────────────────────────────────────────────────────
type PhysicalAssetType = 'gold' | 'silver' | 'platinum' | 'bronze';
type OwnershipTag = 'self' | 'inherited' | 'gifted';

interface WealthAsset {
  id: number;
  assetName: string;
  assetType: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  totalInvested: number;
  currentValue: number;
  purchaseDate: Date;
  metadata?: any;
}

// ─── Accent colours per metal (Light-luxury themed) ───────────────────────────
const METAL_ACCENTS: Record<PhysicalAssetType, { primary: string; secondary: string; border: string; bg: string; emoji: string; label: string }> = {
  gold:     { primary: '#B8960C', secondary: '#FEF3C7', border: 'border-amber-200', bg: 'bg-amber-50/50',     emoji: '🥇', label: 'Gold'     },
  silver:   { primary: '#64748B', secondary: '#F1F5F9', border: 'border-slate-200', bg: 'bg-slate-50/50',     emoji: '🥈', label: 'Silver'   },
  platinum: { primary: '#6366F1', secondary: '#EEF2FF', border: 'border-indigo-200', bg: 'bg-indigo-50/50',   emoji: '💎', label: 'Platinum' },
  bronze:   { primary: '#C2410C', secondary: '#FFEDD5', border: 'border-orange-200', bg: 'bg-orange-50/50',   emoji: '🏆', label: 'Bronze'   },
};

const OWNERSHIP_BADGE: Record<OwnershipTag, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  self:      { label: 'Self-Purchased', bg: 'bg-blue-50',     text: 'text-blue-700',     icon: <ShoppingBag size={10} /> },
  inherited: { label: 'Inherited',      bg: 'bg-amber-50',    text: 'text-amber-700',    icon: <Users size={10} /> },
  gifted:    { label: 'Gifted',         bg: 'bg-pink-50',     text: 'text-pink-700',     icon: <Gift size={10} /> },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isPhysicalMetal(type: string): type is PhysicalAssetType {
  return ['gold', 'silver', 'platinum', 'bronze'].includes(type);
}

function getNormalizedMetalType(inv: any): PhysicalAssetType | null {
  const type = (inv.assetType || inv.type || '').toLowerCase();
  const category = (inv.metadata?.category || inv.category || '').toLowerCase();
  const name = (inv.assetName || inv.name || '').toLowerCase();

  if (type === 'gold' || category.includes('gold') || name.includes('gold')) return 'gold';
  if (type === 'silver' || category.includes('silver') || name.includes('silver')) return 'silver';
  if (type === 'platinum' || category.includes('platinum') || name.includes('platinum')) return 'platinum';
  if (type === 'bronze' || category.includes('bronze') || name.includes('bronze')) return 'bronze';
  return null;
}

function getMetalWeight(asset: WealthAsset): number {
  return asset.metadata?.weightGrams ?? asset.quantity ?? 0;
}

function getOwnershipTag(asset: WealthAsset): OwnershipTag {
  const tag = asset.metadata?.ownershipTag;
  if (tag === 'self' || tag === 'inherited' || tag === 'gifted') return tag;
  return 'self';
}

function getLockerName(asset: WealthAsset): string {
  return asset.metadata?.lockerName ?? 'Unassigned';
}

// Fallback prices deliberately live in lib/metalPriceService.ts only.
//
// This file used to keep its own copy — gold at $77.50/g, roughly 41% below the
// real market when that was found — which meant a second stale number could be
// rendered even after the service was corrected. `fetchMetalPrices()` always
// resolves to *something* and reports its `source`, so there is nothing left for a
// local baseline to do.

export const WealthVaultDashboard: React.FC<{ onAddAsset?: () => void }> = ({ onAddAsset }) => {
  const { investments, currency, setCurrentPage } = useApp();
  const [metalPrices, setMetalPrices] = useState<MetalPrices | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [usdToTargetRate, setUsdToTargetRate] = useState<number>(1);
  const refreshingRef = useRef(false);
  const currencySymbol = getCurrencySymbol(currency);

  const goldEntries = useLiveQuery(() => db.gold.toArray(), []) || [];

  const localGoldAssets = useMemo<WealthAsset[]>(() => {
    return goldEntries.map(g => {
      const weightGrams = g.unit === 'kg' ? g.quantity * 1000 : g.unit === 'ounce' ? g.quantity * 31.1035 : g.quantity;
      const buyPricePerGram = g.purchasePrice > 0 ? (g.purchasePrice < 10000 ? g.purchasePrice : g.purchasePrice / Math.max(weightGrams, 1)) : 0;
      const totalInvested = g.purchasePrice > 10000 ? g.purchasePrice : weightGrams * g.purchasePrice;
      const currPrice = g.currentPrice || buyPricePerGram;
      const currentValue = weightGrams * currPrice;

      return {
        id: g.id || Math.random(),
        assetName: `Physical Gold (${g.purityPercentage ? g.purityPercentage + '%' : '22K'})`,
        assetType: 'gold',
        quantity: weightGrams,
        buyPrice: buyPricePerGram,
        currentPrice: currPrice,
        totalInvested: totalInvested,
        currentValue: currentValue,
        purchaseDate: g.purchaseDate ? new Date(g.purchaseDate) : new Date(),
        metadata: {
          weightGrams,
          purityPercentage: g.purityPercentage,
          lockerName: g.location || 'Home Safe',
          ownershipTag: 'self',
        },
      };
    });
  }, [goldEntries]);

  // ── Load USD to Active Currency FX Rate ───────────────────────────────────────
  useEffect(() => {
    let active = true;
    const loadFxRate = async () => {
      try {
        const rate = await fetchCurrencyConversionRate('USD', currency);
        if (active) {
          setUsdToTargetRate(rate || 1);
        }
      } catch (err) {
        console.error('Failed to load conversion rate for Wealth Vault:', err);
      }
    };
    loadFxRate();
    return () => { active = false; };
  }, [currency]);

  // ── Fetch live metal prices ──────────────────────────────────────────────────
  const loadPrices = useCallback(async (manual = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!manual) setLoadingPrices(true);
    try {
      const prices = await fetchMetalPrices();
      setMetalPrices(prices);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error('Metal price fetch failed:', e);
    } finally {
      setLoadingPrices(false);
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => { loadPrices(); }, [loadPrices]);

  // ── Filter only physical wealth assets ────────────────────────────────────────
  const wealthAssets = useMemo<WealthAsset[]>(() => {
    const fromInvestments: WealthAsset[] = (investments as any[])
      .map(inv => {
        const metalType = getNormalizedMetalType(inv);
        if (metalType) {
          return {
            id: inv.id,
            assetName: inv.assetName || inv.name || 'Gold Asset',
            assetType: metalType,
            quantity: inv.quantity || 1,
            buyPrice: inv.buyPrice || 0,
            currentPrice: inv.currentPrice || inv.buyPrice || 0,
            totalInvested: inv.totalInvested || (inv.quantity * inv.buyPrice) || 0,
            currentValue: inv.currentValue || (inv.quantity * (inv.currentPrice || inv.buyPrice)) || 0,
            purchaseDate: inv.purchaseDate ? new Date(inv.purchaseDate) : new Date(),
            metadata: {
              weightGrams: inv.metadata?.weightGrams ?? inv.quantity,
              purityPercentage: inv.metadata?.purityPercentage ?? 91.6,
              lockerName: inv.metadata?.lockerName ?? 'Home Safe',
              ownershipTag: inv.metadata?.ownershipTag ?? 'self',
              ...inv.metadata,
            },
          };
        }
        if (inv.assetType === 'real_estate' || inv.assetType === 'business') {
          return inv;
        }
        return null;
      })
      .filter(Boolean) as WealthAsset[];

    return [...localGoldAssets, ...fromInvestments];
  }, [investments, localGoldAssets]);


  const physicalMetals = useMemo(() =>
    wealthAssets.filter(a => isPhysicalMetal(a.assetType)),
    [wealthAssets]
  );

  const realEstateAssets = useMemo(() =>
    wealthAssets.filter(a => a.assetType === 'real_estate'),
    [wealthAssets]
  );

  const businessAssets = useMemo(() =>
    wealthAssets.filter(a => a.assetType === 'business'),
    [wealthAssets]
  );

  // Helper to convert metal USD price to target currency
  const getMetalPriceInTarget = useCallback((metal: PhysicalAssetType) => {
    const usdPrice = metalPrices?.[metal] ?? 0;
    const baseInTarget = usdPrice * usdToTargetRate;
    if (currency === 'INR' || currencySymbol === '₹') {
      if (metal === 'gold') return baseInTarget * 1.18;
      if (metal === 'silver') return baseInTarget * 1.15;
    }
    return baseInTarget;
  }, [metalPrices, usdToTargetRate, currency, currencySymbol]);


  // ── Portfolio calculations ─────────────────────────────────────────────────────
  const portfolioStats = useMemo(() => {
    let liveValue = 0;
    let invested = 0;

    for (const asset of physicalMetals) {
      const metalType = asset.assetType as PhysicalAssetType;
      const weightGrams = getMetalWeight(asset);
      if (weightGrams > 0) {
        const pricePerGram = getMetalPriceInTarget(metalType);
        liveValue += pricePerGram * weightGrams;
      } else {
        liveValue += asset.currentValue ?? 0;
      }
      invested += asset.totalInvested ?? 0;
    }

    for (const asset of [...realEstateAssets, ...businessAssets]) {
      liveValue += asset.currentValue ?? 0;
      invested += asset.totalInvested ?? 0;
    }

    const gainLoss = liveValue - invested;
    const gainLossPct = invested > 0 ? (gainLoss / invested) * 100 : 0;
    return { liveValue, invested, gainLoss, gainLossPct };
  }, [physicalMetals, realEstateAssets, businessAssets, getMetalPriceInTarget]);

  // ── Metal breakdown ────────────────────────────────────────────────────────────
  const metalBreakdown = useMemo(() => {
    return (['gold', 'silver', 'platinum', 'bronze'] as PhysicalAssetType[]).map(metal => {
      const assets = physicalMetals.filter(a => a.assetType === metal);
      const totalWeight = assets.reduce((s, a) => s + getMetalWeight(a), 0);
      const pricePerGram = getMetalPriceInTarget(metal);
      const liveValue = totalWeight * pricePerGram;
      const invested = assets.reduce((s, a) => s + (a.totalInvested ?? 0), 0);
      return { metal, assets, totalWeight, pricePerGram, liveValue, invested };
    });
  }, [physicalMetals, getMetalPriceInTarget]);

  // ── Locker grouping ────────────────────────────────────────────────────────────
  const lockerGroups = useMemo(() => {
    const map = new Map<string, WealthAsset[]>();
    for (const asset of physicalMetals) {
      const locker = getLockerName(asset);
      if (!map.has(locker)) map.set(locker, []);
      map.get(locker)!.push(asset);
    }
    return Array.from(map.entries()).map(([locker, assets]) => ({ locker, assets }));
  }, [physicalMetals]);

  // ── Formatters ─────────────────────────────────────────────────────────────────
  const fmt = (n: number) => formatCurrencyAmount(n, currency);

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="pb-24 space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-black tracking-widest text-amber-600 uppercase">
            Family Wealth
          </p>
          <h2 className="text-gray-900 text-xl font-bold tracking-tight mt-0.5">Vault Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadPrices(true)}
            className="p-2.5 rounded-xl border border-gray-200 bg-white shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
            title="Refresh prices"
            data-testid="vault-refresh-prices-button"
          >
            <RefreshCw
              size={14}
              className={`text-gray-500 ${loadingPrices ? 'animate-spin text-amber-500' : ''}`}
            />
          </button>
          <button
            onClick={onAddAsset ?? (() => setCurrentPage('add-investment'))}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-gray-950 hover:bg-gray-800 text-white shadow transition-all active:scale-95"
            data-testid="vault-add-asset-button"
          >
            <Plus size={13} />
            Add Asset
          </button>
        </div>
      </div>

      {/* Freshness label reflects where the numbers actually came from. It used to
          read "Live metal spot rates" unconditionally, including when the price was
          fabricated locally — the single most misleading thing on this screen. */}
      {lastRefreshed && metalPrices && (
        <p className="text-[9px] text-gray-400 font-medium tracking-wide px-1 -mt-4">
          {metalPrices.source === 'live'
            ? `Live metal spot rates updated at ${lastRefreshed.toLocaleTimeString()}`
            : metalPrices.source === 'cached'
              ? `Showing last known spot rates from ${new Date(metalPrices.lastUpdated).toLocaleString()}`
              : 'Live spot rates unavailable — values below are indicative only, not a market quote.'}
        </p>
      )}

      {/* Metal Spot Rate Ticker Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4 border border-amber-500/20">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              metalPrices?.source === 'live'
                ? 'bg-emerald-400 animate-pulse'
                : metalPrices?.source === 'cached'
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-black tracking-wider text-amber-400 uppercase">
            {metalPrices?.source === 'live'
              ? 'Live Spot Rates (India Market)'
              : metalPrices?.source === 'cached'
                ? 'Last Known Spot Rates (India Market)'
                : 'Spot Rates Unavailable'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">24K Pure Gold:</span>
            <span className="font-extrabold text-amber-300">
              {fmt(getMetalPriceInTarget('gold'))}/g ({fmt(getMetalPriceInTarget('gold') * 10)} / 10g)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">22K Standard Gold:</span>
            <span className="font-extrabold text-amber-200">
              {fmt(getMetalPriceInTarget('gold') * 0.9167)}/g ({fmt(getMetalPriceInTarget('gold') * 9.167)} / 10g)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Fine Silver:</span>
            <span className="font-extrabold text-slate-200">
              {fmt(getMetalPriceInTarget('silver'))}/g ({fmt(getMetalPriceInTarget('silver') * 1000)} / 1kg)
            </span>
          </div>
        </div>
      </div>


      {/* Hero Stats Card */}
      <div className="bg-gradient-to-br from-amber-50/70 to-orange-50/50 border border-amber-200/80 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        {/* Aesthetic background mesh */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-radial-gradient from-amber-200/20 to-transparent pointer-events-none rounded-full blur-2xl" />

        <p className="text-[9px] font-bold tracking-widest text-amber-700 uppercase">
          Total Vault Value
        </p>
        
        {loadingPrices ? (
          <div className="flex items-center gap-2 mt-2">
            <Loader2 size={20} className="animate-spin text-amber-600" />
            <span className="text-gray-500 text-sm font-medium">Fetching live prices…</span>
          </div>
        ) : (
          <h3 className="text-3xl font-black text-gray-900 tracking-tight mt-1">
            {fmt(portfolioStats.liveValue)}
          </h3>
        )}

        <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-amber-200/50">
          <div>
            <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">
              Invested Capital
            </p>
            <p className="text-sm font-black text-gray-800 mt-1">
              {fmt(portfolioStats.invested)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">
              Live Gain/Loss
            </p>
            <p className={`text-sm font-black mt-1 ${portfolioStats.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {portfolioStats.gainLoss >= 0 ? '+' : ''}{fmt(portfolioStats.gainLoss)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">
              Return %
            </p>
            <div className="flex items-center gap-1 mt-1">
              {portfolioStats.gainLoss >= 0
                ? <TrendingUp size={12} className="text-green-600" />
                : <TrendingDown size={12} className="text-red-600" />}
              <p className={`text-sm font-black ${portfolioStats.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolioStats.gainLossPct >= 0 ? '+' : ''}{portfolioStats.gainLossPct.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AI OCR Bill Scan Banner */}
      <button
        onClick={onAddAsset ?? (() => setCurrentPage('add-investment'))}
        className="w-full relative overflow-hidden rounded-2xl border border-amber-200 bg-white hover:bg-amber-50/20 p-4 transition-all active:scale-99 text-left flex items-center justify-between shadow-sm"
        data-testid="vault-scan-bill-banner"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <Scan size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Scan Jeweller Bill</p>
            <p className="text-xs text-gray-500 mt-0.5">
              AI reads jeweler invoices to auto-fill weight, purity, HUID & purchase price
            </p>
          </div>
        </div>
        <ChevronRight size={16} className="text-amber-600/70" />
      </button>

      {/* Precious Metals Section */}
      {physicalMetals.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-1">
            Precious Metals
          </p>
          <div className="grid grid-cols-2 gap-3">
            {metalBreakdown.filter(m => m.assets.length > 0).map(({ metal, totalWeight, pricePerGram, liveValue, invested }) => {
              const accent = METAL_ACCENTS[metal];
              const gain = liveValue - invested;
              return (
                <div
                  key={metal}
                  className={`relative overflow-hidden rounded-xl border ${accent.border} ${accent.bg} p-4 shadow-sm`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xl">{accent.emoji}</span>
                      <p className="text-[10px] font-extrabold uppercase tracking-wide mt-1.5" style={{ color: accent.primary }}>
                        {accent.label}
                      </p>
                    </div>
                    {gain >= 0
                      ? <TrendingUp size={14} className="text-green-600" />
                      : <TrendingDown size={14} className="text-red-600" />}
                  </div>
                  <div className="mt-3">
                    <p className="text-lg font-black text-gray-900">
                      {fmt(liveValue)}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                      {totalWeight.toFixed(2)} g · {currencySymbol}{pricePerGram.toFixed(2)}/g
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real Estate Section */}
      {realEstateAssets.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-1">
            Real Estate Properties
          </p>
          <div className="grid grid-cols-1 gap-3">
            {realEstateAssets.map(asset => (
              <div key={asset.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-950">{asset.assetName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {asset.metadata?.propertyType ?? 'Property'} · {asset.metadata?.location ?? '—'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">{fmt(asset.currentValue)}</p>
                  {asset.metadata?.rentalYield && (
                    <p className="text-[10px] text-green-600 font-bold mt-0.5">
                      {asset.metadata.rentalYield}% yield
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Business holdings */}
      {businessAssets.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-1">
            Business Partnerships
          </p>
          <div className="grid grid-cols-1 gap-3">
            {businessAssets.map(asset => (
              <div key={asset.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                    <Briefcase size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-950">{asset.assetName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {asset.metadata?.ownershipPercent ?? '—'}% share · {asset.metadata?.sector ?? 'Business'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">{fmt(asset.currentValue)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset Inventory List */}
      {physicalMetals.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-1">
            Metal Catalog
          </p>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {physicalMetals.map((asset) => {
              const metalType = (asset.assetType as PhysicalAssetType) || 'gold';
              const accent = METAL_ACCENTS[metalType] ?? METAL_ACCENTS.gold;
              const ownershipTag = getOwnershipTag(asset);
              const badge = OWNERSHIP_BADGE[ownershipTag] || OWNERSHIP_BADGE.self;
              const weightGrams = getMetalWeight(asset);
              const pricePerGram = getMetalPriceInTarget(metalType);
              const liveVal = weightGrams > 0 ? weightGrams * pricePerGram : asset.currentValue;
              const gain = liveVal - (asset.totalInvested ?? 0);
              const locker = getLockerName(asset);

              return (
                <div key={asset.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl ${accent.bg} border ${accent.border} flex items-center justify-center shrink-0`}>
                      <span className="text-base">{accent.emoji}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-950 truncate">{asset.assetName}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${badge.bg} ${badge.text} flex items-center gap-1`}>
                          {badge.icon} {badge.label}
                        </span>
                        {asset.metadata?.purity && (
                          <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {asset.metadata.purity}
                          </span>
                        )}
                        <span className="text-[9px] font-medium text-gray-400 flex items-center gap-0.5">
                          <MapPin size={8} /> {locker}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-gray-900">{fmt(liveVal)}</p>
                    <p className={`text-[10px] font-bold mt-0.5 ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gain >= 0 ? '+' : ''}{fmt(gain)}
                    </p>
                    {weightGrams > 0 && (
                      <p className="text-[9px] text-gray-400 mt-0.5">{weightGrams.toFixed(2)} g</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Storage Locker Groups */}
      {lockerGroups.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-1">
            Secure Storage Location Map
          </p>
          <div className="grid grid-cols-2 gap-3">
            {lockerGroups.map(({ locker, assets }) => {
              const totalWeight = assets.reduce((s, a) => s + getMetalWeight(a), 0);
              const isBank = locker.toLowerCase().includes('bank') || locker.toLowerCase().includes('locker');
              return (
                <div key={locker} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${isBank ? 'bg-indigo-50 border-indigo-100 text-indigo-500' : 'bg-amber-50 border-amber-100 text-amber-500'} mb-3`}>
                    {isBank ? <Lock size={15} /> : <Home size={15} />}
                  </div>
                  <p className="text-sm font-bold text-gray-900">{locker}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {assets.length} {assets.length === 1 ? 'item' : 'items'}
                  </p>
                  {totalWeight > 0 && (
                    <p className="text-[10px] text-gray-400 font-medium mt-1">
                      {totalWeight.toFixed(2)} g total
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {assets.slice(0, 2).map(a => (
                      <span key={a.id} className="text-[9px] font-bold px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-gray-600">
                        {METAL_ACCENTS[a.assetType as PhysicalAssetType]?.emoji ?? '📦'} {(a.assetName || 'Asset').split(' ').slice(0, 2).join(' ')}
                      </span>
                    ))}
                    {assets.length > 2 && (
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-gray-400">
                        +{assets.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {wealthAssets.length === 0 && (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 margin-0 mx-auto mb-4">
            <Gem size={28} />
          </div>
          <h3 className="text-base font-bold text-gray-950">Your Vault is Empty</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-[260px] mx-auto">
            Securely track gold, silver, real estate, and private business investments in one place.
          </p>
          <button
            onClick={onAddAsset ?? (() => setCurrentPage('add-investment'))}
            className="mt-5 px-5 py-2.5 bg-gray-950 hover:bg-gray-800 text-white rounded-xl text-xs font-bold shadow active:scale-95 transition-all"
            data-testid="vault-empty-state-add-button"
          >
            Add First Wealth Asset
          </button>
        </div>
      )}
    </div>
  );
};
