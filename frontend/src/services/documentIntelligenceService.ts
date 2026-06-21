import { db, type DocumentRecord, type MerchantProfile, type UserCategoryPreference } from '@/lib/database';
import { TokenManager } from '@/lib/api';

const KNOWN_MERCHANT_CATEGORIES: Record<string, string> = {
  starbucks: 'Food',
  uber: 'Transport',
  shell: 'Fuel',
  amazon: 'Shopping',
  netflix: 'Subscription',
  apple: 'Digital Services',
  zomato: 'Food',
  swiggy: 'Food',
  dominos: 'Food',
  nike: 'Shopping',
  airbnb: 'Travel',
  spotify: 'Subscription',
  hdfc: 'Banking',
  icici: 'Banking',
  chase: 'Banking',
  hsbc: 'Banking',
};

const KEYWORD_CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  { category: 'Fuel', keywords: ['fuel', 'petrol', 'diesel', 'gas station'] },
  { category: 'Food', keywords: ['restaurant', 'pizza', 'cafe', 'coffee', 'food', 'dining'] },
  { category: 'Shopping', keywords: ['mall', 'store', 'shopping', 'retail', 'fashion'] },
  { category: 'Travel', keywords: ['hotel', 'flight', 'airbnb', 'travel', 'booking'] },
  { category: 'Transport', keywords: ['uber', 'taxi', 'cab', 'metro', 'transport'] },
  { category: 'Utilities', keywords: ['electricity', 'water', 'gas', 'internet', 'mobile'] },
  { category: 'Subscription', keywords: ['subscription', 'monthly', 'membership', 'renewal'] },
  { category: 'Income', keywords: ['salary', 'refund', 'dividend', 'interest', 'bonus'] },
];

const KNOWN_BANK_NAMES = [
  'HDFC Bank', 'ICICI Bank', 'SBI', 'State Bank of India', 'Axis Bank', 'Canara Bank',
  'Kotak Mahindra Bank', 'Bank of Baroda', 'Punjab National Bank', 'Indian Bank',
  'Yes Bank', 'IDFC FIRST Bank', 'Union Bank of India', 'IndusInd Bank',
  'RBL Bank', 'Federal Bank', 'South Indian Bank', 'UCO Bank', 'Indian Overseas Bank'
];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

const normalizeMerchantName = (merchantName?: string) => {
  if (!merchantName) return '';

  return normalizeText(
    merchantName
      .replace(/\b(private|limited|ltd|inc|corp|corporation|pvt)\b/gi, ' ')
      .replace(/\b(store|station|supermarket|restaurant|hotel|services)\b/gi, ' ')
      .trim(),
  );
};

const inferCategoryFromKeywords = (text: string, amount?: number) => {
  const normalizedText = normalizeText(text);

  for (const rule of KEYWORD_CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => normalizedText.includes(keyword))) {
      return rule.category;
    }
  }

  if (typeof amount === 'number' && amount >= 1000 && normalizedText.includes('rent')) {
    return 'Housing';
  }

  return 'Others';
};

async function getActiveUserId(): Promise<string | undefined> {
  // Backend-managed auth: derive the user id from the backend JWT, not Supabase.
  const token = TokenManager.getAccessToken();
  if (!token) return undefined;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.userId || payload.sub || undefined;
  } catch {
    return undefined;
  }
}

