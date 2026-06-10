/**
 * Smart Categorization Engine
 * Multi-layer text classification for financial transactions:
 *   Layer 1 - Exact keyword matching (fastest)
 *   Layer 2 - Fuzzy / Levenshtein similarity matching
 *   Layer 3 - Token-based NLP matching
 *   Layer 4 - User-learning system (persisted corrections)
 */

// 
// Types
// 

export interface CategorizationResult {
  category: string;
  subcategory: string;
  confidence: number; // 0-1
  matchedBy: 'learned' | 'exact' | 'fuzzy' | 'token' | 'fallback';
}

export interface LearnedMapping {
  text: string;
  category: string;
  subcategory: string;
  learnedAt: string;
  usageCount: number;
}

// 
// Storage keys
// 

const LEARNED_MAPPINGS_KEY = 'KANAKU.smartCategorization.learnedMappings.v1';

// 
// Keyword Database - extended with Indian context
// 

interface KeywordEntry {
  category: string;
  subcategory: string;
  keywords: string[];
  weight?: number; // higher = stronger signal, default 1
}

const KEYWORD_DB: KeywordEntry[] = [
  //  Food & Dining 
  {
    category: 'Food & Dining', subcategory: 'Street Food',
    keywords: ['pani puri', 'golgappa', 'bhel puri', 'chaat', 'vada pav', 'pav bhaji',
      'samosa', 'kachori', 'dahi puri', 'sev puri', 'ragda', 'aloo tikki'],
  },
  {
    category: 'Food & Dining', subcategory: 'Snacks',
    keywords: ['chips', 'biscuit', 'namkeen', 'popcorn', 'kurkure', 'lays', 'haldiram',
      'dry fruits', 'nuts', 'chocolates', 'candy', 'wafer', 'mathri', 'murukku'],
  },
  {
    category: 'Food & Dining', subcategory: 'Groceries',
    keywords: ['grocery', 'groceries', 'supermarket', 'vegetables', 'fruits', 'sabzi',
      'ration', 'kirana', 'big basket', 'bigbasket', 'blinkit', 'zepto', 'dunzo',
      'dmart', 'reliance fresh', 'more', 'spencer'],
  },
  {
    category: 'Food & Dining', subcategory: 'Restaurant',
    keywords: ['restaurant', 'hotel', 'dhaba', 'dining', 'dinner', 'lunch', 'brunch',
      'buffet', 'thali', 'biryani', 'dal makhani', 'paneer', 'dosa', 'idli'],
  },
  {
    category: 'Food & Dining', subcategory: 'Fast Food',
    keywords: ['burger', 'pizza', 'sandwich', 'wrap', 'mcdonalds', 'kfc', 'subway',
      'dominos', 'pizza hut', 'burger king', 'wendys', 'taco bell', 'nandos',
      'mcd', 'fries', 'nuggets', 'roll', 'frankie'],
  },
  {
    category: 'Food & Dining', subcategory: 'Coffee & Drinks',
    keywords: ['coffee', 'cafe', 'tea', 'chai', 'latte', 'cappuccino', 'espresso',
      'starbucks', 'cafe coffee day', 'ccd', 'barista', 'chaayos', 'chai point',
      'juice', 'smoothie', 'milkshake', 'lassi', 'buttermilk', 'sharbat'],
  },
  {
    category: 'Food & Dining', subcategory: 'Food Delivery',
    keywords: ['swiggy', 'zomato', 'ubereats', 'food delivery', 'online order food',
      'dunzo food', 'magicpin'],
  },
  {
    category: 'Food & Dining', subcategory: 'Bakery',
    keywords: ['bakery', 'cake', 'pastry', 'bread', 'muffin', 'cookie', 'donut',
      'croissant', 'wai wai', 'rusk', 'puff'],
  },
  {
    category: 'Food & Dining', subcategory: 'Ice Cream & Desserts',
    keywords: ['ice cream', 'gelato', 'kulfi', 'falooda', 'dessert', 'brownie',
      'halwa', 'rasgulla', 'gulab jamun', 'kheer', 'mithai', 'sweets', 'barfi'],
  },

  //  Transportation 
  {
    category: 'Transportation', subcategory: 'Petrol / Fuel',
    keywords: ['petrol', 'diesel', 'fuel', 'gas station', 'cng', 'lpg cylinder', 'filling'],
    weight: 2,
  },
  {
    category: 'Transportation', subcategory: 'Taxi / Cab',
    keywords: ['uber', 'ola', 'rapido', 'taxi', 'cab', 'auto', 'auto rickshaw', 'lyft'],
  },
  {
    category: 'Transportation', subcategory: 'Public Transport',
    keywords: ['bus ticket', 'bus pass', 'metro', 'metro card', 'train ticket', 'local train',
      'railway', 'irctc', 'dmrc', 'bmtc', 'ksrtc', 'state bus', 'ticket'],
  },
  {
    category: 'Transportation', subcategory: 'Parking',
    keywords: ['parking', 'parking fee', 'parking ticket', 'valet'],
  },
  {
    category: 'Transportation', subcategory: 'Toll',
    keywords: ['toll', 'toll fee', 'fastag', 'highway'],
  },
  {
    category: 'Transportation', subcategory: 'EV Charging',
    keywords: ['ev charging', 'electric vehicle', 'charging station', 'tata power ev'],
  },

  //  Vehicle 
  {
    category: 'Vehicle', subcategory: 'Vehicle Maintenance',
    keywords: ['car service', 'bike service', 'oil change', 'tyre', 'tire', 'puncture',
      'car repair', 'bike repair', 'workshop', 'garage', 'mechanic', 'clutch',
      'brake', 'battery replace', 'engine oil', 'coolant', 'headlight', 'taillight',
      'wiper', 'seat cover', 'car wash', 'polish', 'detailing', 'alignment', 'balancing'],
    weight: 2,
  },
  {
    category: 'Vehicle', subcategory: 'Vehicle Insurance',
    keywords: ['vehicle insurance', 'car insurance', 'bike insurance', 'two-wheeler insurance',
      'motor insurance', 'third party insurance'],
  },
  {
    category: 'Vehicle', subcategory: 'Car EMI',
    keywords: ['car emi', 'car loan', 'car installment', 'vehicle emi'],
  },
  {
    category: 'Vehicle', subcategory: 'Bike EMI',
    keywords: ['bike emi', 'bike loan', 'two-wheeler loan', 'bike installment'],
  },

  //  Utilities / Bills 
  {
    category: 'Utilities', subcategory: 'Electricity Bill',
    keywords: ['electricity', 'power bill', 'eb bill', 'bescom', 'tata power', 'adani electricity',
      'tneb', 'mseb', 'bses', 'wbsedcl', 'torrent power'],
  },
  {
    category: 'Utilities', subcategory: 'Water Bill',
    keywords: ['water bill', 'water tax', 'bwssb', 'bmc water'],
  },
  {
    category: 'Utilities', subcategory: 'Gas Bill',
    keywords: ['gas bill', 'lpg', 'piped gas', 'indane', 'hp gas', 'bharat gas', 'mgl', 'adani gas'],
  },
  {
    category: 'Utilities', subcategory: 'Internet Bill',
    keywords: ['wifi', 'internet', 'broadband', 'airtel broadband', 'jio fiber', 'act fibernet',
      'hathway', 'tata sky broadband', 'bsnl broadband'],
  },
  {
    category: 'Utilities', subcategory: 'Mobile Recharge',
    keywords: ['mobile recharge', 'phone recharge', 'prepaid recharge', 'postpaid bill',
      'airtel', 'jio', 'vi', 'vodafone idea', 'bsnl mobile'],
  },
  {
    category: 'Utilities', subcategory: 'Cable TV / DTH',
    keywords: ['cable tv', 'dth', 'tata sky', 'tataplay', 'dish tv', 'sun direct', 'airtel dth',
      'videocon d2h'],
  },

  //  Shopping 
  {
    category: 'Shopping', subcategory: 'Online Shopping',
    keywords: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'snapdeal',
      'shopclues', 'tata cliq', 'reliance digital online', 'croma online'],
  },
  {
    category: 'Shopping', subcategory: 'Clothes',
    keywords: ['shirt', 'pant', 'trousers', 'jeans', 'dress', 'kurta', 'saree', 'clothing',
      'garments', 'fashion', 'zara', 'h&m', 'uniqlo', 'fabindia', 'westside'],
  },
  {
    category: 'Shopping', subcategory: 'Shoes',
    keywords: ['shoes', 'sandals', 'chappal', 'footwear', 'sneakers', 'boots', 'heels',
      'bata', 'red tape', 'liberty', 'metro shoes', 'woodland', 'puma', 'nike', 'adidas'],
  },

  //  Health & Medical 
  {
    category: 'Health & Medical', subcategory: 'Medicines',
    keywords: ['medicine', 'medicines', 'pharmacy', 'chemist', 'medical store', 'tablet',
      'capsule', 'syrup', '1mg', 'pharmeasy', 'netmeds', 'apollo pharmacy', 'medplus'],
  },
  {
    category: 'Health & Medical', subcategory: 'Doctor Visit',
    keywords: ['doctor', 'consultation', 'physician', 'specialist', 'opd', 'clinic visit',
      'practo', 'doctor fee', 'general physician'],
  },
  {
    category: 'Health & Medical', subcategory: 'Hospital Bill',
    keywords: ['hospital', 'hospital bill', 'nursing home', 'admission', 'surgery'],
  },
  {
    category: 'Health & Medical', subcategory: 'Lab Tests',
    keywords: ['blood test', 'lab test', 'pathology', 'lal path', 'thyrocare', 'dr lal',
      'srl', 'test report', 'urine test', 'x-ray', 'mri', 'ct scan', 'sonography'],
  },

  //  Subscriptions 
  {
    category: 'Subscriptions', subcategory: 'Streaming Services',
    keywords: ['netflix', 'amazon prime', 'hotstar', 'disney', 'zee5', 'sony liv',
      'alt balaji', 'voot', 'jiocinema', 'apple tv'],
  },
  {
    category: 'Subscriptions', subcategory: 'Music Subscription',
    keywords: ['spotify', 'apple music', 'youtube music', 'gaana', 'wynk', 'jiosaavn'],
  },
  {
    category: 'Subscriptions', subcategory: 'Software Tools',
    keywords: ['notion', 'figma', 'canva', 'adobe', 'microsoft 365', 'office 365', 'slack',
      'zoom', 'dropbox', 'grammarly', 'chatgpt plus', 'openai'],
  },

  //  Entertainment 
  {
    category: 'Entertainment', subcategory: 'Movie Ticket',
    keywords: ['movie', 'cinema', 'pvr', 'inox', 'cinepolis', 'book my show', 'bookmyshow',
      'film ticket', 'multiplex'],
  },
  {
    category: 'Entertainment', subcategory: 'Games',
    keywords: ['game', 'video game', 'gaming', 'steam', 'playstation', 'xbox', 'pubg',
      'bgmi', 'free fire', 'cod', 'in-app purchase', 'uc', 'game purchase'],
  },

  //  Education 
  {
    category: 'Education', subcategory: 'Online Courses',
    keywords: ['udemy', 'coursera', 'skillshare', 'linkedin learning', 'pluralsight',
      'byju', 'unacademy', 'vedantu', 'meritnation', 'online course', 'edtech'],
  },
  {
    category: 'Education', subcategory: 'Books',
    keywords: ['book', 'textbook', 'novel', 'study material', 'stationery', 'pen', 'notebook',
      'amazon books', 'flipkart books', 'crossword', 'om books'],
  },

  //  Personal Care 
  {
    category: 'Personal Care', subcategory: 'Haircut & Salon',
    keywords: ['haircut', 'salon', 'barbershop', 'hair color', 'hair spa', 'beard trim',
      'loreal', 'lakme salon'],
  },
  {
    category: 'Personal Care', subcategory: 'Cosmetics & Skincare',
    keywords: ['cosmetics', 'skincare', 'makeup', 'lipstick', 'foundation', 'moisturizer',
      'sunscreen', 'face wash', 'loreal', 'maybelline', 'lakme', 'nykaa', 'myglamm'],
  },

  //  Fitness 
  {
    category: 'Fitness & Sports', subcategory: 'Gym Membership',
    keywords: ['gym', 'fitness center', 'cult fit', 'gold gym', 'talwalkars', 'fitness membership',
      'gym fee', 'gym subscription'],
  },
  {
    category: 'Fitness & Sports', subcategory: 'Supplements',
    keywords: ['protein', 'whey', 'creatine', 'bcaa', 'supplement', 'protein powder',
      'pre workout', 'musclepharm', 'optimum nutrition', 'myprotein'],
  },

  //  Loan / Debt 
  {
    category: 'Loan / Debt Payments', subcategory: 'EMI Payment',
    keywords: ['emi', 'equated monthly', 'installment', 'loan payment', 'loan emi',
      'home loan emi', 'personal loan emi'],
  },
  {
    category: 'Loan / Debt Payments', subcategory: 'Credit Card Bill',
    keywords: ['credit card bill', 'cc bill', 'credit card payment', 'hdfc credit card',
      'icici credit card', 'sbi credit card', 'axis credit card'],
  },

  //  Business 
  {
    category: 'Business Expenses', subcategory: 'Cloud Hosting',
    keywords: ['aws', 'azure', 'gcp', 'google cloud', 'digital ocean', 'vultr', 'linode',
      'vercel', 'netlify', 'heroku', 'server', 'vps', 'hosting'],
  },
  {
    category: 'Business Expenses', subcategory: 'Domain & SSL',
    keywords: ['domain', 'domain name', 'ssl certificate', 'godaddy', 'namecheap', 'bigrock'],
  },
];

