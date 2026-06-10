interface ExpenseSubcategorySeed {
  name: string;
  keywords?: string[];
}

interface ExpenseCategorySeed {
  name: string;
  icon: string;
  color: string;
  aliases?: string[];
  subcategories: Array<string | ExpenseSubcategorySeed>;
}

interface CategoryRecord {
  name: string;
  icon: string;
  color: string;
  aliases: string[];
  subcategories: string[];
}

export interface CustomExpenseSubcategory {
  name: string;
  category: string;
  keywords?: string[];
  createdAt: string;
  usageCount?: number;
  lastUsedAt?: string;
}

export interface ExpenseSubcategorySuggestion {
  name: string;
  category: string;
  keywords: string[];
  score: number;
  isCustom?: boolean;
}

const CUSTOM_EXPENSE_SUBCATEGORIES_STORAGE_KEY = 'KANAKU.customExpenseSubcategories.v1';

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slugify = (value: string) => normalizeText(value).replace(/\s+/g, '');

const toTokens = (value: string) => normalizeText(value).split(' ').filter(Boolean);

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(value.trim());
  });

  return result;
};

const isSubsequence = (needle: string, haystack: string) => {
  if (!needle) return true;
  let pointer = 0;

  for (const char of haystack) {
    if (char === needle[pointer]) {
      pointer += 1;
      if (pointer === needle.length) return true;
    }
  }

  return false;
};

const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  housing: 'Housing',
  'housing rent': 'Housing',
  'housing / rent': 'Housing',
  living: 'Housing',
  utilities: 'Utilities',
  utility: 'Utilities',
  bills: 'Utilities',
  'bills utilities': 'Utilities',
  'bills and utilities': 'Utilities',
  food: 'Food & Dining',
  dining: 'Food & Dining',
  'food and dining': 'Food & Dining',
  transport: 'Transportation',
  transportation: 'Transportation',
  commute: 'Transportation',
  vehicle: 'Vehicle',
  'vehicle expenses': 'Vehicle',
  'vehicle maintenance': 'Vehicle',
  healthcare: 'Health & Medical',
  health: 'Health & Medical',
  medical: 'Health & Medical',
  shopping: 'Shopping',
  subscriptions: 'Subscriptions',
  subscription: 'Subscriptions',
  'subscriptions and digital services': 'Subscriptions',
  travel: 'Travel',
  vacation: 'Travel',
  holiday: 'Travel',
  'travel & vacation': 'Travel',
  business: 'Business Expenses',
  'work and business': 'Business Expenses',
  work: 'Business Expenses',
  education: 'Education',
  entertainment: 'Entertainment',
  gifts: 'Gifts & Donations',
  gift: 'Gifts & Donations',
  donations: 'Gifts & Donations',
  donation: 'Gifts & Donations',
  charity: 'Gifts & Donations',
  'donations and charity': 'Gifts & Donations',
  'donations & charity': 'Gifts & Donations',
  miscellaneous: 'Miscellaneous',
  'miscellaneous / other': 'Miscellaneous',
  misc: 'Miscellaneous',
  other: 'Miscellaneous',
  family: 'Family & Kids',
  kids: 'Family & Kids',
  personal: 'Personal Care',
  'personal care': 'Personal Care',
  fitness: 'Fitness & Sports',
  sports: 'Fitness & Sports',
  pets: 'Pets',
  pet: 'Pets',
  investment: 'Investments',
  investments: 'Investments',
  taxes: 'Taxes & Government',
  government: 'Taxes & Government',
  electronics: 'Electronics & Gadgets',
  gadgets: 'Electronics & Gadgets',
  home: 'Home Maintenance',
  'home maintenance': 'Home Maintenance',
  loans: 'Loan / Debt Payments',
  loan: 'Loan / Debt Payments',
  debt: 'Loan / Debt Payments',
  finance: 'Loan / Debt Payments',
  financial: 'Loan / Debt Payments',
};

