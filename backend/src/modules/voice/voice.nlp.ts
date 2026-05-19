/**
 * Voice Financial NLP Engine
 * Hybrid pipeline: fast rule-based classifier (90% of cases) with Gemini fallback for complex input.
 */

import { logger } from '../../config/logger';

export type FinancialActionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'loan_borrow'
  | 'loan_lend'
  | 'goal'
  | 'investment'
  | 'unknown';

export interface ExtractedEntity {
  amount?: number;
  currency?: string;
  category?: string;
  subcategory?: string;
  person?: string;
  merchant?: string;
  description?: string;
  date?: string;
  paymentMethod?: string;
  goalTarget?: number;
  goalDuration?: string;
  goalMonthly?: number;
}

export interface FinancialAction {
  type: FinancialActionType;
  rawSegment: string;
  entities: ExtractedEntity;
  confidence: number;
  requiresReview: boolean;
}

//  Keyword maps 

const EXPENSE_KEYWORDS = [
  'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'purchased', 'purchase',
  'dinner', 'lunch', 'breakfast', 'food', 'petrol', 'fuel', 'medicine', 'bill', 'fees',
  '', '', '',
];

const INCOME_KEYWORDS = [
  'received', 'receive', 'earned', 'earn', 'salary', 'income', 'payment received',
  'got', 'credited', '', '',
];

const TRANSFER_KEYWORDS = [
  'transferred', 'transfer', 'sent to', 'moved', 'shifted',
];

const LOAN_BORROW_KEYWORDS = [
  'borrowed', 'borrow', 'took loan', 'liya', ' ',
];

const LOAN_LEND_KEYWORDS = [
  'lent', 'gave', 'give', 'gave loan', 'diya', ' ',
];

const GOAL_KEYWORDS = [
  'save', 'saving', 'goal', 'target', 'want to save', 'plan to save', '',
];

const INVESTMENT_KEYWORDS = [
  'invest', 'invested', 'bought stocks', 'mutual fund', 'sip', 'fd', 'fixed deposit',
];

// Category keyword map
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Dining': ['food', 'dinner', 'lunch', 'breakfast', 'restaurant', 'cafe', 'coffee', 'eat', 'meal', 'pani puri', 'pizza', 'burger', 'swiggy', 'zomato', 'chai', 'tea', 'dhaba'],
  'Transport': ['petrol', 'fuel', 'uber', 'ola', 'cab', 'auto', 'bus', 'train', 'metro', 'travel', 'rapido', 'rickshaw', 'diesel', 'taxi'],
  'Housing': ['rent', 'room', 'accommodation', 'hostel', 'pg', 'flat', 'apartment', 'house', 'lodge', 'dormitory', 'maintenance', 'society'],
  'Shopping': ['shopping', 'clothes', 'shoes', 'amazon', 'flipkart', 'mall', 'shirt', 'dress', 'myntra', 'meesho'],
  'Health': ['medicine', 'doctor', 'hospital', 'pharmacy', 'medical', 'health', 'gym', 'chemist', 'clinic'],
  'Entertainment': ['movie', 'netflix', 'spotify', 'gaming', 'entertainment', 'subscription', 'hotstar', 'prime', 'cinema', 'youtube'],
  'Bills': ['electricity', 'water', 'gas', 'internet', 'mobile', 'recharge', 'bill', 'wifi', 'broadband', 'lpg'],
  'Groceries': ['grocery', 'groceries', 'vegetables', 'sabzi', 'kirana', 'milk', 'doodh'],
  'Education': ['school', 'college', 'fees', 'course', 'book', 'tuition', 'coaching'],
  'Salary': ['salary', 'stipend', 'wages', 'payroll'],
  'Business': ['business', 'client', 'project', 'invoice', 'freelance'],
};

// Indian name detection heuristic (capitalized word after give/gave/received/from/to)
const NAME_CONTEXT_PATTERN = /(?:to|from|gave|give|lent|with|borrowed from|lent to)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/g;

//  Segmentation 

const SEGMENT_SEPARATORS = /(?:,\s*(?:and\s+)?|;\s*|(?:\s+and\s+)(?=(?:spent|paid|bought|received|transferred|gave|saved|lent|borrowed)))/gi;

/**
 * Split a multi-action transcript into individual segments.
 */
export function segmentTranscript(transcript: string): string[] {
  const raw = transcript
    .replace(/\s+/g, ' ')
    .trim();

  const segments = raw
    .split(SEGMENT_SEPARATORS)
    .map(s => s.trim())
    .filter(s => s.length > 3);

  return segments.length > 0 ? segments : [raw];
}

