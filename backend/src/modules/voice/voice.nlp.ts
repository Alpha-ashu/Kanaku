/**
 * Voice Financial NLP Engine — v2
 *
 * Architecture: LLM-first understanding, regex as offline fallback.
 *
 * Phase 1: English only.
 * Language detection + translation stubs are wired but inactive, so future
 * multilingual support (Hindi, Tamil, Telugu, etc.) can be enabled here
 * without touching the rest of the pipeline.
 *
 * Flow:
 *   transcript
 *   → cleanTranscript (filler removal)
 *   → detectLanguage (stub — always 'en' in Phase 1)
 *   → [translateToEnglish if lang ≠ 'en'] (stub — no-op in Phase 1)
 *   → extractWithLLM (Gemini — extracts ALL actions in one shot)
 *   → fallback: regexPipeline (if Gemini unavailable or returns nothing)
 *   → FinancialAction[]
 */

import { logger } from '../../config/logger';
import { getAIConfigurations } from '../../utils/aiConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Language Layer (Phase 1 stubs — English only) ───────────────────────────

/**
 * Supported language codes.
 * Add new codes here when enabling multilingual support.
 */
export type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'ml' | 'kn' | 'bn';

/**
 * Detect the language of a transcript.
 *
 * Phase 1: always returns 'en'.
 * Phase 2 (multilingual): integrate Google Translate langdetect or Gemini
 * language-identification before handing off to extractWithLLM.
 */
function detectLanguage(_transcript: string): SupportedLanguage {
  return 'en';
}

/**
 * Translate a non-English transcript to English.
 *
 * Phase 1: no-op (returns input unchanged).
 * Phase 2: call Google Translate API or use Gemini's translation capability.
 */
async function translateToEnglish(
  transcript: string,
  _fromLang: SupportedLanguage,
): Promise<string> {
  return transcript;
}

// ─── Filler-word cleaner ──────────────────────────────────────────────────────

const FILLER_PATTERN =
  /\b(um+|uh+|err+|like|you know|actually|basically|so|well|i mean|i think|kind of|sort of|maybe|you see)\b/gi;

