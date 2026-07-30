// Kanaku Investment Module V2 Types

export type MainCategoryCode = 'market_assets' | 'physical_assets' | 'other_investments';

export type SubcategoryCode =
  // Market Assets
  | 'stocks' | 'mutual_funds' | 'etf' | 'bonds' | 'fd' | 'rd' | 'crypto' | 'forex' | 'commodities' | 'market_others'
  // Physical Assets
  | 'gold' | 'silver' | 'physical_others'
  // Other Investments
  | 'property' | 'business' | 'collectibles' | 'private_equity' | 'other_investments_others';

export type PhysicalAssetType = 'coins' | 'bars' | 'jewellery' | 'biscuits' | 'custom' | 'platinum' | 'bronze' | 'diamond' | 'collectibles';
export type PropertyType = 'residential' | 'commercial' | 'agriculture' | 'land' | 'rental';

export interface InvestmentCategoryV2 {
  id: string;
  name: string;
  code: MainCategoryCode;
  displayOrder: number;
  icon: string;
  status: 'active' | 'inactive';
}

export interface InvestmentSubcategoryV2 {
  id: string;
  categoryId: string;
  categoryCode: MainCategoryCode;
  name: string;
  code: SubcategoryCode;
  marketEnabled: boolean;
  supportsLivePrice: boolean;
  displayOrder: number;
  status: 'active' | 'inactive';
}

export interface InvestmentDocumentV2 {
  id?: string;
  investmentId?: string;
  documentName: string;
  documentType: 'sale_deed' | 'tax_receipt' | 'registration' | 'encumbrance' | 'photo' | 'valuation_report' | 'gst_doc' | 'pan_doc' | 'financial_statement' | 'partnership_doc' | 'other';
  fileUrl: string;
  checksum?: string;
  uploadedAt: Date | string;
}

export interface PropertyDetailsV2 {
  propertyType: PropertyType;
  location: string;
  ownershipPercentage: number;
  coOwner?: string;
  areaSqft?: number;
  description?: string;
  // Rental details
  isRental: boolean;
  monthlyRentalIncome?: number;
  annualRentalIncome?: number;
  tenantSince?: string;
  recurringIncomeEnabled?: boolean;
  // Financing details
  isFinanced: boolean;
  bankName?: string;
  loanAmount?: number;
  interestRate?: number;
  loanDate?: string;
  loanAccountNumber?: string;
}

export interface BusinessDetailsV2 {
  businessName: string;
  businessType?: string;
  ownershipPercentage: number;
  investmentAmount: number;
  estimatedValue: number;
  annualRevenue: number;
  annualProfit: number;
  description?: string;
  gstNumber?: string;
  panNumber?: string;
  registrationNumber?: string;
}

export interface PhysicalAssetDetailsV2 {
  assetType: PhysicalAssetType;
  weight: number;
  weightUnit: 'g' | 'tola' | 'oz' | 'kg';
  purity: string;
  storageLocation: string;
  // Gold/Metal loan details
  isPledged: boolean;
  bankName?: string;
  loanAmount?: number;
  interestRate?: number;
  loanDate?: string;
  loanAccountNumber?: string;
  loanStatus?: 'active' | 'closed';
}

export interface FixedDepositDetailsV2 {
  bankName: string;
  depositAmount: number;
  interestRate: number;
  compoundingType: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'simple';
  startDate: string;
  maturityDate: string;
  maturityAmount: number;
}

export interface InvestmentV2 {
  id?: number;
  cloudId?: string;
  userId?: string;
  assetType?: string;
  categoryId?: string;
  categoryCode?: MainCategoryCode;
  subcategoryId?: string;
  subcategoryCode?: SubcategoryCode;
  name: string;
  symbol?: string;
  country?: string;
  exchange?: string;
  broker?: string;
  purchaseDate: Date | string;
  buyPrice?: number;
  purchasePrice?: number;
  currentPrice?: number;
  quantity: number;
  units?: number;
  currency?: string;
  totalInvested?: number;
  currentValue?: number;
  currentMarketValue?: number;
  manualMarketValue?: number;
  purchaseFees?: number;
  notes?: string;
  status?: 'active' | 'closed' | 'pledged';
  positionStatus?: 'open' | 'closed';

  // Subcategory specific detail blocks
  propertyDetails?: PropertyDetailsV2;
  businessDetails?: BusinessDetailsV2;
  physicalAssetDetails?: PhysicalAssetDetailsV2;
  fdDetails?: FixedDepositDetailsV2;
  documents?: InvestmentDocumentV2[];

  // Linked module ids
  linkedLoanId?: number | string;
  linkedIncomeId?: number | string;

  createdAt?: Date | string;
  updatedAt?: Date | string;
  deletedAt?: Date | string;
}

export interface InvestmentLinkV2 {
  id?: string;
  investmentId: string | number;
  linkedModule: 'loans' | 'income' | 'accounts';
  linkedRecordId: string | number;
  relationshipType: 'gold_loan' | 'property_loan' | 'rental_income' | 'funding_account';
  createdAt?: Date | string;
}