const EXPENSE_MERCHANT_RULES: Array<{ category: string; subcategory: string; keywords: string[] }> = [
  { category: 'Shopping', subcategory: 'Online Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'ajio'] },
  { category: 'Transportation', subcategory: 'Taxi', keywords: ['uber', 'ola', 'lyft', 'rapido'] },
  { category: 'Food & Dining', subcategory: 'Food Delivery', keywords: ['swiggy', 'zomato', 'ubereats', 'doordash'] },
  { category: 'Subscriptions', subcategory: 'Streaming Services', keywords: ['netflix', 'prime video', 'amazon prime', 'hotstar'] },
  { category: 'Subscriptions', subcategory: 'Music Subscription', keywords: ['spotify', 'apple music', 'youtube music'] },
  { category: 'Business Expenses', subcategory: 'Hosting', keywords: ['aws', 'gcp', 'azure', 'vercel', 'netlify', 'server'] },
  { category: 'Shopping', subcategory: 'Clothes', keywords: ['zara', 'h and m', 'hm', 'uniqlo'] },
];

const EXPENSE_CATEGORY_SEEDS: ExpenseCategorySeed[] = [
  {
    name: 'Housing',
    icon: '',
    color: '#64748B',
    aliases: ['housing', 'housing / rent', 'rent', 'living'],
    subcategories: [
      { name: 'Rent', keywords: ['rent', 'house rent', 'apartment rent'] },
      { name: 'Mortgage Payment', keywords: ['mortgage', 'home loan'] },
      { name: 'Property Tax', keywords: ['property tax'] },
      { name: 'Home Insurance', keywords: ['home insurance'] },
      { name: 'Maintenance', keywords: ['repair', 'maintenance'] },
      { name: 'Furniture', keywords: ['sofa', 'bed', 'table', 'furniture'] },
      { name: 'Home Decor', keywords: ['decor', 'decoration'] },
    ],
  },
  {
    name: 'Utilities',
    icon: '',
    color: '#FBBF24',
    aliases: ['utilities', 'bills', 'bills & utilities'],
    subcategories: [
      { name: 'Electricity Bill', keywords: ['electricity', 'power bill', 'eb bill'] },
      { name: 'Water Bill', keywords: ['water bill'] },
      { name: 'Gas Bill', keywords: ['gas', 'lpg'] },
      { name: 'Internet Bill', keywords: ['wifi', 'internet', 'broadband'] },
      { name: 'Mobile Recharge', keywords: ['mobile recharge', 'phone recharge'] },
      { name: 'Cable TV', keywords: ['cable', 'tv subscription'] },
    ],
  },
  {
    name: 'Food & Dining',
    icon: '',
    color: '#EF4444',
    aliases: ['food', 'dining', 'restaurant'],
    subcategories: [
      { name: 'Groceries', keywords: ['grocery', 'supermarket', 'vegetables', 'fruits'] },
      { name: 'Restaurant', keywords: ['restaurant', 'dinner', 'lunch'] },
      { name: 'Fast Food', keywords: ['burger', 'pizza', 'fast food'] },
      { name: 'Coffee', keywords: ['coffee', 'cafe', 'tea', 'chai'] },
      { name: 'Food Delivery', keywords: ['delivery', 'swiggy', 'zomato'] },
      { name: 'Bakery', keywords: ['cake', 'bakery', 'bread'] },
      { name: 'Ice Cream', keywords: ['ice cream'] },
    ],
  },
  {
    name: 'Transportation',
    icon: '',
    color: '#F59E0B',
    aliases: ['transport', 'transportation', 'commute'],
    subcategories: [
      { name: 'Petrol', keywords: ['petrol', 'fuel', 'gas', 'gasoline'] },
      { name: 'Diesel', keywords: ['diesel'] },
      { name: 'EV Charging', keywords: ['ev charging', 'charging station'] },
      { name: 'Taxi', keywords: ['taxi', 'cab', 'uber', 'ola'] },
      { name: 'Bus Ticket', keywords: ['bus'] },
      { name: 'Train Ticket', keywords: ['train'] },
      { name: 'Metro Ticket', keywords: ['metro'] },
      { name: 'Parking', keywords: ['parking'] },
      { name: 'Toll Fees', keywords: ['toll'] },
    ],
  },
  {
    name: 'Vehicle',
    icon: '',
    color: '#F97316',
    aliases: ['vehicle', 'vehicle maintenance', 'vehicle expenses', 'car', 'bike'],
    subcategories: [
      { name: 'Car EMI', keywords: ['car emi', 'vehicle loan'] },
      { name: 'Bike EMI', keywords: ['bike emi'] },
      { name: 'Vehicle Insurance', keywords: ['vehicle insurance'] },
      { name: 'Car Service', keywords: ['service', 'car repair'] },
      { name: 'Oil Change', keywords: ['oil change'] },
      { name: 'Tires', keywords: ['tire', 'tyre'] },
      { name: 'Car Wash', keywords: ['car wash'] },
    ],
  },
  {
    name: 'Health & Medical',
    icon: '',
    color: '#06B6D4',
    aliases: ['healthcare', 'health', 'medical'],
    subcategories: [
      { name: 'Doctor Visit', keywords: ['doctor', 'consultation'] },
      { name: 'Hospital Bill', keywords: ['hospital'] },
      { name: 'Medicines', keywords: ['medicine', 'pharmacy'] },
      { name: 'Dental', keywords: ['dentist', 'dental'] },
      { name: 'Lab Tests', keywords: ['blood test', 'lab test'] },
      { name: 'Eye Checkup', keywords: ['eye doctor', 'eye checkup'] },
      { name: 'Health Insurance', keywords: ['health insurance'] },
    ],
  },
  {
    name: 'Shopping',
    icon: '',
    color: '#EC4899',
    aliases: ['shopping', 'purchase', 'retail'],
    subcategories: [
      { name: 'Clothes', keywords: ['shirt', 'pant', 'clothing'] },
      { name: 'Shoes', keywords: ['shoes', 'footwear'] },
      { name: 'Accessories', keywords: ['belt', 'wallet'] },
      { name: 'Jewelry', keywords: ['gold', 'ring'] },
      { name: 'Online Shopping', keywords: ['amazon', 'flipkart'] },
    ],
  },
  {
    name: 'Subscriptions',
    icon: '',
    color: '#8B5CF6',
    aliases: ['subscriptions', 'subscriptions & digital services', 'digital', 'streaming'],
    subcategories: [
      { name: 'Streaming Services', keywords: ['netflix', 'prime', 'hotstar'] },
      { name: 'Music Subscription', keywords: ['spotify', 'apple music'] },
      { name: 'Cloud Storage', keywords: ['icloud', 'google drive'] },
      { name: 'Software Tools', keywords: ['software subscription', 'figma', 'canva', 'notion'] },
      { name: 'Online Courses', keywords: ['course', 'udemy'] },
    ],
  },
  {
    name: 'Travel',
    icon: '',
    color: '#6366F1',
    aliases: ['travel', 'travel & vacation', 'vacation', 'holiday'],
    subcategories: [
      { name: 'Flight Ticket', keywords: ['flight', 'air ticket'] },
      { name: 'Hotel', keywords: ['hotel stay'] },
      { name: 'Resort', keywords: ['resort'] },
      { name: 'Visa Fee', keywords: ['visa'] },
      { name: 'Travel Insurance', keywords: ['travel insurance'] },
      { name: 'Luggage', keywords: ['luggage', 'bag'] },
    ],
  },
  {
    name: 'Business Expenses',
    icon: '',
    color: '#06B6D4',
    aliases: ['business', 'work', 'office'],
    subcategories: [
      { name: 'Office Rent', keywords: ['office rent'] },
      { name: 'Office Supplies', keywords: ['stationery'] },
      { name: 'Hosting', keywords: ['server', 'hosting'] },
      { name: 'Domain', keywords: ['domain name'] },
      { name: 'Marketing', keywords: ['ads', 'marketing', 'google ads', 'meta ads'] },
      { name: 'Freelancer Payment', keywords: ['freelancer', 'contractor'] },
    ],
  },
  {
    name: 'Education',
    icon: '',
    color: '#3B82F6',
    aliases: ['education', 'study', 'schooling'],
    subcategories: [
      { name: 'School Fees', keywords: ['school fees'] },
      { name: 'College Fees', keywords: ['college fees'] },
      { name: 'Tuition', keywords: ['tuition'] },
      { name: 'Books', keywords: ['books', 'study material'] },
      { name: 'Certification Exam', keywords: ['exam'] },
    ],
  },
  {
    name: 'Entertainment',
    icon: '',
    color: '#3D5A80',
    aliases: ['entertainment', 'fun', 'leisure'],
    subcategories: [
      { name: 'Movie Ticket', keywords: ['movie', 'cinema'] },
      { name: 'Concert', keywords: ['concert', 'music event'] },
      { name: 'Games', keywords: ['video game', 'game purchase'] },
      { name: 'Theme Park', keywords: ['park ticket'] },
      { name: 'Books & Magazines', keywords: ['magazine'] },
    ],
  },
  {
    name: 'Gifts & Donations',
    icon: '',
    color: '#A855F7',
    aliases: ['gifts', 'gift', 'donation', 'charity', 'donations & charity'],
    subcategories: [
      { name: 'Birthday Gift', keywords: ['birthday gift'] },
      { name: 'Wedding Gift', keywords: ['wedding gift'] },
      { name: 'Charity', keywords: ['donation', 'charity'] },
      { name: 'Religious Donation', keywords: ['zakat', 'sadaqah', 'temple donation'] },
    ],
  },
  {
    name: 'Miscellaneous',
    icon: '',
    color: '#64748B',
    aliases: ['miscellaneous', 'miscellaneous / other', 'misc', 'other'],
    subcategories: [
      { name: 'Emergency Expense', keywords: ['emergency'] },
      { name: 'Fine / Penalty', keywords: ['fine', 'penalty'] },
      { name: 'Unexpected Expense', keywords: ['unexpected'] },
      { name: 'Other', keywords: ['other'] },
    ],
  },
  {
    name: 'Family & Kids',
    icon: '',
    color: '#14B8A6',
    aliases: ['family', 'kids', 'children'],
    subcategories: [
      'Baby Products',
      'Toys',
      'School Supplies',
      'Kids Clothing',
      'Babysitting',
      'Daycare',
    ],
  },
  {
    name: 'Personal Care',
    icon: '',
    color: '#F43F5E',
    aliases: ['personal care', 'self care', 'grooming'],
    subcategories: [
      'Haircut',
      'Salon',
      'Spa',
      'Cosmetics',
      'Skincare',
      'Grooming',
    ],
  },
  {
    name: 'Fitness & Sports',
    icon: '',
    color: '#10B981',
    aliases: ['fitness', 'sports', 'gym'],
    subcategories: [
      'Gym Membership',
      'Sports Equipment',
      'Yoga Classes',
      'Swimming',
      'Personal Trainer',
      'Supplements',
    ],
  },
  {
    name: 'Pets',
    icon: '',
    color: '#F59E0B',
    aliases: ['pets', 'pet'],
    subcategories: [
      { name: 'Pet Food', keywords: ['pet food'] },
      { name: 'Vet Visit', keywords: ['vet', 'veterinary', 'pet doctor'] },
      { name: 'Pet Grooming', keywords: ['pet grooming'] },
      { name: 'Pet Toys', keywords: ['pet toys'] },
      { name: 'Pet Medical', keywords: ['pet medical'] },
    ],
  },
  {
    name: 'Investments',
    icon: '',
    color: '#F59E0B',
    aliases: ['investment', 'investments', 'portfolio'],
    subcategories: [
      { name: 'Stocks Purchase', keywords: ['stock', 'shares', 'nse', 'bse'] },
      'Mutual Funds',
      { name: 'Crypto Investment', keywords: ['crypto', 'bitcoin', 'ethereum'] },
      'Real Estate Investment',
      'Brokerage Fees',
    ],
  },
  {
    name: 'Taxes & Government',
    icon: '',
    color: '#7C3AED',
    aliases: ['tax', 'taxes', 'government'],
    subcategories: [
      'Income Tax',
      'Property Tax',
      'Road Tax',
      'GST Payment',
      'License Fee',
    ],
  },
  {
    name: 'Electronics & Gadgets',
    icon: '',
    color: '#2563EB',
    aliases: ['electronics', 'gadgets'],
    subcategories: [
      'Mobile Phone',
      'Laptop',
      'Tablet',
      'Headphones',
      'Smartwatch',
      'Camera',
    ],
  },
  {
    name: 'Home Maintenance',
    icon: '',
    color: '#0F766E',
    aliases: ['home maintenance', 'repairs'],
    subcategories: [
      'Repairs',
      'Plumber',
      'Electrician',
      'Painter',
      'Appliance Repair',
      'Pest Control',
    ],
  },
  {
    name: 'Loan / Debt Payments',
    icon: '',
    color: '#0EA5E9',
    aliases: ['loan', 'loans', 'debt', 'finance'],
    subcategories: [
      'Loan Payment',
      'Credit Card Bill',
      'Interest Payment',
      'EMI Payment',
      'Bank Fees',
      'ATM Fees',
    ],
  },
];

const buildKeywords = (category: string, seed: string | ExpenseSubcategorySeed) => {
  const name = typeof seed === 'string' ? seed : seed.name;
  const extras = typeof seed === 'string' ? [] : (seed.keywords ?? []);
  const merchantKeywords = EXPENSE_MERCHANT_RULES
    .filter((rule) =>
      normalizeText(rule.category) === normalizeText(category) &&
      normalizeText(rule.subcategory) === normalizeText(name),
    )
    .flatMap((rule) => rule.keywords);

  return uniqueStrings([name, category, ...toTokens(name), ...extras, ...merchantKeywords]);
};

const EXPENSE_CATEGORY_RECORDS: CategoryRecord[] = EXPENSE_CATEGORY_SEEDS.map((seed) => ({
  name: seed.name,
  icon: seed.icon,
  color: seed.color,
  aliases: seed.aliases ?? [],
  subcategories: seed.subcategories.map((subcategory) =>
    typeof subcategory === 'string' ? subcategory : subcategory.name,
  ),
}));

export const EXPENSE_CATEGORIES = Object.fromEntries(
  EXPENSE_CATEGORY_SEEDS.map((seed) => [
    slugify(seed.name),
    {
      name: seed.name,
      icon: seed.icon,
      color: seed.color,
      subcategories: seed.subcategories.map((subcategory) =>
        typeof subcategory === 'string' ? subcategory : subcategory.name,
      ),
    },
  ]),
) as Record<string, { name: string; icon: string; color: string; subcategories: string[] }>;

export const INCOME_CATEGORIES = {
  salary: {
    name: 'Salary',
    icon: '',
    color: '#10B981',
    subcategories: ['Monthly Salary', 'Bonus', 'Overtime', 'Allowance', 'Advance', 'Backpay', 'Raise', 'Commission'],
  },
  freelance: {
    name: 'Freelance & Side Gigs',
    icon: '',
    color: '#3B82F6',
    subcategories: ['Freelance Project', 'Consulting', 'Tutoring', 'Writing', 'Design', 'Photography', 'Transcription', 'Virtual Assistant'],
  },
  investment: {
    name: 'Investment Returns',
    icon: '',
    color: '#F59E0B',
    subcategories: ['Dividends', 'Interest', 'Capital Gains', 'Crypto Returns', 'Stock Sale', 'Mutual Funds', 'Bonds', 'Real Estate'],
  },
  business: {
    name: 'Business',
    icon: '',
    color: '#8B5CF6',
    subcategories: ['Sales', 'Service Revenue', 'Rental Income', 'Product Sale', 'Affiliate Commission', 'Sponsorship', 'License Fee', 'Royalty'],
  },
  gift: {
    name: 'Gift & Refund',
    icon: '',
    color: '#EC4899',
    subcategories: ['Gift Received', 'Refund', 'Reimbursement', 'Insurance Payout', 'Lottery', 'Found Money', 'Tax Return', 'Subsidy'],
  },
  other: {
    name: 'Other Income',
    icon: '',
    color: '#64748B',
    subcategories: ['Bonus', 'Award', 'Inheritance', 'Settlement', 'Residual Income', 'Stipend', 'Scholarship', 'Pension'],
  },
};

const getExpenseCategorySeed = (category: string) => {
  const normalized = normalizeText(category);
  const canonical = EXPENSE_CATEGORY_ALIASES[normalized] ?? category;

  return EXPENSE_CATEGORY_SEEDS.find((seed) => {
    if (seed.name.toLowerCase() === canonical.toLowerCase()) return true;
    if (seed.name.toLowerCase() === category.toLowerCase()) return true;
    return seed.aliases?.some((alias) => normalizeText(alias) === normalized) ?? false;
  }) ?? null;
};

export function normalizeCategorySelection(category: string, type: 'expense' | 'income' = 'expense') {
  if (!category) return '';
  if (type === 'income') {
    const incomeCategory = Object.values(INCOME_CATEGORIES).find(
      (item) => item.name.toLowerCase() === category.toLowerCase(),
    );
    return incomeCategory?.name ?? category;
  }

  const normalized = normalizeText(category);
  const canonical = EXPENSE_CATEGORY_ALIASES[normalized] ?? category;
  return getExpenseCategorySeed(canonical)?.name ?? canonical;
}

export function getExpenseCategoryNames() {
  return EXPENSE_CATEGORY_RECORDS.map((category) => category.name);
}

export function getSubcategoriesForCategory(category: string, type: 'expense' | 'income' = 'expense'): string[] {
  if (type === 'income') {
    const categoryData = Object.values(INCOME_CATEGORIES).find(
      (value) => value.name.toLowerCase() === category.toLowerCase(),
    );
    return categoryData?.subcategories ?? [];
  }

  return getExpenseCategorySeed(category)?.subcategories.map((subcategory) =>
    typeof subcategory === 'string' ? subcategory : subcategory.name,
  ) ?? [];
}

export function getCategoryDetails(category: string, type: 'expense' | 'income' = 'expense') {
  if (type === 'income') {
    return Object.values(INCOME_CATEGORIES).find(
      (value) => value.name.toLowerCase() === category.toLowerCase(),
    ) ?? null;
  }

  const record = getExpenseCategorySeed(category);
  if (!record) return null;

  return {
    name: record.name,
    icon: record.icon,
    color: record.color,
    subcategories: record.subcategories.map((subcategory) =>
      typeof subcategory === 'string' ? subcategory : subcategory.name,
    ),
  };
}

export function loadCustomExpenseSubcategories(): CustomExpenseSubcategory[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(CUSTOM_EXPENSE_SUBCATEGORIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomExpenseSubcategory[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.name && item?.category)
      : [];
  } catch {
    return [];
  }
}

const persistCustomExpenseSubcategories = (items: CustomExpenseSubcategory[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_EXPENSE_SUBCATEGORIES_STORAGE_KEY, JSON.stringify(items));
};

export function saveCustomExpenseSubcategory(name: string, category: string, keywords: string[] = []) {
  const trimmedName = name.trim();
  const canonicalCategory = normalizeCategorySelection(category, 'expense');
  if (!trimmedName || !canonicalCategory) return null;

  const current = loadCustomExpenseSubcategories();
  const normalizedName = normalizeText(trimmedName);
  const existingIndex = current.findIndex((item) => normalizeText(item.name) === normalizedName);
  const now = new Date().toISOString();

  const nextItem: CustomExpenseSubcategory = {
    name: trimmedName,
    category: canonicalCategory,
    keywords: uniqueStrings(keywords),
    createdAt: existingIndex >= 0 ? current[existingIndex].createdAt : now,
    usageCount: existingIndex >= 0 ? current[existingIndex].usageCount : 0,
    lastUsedAt: existingIndex >= 0 ? current[existingIndex].lastUsedAt : undefined,
  };

  if (existingIndex >= 0) {
    current.splice(existingIndex, 1, nextItem);
  } else {
    current.unshift(nextItem);
  }

  persistCustomExpenseSubcategories(current);
  return nextItem;
}

export function noteExpenseSubcategoryUsage(name: string, category: string) {
  const trimmedName = name.trim();
  if (!trimmedName) return;

  const current = loadCustomExpenseSubcategories();
  const normalizedName = normalizeText(trimmedName);
  const existingIndex = current.findIndex((item) => normalizeText(item.name) === normalizedName);
  if (existingIndex < 0) return;

  const existing = current[existingIndex];
  current.splice(existingIndex, 1, {
    ...existing,
    category: normalizeCategorySelection(category, 'expense'),
    usageCount: (existing.usageCount ?? 0) + 1,
    lastUsedAt: new Date().toISOString(),
  });
  persistCustomExpenseSubcategories(current);
}

const getBuiltInExpenseSuggestions = (): ExpenseSubcategorySuggestion[] =>
  EXPENSE_CATEGORY_SEEDS.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      name: typeof subcategory === 'string' ? subcategory : subcategory.name,
      category: category.name,
      keywords: buildKeywords(category.name, subcategory),
      score: 0,
      isCustom: false,
    })),
  );

