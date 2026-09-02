/**
 * Voice Financial Intelligence Service
 * Primary: Calls the backend NLP endpoint (Whisper + Qwen) for high-accuracy parsing
 * Fallback: Local regex-based intent parser that works 100% offline in the browser
 */

import { backendService } from '@/lib/backend-api';
// Wire-contract base types are shared with the backend; the client widens them
// with local-only action types and entities. Backend responses stay assignable.
import type { VoiceActionType, VoiceActionEntities, VoiceFinancialAction } from '@kanaku/shared';

export interface FinancialActionEntities extends VoiceActionEntities {
  members?: string[];
  answer?: string;
  queryResult?: any;
  quantity?: number;
  assetType?: string;
  recurrence?: 'monthly' | 'yearly' | 'weekly' | 'daily' | 'one-time';
  billUrl?: string;
}

/** Backend action types plus client-only intents from the local parser. */
export type ClientVoiceActionType =
  | VoiceActionType
  | 'group_expense'
  | 'query'
  | 'bill_scan'
  | 'subscription';

export type FinancialAction = VoiceFinancialAction<ClientVoiceActionType, FinancialActionEntities>;

export interface VoiceProcessResponse {
  success: boolean;
  transcript: string;
  language?: string;
  sttProvider?: 'gemini' | 'whisper';
  /** engine that parsed: gemini/groq/openrouter (backend AI), regex (backend fallback), local (on-device) */
  parser?: 'gemini' | 'groq' | 'openrouter' | 'regex' | 'local';
  actions: FinancialAction[];
  totalActions: number;
  requiresReview: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL INTENT PARSER — Works 100% offline, no backend required
// ─────────────────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES: Record<string, string> = {
  // Food
  food: 'Food', eat: 'Food', eating: 'Food', lunch: 'Food', dinner: 'Food',
  breakfast: 'Food', snack: 'Food', coffee: 'Food', chai: 'Food', tea: 'Food',
  restaurant: 'Food', swiggy: 'Food', zomato: 'Food', blinkit: 'Food',
  instamart: 'Food', zepto: 'Food', hotel: 'Food', dhaba: 'Food',
  // Groceries
  grocery: 'Groceries', groceries: 'Groceries', vegetables: 'Groceries',
  sabzi: 'Groceries', kirana: 'Groceries', milk: 'Groceries', doodh: 'Groceries',
  // Transport
  uber: 'Transport', ola: 'Transport', taxi: 'Transport', auto: 'Transport',
  petrol: 'Transport', diesel: 'Transport', fuel: 'Transport', metro: 'Transport',
  bus: 'Transport', train: 'Transport', rapido: 'Transport', rickshaw: 'Transport',
  // Housing
  rent: 'Housing', maintenance: 'Housing', society: 'Housing', flat: 'Housing',
  room: 'Housing', accommodation: 'Housing', hostel: 'Housing', pg: 'Housing',
  apartment: 'Housing', house: 'Housing', lodge: 'Housing', dormitory: 'Housing',
  // Utilities
  electricity: 'Utilities', wifi: 'Utilities', internet: 'Utilities',
  mobile: 'Utilities', phone: 'Utilities', recharge: 'Utilities', water: 'Utilities',
  gas: 'Utilities', lpg: 'Utilities', broadband: 'Utilities',
  // Health
  medicine: 'Health', doctor: 'Health', hospital: 'Health', gym: 'Health',
  pharmacy: 'Health', medical: 'Health', chemist: 'Health', clinic: 'Health',
  // Entertainment
  netflix: 'Entertainment', spotify: 'Entertainment', amazon: 'Entertainment',
  hotstar: 'Entertainment', prime: 'Entertainment', movie: 'Entertainment',
  youtube: 'Entertainment', jio: 'Entertainment', cinema: 'Entertainment',
  // Shopping
  shopping: 'Shopping', clothes: 'Shopping', shirt: 'Shopping', dress: 'Shopping',
  flipkart: 'Shopping', myntra: 'Shopping', meesho: 'Shopping',
  // Education
  school: 'Education', college: 'Education', course: 'Education', book: 'Education',
  fees: 'Education', tuition: 'Education', coaching: 'Education',
  // Income
  salary: 'Salary', freelance: 'Freelance', bonus: 'Bonus', stipend: 'Salary',
  dividend: 'Investment', interest: 'Finance',
};

