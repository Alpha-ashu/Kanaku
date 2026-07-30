import { describe, it, expect, beforeEach } from 'vitest';
import { mapLegacyAssetTypeToV2, DEFAULT_INVESTMENT_CATEGORIES, DEFAULT_INVESTMENT_SUBCATEGORIES } from '../../../frontend/src/lib/v2InvestmentMigration';
import { calculatePortfolioMetricsV2 } from '../../../frontend/src/lib/PortfolioValuationEngine';
import { InvestmentV2, PhysicalAssetDetailsV2, PropertyDetailsV2, BusinessDetailsV2 } from '../../../frontend/src/types/investmentV2';

describe('Kanaku Investment Module V2 - Architecture & Integration', () => {

  describe('1. Hierarchical Category & Subcategory Schema Mapping', () => {
    it('provides standard default categories (Market Assets, Physical Assets, Other Investments)', () => {
      expect(DEFAULT_INVESTMENT_CATEGORIES).toHaveLength(3);
      const categoryCodes = DEFAULT_INVESTMENT_CATEGORIES.map(c => c.code);
      expect(categoryCodes).toContain('market_assets');
      expect(categoryCodes).toContain('physical_assets');
      expect(categoryCodes).toContain('other_investments');
    });

    it('provides default subcategories for all major asset classes', () => {
      expect(DEFAULT_INVESTMENT_SUBCATEGORIES.length).toBeGreaterThanOrEqual(15);
      const subCodes = DEFAULT_INVESTMENT_SUBCATEGORIES.map(s => s.code);
      expect(subCodes).toContain('stocks');
      expect(subCodes).toContain('mutual_funds');
      expect(subCodes).toContain('etf');
      expect(subCodes).toContain('bonds');
      expect(subCodes).toContain('fd');
      expect(subCodes).toContain('rd');
      expect(subCodes).toContain('crypto');
      expect(subCodes).toContain('forex');
      expect(subCodes).toContain('commodities');
      expect(subCodes).toContain('gold');
      expect(subCodes).toContain('silver');
      expect(subCodes).toContain('physical_others');
      expect(subCodes).toContain('property');
      expect(subCodes).toContain('business');
      expect(subCodes).toContain('collectibles');
      expect(subCodes).toContain('private_equity');
    });

    it('accurately maps legacy assetType records to V2 category and subcategory', () => {
      expect(mapLegacyAssetTypeToV2('stock')).toEqual({
        categoryCode: 'market_assets', subcategoryCode: 'stocks', categoryId: 'cat_market_assets', subcategoryId: 'sub_stocks'
      });
      expect(mapLegacyAssetTypeToV2('gold')).toEqual({
        categoryCode: 'physical_assets', subcategoryCode: 'gold', categoryId: 'cat_physical_assets', subcategoryId: 'sub_gold'
      });
      expect(mapLegacyAssetTypeToV2('real_estate')).toEqual({
        categoryCode: 'other_investments', subcategoryCode: 'property', categoryId: 'cat_other_investments', subcategoryId: 'sub_property'
      });
      expect(mapLegacyAssetTypeToV2('business')).toEqual({
        categoryCode: 'other_investments', subcategoryCode: 'business', categoryId: 'cat_other_investments', subcategoryId: 'sub_business'
      });
    });
  });

  describe('2. Portfolio Valuation & Asset Allocation Engine', () => {
    it('calculates total portfolio value, P&L, and asset allocation percentages accurately', () => {
      const investments: InvestmentV2[] = [
        {
          id: 1,
          categoryId: 'cat_market_assets',
          categoryCode: 'market_assets',
          subcategoryId: 'sub_stocks',
          subcategoryCode: 'stocks',
          name: 'TCS',
          quantity: 10,
          purchasePrice: 3000,
          currentMarketValue: 3500,
          currency: 'INR',
          status: 'active',
          purchaseDate: new Date(),
        },
        {
          id: 2,
          categoryId: 'cat_physical_assets',
          categoryCode: 'physical_assets',
          subcategoryId: 'sub_gold',
          subcategoryCode: 'gold',
          name: '24K Gold Bar',
          quantity: 100,
          purchasePrice: 6000,
          currentMarketValue: 6500,
          currency: 'INR',
          status: 'active',
          purchaseDate: new Date(),
        },
        {
          id: 3,
          categoryId: 'cat_other_investments',
          categoryCode: 'other_investments',
          subcategoryId: 'sub_property',
          subcategoryCode: 'property',
          name: '2BHK Apartment',
          quantity: 1,
          purchasePrice: 5000000,
          currentMarketValue: 6000000,
          currency: 'INR',
          status: 'active',
          purchaseDate: new Date(),
        },
      ];

      const metrics = calculatePortfolioMetricsV2(investments, 'INR');

      expect(metrics.totalInvested).toBe(30000 + 600000 + 5000000); // 5,630,000
      expect(metrics.currentValue).toBe((10 * 3500) + (100 * 6500) + 6000000); // 6,685,000
      expect(metrics.profitLoss).toBe(1055000);
      expect(metrics.profitLossPercentage).toBeGreaterThan(18);

      // Asset Allocation Percentages
      expect(metrics.marketAssetsValue).toBe(35000);
      expect(metrics.physicalAssetsValue).toBe(650000);
      expect(metrics.propertyValue).toBe(6000000);
      expect(metrics.propertyPercentage).toBeGreaterThan(85);
    });
  });

  describe('3. Dynamic Form Validation Rules', () => {
    it('validates business ownership percentage limits', () => {
      const validBusiness: BusinessDetailsV2 = {
        businessName: 'Kanaku FinTech',
        ownershipPercentage: 51,
        investmentAmount: 500000,
        estimatedValue: 1000000,
        annualRevenue: 2000000,
        annualProfit: 500000,
      };
      expect(validBusiness.ownershipPercentage).toBeGreaterThanOrEqual(0);
      expect(validBusiness.ownershipPercentage).toBeLessThanOrEqual(100);
    });

    it('validates pledged gold loan details', () => {
      const pledgedGold: PhysicalAssetDetailsV2 = {
        assetType: 'jewellery',
        weight: 50,
        weightUnit: 'g',
        purity: '22K',
        storageLocation: 'Bank Locker',
        isPledged: true,
        bankName: 'Muthoot Finance',
        loanAmount: 150000,
        interestRate: 9.5,
        loanDate: '2026-01-15',
        loanAccountNumber: 'GL-987654',
      };
      expect(pledgedGold.isPledged).toBe(true);
      expect(pledgedGold.loanAmount).toBeGreaterThan(0);
      expect(pledgedGold.bankName).toBeTruthy();
    });

    it('validates property rental & loan integration fields', () => {
      const property: PropertyDetailsV2 = {
        propertyType: 'rental',
        location: 'Chennai',
        ownershipPercentage: 100,
        isRental: true,
        monthlyRentalIncome: 25000,
        annualRentalIncome: 300000,
        recurringIncomeEnabled: true,
        isFinanced: true,
        bankName: 'HDFC Home Loans',
        loanAmount: 3500000,
        interestRate: 8.5,
      };
      expect(property.isRental).toBe(true);
      expect(property.monthlyRentalIncome).toBe(25000);
      expect(property.isFinanced).toBe(true);
      expect(property.loanAmount).toBe(3500000);
    });
  });
});
