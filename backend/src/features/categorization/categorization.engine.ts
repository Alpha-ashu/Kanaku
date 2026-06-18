import { prisma } from '../../db/prisma';

export interface CategorizationResult {
  category: string;
  subcategory: string;
  confidence: number;
  matchedBy: 'learned' | 'exact' | 'partial' | 'token' | 'fuzzy' | 'fallback';
}

const KEYWORDS: Array<{ keyword: string; category: string; subcategory: string; weight?: number }> = [
  // Food & Dining
  { keyword: 'pani puri', category: 'Food & Dining', subcategory: 'Street Food', weight: 2 },
  { keyword: 'golgappa', category: 'Food & Dining', subcategory: 'Street Food', weight: 2 },
  { keyword: 'chaat', category: 'Food & Dining', subcategory: 'Street Food' },
  { keyword: 'samosa', category: 'Food & Dining', subcategory: 'Street Food' },
  { keyword: 'snack', category: 'Food & Dining', subcategory: 'Snacks' },
  { keyword: 'chips', category: 'Food & Dining', subcategory: 'Snacks' },
  { keyword: 'tea', category: 'Food & Dining', subcategory: 'Beverages' },
  { keyword: 'chai', category: 'Food & Dining', subcategory: 'Beverages' },
  { keyword: 'coffee', category: 'Food & Dining', subcategory: 'Beverages' },
  { keyword: 'lassi', category: 'Food & Dining', subcategory: 'Beverages' },
  { keyword: 'juice', category: 'Food & Dining', subcategory: 'Beverages' },
  { keyword: 'restaurant', category: 'Food & Dining', subcategory: 'Restaurant' },
  { keyword: 'hotel', category: 'Food & Dining', subcategory: 'Restaurant' },
  { keyword: 'dhaba', category: 'Food & Dining', subcategory: 'Restaurant' },
  { keyword: 'cafe', category: 'Food & Dining', subcategory: 'Cafe' },
  { keyword: 'bakery', category: 'Food & Dining', subcategory: 'Bakery' },
  { keyword: 'mithai', category: 'Food & Dining', subcategory: 'Sweets' },
  { keyword: 'sweet shop', category: 'Food & Dining', subcategory: 'Sweets' },
  { keyword: 'idli', category: 'Food & Dining', subcategory: 'Restaurant' },
  { keyword: 'dosa', category: 'Food & Dining', subcategory: 'Restaurant' },
  { keyword: 'medu wada', category: 'Food & Dining', subcategory: 'Restaurant' },
  { keyword: 'biryani', category: 'Food & Dining', subcategory: 'Restaurant' },
  { keyword: 'zomato', category: 'Food & Dining', subcategory: 'Food Delivery', weight: 2 },
  { keyword: 'swiggy', category: 'Food & Dining', subcategory: 'Food Delivery', weight: 2 },
  { keyword: 'blinkit', category: 'Food & Dining', subcategory: 'Grocery Delivery', weight: 2 },
  { keyword: 'dunzo', category: 'Food & Dining', subcategory: 'Grocery Delivery', weight: 2 },
  { keyword: 'zepto', category: 'Food & Dining', subcategory: 'Grocery Delivery', weight: 2 },
  { keyword: 'bigbasket', category: 'Food & Dining', subcategory: 'Grocery Delivery', weight: 2 },
  { keyword: 'instamart', category: 'Food & Dining', subcategory: 'Grocery Delivery' },
  { keyword: 'fresh menu', category: 'Food & Dining', subcategory: 'Food Delivery' },
  { keyword: 'box8', category: 'Food & Dining', subcategory: 'Food Delivery' },
  { keyword: 'faasos', category: 'Food & Dining', subcategory: 'Food Delivery' },
  { keyword: 'kfc', category: 'Food & Dining', subcategory: 'Fast Food' },
  { keyword: 'mcdonalds', category: 'Food & Dining', subcategory: 'Fast Food' },
  { keyword: 'burger king', category: 'Food & Dining', subcategory: 'Fast Food' },
  { keyword: 'dominos', category: 'Food & Dining', subcategory: 'Fast Food' },
  { keyword: 'pizza hut', category: 'Food & Dining', subcategory: 'Fast Food' },
  { keyword: 'subway', category: 'Food & Dining', subcategory: 'Fast Food' },
  { keyword: 'starbucks', category: 'Food & Dining', subcategory: 'Cafe' },
  { keyword: 'haldirams', category: 'Food & Dining', subcategory: 'Snacks' },
  { keyword: 'bikanervala', category: 'Food & Dining', subcategory: 'Sweets' },
  { keyword: 'grocery', category: 'Food & Dining', subcategory: 'Groceries' },
  { keyword: 'supermarket', category: 'Food & Dining', subcategory: 'Groceries' },
  { keyword: 'dmart', category: 'Food & Dining', subcategory: 'Groceries', weight: 2 },
  { keyword: 'reliance fresh', category: 'Food & Dining', subcategory: 'Groceries', weight: 2 },
  { keyword: 'licious', category: 'Food & Dining', subcategory: 'Groceries' },
  { keyword: 'country delight', category: 'Food & Dining', subcategory: 'Groceries' },
  // Transportation
  { keyword: 'petrol', category: 'Transportation', subcategory: 'Fuel', weight: 2 },
  { keyword: 'diesel', category: 'Transportation', subcategory: 'Fuel', weight: 2 },
  { keyword: 'fuel', category: 'Transportation', subcategory: 'Fuel', weight: 2 },
  { keyword: 'cng', category: 'Transportation', subcategory: 'Fuel', weight: 2 },
  { keyword: 'indian oil', category: 'Transportation', subcategory: 'Fuel' },
  { keyword: 'bharat petroleum', category: 'Transportation', subcategory: 'Fuel' },
  { keyword: 'hp petrol', category: 'Transportation', subcategory: 'Fuel' },
  { keyword: 'uber', category: 'Transportation', subcategory: 'Taxi', weight: 2 },
  { keyword: 'ola', category: 'Transportation', subcategory: 'Taxi', weight: 2 },
  { keyword: 'rapido', category: 'Transportation', subcategory: 'Taxi' },
  { keyword: 'indrive', category: 'Transportation', subcategory: 'Taxi' },
  { keyword: 'metro', category: 'Transportation', subcategory: 'Metro' },
  { keyword: 'bus ticket', category: 'Transportation', subcategory: 'Bus' },
  { keyword: 'redbus', category: 'Transportation', subcategory: 'Bus', weight: 2 },
  { keyword: 'irctc', category: 'Transportation', subcategory: 'Train', weight: 2 },
  { keyword: 'train ticket', category: 'Transportation', subcategory: 'Train' },
  { keyword: 'indigo', category: 'Transportation', subcategory: 'Flight', weight: 2 },
  { keyword: 'air india', category: 'Transportation', subcategory: 'Flight' },
  { keyword: 'spicejet', category: 'Transportation', subcategory: 'Flight' },
  { keyword: 'toll', category: 'Transportation', subcategory: 'Toll Fees' },
  { keyword: 'fastag', category: 'Transportation', subcategory: 'Toll Fees' },
  { keyword: 'parking', category: 'Transportation', subcategory: 'Parking' },
  // Travel
  { keyword: 'makemytrip', category: 'Travel', subcategory: 'Travel Booking', weight: 2 },
  { keyword: 'goibibo', category: 'Travel', subcategory: 'Travel Booking', weight: 2 },
  { keyword: 'yatra', category: 'Travel', subcategory: 'Travel Booking' },
  { keyword: 'cleartrip', category: 'Travel', subcategory: 'Travel Booking' },
  { keyword: 'oyo', category: 'Travel', subcategory: 'Hotel Booking', weight: 2 },
  { keyword: 'airbnb', category: 'Travel', subcategory: 'Hotel Booking' },
  // Vehicle
  { keyword: 'headlight', category: 'Vehicle', subcategory: 'Car Service', weight: 2 },
  { keyword: 'repair', category: 'Vehicle', subcategory: 'Car Service' },
  { keyword: 'maintenance', category: 'Vehicle', subcategory: 'Car Service' },
  { keyword: 'car wash', category: 'Vehicle', subcategory: 'Car Service' },
  { keyword: 'tyre', category: 'Vehicle', subcategory: 'Tires' },
  { keyword: 'tire', category: 'Vehicle', subcategory: 'Tires' },
  // Utilities
  { keyword: 'electricity', category: 'Utilities', subcategory: 'Electricity Bill' },
  { keyword: 'bescom', category: 'Utilities', subcategory: 'Electricity Bill', weight: 2 },
  { keyword: 'msedcl', category: 'Utilities', subcategory: 'Electricity Bill', weight: 2 },
  { keyword: 'tata power', category: 'Utilities', subcategory: 'Electricity Bill' },
  { keyword: 'wifi', category: 'Utilities', subcategory: 'Internet Bill' },
  { keyword: 'internet', category: 'Utilities', subcategory: 'Internet Bill' },
  { keyword: 'broadband', category: 'Utilities', subcategory: 'Internet Bill' },
  { keyword: 'jio fiber', category: 'Utilities', subcategory: 'Internet Bill', weight: 2 },
  { keyword: 'act fibernet', category: 'Utilities', subcategory: 'Internet Bill' },
  { keyword: 'mobile recharge', category: 'Utilities', subcategory: 'Mobile Recharge' },
  { keyword: 'jio recharge', category: 'Utilities', subcategory: 'Mobile Recharge', weight: 2 },
  { keyword: 'airtel recharge', category: 'Utilities', subcategory: 'Mobile Recharge' },
  { keyword: 'bsnl', category: 'Utilities', subcategory: 'Mobile Recharge' },
  { keyword: 'water bill', category: 'Utilities', subcategory: 'Water Bill' },
  { keyword: 'gas bill', category: 'Utilities', subcategory: 'Gas Bill' },
  { keyword: 'lpg', category: 'Utilities', subcategory: 'Gas Bill' },
  { keyword: 'indane gas', category: 'Utilities', subcategory: 'Gas Bill' },
  // Shopping
  { keyword: 'amazon', category: 'Shopping', subcategory: 'Online Shopping', weight: 2 },
  { keyword: 'flipkart', category: 'Shopping', subcategory: 'Online Shopping', weight: 2 },
  { keyword: 'myntra', category: 'Shopping', subcategory: 'Clothing', weight: 2 },
  { keyword: 'ajio', category: 'Shopping', subcategory: 'Clothing', weight: 2 },
  { keyword: 'meesho', category: 'Shopping', subcategory: 'Online Shopping', weight: 2 },
  { keyword: 'nykaa', category: 'Shopping', subcategory: 'Beauty', weight: 2 },
  { keyword: 'tata cliq', category: 'Shopping', subcategory: 'Online Shopping' },
  { keyword: 'snapdeal', category: 'Shopping', subcategory: 'Online Shopping' },
  { keyword: 'croma', category: 'Shopping', subcategory: 'Electronics', weight: 2 },
  { keyword: 'vijay sales', category: 'Shopping', subcategory: 'Electronics' },
  { keyword: 'reliance digital', category: 'Shopping', subcategory: 'Electronics' },
  { keyword: 'apple store', category: 'Shopping', subcategory: 'Electronics' },
  { keyword: 'clothing', category: 'Shopping', subcategory: 'Clothing' },
  // Health & Medical
  { keyword: 'medicine', category: 'Health & Medical', subcategory: 'Medicines', weight: 2 },
  { keyword: 'pharmacy', category: 'Health & Medical', subcategory: 'Medicines', weight: 2 },
  { keyword: 'medical store', category: 'Health & Medical', subcategory: 'Medicines', weight: 2 },
  { keyword: '1mg', category: 'Health & Medical', subcategory: 'Medicines', weight: 2 },
  { keyword: 'pharmeasy', category: 'Health & Medical', subcategory: 'Medicines', weight: 2 },
  { keyword: 'apollo pharmacy', category: 'Health & Medical', subcategory: 'Medicines', weight: 2 },
  { keyword: 'netmeds', category: 'Health & Medical', subcategory: 'Medicines' },
  { keyword: 'doctor', category: 'Health & Medical', subcategory: 'Doctor Visit' },
  { keyword: 'hospital', category: 'Health & Medical', subcategory: 'Hospital' },
  { keyword: 'clinic', category: 'Health & Medical', subcategory: 'Doctor Visit' },
  { keyword: 'practo', category: 'Health & Medical', subcategory: 'Doctor Visit' },
  { keyword: 'diagnostic', category: 'Health & Medical', subcategory: 'Diagnostics' },
  { keyword: 'lab test', category: 'Health & Medical', subcategory: 'Diagnostics' },
  { keyword: 'gym', category: 'Health & Medical', subcategory: 'Fitness' },
  // Subscriptions
  { keyword: 'netflix', category: 'Subscriptions', subcategory: 'Streaming', weight: 2 },
  { keyword: 'amazon prime', category: 'Subscriptions', subcategory: 'Streaming', weight: 2 },
  { keyword: 'hotstar', category: 'Subscriptions', subcategory: 'Streaming', weight: 2 },
  { keyword: 'disney', category: 'Subscriptions', subcategory: 'Streaming' },
  { keyword: 'zee5', category: 'Subscriptions', subcategory: 'Streaming' },
  { keyword: 'sony liv', category: 'Subscriptions', subcategory: 'Streaming' },
  { keyword: 'spotify', category: 'Subscriptions', subcategory: 'Music', weight: 2 },
  { keyword: 'youtube premium', category: 'Subscriptions', subcategory: 'Streaming' },
  { keyword: 'adobe', category: 'Subscriptions', subcategory: 'Software' },
  { keyword: 'google one', category: 'Subscriptions', subcategory: 'Cloud Storage' },
  // Investments & Finance
  { keyword: 'zerodha', category: 'Investments', subcategory: 'Stocks', weight: 2 },
  { keyword: 'groww', category: 'Investments', subcategory: 'Mutual Funds', weight: 2 },
  { keyword: 'upstox', category: 'Investments', subcategory: 'Stocks' },
  { keyword: 'sip', category: 'Investments', subcategory: 'Mutual Funds' },
  { keyword: 'mutual fund', category: 'Investments', subcategory: 'Mutual Funds' },
  { keyword: 'fixed deposit', category: 'Investments', subcategory: 'Fixed Deposit' },
  { keyword: 'ppf', category: 'Investments', subcategory: 'PPF' },
  { keyword: 'gold', category: 'Investments', subcategory: 'Gold' },
  { keyword: 'stock', category: 'Investments', subcategory: 'Stocks' },
  { keyword: 'cred', category: 'Finance', subcategory: 'Credit Card Payment', weight: 2 },
  // Loans
  { keyword: 'emi', category: 'Loan / Debt Payments', subcategory: 'EMI Payment', weight: 2 },
  { keyword: 'loan payment', category: 'Loan / Debt Payments', subcategory: 'Loan Payment' },
  { keyword: 'home loan', category: 'Loan / Debt Payments', subcategory: 'Home Loan EMI' },
  { keyword: 'credit card bill', category: 'Loan / Debt Payments', subcategory: 'Credit Card Payment' },
  // Education
  { keyword: 'school fee', category: 'Education', subcategory: 'School Fees' },
  { keyword: 'tuition', category: 'Education', subcategory: 'Tuition' },
  { keyword: 'byju', category: 'Education', subcategory: 'Online Courses', weight: 2 },
  { keyword: 'unacademy', category: 'Education', subcategory: 'Online Courses', weight: 2 },
  { keyword: 'coursera', category: 'Education', subcategory: 'Online Courses' },
  { keyword: 'udemy', category: 'Education', subcategory: 'Online Courses' },
  { keyword: 'books', category: 'Education', subcategory: 'Books & Stationery' },
  // Entertainment
  { keyword: 'bookmyshow', category: 'Entertainment', subcategory: 'Movies', weight: 2 },
  { keyword: 'pvr', category: 'Entertainment', subcategory: 'Movies', weight: 2 },
  { keyword: 'inox', category: 'Entertainment', subcategory: 'Movies', weight: 2 },
  { keyword: 'movie ticket', category: 'Entertainment', subcategory: 'Movies' },
  { keyword: 'concert', category: 'Entertainment', subcategory: 'Events' },
  { keyword: 'gaming', category: 'Entertainment', subcategory: 'Gaming' },
];

