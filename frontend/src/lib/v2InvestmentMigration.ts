import { db } from '@/lib/database';
import {
  MainCategoryCode,
  SubcategoryCode,
  InvestmentCategoryV2,
  InvestmentSubcategoryV2,
} from '@/types/investmentV2';

export const DEFAULT_INVESTMENT_CATEGORIES: InvestmentCategoryV2[] = [
  {
    id: 'cat_market_assets',
    name: 'Market Assets',
    code: 'market_assets',
    displayOrder: 1,
    icon: 'TrendingUp',
    status: 'active',
  },
  {
    id: 'cat_physical_assets',
    name: 'Physical Assets',
    code: 'physical_assets',
    displayOrder: 2,
    icon: 'Gem',
    status: 'active',
  },
  {
    id: 'cat_other_investments',
    name: 'Other Investments',
    code: 'other_investments',
    displayOrder: 3,
    icon: 'Briefcase',
    status: 'active',
  },
];

export const DEFAULT_INVESTMENT_SUBCATEGORIES: InvestmentSubcategoryV2[] = [
  // Market Assets Subcategories
  { id: 'sub_stocks', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Stocks', code: 'stocks', marketEnabled: true, supportsLivePrice: true, displayOrder: 1, status: 'active' },
  { id: 'sub_mutual_funds', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Mutual Funds', code: 'mutual_funds', marketEnabled: true, supportsLivePrice: true, displayOrder: 2, status: 'active' },
  { id: 'sub_etf', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'ETF', code: 'etf', marketEnabled: true, supportsLivePrice: true, displayOrder: 3, status: 'active' },
  { id: 'sub_bonds', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Bonds', code: 'bonds', marketEnabled: false, supportsLivePrice: false, displayOrder: 4, status: 'active' },
  { id: 'sub_fd', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Fixed Deposit', code: 'fd', marketEnabled: false, supportsLivePrice: false, displayOrder: 5, status: 'active' },
  { id: 'sub_rd', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Recurring Deposit', code: 'rd', marketEnabled: false, supportsLivePrice: false, displayOrder: 6, status: 'active' },
  { id: 'sub_crypto', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Crypto', code: 'crypto', marketEnabled: true, supportsLivePrice: true, displayOrder: 7, status: 'active' },
  { id: 'sub_forex', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Forex', code: 'forex', marketEnabled: true, supportsLivePrice: true, displayOrder: 8, status: 'active' },
  { id: 'sub_commodities', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Commodities', code: 'commodities', marketEnabled: true, supportsLivePrice: true, displayOrder: 9, status: 'active' },
  { id: 'sub_market_others', categoryId: 'cat_market_assets', categoryCode: 'market_assets', name: 'Others', code: 'market_others', marketEnabled: false, supportsLivePrice: false, displayOrder: 10, status: 'active' },

  // Physical Assets Subcategories
  { id: 'sub_gold', categoryId: 'cat_physical_assets', categoryCode: 'physical_assets', name: 'Gold', code: 'gold', marketEnabled: true, supportsLivePrice: true, displayOrder: 1, status: 'active' },
  { id: 'sub_silver', categoryId: 'cat_physical_assets', categoryCode: 'physical_assets', name: 'Silver', code: 'silver', marketEnabled: true, supportsLivePrice: true, displayOrder: 2, status: 'active' },
  { id: 'sub_physical_others', categoryId: 'cat_physical_assets', categoryCode: 'physical_assets', name: 'Others', code: 'physical_others', marketEnabled: false, supportsLivePrice: false, displayOrder: 3, status: 'active' },

  // Other Investments Subcategories
  { id: 'sub_property', categoryId: 'cat_other_investments', categoryCode: 'other_investments', name: 'Property', code: 'property', marketEnabled: false, supportsLivePrice: false, displayOrder: 1, status: 'active' },
  { id: 'sub_business', categoryId: 'cat_other_investments', categoryCode: 'other_investments', name: 'Business', code: 'business', marketEnabled: false, supportsLivePrice: false, displayOrder: 2, status: 'active' },
  { id: 'sub_collectibles', categoryId: 'cat_other_investments', categoryCode: 'other_investments', name: 'Collectibles', code: 'collectibles', marketEnabled: false, supportsLivePrice: false, displayOrder: 3, status: 'active' },
  { id: 'sub_private_equity', categoryId: 'cat_other_investments', categoryCode: 'other_investments', name: 'Private Equity', code: 'private_equity', marketEnabled: false, supportsLivePrice: false, displayOrder: 4, status: 'active' },
  { id: 'sub_other_investments_others', categoryId: 'cat_other_investments', categoryCode: 'other_investments', name: 'Others', code: 'other_investments_others', marketEnabled: false, supportsLivePrice: false, displayOrder: 5, status: 'active' },
];

/**
 * Legacy assetType mapper to V2 Category & Subcategory
 */
export function mapLegacyAssetTypeToV2(assetType: string): {
  categoryCode: MainCategoryCode;
  subcategoryCode: SubcategoryCode;
  categoryId: string;
  subcategoryId: string;
} {
  const norm = String(assetType || '').toLowerCase();
  switch (norm) {
    case 'stock':
    case 'stocks':
      return { categoryCode: 'market_assets', subcategoryCode: 'stocks', categoryId: 'cat_market_assets', subcategoryId: 'sub_stocks' };
    case 'crypto':
      return { categoryCode: 'market_assets', subcategoryCode: 'crypto', categoryId: 'cat_market_assets', subcategoryId: 'sub_crypto' };
    case 'mutual-funds':
    case 'mutual_funds':
    case 'fund':
    case 'funds':
      return { categoryCode: 'market_assets', subcategoryCode: 'mutual_funds', categoryId: 'cat_market_assets', subcategoryId: 'sub_mutual_funds' };
    case 'etf':
      return { categoryCode: 'market_assets', subcategoryCode: 'etf', categoryId: 'cat_market_assets', subcategoryId: 'sub_etf' };
    case 'bonds':
    case 'bond':
      return { categoryCode: 'market_assets', subcategoryCode: 'bonds', categoryId: 'cat_market_assets', subcategoryId: 'sub_bonds' };
    case 'fd':
    case 'fixed_deposit':
      return { categoryCode: 'market_assets', subcategoryCode: 'fd', categoryId: 'cat_market_assets', subcategoryId: 'sub_fd' };
    case 'rd':
    case 'recurring_deposit':
      return { categoryCode: 'market_assets', subcategoryCode: 'rd', categoryId: 'cat_market_assets', subcategoryId: 'sub_rd' };
    case 'forex':
      return { categoryCode: 'market_assets', subcategoryCode: 'forex', categoryId: 'cat_market_assets', subcategoryId: 'sub_forex' };
    case 'commodities':
      return { categoryCode: 'market_assets', subcategoryCode: 'commodities', categoryId: 'cat_market_assets', subcategoryId: 'sub_commodities' };
    case 'gold':
      return { categoryCode: 'physical_assets', subcategoryCode: 'gold', categoryId: 'cat_physical_assets', subcategoryId: 'sub_gold' };
    case 'silver':
      return { categoryCode: 'physical_assets', subcategoryCode: 'silver', categoryId: 'cat_physical_assets', subcategoryId: 'sub_silver' };
    case 'platinum':
    case 'bronze':
      return { categoryCode: 'physical_assets', subcategoryCode: 'physical_others', categoryId: 'cat_physical_assets', subcategoryId: 'sub_physical_others' };
    case 'real_estate':
    case 'real-estate':
    case 'property':
      return { categoryCode: 'other_investments', subcategoryCode: 'property', categoryId: 'cat_other_investments', subcategoryId: 'sub_property' };
    case 'business':
      return { categoryCode: 'other_investments', subcategoryCode: 'business', categoryId: 'cat_other_investments', subcategoryId: 'sub_business' };
    case 'collectibles':
      return { categoryCode: 'other_investments', subcategoryCode: 'collectibles', categoryId: 'cat_other_investments', subcategoryId: 'sub_collectibles' };
    case 'private_equity':
      return { categoryCode: 'other_investments', subcategoryCode: 'private_equity', categoryId: 'cat_other_investments', subcategoryId: 'sub_private_equity' };
    default:
      return { categoryCode: 'market_assets', subcategoryCode: 'market_others', categoryId: 'cat_market_assets', subcategoryId: 'sub_market_others' };
  }
}

/**
 * Migration executor to ensure standard V2 categories/subcategories exist in Dexie
 * and legacy investment records have categoryId, subcategoryId, categoryCode, subcategoryCode.
 */
export async function runV2InvestmentMigration(): Promise<void> {
  try {
    if (!db.investmentCategories || !db.investmentSubcategories) return;

    const countCat = await db.investmentCategories.count();
    if (countCat === 0) {
      await db.investmentCategories.bulkPut(DEFAULT_INVESTMENT_CATEGORIES);
    }

    const countSub = await db.investmentSubcategories.count();
    if (countSub === 0) {
      await db.investmentSubcategories.bulkPut(DEFAULT_INVESTMENT_SUBCATEGORIES);
    }

    // Migrate existing legacy records
    const legacyInvestments = await db.investments.toArray();
    for (const record of legacyInvestments as Array<Record<string, any>>) {
      if (!record.categoryCode || !record.subcategoryCode) {
        const mapping = mapLegacyAssetTypeToV2(record.assetType || 'other');
        await db.investments.put({
          ...record,
          categoryId: record.categoryId || mapping.categoryId,
          subcategoryId: record.subcategoryId || mapping.subcategoryId,
          categoryCode: record.categoryCode || mapping.categoryCode,
          subcategoryCode: record.subcategoryCode || mapping.subcategoryCode,
          updatedAt: record.updatedAt || new Date(),
        } as any);
      }
    }
  } catch (err) {
    console.error('V2 Investment Migration error:', err);
  }
}