function cleanTranscript(text: string): string {
  return text
    .replace(FILLER_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── LLM Extraction (primary path) ───────────────────────────────────────────

interface LLMRawAction {
  type?: string;
  amount?: number;
  category?: string;
  description?: string;
  person?: string | null;
  merchant?: string | null;
  date?: string | null;
  confidence?: number;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Build the extraction prompt for Gemini.
 * Keeping it in one place makes it easy to tune without touching logic.
 */
function buildExtractionPrompt(transcript: string): string {
  return `You are a financial assistant that extracts structured financial actions from natural human speech.

CRITICAL RULE: Extract EVERY financial action. Never drop an action because of sentence structure or missing verbs.

INPUT: "${transcript}"
TODAY: ${TODAY()}

OUTPUT: Return a JSON array only. No markdown, no explanation.

Each element must have:
{
  "type": "expense" | "income" | "transfer" | "loan_borrow" | "loan_lend" | "goal" | "investment",
  "amount": <positive number, required>,
  "category": <string — see list below>,
  "description": <short noun phrase, 1-5 words, e.g. "Petrol", "Dinner", "Netflix subscription">,
  "person": <name string if relevant, else null>,
  "merchant": <merchant/place name if mentioned, else null>,
  "date": <"YYYY-MM-DD" or null — use today's date if "today" is said, yesterday's date if "yesterday">,
  "confidence": <0.0 to 1.0>
}

CATEGORIES (use these exact strings):
  Expenses: "Food & Dining", "Transport", "Housing", "Shopping", "Health",
            "Entertainment", "Bills & Utilities", "Groceries", "Education", "Travel"
  Income:   "Salary", "Freelance", "Business", "Investment Returns", "Other Income"
  Special:  "Savings", "Investment", "Loans", "Transfer"

TYPE MAPPING:
  - "spent X on Y", "paid X for Y", "bought Y for X", "X for Y" → expense
  - "received X", "earned X", "got X salary" → income
  - "sent X to account", "transferred X to savings" → transfer
  - "borrowed X from [person]", "took X from [person]" → loan_borrow
  - "lent X to [person]", "gave X to [person]" → loan_lend
  - "invested X in Y", "bought stocks/SIP/FD" → investment
  - "saving X for Y", "want to save X" → goal

MULTI-ACTION EXAMPLES:
  "spent 500 on petrol and 3499 for dinner" → 2 expense actions (petrol + dinner)
  "paid 500 petrol 200 tea" → 2 expenses
  "spent 500 petrol, 200 tea, borrowed 5000 from Arun" → 3 actions
  "received salary and paid 2000 rent" → 1 income + 1 expense

SLANG & INFORMAL SPEECH:
  "put 500 for petrol" → expense ₹500 Petrol
  "petrol 500" → expense ₹500 Petrol (infer expense when context is clear)
  "today I think around 500 went for petrol" → expense ₹500 Petrol

PERSON NAMES: Extract the actual name, not title. "borrowed from Jijo" → person: "Jijo"

Return ONLY the JSON array. Example for "spent 500 on petrol and 3499 for dinner and borrowed 49876 from Jijo":
[
  {"type":"expense","amount":500,"category":"Transport","description":"Petrol","person":null,"merchant":null,"date":null,"confidence":0.97},
  {"type":"expense","amount":3499,"category":"Food & Dining","description":"Dinner","person":null,"merchant":null,"date":null,"confidence":0.96},
  {"type":"loan_borrow","amount":49876,"category":"Loans","description":"Borrowed from Jijo","person":"Jijo","merchant":null,"date":null,"confidence":0.95}
]`;
}

/**
 * Send the cleaned transcript to Gemini and return all extracted actions.
 * Uses JSON mode (responseMimeType) for reliable structured output.
 */
async function extractWithLLM(
  transcript: string,
  modelName: string,
  confidenceThreshold: number,
): Promise<FinancialAction[]> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,        // low temperature = consistent, predictable extraction
      maxOutputTokens: 2048,
    },
  });

  const prompt = buildExtractionPrompt(transcript);

  const result = await model.generateContent(prompt);
  const rawText = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  let parsed: LLMRawAction[];
  try {
    const maybeArray = JSON.parse(rawText);
    // Gemini sometimes wraps in {"actions": [...]}
    parsed = Array.isArray(maybeArray)
      ? maybeArray
      : (maybeArray.actions ?? maybeArray.results ?? []);
  } catch (e) {
    logger.warn('Voice LLM: JSON parse failed', { rawText: rawText.slice(0, 200) });
    return [];
  }

  const today = TODAY();

  return parsed
    .filter((a): a is LLMRawAction => typeof a === 'object' && a !== null && typeof a.amount === 'number' && a.amount > 0)
    .map((a) => {
      const type = normaliseType(a.type);
      const confidence = typeof a.confidence === 'number' ? Math.min(1, Math.max(0, a.confidence)) : 0.9;

      let date = a.date ?? undefined;
      if (date === 'today') date = today;
      if (date === 'yesterday') {
        const d = new Date(); d.setDate(d.getDate() - 1);
        date = d.toISOString().slice(0, 10);
      }

      return {
        type,
        rawSegment: transcript,
        entities: {
          amount: a.amount,
          category: a.category ?? undefined,
          description: a.description ?? undefined,
          person: a.person ?? undefined,
          merchant: a.merchant ?? undefined,
          date,
        },
        confidence,
        requiresReview: confidence < confidenceThreshold,
      } satisfies FinancialAction;
    });
}

function normaliseType(raw: string | undefined): FinancialActionType {
  const t = (raw ?? '').toLowerCase().replace(/-/g, '_');
  const valid: FinancialActionType[] = [
    'expense', 'income', 'transfer', 'loan_borrow', 'loan_lend', 'goal', 'investment',
  ];
  return (valid.includes(t as FinancialActionType) ? t : 'expense') as FinancialActionType;
}

// ─── Regex Fallback Pipeline ──────────────────────────────────────────────────
// Kept intact as offline fallback. Used when Gemini key is absent or call fails.

const EXPENSE_KEYWORDS   = ['spent','spend','paid','pay','bought','buy','purchased','purchase','dinner','lunch','breakfast','food','petrol','fuel','medicine','bill','fees'];
const INCOME_KEYWORDS    = ['received','receive','earned','earn','salary','income','payment received','got','credited'];
const TRANSFER_KEYWORDS  = ['transferred','transfer','sent to','moved','shifted'];
const LOAN_BORROW_KEYWORDS = ['borrowed','borrow','took loan'];
const LOAN_LEND_KEYWORDS   = ['lent','gave','give','gave loan'];
const GOAL_KEYWORDS        = ['save','saving','goal','target','want to save','plan to save'];
const INVESTMENT_KEYWORDS  = ['invest','invested','bought stocks','mutual fund','sip','fd','fixed deposit'];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Dining':    ['food','dinner','lunch','breakfast','restaurant','cafe','coffee','eat','meal','pani puri','pizza','burger','swiggy','zomato','chai','tea','dhaba'],
  'Transport':        ['petrol','fuel','uber','ola','cab','auto','bus','train','metro','travel','rapido','rickshaw','diesel','taxi'],
  'Housing':          ['rent','room','accommodation','hostel','pg','flat','apartment','house','lodge','maintenance','society'],
  'Shopping':         ['shopping','clothes','shoes','amazon','flipkart','mall','shirt','dress','myntra','meesho'],
  'Health':           ['medicine','doctor','hospital','pharmacy','medical','health','gym','chemist','clinic'],
  'Entertainment':    ['movie','netflix','spotify','gaming','entertainment','subscription','hotstar','prime','cinema'],
  'Bills & Utilities':['electricity','water','gas','internet','mobile','recharge','bill','wifi','broadband','lpg'],
  'Groceries':        ['grocery','groceries','vegetables','sabzi','kirana','milk','doodh'],
  'Education':        ['school','college','fees','course','book','tuition','coaching'],
  'Salary':           ['salary','stipend','wages','payroll'],
  'Business':         ['business','client','project','invoice','freelance'],
};