function extractAmount(text: string): number | undefined {
  // Match patterns: "500", "₹500", "Rs 500", "500 rupees", "5k", "1.5 lakh", "2 hazaar"
  const patterns = [
    /₹\s*([\d,]+(?:\.\d+)?)/i,
    /rs\.?\s*([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:rupees?|rs|inr)/i,
    /([\d.]+)\s*(?:k|thousand|hazaar|hazar)/i,
    /([\d.]+)\s*(?:lakh|lac|lacs)/i,
    /([\d.]+)\s*(?:cr|crore)/i,
    /\b([\d,]+(?:\.\d+)?)\b/,
  ];

  // Handle written Hindi numbers
  const hindiMap: Record<string, number> = {
    'ek sau': 100, 'do sau': 200, 'teen sau': 300, 'char sau': 400, 'paanch sau': 500,
    'ek hazaar': 1000, 'do hazaar': 2000, 'paanch hazaar': 5000, 'das hazaar': 10000,
    'ek lakh': 100000, 'do lakh': 200000, 'paanch lakh': 500000,
  };
  const lowerText = text.toLowerCase();
  for (const [word, val] of Object.entries(hindiMap)) {
    if (lowerText.includes(word)) return val;
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let val = parseFloat(match[1].replace(/,/g, ''));
      // Use k(?!\w) so the bare "k" shorthand (e.g. "5k", "10 K") matches but
      // the 'k' inside compound words like "lakh" / "lakh" does NOT — without the
      // lookahead "1 lakh" incorrectly multiplied by ×1000 then ×100000 = 10^8.
      if (/k(?!\w)|thousand|hazaar|hazar/i.test(match[0])) val *= 1000;
      if (/lakh|lac/i.test(match[0])) val *= 100000;
      if (/cr|crore/i.test(match[0])) val *= 10000000;
      return val;
    }
  }
  return undefined;
}

// Common nouns that should NEVER be treated as person names
const COMMON_NOUNS = new Set([
  'me','my','someone','him','her','them','the','a','an','i',
  'yesterday','today','tomorrow','now','cash','card','upi','bank',
  'room','rooms','food','lunch','dinner','breakfast','coffee','tea','hotel',
  'rent','flat','house','hostel','pg','accommodation','apartment','lodge',
  'uber','ola','taxi','auto','bus','train','metro','petrol','fuel',
  'medicine','doctor','hospital','gym','pharmacy','clinic',
  'netflix','spotify','amazon','movie','cinema','shopping','clothes',
  'school','college','course','book','fees','tuition','coaching',
  'salary','freelance','bonus','stipend','invoice','client',
  'grocery','groceries','vegetables','milk','sabzi','kirana',
  'electricity','wifi','internet','mobile','phone','recharge','water','gas',
  'investment','mutual','fund','sip','stock','gold','crypto','bitcoin',
  'lent','borrowed','paid','spent','received','invested','saved','transferred',
  'general','miscellaneous','expense','income','transfer','goal','savings',
]);

// Connectives that must never ride along inside a captured person name
// ("lent 50,000 to Arun for marriage" must yield "Arun", not "Arun for").
const NAME_STOP_WORDS = new Set(['for', 'to', 'on', 'in', 'at', 'from', 'and', 'because', 'so', 'the', 'a', 'an']);

