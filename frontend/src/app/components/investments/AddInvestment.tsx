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
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Button } from '@/app/components/ui/button';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { queueRecordUpsertSync, processPendingSyncQueue } from '@/lib/auth-sync-integration';

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

      // Cross-module balance adjustment: deduct investment cost from funding account
      if (formData.fundingAccountId && calculatedTotalCapital > 0) {
        await applyAccountBalanceDeltas(new Map([[formData.fundingAccountId, -calculatedTotalCapital]]));
        queueRecordUpsertSync('accounts', formData.fundingAccountId);
        void processPendingSyncQueue();
      }

      // 5. Sync to backend API if available
      try {
        const fundingAccount = activeAccounts.find(a => a.id === formData.fundingAccountId);
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
          accountId: fundingAccount?.cloudId || (fundingAccount?.id ? String(fundingAccount.id) : undefined),
          metadata: {
            categoryCode: selectedCategory,
            subcategoryCode: selectedSubcategory,
            physicalDetails,
            propertyDetails,
            businessDetails,
          },
        });
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
    <CenteredLayout enablePullToRefresh={false} className="pb-32">
      <div className="flex flex-col text-slate-900">
        {/* Header with Title and Category Pill Bar */}
        <header className="sticky top-0 z-30 pb-2">
          <div className="flex items-center justify-between py-2 sm:py-2.5 mb-1.5">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setCurrentPage('investments')}
                title="Back to Portfolio"
                aria-label="Back to Portfolio"
                data-testid="investments-create-back-button"
                className="w-8.5 h-8.5 sm:w-9.5 sm:h-9.5 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              >
                <ArrowLeft size={16} className="text-slate-700" />
              </button>
              <h1 className="text-base sm:text-lg md:text-xl font-black text-slate-900 tracking-tight leading-none truncate">Add Investment</h1>
            </div>
          </div>

          <div className="pb-1.5">
            <InvestmentCategoryTabs
              selectedCategory={selectedCategory}
              selectedSubcategory={selectedSubcategory}
              onSelectCategory={handleSelectCategory}
              onSelectSubcategory={handleSelectSubcategory}
            />
          </div>
        </header>

        {/* Main Content */}
        <div className="w-full space-y-4 sm:space-y-6">
          {/* Total Summary Banner (Refined fintech overview card) */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white shadow-md border border-indigo-500/20 p-3 sm:p-4">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/15 rounded-full blur-xl pointer-events-none" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[9px] sm:text-[10px] font-black text-indigo-200 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{selectedSubcategory.replace('_', ' ').toUpperCase()}</span>
                </div>
                <p className="text-sm sm:text-base md:text-lg font-black text-white truncate max-w-[160px] sm:max-w-[260px] mt-1 tracking-tight">
                  {formData.name || `${selectedSubcategory.replace('_', ' ').toUpperCase()}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] sm:text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Total Capital Required</p>
                <p className="text-lg sm:text-2xl md:text-3xl font-black tracking-tight text-white mt-0.5">
                  {formatCurrencyAmount(calculatedTotalCapital, currency)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 items-start">
            {/* Left Column: Dynamic Form */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-6">
              {/* Dynamic Form Component based on Category/Subcategory */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="text-indigo-600" size={16} />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-slate-100">
                    <div className="space-y-1 sm:space-y-1.5">
                      <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Broker / Platform</label>
                      <input
                        type="text"
                        value={formData.broker}
                        onChange={e => setFormData(prev => ({ ...prev, broker: e.target.value }))}
                        data-testid="investments-create-broker-input"
                        className="w-full h-10 sm:h-11 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 sm:px-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                        placeholder="e.g. Zerodha, Groww, Bank"
                      />
                    </div>

                    <div className="space-y-1 sm:space-y-1.5">
                      <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Purchase Date</label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                        data-testid="investments-create-date-input"
                        className="w-full h-10 sm:h-11 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 sm:px-3.5 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Notes / Strategy</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    data-testid="investments-create-notes-textarea"
                    className="w-full p-2.5 sm:p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none min-h-[60px] sm:min-h-[72px] resize-none"
                    placeholder="Notes, portfolio strategy..."
                  />
                </div>
              </div>

              {/* Payment Account */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <CreditCard className="text-indigo-600" size={16} />
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider">Payment Account</h2>
                </div>
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Source Account</label>
                  <SearchableDropdown
                    options={activeAccounts.map(a => ({
                      value: String(a.id),
                      label: a.name,
                      description: formatCurrencyAmount(a.balance, currency),
                      icon: (
                        <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold text-[10px]">
                          {(a.type || 'BK').substring(0, 2).toUpperCase()}
                        </div>
                      ),
                    }))}
                    value={String(formData.fundingAccountId)}
                    onChange={val => setFormData(prev => ({ ...prev, fundingAccountId: parseInt(val) }))}
                    placeholder="Select Funding Account"
                    testId="investments-create-account-dropdown"
                    className="h-10 sm:h-11 rounded-xl border border-slate-200/80 bg-slate-50/80 font-semibold text-xs sm:text-sm text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Financial Breakdown */}
            <div className="lg:col-span-5 space-y-4 sm:space-y-6 lg:sticky lg:top-20">
              {/* Pricing & Quantity Card */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-indigo-600" size={16} />
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider">Financial Breakdown</h2>
                  </div>
                </div>

                {/* Quantity / Weight and Buy Price Inputs */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 text-center space-y-1 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                      {selectedCategory === 'physical_assets' ? `Weight (${physicalDetails.weightUnit})` : 'Quantity'}
                    </span>
                    {selectedCategory === 'physical_assets' ? (
                      <input
                        type="number"
                        value={physicalDetails.weight || ''}
                        onChange={e => setPhysicalDetails(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                        data-testid="investments-create-quantity-input"
                        className="w-full text-center text-lg sm:text-2xl md:text-3xl font-black text-slate-900 bg-transparent outline-none tracking-tight placeholder:text-slate-300"
                        placeholder="0.00"
                      />
                    ) : (
                      <input
                        type="number"
                        value={formData.quantity || ''}
                        onChange={e => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                        data-testid="investments-create-quantity-input"
                        className="w-full text-center text-lg sm:text-2xl md:text-3xl font-black text-slate-900 bg-transparent outline-none tracking-tight placeholder:text-slate-300"
                        placeholder="0.00"
                      />
                    )}
                  </div>

                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 text-center space-y-1 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                      {selectedCategory === 'physical_assets' ? `Price per unit` : `Buy Price (${assetCurrencySymbol})`}
                    </span>
                    <input
                      type="number"
                      value={formData.purchasePrice || ''}
                      onChange={e => setFormData(prev => ({ ...prev, purchasePrice: parseFloat(e.target.value) || 0 }))}
                      data-testid="investments-create-price-input"
                      className="w-full text-center text-lg sm:text-2xl md:text-3xl font-black text-slate-900 bg-transparent outline-none tracking-tight placeholder:text-slate-300"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Fees and Subtotal Row */}
                <div className="flex items-center justify-between gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-slate-100">
                  <div className="w-1/2 space-y-1">
                    <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fees ({currency})</label>
                    <input
                      type="number"
                      value={formData.purchaseFees || ''}
                      onChange={e => setFormData(prev => ({ ...prev, purchaseFees: parseFloat(e.target.value) || 0 }))}
                      data-testid="investments-create-fees-input"
                      className="w-full h-10 sm:h-11 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 sm:px-3.5 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div className="w-1/2 text-right">
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subtotal</p>
                    <p className="text-base sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                      {formatNativeMoney(calculatedSubtotal, assetCurrencyCode)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom clearance spacer to guarantee nothing is obscured behind FloatingSaveBar & BottomNav */}
          <div className="h-28 sm:h-20 w-full shrink-0" aria-hidden="true" />
        </div>

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
    </CenteredLayout>
  );
};