//  Amount extraction 

const AMOUNT_PATTERNS = [
  /(?:|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/gi,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees?|rs\.?|)/gi,
  /\b([\d,]+(?:\.\d{1,2})?)\b/g,
];

function extractAmount(text: string): number | undefined {
  for (const pattern of AMOUNT_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) return val;
    }
    pattern.lastIndex = 0;
  }
  return undefined;
}

//  Category detection 

function detectCategory(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }
  return undefined;
}

//  Intent classification 

// Detect if segment is clearly an explicit expense (paid/spent/bought FOR something)
function isExplicitExpense(lower: string): boolean {
  return /\b(?:paid|pay|spent|spend|bought|buy|purchased|purchase|got|ordered)\b/.test(lower)
    && /\b(?:for|on|at|from)\b/.test(lower);
}

function classifyIntent(segment: string): { type: FinancialActionType; confidence: number } {
  const lower = segment.toLowerCase();

  // Check explicit expense FIRST — prevents "paid for room" being misclassified as goal
  if (isExplicitExpense(lower) && extractAmount(segment) !== undefined) {
    return { type: 'expense', confidence: 0.92 };
  }
  if (INVESTMENT_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: 'investment', confidence: 0.80 };
  }
  if (LOAN_BORROW_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: 'loan_borrow', confidence: 0.85 };
  }
  if (LOAN_LEND_KEYWORDS.some(kw => lower.includes(kw)) && /to\s+[A-Z]/.test(segment)) {
    return { type: 'loan_lend', confidence: 0.82 };
  }
  if (TRANSFER_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: 'transfer', confidence: 0.83 };
  }
  if (INCOME_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: 'income', confidence: 0.87 };
  }
  if (EXPENSE_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: 'expense', confidence: 0.88 };
  }
  // GOAL only when no expense-action verb is present
  if (GOAL_KEYWORDS.some(kw => lower.includes(kw))
      && !/\b(?:paid|spent|bought|purchased|pay|spend)\b/.test(lower)) {
    return { type: 'goal', confidence: 0.85 };
  }
  // If we detect an amount but no clear intent, assume expense
  if (extractAmount(segment) !== undefined) {
    return { type: 'expense', confidence: 0.55 };
  }
  return { type: 'unknown', confidence: 0.2 };
}

//  Entity extraction 

