import { Investment } from '@/lib/database';
import {
  buildFxSymbol,
  convertCurrencyAmount,
  getConversionRateFromQuotes,
  getCurrencySymbol,
  normalizeCurrencyCode,
} from '@/lib/currencyUtils';
import { displaySymbol, fetchStockQuote, StockQuote } from '@/lib/stockApi';

export const isQuotedInvestment = (assetType: string) =>
  assetType === 'stock' || assetType === 'crypto';

export const resolveInvestmentQuoteSymbol = (assetName: string, assetType: string) => {
  const trimmedName = assetName.trim();
  const explicitTicker = trimmedName.match(/\(([A-Z0-9.=^-]+)\)\s*$/i)?.[1]?.toUpperCase();
  const bareTicker = /^[A-Z0-9.=^-]+$/.test(trimmedName.toUpperCase())
    ? trimmedName.toUpperCase()
    : null;
  const normalizedTicker = explicitTicker ?? bareTicker;

  if (!normalizedTicker) {
    return null;
  }

  if (explicitTicker) {
    return explicitTicker;
  }

  if (
    normalizedTicker.includes('.') ||
    normalizedTicker.includes('=') ||
    normalizedTicker.includes('^') ||
    normalizedTicker.includes('-')
  ) {
    return normalizedTicker;
  }

  return assetType === 'crypto'
    ? `${normalizedTicker}-USD`
    : `${normalizedTicker}.NS`;
};

export const getInvestmentDisplayName = (assetName: string) =>
  assetName.includes(' ') ? assetName : displaySymbol(assetName);

export const isClosedInvestment = (investment: Pick<Investment, 'positionStatus'>) =>
  investment.positionStatus === 'closed';

export const inferInvestmentAssetCurrency = (
  investment: Pick<Investment, 'assetCurrency' | 'assetName' | 'assetType'>,
  liveQuote?: Pick<StockQuote, 'currencyCode' | 'currency'> | null,
) => {
  if (investment.assetCurrency) {
    return normalizeCurrencyCode(investment.assetCurrency);
  }

  if (liveQuote?.currencyCode || liveQuote?.currency) {
    return normalizeCurrencyCode(liveQuote.currencyCode || liveQuote.currency);
  }

  const normalizedName = investment.assetName.trim().toUpperCase();
  if (normalizedName.endsWith('.NS') || normalizedName.endsWith('.BO')) {
    return 'INR';
  }

  if (normalizedName.endsWith('-USD') || investment.assetType === 'crypto' || normalizedName.endsWith('.US')) {
    return 'USD';
  }

  if (normalizedName.endsWith('=X') && normalizedName.length >= 6) {
    return normalizeCurrencyCode(normalizedName.slice(3, 6), 'USD');
  }

  return 'USD';
};

export const getRequiredInvestmentQuoteSymbols = (
  investments: Investment[],
  displayCurrency: string,
) => {
  const symbols = new Set<string>();
  const normalizedDisplayCurrency = normalizeCurrencyCode(displayCurrency);

  investments
    .filter(investment => !isClosedInvestment(investment))
    .forEach((investment) => {
      const quoteSymbol = resolveInvestmentQuoteSymbol(investment.assetName, investment.assetType);
      if (quoteSymbol) {
        symbols.add(quoteSymbol);
      }

      const assetCurrency = inferInvestmentAssetCurrency(investment);
      const fxSymbol = buildFxSymbol(assetCurrency, normalizedDisplayCurrency);
      if (fxSymbol) {
        symbols.add(fxSymbol);
      }

      const baseFxSymbol = buildFxSymbol(investment.baseCurrency || normalizedDisplayCurrency, normalizedDisplayCurrency);
      if (baseFxSymbol) {
        symbols.add(baseFxSymbol);
      }
    });

  return Array.from(symbols);
};

export const fetchCurrencyConversionRate = async (
  fromCurrency: string,
  toCurrency: string,
): Promise<number> => {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);

  if (from === to) {
    return 1;
  }

  const directSymbol = buildFxSymbol(from, to);
  if (directSymbol) {
    const directQuote = await fetchStockQuote(directSymbol, 'forex');
    if (directQuote?.lastPrice && Number.isFinite(directQuote.lastPrice) && directQuote.lastPrice > 0) {
      return directQuote.lastPrice;
    }
  }

  const inverseSymbol = buildFxSymbol(to, from);
  if (inverseSymbol) {
    const inverseQuote = await fetchStockQuote(inverseSymbol, 'forex');
    if (inverseQuote?.lastPrice && Number.isFinite(inverseQuote.lastPrice) && inverseQuote.lastPrice > 0) {
      return 1 / inverseQuote.lastPrice;
    }
  }

  if (from !== 'USD' && to !== 'USD') {
    const fromToUsd = await fetchCurrencyConversionRate(from, 'USD');
    const usdToTarget = await fetchCurrencyConversionRate('USD', to);
    if (fromToUsd > 0 && usdToTarget > 0) {
      return fromToUsd * usdToTarget;
    }
  }

  return 1;
};