const SEGMENT_SEPARATORS = /\s*(?:(?:,|\b)and\s+)?(?:I\s+|we\s+|then\s+|also\s+|so\s+)*(?=(?:paid|pay|spent|spend|bought|buy|lent|lend|gave|give|borrowed|borrow|saved|save|invested|invest|transferred|transfer|sent|send|received|receive|got|get|split)\b)/gi;

const AMOUNT_PATTERNS = [
  /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/gi,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees?|rs\.?|₹)/gi,
  /\b([\d,]+(?:\.\d{1,2})?)\b/g,
];

const NAME_CONTEXT_PATTERN = /(?:to|from|gave|give|lent|with|borrowed from|lent to)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/g;
const BORROW_PERSON_PATTERN = /\b(?:borrowed|borrow|took)\b\s+(?:₹\s*)?(?:rs\.?\s*)?[\d,]+(?:\.\d+)?\s*(?:rupees?|rs|inr|k|thousand|lakh)?\s+from\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i;

function regexExtractAmount(text: string): number | undefined {
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

function regexDetectCategory(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return cat;
  }
  return undefined;
}

function regexClassifyIntent(segment: string): { type: FinancialActionType; confidence: number } {
  const lower = segment.toLowerCase();
  const hasAmount = regexExtractAmount(segment) !== undefined;
  const isExplicitExpense = /\b(?:paid|pay|spent|spend|bought|buy|purchased|purchase|got|ordered)\b/.test(lower) && /\b(?:for|on|at|from)\b/.test(lower);

  if (isExplicitExpense && hasAmount) return { type: 'expense', confidence: 0.92 };
  if (INVESTMENT_KEYWORDS.some(kw => lower.includes(kw))) return { type: 'investment', confidence: 0.80 };
  if (LOAN_BORROW_KEYWORDS.some(kw => lower.includes(kw))) return { type: 'loan_borrow', confidence: 0.85 };
  if (LOAN_LEND_KEYWORDS.some(kw => lower.includes(kw)) && /to\s+[A-Z]/.test(segment)) return { type: 'loan_lend', confidence: 0.82 };
  if (TRANSFER_KEYWORDS.some(kw => lower.includes(kw))) return { type: 'transfer', confidence: 0.83 };
  if (INCOME_KEYWORDS.some(kw => lower.includes(kw))) return { type: 'income', confidence: 0.87 };
  if (EXPENSE_KEYWORDS.some(kw => lower.includes(kw))) return { type: 'expense', confidence: 0.88 };
  if (GOAL_KEYWORDS.some(kw => lower.includes(kw)) && !/\b(?:paid|spent|bought)\b/.test(lower)) return { type: 'goal', confidence: 0.85 };
  if (hasAmount) return { type: 'expense', confidence: 0.55 };
  return { type: 'unknown', confidence: 0.2 };
}