function extractCleanDescription(text: string): string {
  // Try to extract clean noun after "for a/an/the" → "Room"
  const forMatch = text.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,30})(?:\s+(?:at|in|on|from|by|with)|[,.]|$)/i)
    || text.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,25})/i);
  if (forMatch) {
    const s = forMatch[1].trim().replace(/\b(?:yesterday|today|now|cash|card|upi|bank)\b/gi, '').trim();
    if (s.length > 1) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  const onMatch = text.match(/\bon\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z][a-zA-Z\s]{1,25})/i);
  if (onMatch) {
    const s = onMatch[1].trim().replace(/\b(?:yesterday|today|now|cash|card|upi|bank)\b/gi, '').trim();
    if (s.length > 1) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  // Fallback: strip noise
  return text
    .replace(/₹\s*[\d,]+(?:\.\d+)?/g, '')
    .replace(/\b[\d,]+(?:\.\d+)?\s*(?:rupees?|rs\.?|inr)?\b/gi, '')
    .replace(/\b(?:i|me|my|a|an|the|and|for|on|at|to|from|with|in|of|paid|spent|bought|purchased|got|received|borrowed|lent|invested|saved)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEntities(segment: string, type: FinancialActionType): ExtractedEntity {
  const entities: ExtractedEntity = {};
  entities.amount = extractAmount(segment);
  entities.category = detectCategory(segment);
  entities.description = extractCleanDescription(segment);

  // Merchant extraction: look for "at/from/on [Merchant]" or "for [description]"
  const merchantMatch = segment.match(/(?:at|from|on)\s+([A-Za-z][A-Za-z\s]{2,20})(?:\s|,|$)/i);
  if (merchantMatch) {
    entities.merchant = merchantMatch[1].trim();
  }

  // Person extraction for loan/group actions
  if (type === 'loan_lend' || type === 'loan_borrow' || type === 'transfer') {
    NAME_CONTEXT_PATTERN.lastIndex = 0;
    const nameMatch = NAME_CONTEXT_PATTERN.exec(segment);
    if (nameMatch) {
      entities.person = nameMatch[1];
    } else {
      // Fallback: look for capitalized word after "gave/lent/from/to"
      const simpleMatch = segment.match(/(?:gave|lent|to|from|borrowed from)\s+([A-Z][a-z]+)/);
      if (simpleMatch) entities.person = simpleMatch[1];
    }
  }

  // Goal-specific: extract target amount and duration
  if (type === 'goal') {
    const goalAmountMatch = segment.match(/(?:save|target|goal)\s+(?:|rs\.?|inr\s*)?([\d,]+(?:\.\d{1,2})?)/i);
    if (goalAmountMatch) {
      entities.goalTarget = parseFloat(goalAmountMatch[1].replace(/,/g, ''));
    }
    const durationMatch = segment.match(/(?:in|over|within)\s+(\d+)\s+(month|year|week)s?/i);
    if (durationMatch) {
      entities.goalDuration = `${durationMatch[1]} ${durationMatch[2]}s`;
      if (entities.goalTarget && durationMatch[2].toLowerCase() === 'month') {
        entities.goalMonthly = Math.ceil(entities.goalTarget / parseInt(durationMatch[1]));
      }
    }
  }

  // Date extraction: "yesterday", "today", specific dates
  const today = new Date();
  if (/yesterday/i.test(segment)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    entities.date = d.toISOString().slice(0, 10);
  } else if (/today|now/i.test(segment)) {
    entities.date = today.toISOString().slice(0, 10);
  }

  // Payment method
  const pmMatch = segment.match(/(upi|cash|card|gpay|paytm|credit|debit|neft|imps|netbanking)/i);
  if (pmMatch) {
    entities.paymentMethod = pmMatch[1].toUpperCase();
  }

  return entities;
}

//  Clean filler words 

const FILLER_PATTERN = /\b(um+|uh+|err+|like|you know|actually|basically|so|well|i mean|i think|kind of|sort of)\b/gi;

function cleanTranscript(text: string): string {
  return text
    .replace(FILLER_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

//  Main pipeline 

export async function processVoiceTranscript(transcript: string): Promise<FinancialAction[]> {
  const cleaned = cleanTranscript(transcript);
  logger.debug('Voice NLP: cleaned transcript', { original: transcript.slice(0, 100), cleaned: cleaned.slice(0, 100) });

  const segments = segmentTranscript(cleaned);
  logger.info('Voice NLP: segmented', { count: segments.length });

  const actions: FinancialAction[] = segments.map(segment => {
    const { type, confidence } = classifyIntent(segment);
    const entities = extractEntities(segment, type);

    return {
      type,
      rawSegment: segment,
      entities,
      confidence,
      requiresReview: confidence < 0.7 || !entities.amount,
    };
  });

  // If Gemini is configured and any action has low confidence, use it for ambiguous ones
  if (process.env.GOOGLE_API_KEY) {
    const lowConfidenceActions = actions.filter(a => a.confidence < 0.7);
    if (lowConfidenceActions.length > 0) {
      try {
        await enhanceWithGemini(lowConfidenceActions, transcript);
      } catch (err: any) {
        logger.warn('Gemini voice enhancement failed, using rule-based results', { error: err.message });
      }
    }
  }

  return actions.filter(a => a.type !== 'unknown' || a.entities.amount !== undefined);
}

async function enhanceWithGemini(actions: FinancialAction[], originalTranscript: string): Promise<void> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const segments = actions.map(a => a.rawSegment).join('\n');
  const prompt = `You are a financial assistant. Analyze each sentence and extract financial actions.
For each sentence, return JSON with: type (expense/income/transfer/loan_borrow/loan_lend/goal/investment), amount (number), category (string), person (string|null), description (string), confidence (0-1).
Return a JSON array only, no explanation.

Sentences:
${segments}`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  const parsed = JSON.parse(text) as Array<{
    type?: FinancialActionType;
    amount?: number;
    category?: string;
    person?: string;
    description?: string;
    confidence?: number;
  }>;

  parsed.forEach((result, idx) => {
    if (idx < actions.length && result.type) {
      actions[idx].type = result.type;
      actions[idx].confidence = result.confidence ?? actions[idx].confidence;
      if (result.amount) actions[idx].entities.amount = result.amount;
      if (result.category) actions[idx].entities.category = result.category;
      if (result.person) actions[idx].entities.person = result.person;
      if (result.description) actions[idx].entities.description = result.description;
      actions[idx].requiresReview = (actions[idx].confidence ?? 0) < 0.7;
    }
  });
}