const cleanPersonName = (raw: string): string | undefined => {
  const tokens = raw.trim().replace(/[.,!?]+$/g, '').split(/\s+/);
  while (tokens.length > 0 && NAME_STOP_WORDS.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  const name = tokens.join(' ');
  if (!name || COMMON_NOUNS.has(name.toLowerCase())) return undefined;
  return name.charAt(0).toUpperCase() + name.slice(1);
};

function extractPerson(text: string): string | undefined {
  const amountText = String.raw`(?:₹\s*)?(?:rs\.?\s*)?[\d,]+(?:\.\d+)?\s*(?:rupees?|rs|inr|k|thousand|hazaar|hazar|lakh|lac|lacs|cr|crore)?`;

  // Only extract person for loan/transfer-related sentences
  // English: "to Rahul", "from Rahul" — but NOT for expense sentences like "paid for room"
  const loanPattern = /\b(?:gave to|lent to|give to|borrowed from|repaid to|returned to|transferred to|sent to)\s+([A-Za-z]+(?:\s[A-Za-z]+)?)/i;
  const loanMatch = text.match(loanPattern);
  if (loanMatch) {
    const name = cleanPersonName(loanMatch[1]);
    if (name) return name;
  }

  const amountBetweenPattern = new RegExp(
    String.raw`\b(?:lent|lend|gave|give|sent|send|transferred|transfer|repaid|returned|paid back)\b\s+${amountText}\s+(?:to|for)\s+([A-Za-z]+(?:\s[A-Za-z]+)?)`,
    'i',
  );
  const amountBetweenMatch = text.match(amountBetweenPattern);
  if (amountBetweenMatch) {
    const name = cleanPersonName(amountBetweenMatch[1]);
    if (name) return name;
  }

  const borrowAmountPattern = new RegExp(
    String.raw`\b(?:borrowed|borrow|took)\b\s+${amountText}\s+(?:from)\s+([A-Za-z]+(?:\s[A-Za-z]+)?)`,
    'i',
  );
  const borrowAmountMatch = text.match(borrowAmountPattern);
  if (borrowAmountMatch) {
    const name = cleanPersonName(borrowAmountMatch[1]);
    if (name) return name;
  }

  // Hinglish: "Rahul ko", "Rahul se"
  const hingMatch = text.match(/\b([A-Za-z]{3,})\s+(?:ko|se|ne)\b/i);
  if (hingMatch) {
    const name = hingMatch[1].trim();
    if (!COMMON_NOUNS.has(name.toLowerCase())) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  return undefined;
}

function extractCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, category] of Object.entries(EXPENSE_CATEGORIES)) {
    if (lower.includes(keyword)) return category;
  }
  return 'Miscellaneous';
}

