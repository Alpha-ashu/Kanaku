import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import {
  TrendingUp, Loader2, ArrowLeft, Plus, BarChart3, Shield, CreditCard,
  Layers, CheckCircle2, DollarSign, Building2, Gem,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';
import { Button } from '@/app/components/ui/button';

import {
  MainCategoryCode,
  SubcategoryCode,
  PhysicalAssetDetailsV2,
  PropertyDetailsV2,
  BusinessDetailsV2,
  FixedDepositDetailsV2,
  InvestmentDocumentV2,
  InvestmentV2,
} from '@/types/investmentV2';

import { InvestmentCategoryTabs } from '@/app/components/investments/InvestmentCategoryTabs';
import { MarketAssetsForm } from '@/app/components/investments/forms/MarketAssetsForm';
import { PhysicalAssetsForm } from '@/app/components/investments/forms/PhysicalAssetsForm';
import { OtherInvestmentsForm } from '@/app/components/investments/forms/OtherInvestmentsForm';
import { mapLegacyAssetTypeToV2 } from '@/lib/v2InvestmentMigration';
import { formatCurrencyAmount, formatNativeMoney, getCurrencySymbol, normalizeCurrencyCode } from '@/lib/currencyUtils';

export const AddInvestment: React.FC = () => {
  const { accounts, setCurrentPage, currency, refreshData } = useApp();
  const activeAccounts = accounts.filter(a => a.isActive);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category & Subcategory Navigation State
  const [selectedCategory, setSelectedCategory] = useState<MainCategoryCode>('market_assets');
  const [selectedSubcategory, setSelectedSubcategory] = useState<SubcategoryCode>('stocks');

  // Core Form Data
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    country: 'IN',
    exchange: '',
    broker: '',
    quantity: 0,
    purchasePrice: 0,
    currentPrice: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
    fundingAccountId: activeAccounts[0]?.id || 0,
    purchaseFees: 0,
  });

  // Dynamic Detail Blocks
  const [physicalDetails, setPhysicalDetails] = useState<PhysicalAssetDetailsV2>({
    assetType: 'coins',
    weight: 0,
    weightUnit: 'g',
    purity: '',
    storageLocation: '',
    isPledged: false,
    bankName: '',
    loanAmount: 0,
    interestRate: 0,
    loanDate: new Date().toISOString().split('T')[0],
    loanAccountNumber: '',
    loanStatus: 'active',
  });

  const [propertyDetails, setPropertyDetails] = useState<PropertyDetailsV2>({
    propertyType: 'residential',
    location: '',
    ownershipPercentage: 100,
    coOwner: '',
    areaSqft: 0,
    isRental: false,
    monthlyRentalIncome: 0,
    annualRentalIncome: 0,
    tenantSince: '',
    recurringIncomeEnabled: false,
    isFinanced: false,
    bankName: '',
    loanAmount: 0,
    interestRate: 0,
    loanDate: new Date().toISOString().split('T')[0],
    loanAccountNumber: '',
  });

  const [businessDetails, setBusinessDetails] = useState<BusinessDetailsV2>({
    businessName: '',
    businessType: '',
    ownershipPercentage: 100,
    investmentAmount: 0,
    estimatedValue: 0,
    annualRevenue: 0,
    annualProfit: 0,
    gstNumber: '',
    panNumber: '',
  });

  const [fdDetails, setFdDetails] = useState<FixedDepositDetailsV2>({
    bankName: '',
    depositAmount: 0,
    interestRate: 7,
    compoundingType: 'quarterly',
    startDate: new Date().toISOString().split('T')[0],
    maturityDate: '',
    maturityAmount: 0,
  });

  const [documents, setDocuments] = useState<InvestmentDocumentV2[]>([]);

  // Category selection handler
  const handleSelectCategory = (cat: MainCategoryCode, defaultSub: SubcategoryCode) => {
    setSelectedCategory(cat);
    setSelectedSubcategory(defaultSub);
  };

  const handleSelectSubcategory = (sub: SubcategoryCode) => {
    setSelectedSubcategory(sub);
  };

  const assetCurrencyCode = normalizeCurrencyCode(currency);
  const assetCurrencySymbol = getCurrencySymbol(assetCurrencyCode);

  const calculatedSubtotal = selectedCategory === 'physical_assets'
    ? (formData.purchasePrice || (physicalDetails.weight * (formData.purchasePrice || 1)))
    : (formData.quantity > 0 ? formData.quantity * formData.purchasePrice : formData.purchasePrice);

  const calculatedTotalCapital = calculatedSubtotal + formData.purchaseFees;

  const handleSubmit = async () => {
    if (!formData.name.trim() && selectedSubcategory !== 'fd' && selectedSubcategory !== 'rd') {
      toast.error('Enter investment asset name');
      return;
    }

    if (selectedCategory === 'physical_assets' && physicalDetails.weight <= 0) {
      toast.error('Weight must be greater than 0');
      return;
    }

    if (selectedCategory === 'other_investments' && selectedSubcategory === 'business' && (businessDetails.ownershipPercentage < 0 || businessDetails.ownershipPercentage > 100)) {
      toast.error('Ownership percentage must be between 0 and 100%');
      return;
    }

    setIsSubmitting(true);
    try {
      const isPhysical = selectedCategory === 'physical_assets';
      const qty = isPhysical
        ? physicalDetails.weight
        : (formData.quantity <= 0 ? 1 : formData.quantity);

      const price = formData.purchasePrice;
      const curPrice = formData.currentPrice || price;

      // 1. Create Core Investment in Dexie
      const invId = await db.investments.add({
        assetType: (selectedSubcategory === 'gold' || selectedSubcategory === 'silver' ? selectedSubcategory : (selectedCategory === 'physical_assets' ? 'gold' : (selectedSubcategory === 'property' ? 'real_estate' : (selectedSubcategory === 'business' ? 'business' : 'stock')))) as any,
        assetName: formData.name || `${fdDetails.bankName || 'Fixed'} Deposit`,
        quantity: qty,
        buyPrice: price,
        currentPrice: curPrice,
        totalInvested: calculatedTotalCapital,
        currentValue: qty * curPrice,
        profitLoss: (qty * curPrice) - calculatedTotalCapital,
        purchaseDate: new Date(formData.date),
        lastUpdated: new Date(),
        broker: formData.broker || fdDetails.bankName,
        description: formData.description,
        fundingAccountId: formData.fundingAccountId,
        purchaseFees: formData.purchaseFees,
        positionStatus: 'open',

        // V2 Normalized Metadata Fields
        categoryId: `cat_${selectedCategory}`,
        categoryCode: selectedCategory,
        subcategoryId: `sub_${selectedSubcategory}`,
        subcategoryCode: selectedSubcategory,

        metadata: {
          physicalDetails: isPhysical ? physicalDetails : undefined,
          propertyDetails: selectedSubcategory === 'property' ? propertyDetails : undefined,
          businessDetails: selectedSubcategory === 'business' ? businessDetails : undefined,
          fdDetails: (selectedSubcategory === 'fd' || selectedSubcategory === 'rd') ? fdDetails : undefined,
          documents: documents.length > 0 ? documents : undefined,
        },
      } as any);

      // 2. Gold Loan Auto-Creation (Cross-module sync to Loans)
      if (isPhysical && physicalDetails.isPledged && physicalDetails.loanAmount && physicalDetails.loanAmount > 0) {
        const loanId = await db.loans.add({
          type: 'borrowed',
          name: `${physicalDetails.bankName || 'Gold'} Loan (${formData.name || 'Gold'})`,
          principalAmount: physicalDetails.loanAmount,
          outstandingBalance: physicalDetails.loanAmount,
          interestRate: physicalDetails.interestRate || 0,
          loanDate: new Date(physicalDetails.loanDate || formData.date),
          status: 'active',
          bankName: physicalDetails.bankName,
          loanCategory: 'gold_loan',
          notes: `Linked Gold Asset #${invId} (${physicalDetails.weight}${physicalDetails.weightUnit} ${formData.name})`,
          createdAt: new Date(),
        });

        // Store cross-module relationship link
        if (db.investmentLinks) {
          await db.investmentLinks.add({
            investmentId: String(invId),
            linkedModule: 'loans',
            linkedRecordId: String(loanId),
            relationshipType: 'gold_loan',
            createdAt: new Date(),
          });
        }
        toast.success(`Gold Loan automatically created in Loans module`);
      }

      // 3. Property Loan Auto-Creation (Cross-module sync to Loans)
      if (selectedSubcategory === 'property' && propertyDetails.isFinanced && propertyDetails.loanAmount && propertyDetails.loanAmount > 0) {
        const loanId = await db.loans.add({
          type: 'borrowed',
          name: `${propertyDetails.bankName || 'Home'} Loan (${formData.name || 'Property'})`,
          principalAmount: propertyDetails.loanAmount,
          outstandingBalance: propertyDetails.loanAmount,
          interestRate: propertyDetails.interestRate || 0,
          loanDate: new Date(propertyDetails.loanDate || formData.date),
          status: 'active',
          bankName: propertyDetails.bankName,
          loanCategory: 'home_loan',
          notes: `Linked Property Asset #${invId} (${formData.name})`,
          createdAt: new Date(),
        });

        if (db.investmentLinks) {
          await db.investmentLinks.add({
            investmentId: String(invId),
            linkedModule: 'loans',
            linkedRecordId: String(loanId),
            relationshipType: 'property_loan',
            createdAt: new Date(),
          });
        }
        toast.success(`Home Loan automatically created in Loans module`);
      }

      // 4. Rental Income Auto-Creation (Cross-module sync to Recurring Income)
      if (selectedSubcategory === 'property' && propertyDetails.isRental && propertyDetails.recurringIncomeEnabled && propertyDetails.monthlyRentalIncome && propertyDetails.monthlyRentalIncome > 0) {
        if (db.recurringTransactions) {
          await db.recurringTransactions.add({
            name: `Rental Income (${formData.name})`,
            type: 'income',
            amount: propertyDetails.monthlyRentalIncome,
            accountId: formData.fundingAccountId || activeAccounts[0]?.id || 1,
            category: 'Rental Income',
            frequency: 'monthly',
            startDate: new Date(),
            nextDueDate: new Date(),
            status: 'active',
            notes: `Linked Property #${invId}`,
            createdAt: new Date(),
          });
        }
        toast.success(`Recurring Rental Income created in Income module`);
      }

      // 5. Sync to backend API if available
      try {
        await backendService.createInvestment({
          assetType: selectedSubcategory,
          assetName: formData.name || `${fdDetails.bankName} Deposit`,
          quantity: qty,
          buyPrice: price,
          currentPrice: curPrice,
          totalInvested: calculatedTotalCapital,
          currentValue: qty * curPrice,
          profitLoss: (qty * curPrice) - calculatedTotalCapital,
          purchaseDate: new Date(formData.date),
          broker: formData.broker,
          description: formData.description,
          metadata: {
            categoryCode: selectedCategory,
            subcategoryCode: selectedSubcategory,
            physicalDetails,
            propertyDetails,
            businessDetails,
          },
        } as any);
      } catch (e) {
        // Backend optional fallback
      }

      toast.success('Investment added successfully');
      refreshData();
      setCurrentPage('investments');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save investment record');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-900 pb-28">
      {/* Sticky Header with Title and Category Pill Bar (Matching AddTransaction) */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        {/* Row 1: Back Button & Title */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 h-14">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('investments')}
              title="Back to Portfolio"
              data-testid="investments-create-back-button"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all cursor-pointer shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-base font-black text-slate-900 tracking-tight leading-none uppercase">Add Investment</h1>
          </div>
        </div>

        {/* Row 2: Category & Subcategory Selector Pills */}
        <div className="px-4 lg:px-6 pb-3">
          <InvestmentCategoryTabs
            selectedCategory={selectedCategory}
            selectedSubcategory={selectedSubcategory}
            onSelectCategory={handleSelectCategory}
            onSelectSubcategory={handleSelectSubcategory}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Total Summary Banner (Below Header Section) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-xl border border-indigo-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white/70 uppercase tracking-wider">Asset</p>
              <p className="text-base sm:text-lg font-extrabold text-white truncate max-w-[220px]">
                {formData.name || `${selectedSubcategory.toUpperCase()}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-white/70 uppercase tracking-wider">Total Capital Required</p>
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                {formatCurrencyAmount(calculatedTotalCapital, currency)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column: Dynamic Form */}
          <div className="lg:col-span-7 space-y-6">
            {/* Dynamic Form Component based on Category/Subcategory */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="text-indigo-600" size={18} />
                  {selectedSubcategory.replace('_', ' ').toUpperCase()} Specification
                </h2>
              </div>

              {selectedCategory === 'market_assets' && (
                <MarketAssetsForm
                  subcategory={selectedSubcategory}
                  formData={formData}
                  setFormData={setFormData}
                  fdDetails={fdDetails}
                  setFdDetails={setFdDetails}
                  currency={currency}
                />
              )}

              {selectedCategory === 'physical_assets' && (
                <PhysicalAssetsForm
                  subcategory={selectedSubcategory}
                  details={physicalDetails}
                  setDetails={setPhysicalDetails}
                  formData={formData}
                  setFormData={setFormData}
                  currency={currency}
                />
              )}

              {selectedCategory === 'other_investments' && (
                <OtherInvestmentsForm
                  subcategory={selectedSubcategory}
                  propertyDetails={propertyDetails}
                  setPropertyDetails={setPropertyDetails}
                  businessDetails={businessDetails}
                  setBusinessDetails={setBusinessDetails}
                  documents={documents}
                  setDocuments={setDocuments}
                  formData={formData}
                  setFormData={setFormData}
                  currency={currency}
                />
              )}

              {/* Common Metadata Fields: Broker/Platform & Date */}
              {selectedSubcategory !== 'fd' && selectedSubcategory !== 'rd' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Broker / Platform</label>
                    <input
                      type="text"
                      value={formData.broker}
                      onChange={e => setFormData(prev => ({ ...prev, broker: e.target.value }))}
                      data-testid="investments-create-broker-input"
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      placeholder="e.g. Zerodha, Groww, Bank"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Purchase Date</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      data-testid="investments-create-date-input"
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Notes / Strategy</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  data-testid="investments-create-notes-textarea"
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none min-h-[80px] resize-none"
                  placeholder="Notes, portfolio strategy..."
                />
              </div>
            </div>

            {/* Payment Account */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CreditCard className="text-indigo-600" size={18} />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Payment Account</h2>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Source Account</label>
                <SearchableDropdown
                  options={activeAccounts.map(a => ({
                    value: String(a.id),
                    label: a.name,
                    description: formatCurrencyAmount(a.balance, currency),
                    icon: (
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold text-xs">
                        {(a.type || 'BK').substring(0, 2).toUpperCase()}
                      </div>
                    ),
                  }))}
                  value={String(formData.fundingAccountId)}
                  onChange={val => setFormData(prev => ({ ...prev, fundingAccountId: parseInt(val) }))}
                  placeholder="Select Funding Account"
                  testId="investments-create-account-dropdown"
                  className="h-12 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Financial Breakdown */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-20">
            {/* Pricing & Quantity Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-indigo-600" size={18} />
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Financial Breakdown</h2>
                </div>
              </div>

              {/* Quantity / Weight and Buy Price Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center space-y-1.5 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    {selectedCategory === 'physical_assets' ? `Weight (${physicalDetails.weightUnit})` : 'Quantity'}
                  </span>
                  {selectedCategory === 'physical_assets' ? (
                    <input
                      type="number"
                      value={physicalDetails.weight || ''}
                      onChange={e => setPhysicalDetails(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                      data-testid="investments-create-quantity-input"
                      className="w-full text-center text-2xl sm:text-3xl font-extrabold text-slate-900 bg-transparent outline-none tracking-tight placeholder:text-slate-300"
                      placeholder="0.00"
                    />
                  ) : (
                    <input
                      type="number"
                      value={formData.quantity || ''}
                      onChange={e => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                      data-testid="investments-create-quantity-input"
                      className="w-full text-center text-2xl sm:text-3xl font-extrabold text-slate-900 bg-transparent outline-none tracking-tight placeholder:text-slate-300"
                      placeholder="0.00"
                    />
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center space-y-1.5 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    {selectedCategory === 'physical_assets' ? `Price per unit` : `Buy Price (${assetCurrencySymbol})`}
                  </span>
                  <input
                    type="number"
                    value={formData.purchasePrice || ''}
                    onChange={e => setFormData(prev => ({ ...prev, purchasePrice: parseFloat(e.target.value) || 0 }))}
                    data-testid="investments-create-price-input"
                    className="w-full text-center text-2xl sm:text-3xl font-extrabold text-slate-900 bg-transparent outline-none tracking-tight placeholder:text-slate-300"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Fees and Subtotal Row */}
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
                <div className="w-1/2 space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Fees ({currency})</label>
                  <input
                    type="number"
                    value={formData.purchaseFees || ''}
                    onChange={e => setFormData(prev => ({ ...prev, purchaseFees: parseFloat(e.target.value) || 0 }))}
                    data-testid="investments-create-fees-input"
                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    placeholder="0"
                  />
                </div>
                <div className="w-1/2 text-right">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subtotal</p>
                  <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    {formatNativeMoney(calculatedSubtotal, assetCurrencyCode)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>


      {/* Floating Save Bar */}
      <FloatingSaveBar
        onSave={handleSubmit}
        onDiscard={() => setCurrentPage('investments')}
        isSaving={isSubmitting}
        saveLabel="Add to Portfolio"
        saveTestId="investments-create-save-button"
        discardTestId="investments-create-discard-button"
      />
    </div>
  );
};