function regexExtractDescription(text: string): string {
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
  return text
    .replace(/₹\s*[\d,]+(?:\.\d+)?/g, '')
    .replace(/\b[\d,]+(?:\.\d+)?\s*(?:rupees?|rs\.?|inr)?\b/gi, '')
    .replace(/\b(?:i|me|my|a|an|the|and|for|on|at|to|from|with|in|of|paid|spent|bought|purchased|got|received|borrowed|lent|invested|saved)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function regexExtractEntities(segment: string, type: FinancialActionType): ExtractedEntity {
  const entities: ExtractedEntity = {};
  entities.amount = regexExtractAmount(segment);
  entities.category = regexDetectCategory(segment);
  entities.description = regexExtractDescription(segment);

  const merchantMatch = segment.match(/(?:at|from|on)\s+([A-Za-z][A-Za-z\s]{2,20})(?:\s|,|$)/i);
  if (merchantMatch) entities.merchant = merchantMatch[1].trim();

  if (type === 'loan_lend' || type === 'loan_borrow' || type === 'transfer') {
    NAME_CONTEXT_PATTERN.lastIndex = 0;
    const nameMatch = NAME_CONTEXT_PATTERN.exec(segment);
    if (nameMatch) {
      entities.person = nameMatch[1];
    } else if (type === 'loan_borrow') {
      const m = segment.match(BORROW_PERSON_PATTERN);
      if (m) entities.person = m[1];
    }
    if (!entities.person) {
      const simple = segment.match(/(?:gave|lent|to|from|borrowed from)\s+([A-Z][a-z]+)/);
      if (simple) entities.person = simple[1];
    }
  }

  if (type === 'goal') {
    const goalM = segment.match(/(?:save|target|goal)\s+(?:₹\s*|rs\.?\s*|inr\s*)?([\d,]+(?:\.\d{1,2})?)/i);
    if (goalM) entities.goalTarget = parseFloat(goalM[1].replace(/,/g, ''));
    const durM = segment.match(/(?:in|over|within)\s+(\d+)\s+(month|year|week)s?/i);
    if (durM) {
      entities.goalDuration = `${durM[1]} ${durM[2]}s`;
      if (entities.goalTarget && durM[2].toLowerCase() === 'month') {
        entities.goalMonthly = Math.ceil(entities.goalTarget / parseInt(durM[1]));
      }
    }
  }

  const today = new Date();
  if (/yesterday/i.test(segment)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    entities.date = d.toISOString().slice(0, 10);
  } else if (/today|now/i.test(segment)) {
    entities.date = today.toISOString().slice(0, 10);
  }

  const pmMatch = segment.match(/(upi|cash|card|gpay|paytm|credit|debit|neft|imps|netbanking)/i);
  if (pmMatch) entities.paymentMethod = pmMatch[1].toUpperCase();

  return entities;
}

function regexPipeline(transcript: string, threshold: number): FinancialAction[] {
  const segments = transcript
    .replace(/\s+/g, ' ')
    .trim()
    .split(SEGMENT_SEPARATORS)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  const rawSegments = segments.length > 0 ? segments : [transcript];

  return rawSegments
    .map(segment => {
      const { type, confidence } = regexClassifyIntent(segment);
      const entities = regexExtractEntities(segment, type);
      return {
        type,
        rawSegment: segment,
        entities,
        confidence,
        requiresReview: confidence < threshold || !entities.amount,
      } satisfies FinancialAction;
    })
    .filter(a => a.type !== 'unknown' || a.entities.amount !== undefined);
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

export async function processVoiceTranscript(transcript: string): Promise<FinancialAction[]> {
  const config = await getAIConfigurations();

  if (!config.voice.enabled) {
    logger.warn('Voice NLP: Voice processing is disabled by configuration');
    return [];
  }

  // Step 1: Remove filler words
  const cleaned = cleanTranscript(transcript);
  logger.debug('Voice NLP: cleaned', { original: transcript.slice(0, 120), cleaned: cleaned.slice(0, 120) });

  // Step 2: Detect language (Phase 1: always 'en')
  const lang = detectLanguage(cleaned);

  // Step 3: Translate to English if needed (Phase 1: no-op)
  const english = lang === 'en' ? cleaned : await translateToEnglish(cleaned, lang);

  const threshold = config.voice.autoSaveThreshold ?? 0.7;
  const modelName = config.voice.model ?? 'gemini-1.5-flash';

  // Step 4: LLM-first extraction (primary path — handles all natural language cases)
  if (process.env.GOOGLE_API_KEY) {
    try {
      const llmActions = await extractWithLLM(english, modelName, threshold);
      if (llmActions.length > 0) {
        logger.info('Voice NLP: LLM extracted actions', {
          count: llmActions.length,
          types: llmActions.map(a => a.type),
          amounts: llmActions.map(a => a.entities.amount),
        });
        return llmActions;
      }
      logger.warn('Voice NLP: LLM returned empty result, falling back to regex');
    } catch (err: any) {
      logger.warn('Voice NLP: LLM extraction failed, falling back to regex', { error: err.message });
    }
  }

  // Step 5: Regex fallback (offline / no API key / LLM failure)
  const fallbackActions = regexPipeline(english, threshold);
  logger.info('Voice NLP: regex fallback extracted actions', {
    count: fallbackActions.length,
  });
  return fallbackActions;
}