const SYNONYMS: Record<string, string[]> = {
  fuel: ['petrol', 'diesel', 'gas'],
  petrol: ['fuel'],
  repair: ['maintenance', 'service', 'fix'],
  car: ['vehicle'],
  bike: ['vehicle', 'two wheeler'],
  food: ['meal', 'dining', 'restaurant'],
  bill: ['payment', 'charge'],
};

let ready = false;

export const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string) => normalizeText(value).split(' ').filter(Boolean);

const expandTokens = (tokens: string[]) => {
  const expanded = new Set(tokens);
  tokens.forEach((token) => SYNONYMS[token]?.forEach((synonym) => expanded.add(synonym)));
  return Array.from(expanded);
};

const levenshtein = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  if (left.length > 24 || right.length > 24) return Math.abs(left.length - right.length) + 4;

  const matrix = Array.from({ length: right.length + 1 }, (_, row) =>
    Array.from({ length: left.length + 1 }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)),
  );

  for (let row = 1; row <= right.length; row += 1) {
    for (let col = 1; col <= left.length; col += 1) {
      matrix[row][col] = right[row - 1] === left[col - 1]
        ? matrix[row - 1][col - 1]
        : 1 + Math.min(matrix[row - 1][col], matrix[row][col - 1], matrix[row - 1][col - 1]);
    }
  }

  return matrix[right.length][left.length];
};