const toCustomSuggestion = (subcategory: CustomExpenseSubcategory): ExpenseSubcategorySuggestion => ({
  name: subcategory.name,
  category: normalizeCategorySelection(subcategory.category, 'expense'),
  keywords: uniqueStrings([subcategory.name, ...(subcategory.keywords ?? [])]),
  score: 0,
  isCustom: true,
});

const usageBoost = (name: string, recentNames: string[], frequentNames: string[]) => {
  const normalizedName = normalizeText(name);
  let score = 0;

  const recentIndex = recentNames.findIndex((item) => normalizeText(item) === normalizedName);
  if (recentIndex >= 0) score += 55 - recentIndex * 8;

  const frequentIndex = frequentNames.findIndex((item) => normalizeText(item) === normalizedName);
  if (frequentIndex >= 0) score += 45 - frequentIndex * 5;

  return score;
};

const scoreSuggestion = (
  query: string,
  suggestion: ExpenseSubcategorySuggestion,
  preferredCategory: string,
  recentNames: string[],
  frequentNames: string[],
) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return usageBoost(suggestion.name, recentNames, frequentNames)
      + (suggestion.isCustom ? 10 : 0)
      + (preferredCategory && normalizeText(preferredCategory) === normalizeText(suggestion.category) ? 8 : 0);
  }

  const queryTokens = toTokens(normalizedQuery);
  const name = normalizeText(suggestion.name);
  const keywordSpace = uniqueStrings([suggestion.name, ...suggestion.keywords]).map(normalizeText);
  let score = 0;

  if (name === normalizedQuery) score = Math.max(score, 280);
  if (name.startsWith(normalizedQuery)) score = Math.max(score, 220);
  if (name.includes(normalizedQuery)) score = Math.max(score, 180);
  if (isSubsequence(normalizedQuery.replace(/\s+/g, ''), name.replace(/\s+/g, ''))) {
    score = Math.max(score, 120);
  }

  keywordSpace.forEach((keyword) => {
    if (keyword === normalizedQuery) score = Math.max(score, 240);
    else if (keyword.startsWith(normalizedQuery)) score = Math.max(score, 200);
    else if (keyword.includes(normalizedQuery)) score = Math.max(score, 160);

    if (queryTokens.length > 0 && queryTokens.every((token) => keyword.includes(token))) {
      score = Math.max(score, 145 + queryTokens.length * 10);
    }
  });

  if (!score) return 0;

  score += usageBoost(suggestion.name, recentNames, frequentNames);
  if (preferredCategory && normalizeText(preferredCategory) === normalizeText(suggestion.category)) score += 14;
  if (suggestion.isCustom) score += 8;
  return score;
};

