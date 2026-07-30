import { InvestmentV2, MainCategoryCode, SubcategoryCode } from '@/types/investmentV2';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

export interface PortfolioAllocationItem {
  categoryCode: MainCategoryCode;
  categoryName: string;
  value: number;
  percentage: number;
  color: string;
}

export interface PortfolioSubcategoryAllocationItem {
  subcategoryCode: SubcategoryCode;
  subcategoryName: string;
  value: number;
  percentage: number;
  color: string;
}

export interface PortfolioMetricsV2 {
  totalInvested: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  
  // Asset Allocation breakdown
  marketAssetsValue: number;
  marketAssetsPercentage: number;
  
  physicalAssetsValue: number;
  physicalAssetsPercentage: number;
  
  propertyValue: number;
  propertyPercentage: number;
  
  businessValue: number;
  businessPercentage: number;
  
  cashEquivalentValue: number;
  cashEquivalentPercentage: number;
  
  allocationByCategory: PortfolioAllocationItem[];
  allocationBySubcategory: PortfolioSubcategoryAllocationItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  market_assets: '#4f46e5',     // Indigo
  physical_assets: '#d4af37',   // Gold
  other_investments: '#10b981', // Emerald
};

const SUBCATEGORY_COLORS: Record<string, string> = {
  stocks: '#4f46e5',
  mutual_funds: '#6366f1',
  etf: '#818cf8',
  bonds: '#0284c7',
  fd: '#0ea5e9',
  rd: '#38bdf8',
  crypto: '#f59e0b',
  forex: '#84cc16',
  commodities: '#b45309',
  gold: '#d4af37',
  silver: '#94a3b8',
  property: '#10b981',
  business: '#059669',
  collectibles: '#ec4899',
  private_equity: '#8b5cf6',
  other: '#64748b',
};

/**
 * Calculates complete V2 portfolio metrics, P&L, and asset allocation percentages
 */
export function calculatePortfolioMetricsV2(
  investments: InvestmentV2[] | Array<Record<string, any>>,
  currency: string = 'INR',
  livePricesMap?: Record<string, number>
): PortfolioMetricsV2 {
  let totalInvested = 0;
  let currentValue = 0;

  let marketAssetsValue = 0;
  let physicalAssetsValue = 0;
  let propertyValue = 0;
  let businessValue = 0;
  let cashEquivalentValue = 0;

  const subcategoryValues: Record<string, number> = {};

  for (const inv of investments) {
    if (inv.deletedAt || inv.positionStatus === 'closed') continue;

    const qty = Number(inv.quantity) || (inv.physicalAssetDetails?.weight ? Number(inv.physicalAssetDetails.weight) : 1);
    const buyP = Number(inv.buyPrice) || Number(inv.purchasePrice) || 0;
    const invested = Number(inv.totalInvested) || (qty * buyP) + (Number(inv.purchaseFees) || 0);

    let unitCurrentPrice = Number(inv.currentPrice) || Number(inv.currentMarketValue) || buyP;

    // Use live price snapshot if available for symbol
    if (inv.symbol && livePricesMap && livePricesMap[inv.symbol] !== undefined) {
      unitCurrentPrice = livePricesMap[inv.symbol];
    }

    const val = Number(inv.currentValue) || (qty * unitCurrentPrice);

    totalInvested += invested;
    currentValue += val;

    // Categorize
    const catCode = inv.categoryCode || (inv.assetType === 'real_estate' ? 'other_investments' : (inv.assetType === 'gold' || inv.assetType === 'silver' ? 'physical_assets' : 'market_assets'));
    const subCode = inv.subcategoryCode || inv.assetType || 'stocks';

    subcategoryValues[subCode] = (subcategoryValues[subCode] || 0) + val;

    if (catCode === 'market_assets') {
      marketAssetsValue += val;
      if (subCode === 'fd' || subCode === 'rd') {
        cashEquivalentValue += val;
      }
    } else if (catCode === 'physical_assets') {
      physicalAssetsValue += val;
    } else if (catCode === 'other_investments') {
      if (subCode === 'property') {
        propertyValue += val;
      } else if (subCode === 'business') {
        businessValue += val;
      }
    }
  }

  const profitLoss = currentValue - totalInvested;
  const profitLossPercentage = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;

  const denominator = currentValue > 0 ? currentValue : 1;

  const allocationByCategory: PortfolioAllocationItem[] = [
    {
      categoryCode: 'market_assets' as MainCategoryCode,
      categoryName: 'Market Assets',
      value: marketAssetsValue,
      percentage: currentValue > 0 ? (marketAssetsValue / denominator) * 100 : 0,
      color: CATEGORY_COLORS['market_assets'],
    },
    {
      categoryCode: 'physical_assets' as MainCategoryCode,
      categoryName: 'Physical Assets',
      value: physicalAssetsValue,
      percentage: currentValue > 0 ? (physicalAssetsValue / denominator) * 100 : 0,
      color: CATEGORY_COLORS['physical_assets'],
    },
    {
      categoryCode: 'other_investments' as MainCategoryCode,
      categoryName: 'Other Investments',
      value: propertyValue + businessValue,
      percentage: currentValue > 0 ? ((propertyValue + businessValue) / denominator) * 100 : 0,
      color: CATEGORY_COLORS['other_investments'],
    },
  ].filter(item => item.value > 0);

  const allocationBySubcategory: PortfolioSubcategoryAllocationItem[] = Object.entries(subcategoryValues)
    .map(([subCode, val]) => ({
      subcategoryCode: subCode as SubcategoryCode,
      subcategoryName: subCode.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value: val,
      percentage: currentValue > 0 ? (val / denominator) * 100 : 0,
      color: SUBCATEGORY_COLORS[subCode] || '#64748b',
    }))
    .sort((a, b) => b.value - a.value);

  return {
    totalInvested,
    currentValue,
    profitLoss,
    profitLossPercentage,
    marketAssetsValue,
    marketAssetsPercentage: currentValue > 0 ? (marketAssetsValue / denominator) * 100 : 0,
    physicalAssetsValue,
    physicalAssetsPercentage: currentValue > 0 ? (physicalAssetsValue / denominator) * 100 : 0,
    propertyValue,
    propertyPercentage: currentValue > 0 ? (propertyValue / denominator) * 100 : 0,
    businessValue,
    businessPercentage: currentValue > 0 ? (businessValue / denominator) * 100 : 0,
    cashEquivalentValue,
    cashEquivalentPercentage: currentValue > 0 ? (cashEquivalentValue / denominator) * 100 : 0,
    allocationByCategory,
    allocationBySubcategory,
  };
}