// 
// Synonyms for token expansion
// 

const SYNONYM_MAP: Record<string, string[]> = {
  'petrol': ['fuel', 'gas', 'filling'],
  'fuel': ['petrol', 'diesel', 'cng'],
  'food': ['meal', 'eating', 'dining'],
  'medicine': ['tablet', 'drug', 'pharmacy', 'chemist'],
  'mobile': ['phone', 'cell', 'smartphone'],
  'electric': ['electricity', 'power', 'current'],
  'car': ['vehicle', 'automobile', 'auto'],
  'bike': ['motorcycle', 'scooter', 'two-wheeler'],
  'clothes': ['clothing', 'garment', 'apparel', 'dress'],
  'repair': ['fix', 'maintenance', 'service'],
  'bill': ['payment', 'charge', 'fee'],
};

// 
// Utility functions
// 

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

function expandWithSynonyms(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);
  tokens.forEach((token) => {
    const synonyms = SYNONYM_MAP[token];
    if (synonyms) synonyms.forEach((s) => expanded.add(s));
  });
  return Array.from(expanded);
}

/**
 * Levenshtein distance between two strings (max ~12 chars for performance)
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > 16 || b.length > 16) return Math.abs(a.length - b.length) + 4;

  const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) =>
    Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
    }
  }
  return matrix[b.length][a.length];
}

function isFuzzyMatch(input: string, keyword: string, threshold = 2): boolean {
  const normalInput = normalizeText(input);
  const normalKeyword = normalizeText(keyword);
  if (normalInput === normalKeyword) return true;
  if (normalInput.includes(normalKeyword) || normalKeyword.includes(normalInput)) return true;
  if (normalInput.length < 4 || normalKeyword.length < 4) return false;
  return levenshtein(normalInput, normalKeyword) <= threshold;
}

// 
// Learning system
// 

export function loadLearnedMappings(): LearnedMapping[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LEARNED_MAPPINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearnedMapping[];
    return Array.isArray(parsed) ? parsed.filter((m) => m?.text && m?.category) : [];
  } catch {
    return [];
  }
}

function saveLearnedMappings(mappings: LearnedMapping[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LEARNED_MAPPINGS_KEY, JSON.stringify(mappings));
}

/**
 * Record a user correction. This is the POST /learn equivalent.
 */