async function upsertMerchantProfile(profile: Omit<MerchantProfile, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) {
  const normalizedName = normalizeMerchantName(profile.merchantName);
  if (!normalizedName) return null;

  const existing = await db.merchantProfiles
    .where('normalizedName')
    .equals(normalizedName)
    .filter((item) => (profile.userId ? item.userId === profile.userId : true))
    .first();

  const now = new Date();

  if (existing?.id) {
    await db.merchantProfiles.update(existing.id, {
      merchantName: profile.merchantName,
      suggestedCategory: profile.suggestedCategory,
      confidenceScore: Math.max(existing.confidenceScore, profile.confidenceScore),
      country: profile.country ?? existing.country,
      usageCount: (existing.usageCount || 0) + 1,
      lastSeenAt: now,
      updatedAt: now,
    });

    return existing.id;
  }

  return db.merchantProfiles.add({
    ...profile,
    normalizedName,
    usageCount: 1,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
}

async function upsertCategoryPreference(preference: Omit<UserCategoryPreference, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) {
  const merchantKey = preference.merchantKey ? normalizeMerchantName(preference.merchantKey) : undefined;
  const keywordKey = preference.keywordKey ? normalizeText(preference.keywordKey) : undefined;

  const existing = await db.userCategoryPreferences
    .filter((item) =>
      item.userId === preference.userId
      && item.category === preference.category
      && item.merchantKey === merchantKey
      && item.keywordKey === keywordKey,
    )
    .first();

  const now = new Date();

  if (existing?.id) {
    await db.userCategoryPreferences.update(existing.id, {
      confidenceScore: Math.max(existing.confidenceScore, preference.confidenceScore),
      usageCount: (existing.usageCount || 0) + 1,
      lastUsedAt: now,
      updatedAt: now,
    });
    return existing.id;
  }

  return db.userCategoryPreferences.add({
    ...preference,
    merchantKey,
    keywordKey,
    usageCount: 1,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  });
}

async function createDocumentRecord(input: {
  documentType: DocumentRecord['documentType'];
  file: File;
  processingStatus?: DocumentRecord['processingStatus'];
  accountId?: number;
  sourceAccountName?: string;
  extractedCurrency?: string;
  metadata?: Record<string, string>;
}) {
  const userId = await getActiveUserId();
  const now = new Date();

  return db.documents.add({
    userId,
    documentType: input.documentType,
    fileName: input.file.name,
    fileType: input.file.type,
    fileSize: input.file.size,
    fileData: input.file,
    uploadDate: now,
    processingStatus: input.processingStatus ?? 'queued',
    accountId: input.accountId,
    sourceAccountName: input.sourceAccountName,
    extractedCurrency: input.extractedCurrency,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

async function updateDocumentRecord(id: number, updates: Partial<DocumentRecord>) {
  await db.documents.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

async function predictCategory(input: {
  merchantName?: string;
  text?: string;
  amount?: number;
  userId?: string;
}) {
  const normalizedMerchant = normalizeMerchantName(input.merchantName);
  const normalizedText = normalizeText([input.merchantName, input.text].filter(Boolean).join(' '));

  if (input.userId && normalizedMerchant) {
    const userPreference = await db.userCategoryPreferences
      .filter((item) => item.userId === input.userId && item.merchantKey === normalizedMerchant)
      .sortBy('updatedAt');

    const latest = userPreference[userPreference.length - 1];
    if (latest?.category) {
      return { category: latest.category, confidence: 0.96, source: 'user-preference' as const };
    }
  }

  if (normalizedMerchant && KNOWN_MERCHANT_CATEGORIES[normalizedMerchant]) {
    return {
      category: KNOWN_MERCHANT_CATEGORIES[normalizedMerchant],
      confidence: 0.94,
      source: 'merchant-map' as const,
    };
  }

  if (normalizedMerchant) {
    const merchantProfile = await db.merchantProfiles
      .where('normalizedName')
      .equals(normalizedMerchant)
      .first();

    if (merchantProfile?.suggestedCategory) {
      return {
        category: merchantProfile.suggestedCategory,
        confidence: Math.min(0.98, Math.max(0.65, merchantProfile.confidenceScore || 0.75)),
        source: 'merchant-profile' as const,
      };
    }
  }

  return {
    category: inferCategoryFromKeywords(normalizedText, input.amount),
    confidence: normalizedText ? 0.72 : 0.45,
    source: 'keyword-model' as const,
  };
}

function detectCurrency(text: string, defaultCurrency: string = 'INR') {
  const t = text.toLowerCase();
  
  // Strong exact string matches win first to prevent hallucination overrides
  if (t.includes('inr') || t.includes('rs.') || t.includes('INR')) return 'INR';
  if (t.includes('usd') || t.includes('$')) return 'USD';
  if (t.includes('eur') || t.includes('EUR')) return 'EUR';
  if (t.includes('gbp') || t.includes('GBP')) return 'GBP';
  if (t.includes('aed')) return 'AED';
  
  // OCR often hallucinates  interchangeably with INR, or Y for INR.
  // ONLY use JPY if it explicitly says "JPY". 
  if (t.includes('jpy')) return 'JPY';
  
  // If the OCR hallucinates "" but it's an Indian receipt (has gst/fssai), ignore .
  if (t.includes('')) {
    if (t.match(/gst|fssai|tin|india|delhi|mumbai|bengaluru|bangalore/i)) {
      return 'INR';
    }
    return 'JPY'; 
  }

  return defaultCurrency;
}

function detectBankName(text: string) {
  // Focus on the first few pages/lines for bank names
  const headerSection = text.slice(0, 3000);
  const normalizedText = normalizeText(headerSection);
  return KNOWN_BANK_NAMES.find((bankName) => normalizedText.includes(normalizeText(bankName)));
}

function detectAccountNumber(text: string) {
  // Look for patterns like Account No: 123456789
  const headerSection = text.slice(0, 5000);
  const patterns = [
    /\bAccount\s*(?:No|Number|A\/c)[:\s-]*(\d{9,20})\b/i,
    /\bA\/c\s*No[:\s-]*(\d{9,20})\b/i,
    /\bCustomer\s*ID[:\s-]*(\d{5,15})\b/i
  ];
  
  for (const pattern of patterns) {
    const match = headerSection.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

function detectOpeningBalance(text: string) {
  const patterns = [
    /(?:Opening Balance|Balance b\/f|Brought Forward)[^\d]*([\d,]+\.\d{2})/i,
    /(?:Previous Balance)[^\d]*([\d,]+\.\d{2})/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/,/g, '');
      return parseFloat(cleaned);
    }
  }
  return undefined;
}

export const documentIntelligenceService = {
  normalizeMerchantName,
  toTitleCase,
  detectCurrency,
  detectBankName,
  detectAccountNumber,
  detectOpeningBalance,
  inferCategoryFromKeywords,
  predictCategory,
  upsertMerchantProfile,
  upsertCategoryPreference,
  createDocumentRecord,
  updateDocumentRecord,
};