export interface InvestmentMetrics {
  quoteSymbol: string | null;
  assetCurrency: string;
  assetCurrencySymbol: string;
  displayCurrency: string;
  displayCurrencySymbol: string;
  nativeBuyPrice: number;
  nativeCurrentPrice: number;
  convertedBuyPrice: number;
  convertedCurrentPrice: number;
  totalInvested: number;
  currentValue: number;
  profitLoss: number;
  percentChange: number;
  isLive: boolean;
  positionStatus: 'open' | 'closed';
  grossSaleValue?: number;
  netSaleValue?: number;
  closingFees?: number;
  realizedProfitLoss?: number;
}

export const getInvestmentMetrics = (
  investment: Investment,
  displayCurrency: string,
  quotes: Record<string, StockQuote | null>,
): InvestmentMetrics => {
  const quoteSymbol = resolveInvestmentQuoteSymbol(investment.assetName, investment.assetType);
  const liveQuote = quoteSymbol ? quotes[quoteSymbol] : null;
  const normalizedDisplayCurrency = normalizeCurrencyCode(displayCurrency);
  const storedBaseCurrency = normalizeCurrencyCode(investment.baseCurrency, normalizedDisplayCurrency);
  const assetCurrency = inferInvestmentAssetCurrency(investment, liveQuote);
  const assetToDisplayRate = getConversionRateFromQuotes(assetCurrency, normalizedDisplayCurrency, quotes);
  const storedToDisplayRate = getConversionRateFromQuotes(storedBaseCurrency, normalizedDisplayCurrency, quotes);
  const nativeBuyPrice = Number(investment.buyPrice) || 0;
  const nativeCurrentPrice = Number(liveQuote?.lastPrice ?? investment.currentPrice) || 0;
  const nativeInvested = Number(investment.totalInvestedNative) || nativeBuyPrice * (Number(investment.quantity) || 0);
  const trustedStoredTotals = investment.valuationVersion === 2;
  const totalInvested = trustedStoredTotals
    ? (Number(investment.totalInvested) || 0) * storedToDisplayRate
    : nativeInvested * assetToDisplayRate;
  const currentValue = isClosedInvestment(investment)
    ? 0
    : nativeCurrentPrice * (Number(investment.quantity) || 0) * assetToDisplayRate;
  const realizedProfitLoss = investment.realizedProfitLoss != null
    ? Number(investment.realizedProfitLoss) * storedToDisplayRate
    : undefined;
  const grossSaleValue = investment.grossSaleValue != null
    ? Number(investment.grossSaleValue) * storedToDisplayRate
    : undefined;
  const netSaleValue = investment.netSaleValue != null
    ? Number(investment.netSaleValue) * storedToDisplayRate
    : undefined;
  const closingFees = investment.closingFees != null
    ? Number(investment.closingFees) * storedToDisplayRate
    : undefined;
  const profitLoss = isClosedInvestment(investment)
    ? realizedProfitLoss ?? (Number(investment.profitLoss) || 0) * storedToDisplayRate
    : currentValue - totalInvested;
  const convertedBuyPrice = convertCurrencyAmount(nativeBuyPrice, assetCurrency, normalizedDisplayCurrency, quotes);
  const convertedCurrentPrice = convertCurrencyAmount(nativeCurrentPrice, assetCurrency, normalizedDisplayCurrency, quotes);

  return {
    quoteSymbol,
    assetCurrency,
    assetCurrencySymbol: getCurrencySymbol(assetCurrency),
    displayCurrency: normalizedDisplayCurrency,
    displayCurrencySymbol: getCurrencySymbol(normalizedDisplayCurrency),
    nativeBuyPrice,
    nativeCurrentPrice,
    convertedBuyPrice,
    convertedCurrentPrice,
    totalInvested,
    currentValue,
    profitLoss,
    percentChange: totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0,
    isLive: Boolean(liveQuote),
    positionStatus: investment.positionStatus ?? 'open',
    grossSaleValue,
    netSaleValue,
    closingFees,
    realizedProfitLoss,
  };
};