export const ensureCategorizationTables = async () => {
  if (ready) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS keyword_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keyword TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      confidence_score NUMERIC DEFAULT 0.8,
      usage_count INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_learning (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      input_text TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      usage_count INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, input_text)
    );
  `);

  for (const entry of KEYWORDS) {
    await prisma.$executeRaw`
      INSERT INTO keyword_mappings (keyword, category, subcategory, confidence_score, usage_count)
      VALUES (${entry.keyword}, ${entry.category}, ${entry.subcategory}, ${0.82 * (entry.weight ?? 1)}, 1)
      ON CONFLICT (keyword) DO NOTHING
    `;
  }

  ready = true;
};

export const categorizeTextForUser = async (userId: string, text: string): Promise<CategorizationResult> => {
  const normalized = normalizeText(text);

  if (!normalized) {
    return { category: 'Miscellaneous', subcategory: 'Other', confidence: 0, matchedBy: 'fallback' };
  }

  await ensureCategorizationTables();

  const learned = await prisma.$queryRaw<Array<{ category: string; subcategory: string | null }>>`
    SELECT category, subcategory
    FROM user_learning
    WHERE user_id = ${userId} AND input_text = ${normalized}
    LIMIT 1
  `;

  if (learned[0]) {
    return {
      category: learned[0].category,
      subcategory: learned[0].subcategory || 'Other',
      confidence: 0.98,
      matchedBy: 'learned',
    };
  }

  const exact = await prisma.$queryRaw<Array<{ category: string; subcategory: string | null; confidence_score: number }>>`
    SELECT category, subcategory, confidence_score
    FROM keyword_mappings
    WHERE keyword = ${normalized}
    LIMIT 1
  `;

  if (exact[0]) {
    return {
      category: exact[0].category,
      subcategory: exact[0].subcategory || 'Other',
      confidence: 0.95,
      matchedBy: 'exact',
    };
  }

  const partial = await prisma.$queryRaw<Array<{ category: string; subcategory: string | null; confidence_score: number }>>`
    SELECT category, subcategory, confidence_score
    FROM keyword_mappings
    WHERE ${normalized} ILIKE '%' || keyword || '%'
    ORDER BY usage_count DESC, LENGTH(keyword) DESC
    LIMIT 1
  `;

  if (partial[0]) {
    return {
      category: partial[0].category,
      subcategory: partial[0].subcategory || 'Other',
      confidence: 0.86,
      matchedBy: 'partial',
    };
  }

  const rows = await prisma.$queryRaw<Array<{ keyword: string; category: string; subcategory: string | null; usage_count: number }>>`
    SELECT keyword, category, subcategory, usage_count
    FROM keyword_mappings
  `;

  const tokens = expandTokens(tokenize(normalized));
  let best: { row: (typeof rows)[number]; score: number; matchedBy: CategorizationResult['matchedBy'] } | null = null;

  for (const row of rows) {
    const keyword = normalizeText(row.keyword);
    const keywordTokens = tokenize(keyword);
    const tokenMatches = keywordTokens.filter((keywordToken) =>
      tokens.some((token) => token === keywordToken || token.startsWith(keywordToken) || keywordToken.startsWith(token)),
    ).length;

    if (tokenMatches > 0) {
      const score = tokenMatches / Math.max(keywordTokens.length, 1) + Math.min(row.usage_count / 100, 0.2);
      if (!best || score > best.score) {
        best = { row, score, matchedBy: 'token' };
      }
    }

    for (const token of tokens) {
      for (const keywordToken of keywordTokens) {
        if (token.length < 4 || keywordToken.length < 4) continue;
        const distance = levenshtein(token, keywordToken);
        if (distance <= 2) {
          const score = 0.5 + ((2 - distance) * 0.08) + Math.min(row.usage_count / 120, 0.16);
          if (!best || score > best.score) {
            best = { row, score, matchedBy: 'fuzzy' };
          }
        }
      }
    }
  }

  if (best && best.score >= 0.5) {
    return {
      category: best.row.category,
      subcategory: best.row.subcategory || 'Other',
      confidence: Math.min(best.score, best.matchedBy === 'token' ? 0.82 : 0.68),
      matchedBy: best.matchedBy,
    };
  }

  return { category: 'Miscellaneous', subcategory: 'Other', confidence: 0.1, matchedBy: 'fallback' };
};

export const learnCategorizationForUser = async (
  userId: string,
  text: string,
  category: string,
  subcategory = '',
) => {
  const normalized = normalizeText(text);
  const normalizedCategory = category.trim();
  const normalizedSubcategory = subcategory.trim() || 'Other';

  if (!normalized || !normalizedCategory) return;

  await ensureCategorizationTables();

  await prisma.$executeRaw`
    INSERT INTO user_learning (user_id, input_text, category, subcategory, usage_count, updated_at)
    VALUES (${userId}, ${normalized}, ${normalizedCategory}, ${normalizedSubcategory}, 1, ${new Date()})
    ON CONFLICT (user_id, input_text)
    DO UPDATE SET
      category = EXCLUDED.category,
      subcategory = EXCLUDED.subcategory,
      usage_count = user_learning.usage_count + 1,
      updated_at = EXCLUDED.updated_at
  `;

  await prisma.$executeRaw`
    INSERT INTO keyword_mappings (keyword, category, subcategory, confidence_score, usage_count, updated_at)
    VALUES (${normalized}, ${normalizedCategory}, ${normalizedSubcategory}, 0.92, 1, ${new Date()})
    ON CONFLICT (keyword)
    DO UPDATE SET
      category = EXCLUDED.category,
      subcategory = EXCLUDED.subcategory,
      confidence_score = GREATEST(keyword_mappings.confidence_score, 0.92),
      usage_count = keyword_mappings.usage_count + 1,
      updated_at = EXCLUDED.updated_at
  `;
};