export function getCategoryForExpenseSubcategory(
  subcategory: string,
  customSubcategories: CustomExpenseSubcategory[] = loadCustomExpenseSubcategories(),
) {
  const normalizedSubcategory = normalizeText(subcategory);
  if (!normalizedSubcategory) return null;

  const customMatch = customSubcategories.find(
    (item) => normalizeText(item.name) === normalizedSubcategory,
  );
  if (customMatch) return normalizeCategorySelection(customMatch.category, 'expense');

  for (const category of EXPENSE_CATEGORY_SEEDS) {
    const matched = category.subcategories.find((subcategoryItem) =>
      normalizeText(typeof subcategoryItem === 'string' ? subcategoryItem : subcategoryItem.name) === normalizedSubcategory,
    );
    if (matched) return category.name;
  }

  return null;
}

export function searchExpenseSubcategories(
  query: string,
  options?: {
    limit?: number;
    preferredCategory?: string;
    recentNames?: string[];
    frequentNames?: string[];
    customSubcategories?: CustomExpenseSubcategory[];
  },
) {
  const limit = options?.limit ?? 8;
  const preferredCategory = options?.preferredCategory ?? '';
  const recentNames = options?.recentNames ?? [];
  const frequentNames = options?.frequentNames ?? [];
  const customSubcategories = options?.customSubcategories ?? loadCustomExpenseSubcategories();

  const suggestions = [...getBuiltInExpenseSuggestions(), ...customSubcategories.map(toCustomSuggestion)]
    .map((suggestion) => ({
      ...suggestion,
      score: scoreSuggestion(query, suggestion, preferredCategory, recentNames, frequentNames),
    }))
    .filter((suggestion) => suggestion.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.name.localeCompare(b.name) ||
      a.category.localeCompare(b.category),
    );

  const deduped: ExpenseSubcategorySuggestion[] = [];
  const seen = new Set<string>();

  for (const suggestion of suggestions) {
    const key = `${normalizeText(suggestion.name)}::${normalizeText(suggestion.category)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(suggestion);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export function detectExpenseCategoryFromText(
  text: string,
  customSubcategories: CustomExpenseSubcategory[] = loadCustomExpenseSubcategories(),
) {
  const bestMatch = searchExpenseSubcategories(text, {
    limit: 1,
    customSubcategories,
  })[0];

  if (!bestMatch || bestMatch.score < 140) {
    return null;
  }

  return {
    category: bestMatch.category,
    subcategory: bestMatch.name,
    score: bestMatch.score,
  };
}

// Tax Brackets (India as example - customize as needed)
export const TAX_BRACKETS = {
  india: {
    singleFiler: [
      { min: 0, max: 250000, rate: 0 },
      { min: 250001, max: 500000, rate: 5 },
      { min: 500001, max: 1000000, rate: 20 },
      { min: 1000001, max: Infinity, rate: 30 },
    ],
    marriedFiler: [
      { min: 0, max: 500000, rate: 0 },
      { min: 500001, max: 1000000, rate: 5 },
      { min: 1000001, max: 1500000, rate: 20 },
      { min: 1500001, max: Infinity, rate: 30 },
    ],
  },
  usa: {
    singleFiler: [
      { min: 0, max: 11000, rate: 0.10 },
      { min: 11000, max: 44725, rate: 0.12 },
      { min: 44725, max: 95375, rate: 0.22 },
      { min: 95375, max: 182100, rate: 0.24 },
      { min: 182100, max: 231250, rate: 0.32 },
      { min: 231250, max: 578125, rate: 0.35 },
      { min: 578125, max: Infinity, rate: 0.37 },
    ],
    marriedFiler: [
      { min: 0, max: 22000, rate: 0.10 },
      { min: 22000, max: 89075, rate: 0.12 },
      { min: 89075, max: 190750, rate: 0.22 },
      { min: 190750, max: 364200, rate: 0.24 },
      { min: 364200, max: 462500, rate: 0.32 },
      { min: 462500, max: 693750, rate: 0.35 },
      { min: 693750, max: Infinity, rate: 0.37 },
    ],
  },
};

export const STANDARD_DEDUCTIONS = {
  india: {
    singleFiler: 50000,
    marriedFiler: 50000,
    seniorCitizen: 100000,
  },
  usa: {
    singleFiler: 13850,
    marriedFiler: 27700,
    headOfHousehold: 20800,
    seniorCitizen: 16550,
  },
};

export function calculateTax(
  income: number,
  country: string = 'india',
  filingStatus: string = 'singleFiler',
): {
  taxableIncome: number;
  tax: number;
  effectiveRate: number;
} {
  const brackets = TAX_BRACKETS[country as keyof typeof TAX_BRACKETS];
  const deduction =
    STANDARD_DEDUCTIONS[country as keyof typeof STANDARD_DEDUCTIONS][
      filingStatus as keyof typeof STANDARD_DEDUCTIONS.india
    ];

  if (!brackets || !deduction) {
    return { taxableIncome: 0, tax: 0, effectiveRate: 0 };
  }

  const taxableIncome = Math.max(0, income - deduction);
  let tax = 0;

  const bracketsArray = Array.isArray(brackets) ? brackets : Object.values(brackets);
  for (const bracket of bracketsArray) {
    if (taxableIncome > bracket.min) {
      const incomeInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
      tax += incomeInBracket * bracket.rate;
    }
  }

  const effectiveRate = income > 0 ? (tax / income) * 100 : 0;

  return {
    taxableIncome,
    tax,
    effectiveRate,
  };
}