function extractDescription(text: string): string {
  // 1. Try to extract the subject after "for", "on", "at" — gives cleanest label
  //    e.g. "I paid 2000 for a room" → "Room"
  //    e.g. "spent 500 on coffee" → "Coffee"
  const forMatch = text.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,30})(?:\s+(?:at|in|on|from|by|with)|[,.]|$)/i)
    || text.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,25})/i);
  if (forMatch) {
    const subject = forMatch[1].trim()
      .replace(/\b(?:yesterday|today|tomorrow|now|cash|card|upi|bank|gpay|paytm)\b/gi, '')
      .trim();
    if (subject.length > 1) {
      return subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
    }
  }

  const onMatch = text.match(/\bon\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,25})/i);
  if (onMatch) {
    const subject = onMatch[1].trim()
      .replace(/\b(?:yesterday|today|tomorrow|now|cash|card|upi|bank|gpay|paytm)\b/gi, '')
      .trim();
    if (subject.length > 1) {
      return subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
    }
  }

  // 2. Fallback: strip amounts, verbs, filler — then capitalise what remains
  return text
    .replace(/₹\s*[\d,]+(?:\.\d+)?/g, '')
    .replace(/\b[\d,]+(?:\.\d+)?\s*(?:rupees?|rs|inr|k|lakh|lac)?\b/gi, '')
    .replace(/\b(?:i|me|my|a|an|the|and|for|on|at|to|from|with|in|of)\b/gi, '')
    .replace(/\b(?:paid|spent|bought|purchased|got|received|borrowed|lent|invested|saved|transferred|sent)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split multi-intent sentences like "paid 200 for coffee and bought 500 medicine"
function splitSentences(text: string): string[] {
  // This regex matches any combination of spaces, commas, "and", "then", "also", "so", "I", "we"
  // that appear immediately before a financial action verb.
  // By splitting here, we consume and discard the filler text, leaving clean action chunks.
  const verbBoundaryPattern = /\s*(?:(?:,|\b)and\s+)?(?:I\s+|we\s+|then\s+|also\s+|so\s+)*(?=(?:paid|pay|spent|spend|bought|buy|lent|lend|gave|give|borrowed|borrow|saved|save|invested|invest|transferred|transfer|sent|send|received|receive|got|get|split)\b)/gi;
  
  return text.split(verbBoundaryPattern)
    .map(s => s.trim())
    .filter(s => s.length > 2); // Ignore empty or single-character chunks
}

// Extract a date from natural language
function extractDate(text: string): string | undefined {
  const q = text.toLowerCase();
  const now = new Date();

  if (q.includes('today')) return now.toISOString().split('T')[0];

  if (q.includes('yesterday')) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return y.toISOString().split('T')[0];
  }

  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (const [i, day] of dayNames.entries()) {
    if (q.includes(`last ${day}`) || (q.includes(day) && !q.includes('last'))) {
      const diff = (now.getDay() - i + 7) % 7 || 7;
      const d = new Date(now);
      d.setDate(d.getDate() - diff);
      return d.toISOString().split('T')[0];
    }
  }

  // Match "5th March", "March 5", "5/3"
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  for (const [i, month] of monthNames.entries()) {
    const match = q.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*${month}|${month}\\w*\\s*(\\d{1,2})`));
    if (match) {
      const day = parseInt(match[1] || match[2]);
      const d = new Date(now.getFullYear(), i, day);
      return d.toISOString().split('T')[0];
    }
  }

  return undefined;
}

// Detect if a segment is clearly an expense action (paid/spent/bought for something)
function isExplicitExpense(q: string): boolean {
  return /\b(?:paid|pay|spent|spend|bought|buy|purchased|purchase|got|ordered)\b/.test(q)
    && /\b(?:for|on|at|from)\b/.test(q);
}

function extractMembers(text: string): string[] {
  const match = text.match(/\b(?:with|between|among|split with|shared with|me and|we and)\s+([A-Za-z\s,and&.'"-]+)/i);
  if (!match) return [];

  const rawPhrase = match[1].trim();
  const tokens = rawPhrase.split(/,|\band\b|&/i);

  const members: string[] = [];
  for (const rawToken of tokens) {
    const token = rawToken
      .trim()
      .replace(/^[^\w]+|[^\w]+$/g, '')
      .replace(/\b(?:mr\.?|mrs\.?|ms\.?|dr\.?)\s+/gi, '')
      .replace(/'s\s+(?:share|part|half)?$/i, '')
      .trim();

    if (!token) continue;

    const lower = token.toLowerCase();
    if (
      COMMON_NOUNS.has(lower) ||
      /^(me|i|we|us|them|everyone|all|together|each|someone|people|guys|friends|boys|girls|others|food|dinner|lunch|bill|total|room|hotel)$/i.test(lower) ||
      /\d/.test(token) ||
      token.length < 2
    ) {
      continue;
    }

    const capitalized = token
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    if (!members.includes(capitalized)) {
      members.push(capitalized);
    }
  }

  return members;
}

function parseSegment(segment: string): FinancialAction {
  const q = segment.toLowerCase();
  const amount = extractAmount(segment);
  const category = extractCategory(segment);
  const description = extractDescription(segment);
  const date = extractDate(segment);
  const members = extractMembers(segment);
  const person = extractPerson(segment);

  // QUERY — must check before anything else
  if (/\b(?:how much|what is|tell me|show me|what'?s|total|balance|how many|list|summary)\b/.test(q)) {
    return {
      type: 'query', rawSegment: segment,
      entities: { description: segment },
      confidence: 0.9, requiresReview: false,
    };
  }

  // GROUP EXPENSE — Check early when multiple members or explicit group keywords are present
  if ((members.length > 0 && (/\b(?:split|group|shared|with|among|between)\b/i.test(q) || members.length >= 2)) ||
      /\b(?:split|group expense|shared with|divide|among|between)\b/.test(q)) {
    return {
      type: 'group_expense',
      rawSegment: segment,
      entities: {
        amount,
        category: category !== 'Miscellaneous' ? category : 'Food',
        description: description || (members.length > 0 ? `Group expense with ${members.slice(0, 3).join(', ')}` : 'Group Expense'),
        members,
        date,
      },
      confidence: 0.92,
      requiresReview: false,
    };
  }

  // SUBSCRIPTION
  if (/\b(?:subscription|subscribe|monthly plan|yearly plan|recurring|netflix|spotify|hotstar|prime|youtube premium)\b/.test(q)) {
    const rec: FinancialActionEntities['recurrence'] = /yearly|annual/i.test(q) ? 'yearly' : 'monthly';
    return {
      type: 'subscription', rawSegment: segment,
      entities: { amount, category: 'Entertainment', description: description || 'Subscription', recurrence: rec, date },
      confidence: 0.9, requiresReview: false,
    };
  }

  // INVESTMENT
  if (/\b(?:invest|bought shares?|gold|crypto|bitcoin|ethereum|mutual fund|sip|stock|nifty|sensex)\b/.test(q)) {
    const qtyMatch = segment.match(/(\d+)\s*(?:units?|shares?)/i);
    return {
      type: 'investment', rawSegment: segment,
      entities: { amount, category: 'Investment', description: description || 'Voice Investment',
        quantity: qtyMatch ? parseInt(qtyMatch[1]) : undefined,
        assetType: /gold/i.test(q) ? 'gold' : /crypto|bitcoin|ethereum/i.test(q) ? 'crypto' : /sip|mutual/i.test(q) ? 'mutual_fund' : 'stock',
        date,
      },
      confidence: 0.88, requiresReview: false,
    };
  }

  // DEBT SETTLEMENT / REPAYMENT
  if (/\b(?:settled|settle|paid back|returned|repaid|cleared|clear loan|returned money|returned balance)\b/.test(q) && (person || amount)) {
    const lowerSegment = segment.toLowerCase();
    const nameIndex = person ? lowerSegment.indexOf(person.toLowerCase()) : -1;
    const keywordIndex = lowerSegment.search(/\b(?:paid back|returned|repaid|returned money|returned balance)\b/);
    const isReceivedBack = (nameIndex !== -1 && keywordIndex !== -1 && nameIndex < keywordIndex) || /\b(?:by|from)\s+[A-Za-z]/i.test(segment);
    return {
      type: isReceivedBack ? 'loan_lend' : 'loan_borrow',
      rawSegment: segment,
      entities: { amount, person, description: description || (isReceivedBack ? `Loan repayment from ${person || 'someone'}` : `Repaid loan to ${person || 'someone'}`), date },
      confidence: 0.9,
      requiresReview: !person,
    };
  }

  // LOAN — LEND
  if (/\b(?:lent|lend|given to|gave to)\b/.test(q) && (person || amount)) {
    return {
      type: 'loan_lend', rawSegment: segment,
      entities: { amount, person, description: description || `Lent to ${person || 'someone'}`, date },
      confidence: 0.88, requiresReview: !person,
    };
  }

  // LOAN — BORROW
  if (/\b(?:borrowed|borrow|took from|took loan|owe to)\b/.test(q) && (person || amount)) {
    return {
      type: 'loan_borrow', rawSegment: segment,
      entities: { amount, person, description: description || `Borrowed from ${person || 'someone'}`, date },
      confidence: 0.88, requiresReview: !person,
    };
  }

  // GOAL / SAVINGS — only when explicit saving keywords with NO expense-action verbs
  if (/\b(?:saved|saving|goal|target|put aside|emergency fund|vacation fund|house fund)\b/.test(q)
      && !/\b(?:paid|spent|bought|purchased|pay|spend)\b/.test(q)) {
    return {
      type: 'goal', rawSegment: segment,
      entities: { amount, category: 'Savings', description: description || 'Goal Contribution', date },
      confidence: 0.85, requiresReview: false,
    };
  }

  // EXPLICIT EXPENSE (paid/spent/bought for X)
  if (isExplicitExpense(q) && amount) {
    return {
      type: 'expense', rawSegment: segment,
      entities: { amount, category, description: description || 'Expense', date },
      confidence: 0.92, requiresReview: false,
    };
  }

  // TRANSFER
  if (/\b(?:transfer|transferred|sent|send money|upi|gpay|paytm|phonepe)\b/.test(q)) {
    return {
      type: 'transfer', rawSegment: segment,
      entities: { amount, person, description: description || 'Voice Transfer', date },
      confidence: 0.87, requiresReview: false,
    };
  }

  // INCOME  
  if (/\b(?:received|got paid|salary|income|earned|freelance|credited|bonus|commission|salary credited|mila|milega|stipend|client paid|payment received|invoice paid)\b/.test(q)) {
    return {
      type: 'income', rawSegment: segment,
      entities: { amount, category: extractCategory(segment), description: description || 'Income', date },
      confidence: 0.88, requiresReview: false,
    };
  }

  // DEFAULT → EXPENSE
  if (amount) {
    return {
      type: 'expense', rawSegment: segment,
      entities: { amount, category, description: description || segment, date },
      confidence: amount > 0 ? 0.78 : 0.5, requiresReview: false,
    };
  }

  return {
    type: 'unknown', rawSegment: segment,
    entities: { description: segment },
    confidence: 0.3, requiresReview: true,
  };
}

export function parseTranscriptLocally(transcript: string): VoiceProcessResponse {
  const segments = splitSentences(transcript);
  const allActions = segments.map(parseSegment);
  const actions = allActions.filter(a => a.type !== 'unknown');

  // If nothing parsed but we have segments, still return as unknown for review
  if (actions.length === 0 && segments.length > 0) {
    return {
      success: false,
      transcript,
      parser: 'local',
      actions: [],
      totalActions: 0,
      requiresReview: false,
    };
  }

  return {
    success: actions.length > 0,
    transcript,
    parser: 'local',
    actions,
    totalActions: actions.length,
    requiresReview: actions.some(a => a.requiresReview),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND CALLS (with automatic local fallback)
// ─────────────────────────────────────────────────────────────────────────────

export async function processVoiceTranscript(transcript: string): Promise<VoiceProcessResponse> {
  try {
    const response = await backendService.post<VoiceProcessResponse>(
      '/voice/process',
      { transcript }
    );
    return response;
  } catch (err) {
    // Backend unavailable — use local parser
    console.info('[VoiceAI] Backend unavailable, using local parser');
    return parseTranscriptLocally(transcript);
  }
}

export async function processVoiceAudio(audioBlob: Blob): Promise<VoiceProcessResponse> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice_input.webm');

  try {
    const response = await backendService.post<VoiceProcessResponse>(
      '/voice/process-audio',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response;
  } catch (err) {
    // Backend unavailable — cannot process raw audio locally; caller should retry with transcript
    console.info('[VoiceAI] Audio backend unavailable, will fall back to transcript');
    throw err; // Let VoiceInput.tsx handle fallback to transcript path
  }
}

export async function submitVoiceCorrection(correction: {
  originalSegment: string;
  correctedType?: string;
  correctedCategory?: string;
  correctedAmount?: number;
}): Promise<void> {
  try {
    await backendService.post('/voice/learn', correction);
  } catch {
    // Non-critical, silently ignore
  }
}

export function getActionTypeLabel(type: FinancialAction['type']): string {
  const labels: Record<string, string> = {
    expense: ' Expense',
    income: ' Income',
    transfer: ' Transfer',
    loan_borrow: ' Borrowed',
    loan_lend: ' Lent',
    goal: ' Goal',
    investment: ' Investment',
    group_expense: ' Group Split',
    query: ' Financial Query',
    bill_scan: ' Bill Scan',
    subscription: ' Subscription',
    unknown: ' Unknown',
  };
  return labels[type] ?? type;
}

export function getActionTypeColor(type: FinancialAction['type']): string {
  const colors: Record<string, string> = {
    expense: 'bg-rose-50 border-rose-200 text-rose-700',
    income: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    transfer: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    loan_borrow: 'bg-amber-50 border-amber-200 text-amber-700',
    loan_lend: 'bg-blue-50 border-blue-200 text-blue-700',
    goal: 'bg-purple-50 border-purple-200 text-purple-700',
    investment: 'bg-teal-50 border-teal-200 text-teal-700',
    group_expense: 'bg-orange-50 border-orange-200 text-orange-700',
    query: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    bill_scan: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    subscription: 'bg-pink-50 border-pink-200 text-pink-700',
    unknown: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  return colors[type] ?? colors.unknown;
}