export function learnCategorization(text: string, category: string, subcategory: string): void {
  const normalizedText = normalizeText(text.trim());
  if (!normalizedText || !category) return;

  const current = loadLearnedMappings();
  const existingIdx = current.findIndex((m) => normalizeText(m.text) === normalizedText);

  const entry: LearnedMapping = {
    text: text.trim(),
    category,
    subcategory,
    learnedAt: existingIdx >= 0 ? current[existingIdx].learnedAt : new Date().toISOString(),
    usageCount: existingIdx >= 0 ? current[existingIdx].usageCount + 1 : 1,
  };

  if (existingIdx >= 0) {
    current.splice(existingIdx, 1, entry);
  } else {
    current.unshift(entry);
  }

  // Cap at 500 entries
  saveLearnedMappings(current.slice(0, 500));
}

// 
// Core categorization engine
// 

/**
 * Main categorization function - POST /categorize equivalent.
 * Multi-layer: learned  exact keyword  token  fuzzy  fallback
 */
export function categorizeText(text: string): CategorizationResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { category: 'Miscellaneous', subcategory: 'Other', confidence: 0, matchedBy: 'fallback' };
  }

  const normalized = normalizeText(trimmed);
  const tokens = tokenize(trimmed);
  const expandedTokens = expandWithSynonyms(tokens);

  //  Layer 1: Learned mappings 
  const learnedMappings = loadLearnedMappings();
  const learnedMatch = learnedMappings.find((m) => normalizeText(m.text) === normalized);
  if (learnedMatch) {
    return {
      category: learnedMatch.category,
      subcategory: learnedMatch.subcategory,
      confidence: 0.98,
      matchedBy: 'learned',
    };
  }

  // Also check fuzzy match against learned mappings
  const fuzzyLearned = learnedMappings.find((m) => isFuzzyMatch(normalized, normalizeText(m.text), 1));
  if (fuzzyLearned) {
    return {
      category: fuzzyLearned.category,
      subcategory: fuzzyLearned.subcategory,
      confidence: 0.90,
      matchedBy: 'learned',
    };
  }

  //  Layer 2: Exact keyword matching 
  let bestScore = 0;
  let bestMatch: KeywordEntry | null = null;

  for (const entry of KEYWORD_DB) {
    for (const keyword of entry.keywords) {
      const normalKeyword = normalizeText(keyword);
      const weight = entry.weight ?? 1;

      // Exact full match
      if (normalized === normalKeyword) {
        const score = 300 * weight;
        if (score > bestScore) { bestScore = score; bestMatch = entry; }
        break;
      }
      // Contains the full keyword phrase
      if (normalized.includes(normalKeyword)) {
        const score = (200 + normalKeyword.length * 2) * weight;
        if (score > bestScore) { bestScore = score; bestMatch = entry; }
      }
      // Keyword contains the input
      if (normalKeyword.includes(normalized) && normalized.length > 3) {
        const score = (150 + normalized.length) * weight;
        if (score > bestScore) { bestScore = score; bestMatch = entry; }
      }
    }
  }

  if (bestScore >= 150 && bestMatch) {
    const confidence = Math.min(bestScore / 350, 0.97);
    return {
      category: bestMatch.category,
      subcategory: bestMatch.subcategory,
      confidence,
      matchedBy: 'exact',
    };
  }

  //  Layer 3: Token-based NLP matching 
  bestScore = 0;
  bestMatch = null;

  for (const entry of KEYWORD_DB) {
    for (const keyword of entry.keywords) {
      const keywordTokens = tokenize(keyword);
      const weight = entry.weight ?? 1;

      // Count how many keyword tokens appear in expanded input tokens
      const matchCount = keywordTokens.filter((kt) =>
        expandedTokens.some((et) => et === kt || et.startsWith(kt) || kt.startsWith(et)),
      ).length;

      if (matchCount > 0) {
        const matchRatio = matchCount / keywordTokens.length;
        const score = matchRatio * 130 * weight * (matchCount > 1 ? 1.3 : 1);
        if (score > bestScore) { bestScore = score; bestMatch = entry; }
      }
    }
  }

  if (bestScore >= 60 && bestMatch) {
    const confidence = Math.min(bestScore / 180, 0.82);
    return {
      category: bestMatch.category,
      subcategory: bestMatch.subcategory,
      confidence,
      matchedBy: 'token',
    };
  }

  //  Layer 4: Fuzzy (Levenshtein) matching 
  bestScore = 0;
  bestMatch = null;

  for (const entry of KEYWORD_DB) {
    for (const keyword of entry.keywords) {
      const normalKeyword = normalizeText(keyword);
      const keywordTokens = normalKeyword.split(' ');
      const weight = entry.weight ?? 1;

      // Match individual tokens via Levenshtein
      for (const token of tokens) {
        for (const kToken of keywordTokens) {
          if (token.length < 4 || kToken.length < 4) continue;
          const dist = levenshtein(token, kToken);
          if (dist <= 2) {
            const score = (100 - dist * 25) * weight;
            if (score > bestScore) { bestScore = score; bestMatch = entry; }
          }
        }
      }
    }
  }

  if (bestScore >= 50 && bestMatch) {
    const confidence = Math.min(bestScore / 130, 0.65);
    return {
      category: bestMatch.category,
      subcategory: bestMatch.subcategory,
      confidence,
      matchedBy: 'fuzzy',
    };
  }

  //  Fallback 
  return {
    category: 'Miscellaneous',
    subcategory: 'Other',
    confidence: 0.1,
    matchedBy: 'fallback',
  };
}

/**
 * Hook-friendly debounced categorizer.
 * Returns the categorization result as a promise (use with useCallback + debounce).
 */
export async function categorizeTextAsync(text: string): Promise<CategorizationResult> {
  // Simulate async for future API integration
  return new Promise((resolve) => {
    setTimeout(() => resolve(categorizeText(text)), 0);
  });
}

/**
 * Format confidence as human-readable label.
 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.95) return 'Very High';
  if (confidence >= 0.80) return 'High';
  if (confidence >= 0.65) return 'Medium';
  if (confidence >= 0.45) return 'Low';
  return 'Very Low';
}

