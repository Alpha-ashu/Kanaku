/**
 * Conversational AI Chat Controller
 *
 * POST /api/v1/ai/chat
 *   Body: { message: string; conversationId?: string }
 *
 * The assistant does four things, decided by one LLM classification pass
 * (Gemini → Groq → OpenRouter → offline heuristics):
 *
 *   record_*   "I spent 382 on Zomato", "lent 5k to Arun", "invested 10k in SIP"
 *              → a FinancialAction the client confirms and saves (all the voice
 *                Command Center types: expense, income, transfer, loans, goal,
 *                investment, group_expense, subscription).
 *   query      "How much did I spend on food?", "who owes me?", "goal progress"
 *              → FinancialQueryEngine over the user's own data.
 *   overview   "How am I doing?", "give me a summary" → FinancialSnapshot.
 *   advice     "How can I save more?", "should I prepay my loan?"
 *              → LLM guidance grounded in the snapshot (rule-based when offline).
 *   task       "set a food budget of 8000", "remind me to pay rent on the 1st",
 *              "create a goal Goa trip 50k by March" → a `task` action the client
 *              confirms and executes (goal / budget / to-do / recurring).
 *
 * GET /api/v1/ai/chat/categories
 *   Returns the authenticated user's top categories (for frontend dropdown hints).
 */

import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { sanitizeAIInput } from '../../utils/sanitize';
import { incrementAIUsage } from '../../utils/aiUsageTracker';
import { audit } from '../../utils/auditLogger';
import { executeFinancialQuery, QueryIntent, QueryParams } from './financial-query-engine';
import { suggestCategory, getUserTopCategories } from './category-suggester';
import type { TransactionSummaryRow } from './financial-query-engine';
import { buildFinancialSnapshot, renderOverview, offlineAdvice, snapshotForPrompt, INR } from './financial-snapshot';
import { completeWithLLM, stripJsonFence, type LLMParser } from './chat.llm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export type ChatTaskType = 'create_goal' | 'create_budget' | 'add_todo' | 'create_recurring';

export interface ChatTask {
  type: ChatTaskType;
  title: string;
  amount?: number;
  category?: string;
  /** create_goal: target date; add_todo: due date; create_recurring: next due date (YYYY-MM-DD) */
  date?: string;
  period?: 'weekly' | 'monthly' | 'yearly';
  interval?: 'weekly' | 'monthly' | 'yearly';
  priority?: 'low' | 'medium' | 'high';
  transactionType?: 'expense' | 'income' | 'transfer';
  notes?: string;
}

export interface ChatActionEntities {
  amount?: number;
  category?: string;
  description?: string;
  date?: string;
  person?: string;
  merchant?: string;
  paymentMethod?: string;
  members?: string[];
  recurrence?: 'monthly' | 'yearly' | 'weekly' | 'daily';
  assetType?: string;
  quantity?: number;
  goalTarget?: number;
  task?: ChatTask;
}

export interface ChatAction {
  type: string;
  entities: ChatActionEntities;
  confidence: number;
  requiresConfirmation: boolean;
}

export type ChatParser = LLMParser | 'offline';

export interface ChatResponse {
  conversationId: string;
  reply: string;
  intent: string;
  action?: ChatAction;
  transactions?: TransactionSummaryRow[];
  requiresConfirmation: boolean;
  parser: ChatParser;
}

// ─── Short-term Context Store ─────────────────────────────────────────────────
// In-memory conversation context (last 6 turns per conversationId).

const CTX_MAX_TURNS = 6;
const CTX_TTL_MS = 30 * 60 * 1000;

interface ContextEntry {
  turns: ChatMessage[];
  lastAccess: number;
}

const conversationStore = new Map<string, ContextEntry>();

const evictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of conversationStore.entries()) {
    if (now - entry.lastAccess > CTX_TTL_MS) conversationStore.delete(id);
  }
}, 10 * 60 * 1000);
evictionTimer.unref?.();

function getContext(conversationId: string): ChatMessage[] {
  const entry = conversationStore.get(conversationId);
  if (!entry) return [];
  entry.lastAccess = Date.now();
  return entry.turns;
}

function appendContext(conversationId: string, message: ChatMessage): void {
  let entry = conversationStore.get(conversationId);
  if (!entry) {
    entry = { turns: [], lastAccess: Date.now() };
    conversationStore.set(conversationId, entry);
  }
  entry.turns.push(message);
  if (entry.turns.length > CTX_MAX_TURNS * 2) {
    entry.turns.splice(0, entry.turns.length - CTX_MAX_TURNS * 2);
  }
  entry.lastAccess = Date.now();
}

// ─── Intent Classification & Entity Extraction ────────────────────────────────

const TODAY = () => new Date().toISOString().slice(0, 10);

const RECORD_INTENT_TO_TYPE: Record<string, string> = {
  record_expense: 'expense',
  record_income: 'income',
  record_transfer: 'transfer',
  record_loan_lend: 'loan_lend',
  record_loan_borrow: 'loan_borrow',
  record_investment: 'investment',
  record_goal: 'goal',
  record_group_expense: 'group_expense',
  record_subscription: 'subscription',
};

const QUERY_TYPES: QueryIntent[] = [
  'SUM_EXPENSES', 'DATE_RANGE_SUMMARY', 'MERCHANT_LOOKUP', 'PERSON_BALANCE', 'ACCOUNT_BALANCE',
  'RECENT_TRANSACTIONS', 'CATEGORY_USAGE', 'INCOME_SUMMARY', 'GOALS_PROGRESS', 'LOANS_SUMMARY',
  'INVESTMENT_SUMMARY', 'BUDGET_STATUS', 'UPCOMING_RECURRING',
];

const TASK_TYPES: ChatTaskType[] = ['create_goal', 'create_budget', 'add_todo', 'create_recurring'];

function buildClassificationPrompt(message: string, history: ChatMessage[]): string {
  const historyStr = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n');

  return `You are the intent classifier for Kanaku, an Indian personal-finance app. Understand any language
(Hindi, Tamil, Telugu, Hinglish…) but output English field values. Amounts in Indian units convert
numerically: "5k"/"5 hazaar" → 5000, "2 lakh" → 200000, "dedh sau" → 150.

CONVERSATION HISTORY (last turns):
${historyStr || '(none)'}

USER MESSAGE: "${message}"
TODAY: ${TODAY()}

Respond with ONE JSON object (no markdown). Pick exactly one intent:

1) Recording money the user ALREADY moved. intent is one of
   "record_expense" | "record_income" | "record_transfer" | "record_loan_lend" | "record_loan_borrow" |
   "record_investment" | "record_goal" | "record_group_expense" | "record_subscription"
   {"intent":..., "amount":<number>, "description":<1-5 word noun phrase>, "category":<see list or null>,
    "merchant":<string|null>, "person":<name for loans/transfers|null>, "members":<group_expense: other people's names array|null>,
    "date":<"YYYY-MM-DD"|null — today if "today", yesterday if "yesterday">, "paymentMethod":<"cash"|"upi"|"card"|"bank"|null>,
    "recurrence":<subscription: "monthly"|"yearly"|"weekly"|null>, "assetType":<investment: "stock"|"mutual_fund"|"gold"|"crypto"|"fd"|"other"|null>,
    "confidence":<0-1>}
   - "lent/gave X to <person>" → record_loan_lend; "borrowed/took X from <person>" → record_loan_borrow
   - "sent/transferred X to <account>" → record_transfer (person = destination account name)
   - "invested X in SIP/stocks/gold" → record_investment
   - "saved/put aside X for <goal>" → record_goal (description = goal name)
   - "me and Arun spent 3000 on dinner"/"split 3000 with Arun" → record_group_expense
   - "paid 649 for Netflix monthly" → record_subscription
   - "got salary 50k"/"received 2000 from client" → record_income

2) Questions about the user's own data:
   {"intent":"query", "queryType": "SUM_EXPENSES" | "DATE_RANGE_SUMMARY" | "MERCHANT_LOOKUP" | "PERSON_BALANCE" |
    "ACCOUNT_BALANCE" | "RECENT_TRANSACTIONS" | "INCOME_SUMMARY" | "GOALS_PROGRESS" | "LOANS_SUMMARY" |
    "INVESTMENT_SUMMARY" | "BUDGET_STATUS" | "UPCOMING_RECURRING",
    "category":<string|null>, "person":<string|null>, "keyword":<string|null>,
    "startDate":<"YYYY-MM-DD"|null>, "endDate":<"YYYY-MM-DD"|null>, "limit":<number|null>}

3) A full picture / health check ("how am I doing", "summary", "overview", "where do I stand"):
   {"intent":"overview"}

4) Guidance, planning, explanations, "should I", "how can I", "what is a good…", tips, comparisons,
   general finance questions (tax, SIP vs FD, emergency fund, credit cards, EMIs, budgeting):
   {"intent":"advice", "question":<the user's question, cleaned up>}

5) Asking the app to SET SOMETHING UP for the future (not money already spent):
   {"intent":"task", "taskType": "create_goal" | "create_budget" | "add_todo" | "create_recurring",
    "title":<goal name / budget category / to-do title / recurring title>, "amount":<number|null>,
    "category":<string|null>, "date":<"YYYY-MM-DD"|null — goal target date, to-do due date, or next due date>,
    "period":<budget: "weekly"|"monthly"|"yearly"|null>, "interval":<recurring: "weekly"|"monthly"|"yearly"|null>,
    "priority":<to-do: "low"|"medium"|"high"|null>, "transactionType":<recurring: "expense"|"income"|null>}
   - "set/create a budget of 8000 for food" → create_budget (title = category)
   - "remind me to pay rent on the 1st", "add a task to file ITR" → add_todo
   - "create a goal Goa trip 50000 by March", "I want to save 1 lakh for a bike" → create_goal
   - "add a monthly Netflix expense of 649", "track my 15000 rent every month" → create_recurring

6) Greetings, thanks, or anything unrelated to money: {"intent":"out_of_scope"}

CATEGORIES (use these exact strings when they fit):
  Expenses: "Food & Dining", "Transport", "Housing", "Shopping", "Health", "Entertainment",
            "Bills & Utilities", "Groceries", "Education", "Travel"
  Income:   "Salary", "Freelance", "Business", "Investment Returns", "Other Income"

EXAMPLES:
"I spent 382 on Zomato" → {"intent":"record_expense","amount":382,"description":"Zomato order","category":"Food & Dining","merchant":"Zomato","person":null,"members":null,"date":null,"paymentMethod":null,"recurrence":null,"assetType":null,"confidence":0.96}
"lent 5000 to Arun yesterday" → {"intent":"record_loan_lend","amount":5000,"description":"Lent to Arun","category":"Loans","merchant":null,"person":"Arun","members":null,"date":"<yesterday>","paymentMethod":null,"recurrence":null,"assetType":null,"confidence":0.95}
"how much did I spend on food this month?" → {"intent":"query","queryType":"SUM_EXPENSES","category":"Food & Dining","person":null,"keyword":null,"startDate":null,"endDate":null,"limit":null}
"what's my goal progress" → {"intent":"query","queryType":"GOALS_PROGRESS","category":null,"person":null,"keyword":null,"startDate":null,"endDate":null,"limit":null}
"how am I doing this month" → {"intent":"overview"}
"how can I save more every month?" → {"intent":"advice","question":"How can I save more every month?"}
"set a food budget of 8000" → {"intent":"task","taskType":"create_budget","title":"Food & Dining","amount":8000,"category":"Food & Dining","date":null,"period":"monthly","interval":null,"priority":null,"transactionType":null}
"remind me to pay the electricity bill on 15th" → {"intent":"task","taskType":"add_todo","title":"Pay electricity bill","amount":null,"category":"Bills & Utilities","date":"<15th of this or next month>","period":null,"interval":null,"priority":"high","transactionType":null}

Return ONLY the JSON object.`;
}

interface ClassifiedIntent {
  intent: string;
  // record_*
  amount?: number;
  description?: string;
  merchant?: string | null;
  person?: string | null;
  members?: string[] | null;
  date?: string | null;
  paymentMethod?: string | null;
  recurrence?: string | null;
  assetType?: string | null;
  confidence?: number;
  category?: string | null;
  // query
  queryType?: string;
  keyword?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number | null;
  // advice
  question?: string;
  // task
  taskType?: string;
  title?: string;
  period?: string | null;
  interval?: string | null;
  priority?: string | null;
  transactionType?: string | null;
}

const clean = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, 120) : undefined;
};

const cleanAmount = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
};

const cleanDate = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().toLowerCase();
  if (t === 'today') return TODAY();
  if (t === 'yesterday') {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(t).getTime()) ? t : undefined;
};

/**
 * Offline heuristic classifier — used when no LLM provider is reachable.
 * Covers the common phrasings for every intent so the assistant stays useful
 * (if less nuanced) without a key or during a quota outage.
 */
export function classifyOffline(message: string): ClassifiedIntent {
  const lower = message.toLowerCase().trim();
  const amountMatch = message.match(/(?:₹|rs\.?\s*|inr\s*)?\b(\d[\d,]*(?:\.\d{1,2})?)\s*(k|thousand|hazaar|hazar|lakh|lac|lacs|cr|crore)?\b/i);
  let amount: number | undefined;
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    const unit = (amountMatch[2] || '').toLowerCase();
    if (/^(k|thousand|hazaar|hazar)$/.test(unit)) amount *= 1000;
    if (/^(lakh|lac|lacs)$/.test(unit)) amount *= 100000;
    if (/^(cr|crore)$/.test(unit)) amount *= 10000000;
  }
  const dateHint = /\byesterday\b/.test(lower) ? cleanDate('yesterday') : /\btoday\b/.test(lower) ? TODAY() : undefined;
  const nameAfter = (re: RegExp, source = message) => source.match(re)?.[1]?.trim();
  // Titles are extracted from the message with amounts removed, so "track my
  // 15000 rent every month" yields "rent" rather than stalling on the number.
  const textNoAmount = message
    .replace(/(?:₹|rs\.?\s*|inr\s*)?\b\d[\d,]*(?:\.\d{1,2})?\s*(?:k|thousand|hazaar|hazar|lakh|lac|lacs|cr|crore)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const LEAD_STOP = /^(?:set|create|make|add|start|track|please|new|a|an|the|my|our|monthly|weekly|yearly|up)\s+/i;
  const TRAIL_STOP = /\s+(?:of|for|budget|goal|expense|bill|payment|every|each|monthly|weekly|yearly|by|on|at|to)$/i;
  const tidy = (s?: string): string | undefined => {
    let t = (s ?? '').replace(/[.!?,]+$/, '').trim();
    while (LEAD_STOP.test(t)) t = t.replace(LEAD_STOP, '');
    while (TRAIL_STOP.test(t)) t = t.replace(TRAIL_STOP, '');
    t = t.replace(/\s+/g, ' ').trim();
    return t.length >= 2 ? t.charAt(0).toUpperCase() + t.slice(1) : undefined;
  };

  // Tasks (set up something for the future)
  if (/\b(set|create|make|add|start)\b.*\bbudget\b|\bbudget of\b/.test(lower) && amount) {
    const cat = tidy(nameAfter(/\bfor\s+([a-z&\s]{3,30}?)(?:\s+(?:of|budget|at|to|per)\b|$)/i, textNoAmount))
      || tidy(nameAfter(/\b((?:[a-z&]+\s+){0,3}[a-z&]+)\s+budget\b/i, textNoAmount));
    return { intent: 'task', taskType: 'create_budget', title: cat || 'General', category: cat || undefined, amount, period: /\bweek/.test(lower) ? 'weekly' : /\byear/.test(lower) ? 'yearly' : 'monthly' };
  }
  if (/\bremind me\b|\badd (?:a )?(?:task|todo|to-do|reminder)\b|\bto-?do\b/.test(lower)) {
    const title = tidy(nameAfter(/\bremind me to\s+(.+?)(?:\s+on\b|\s+by\b|\s+before\b|$)/i))
      || tidy(nameAfter(/\b(?:task|todo|to-do|reminder)\s+(?:to\s+)?(.+)/i))
      || message.replace(/[.!?]+$/, '').slice(0, 100);
    return { intent: 'task', taskType: 'add_todo', title: title.slice(0, 100), priority: /\burgent|important|high\b/.test(lower) ? 'high' : 'medium', date: dateHint };
  }
  if (/\b(create|set|make|start|new)\b.*\bgoal\b|\bwant to save\b|\bsave (?:up )?for\b/.test(lower)) {
    const title = tidy(nameAfter(/\bgoal\s+(?:for\s+|called\s+|named\s+)?([a-z][a-z\s]{2,40}?)(?:\s+(?:of|for|by|in|within|before)\b|$)/i, textNoAmount))
      || tidy(nameAfter(/\b(?:save|saving|saved)\b.*?\bfor\s+(?:a\s+|an\s+|the\s+|my\s+)?([a-z][a-z\s]{2,40}?)(?:\s+(?:by|in|within|before)\b|$)/i, textNoAmount))
      || 'Savings goal';
    return { intent: 'task', taskType: 'create_goal', title, amount, category: 'Savings' };
  }
  if (/\b(every|each)\s+(month|week|year)\b|\brecurring\b|\bmonthly\b.*\b(add|track|set)\b|\b(add|track|set)\b.*\bmonthly\b/.test(lower) && amount
      && !/\b(spent|paid|bought)\b/.test(lower)) {
    const interval = /\bweek/.test(lower) ? 'weekly' : /\byear/.test(lower) ? 'yearly' : 'monthly';
    const title = tidy(nameAfter(/\b(?:track|add|set up|set|create)\s+(?:my\s+|a\s+|the\s+)?(?:monthly\s+|weekly\s+|yearly\s+)?([a-z][a-z\s]{2,40}?)(?:\s+(?:every|each|of|monthly|weekly|yearly|expense|bill|payment)\b|$)/i, textNoAmount))
      || tidy(nameAfter(/\bfor\s+(?:my\s+)?([a-z][a-z\s]{2,40}?)(?:\s+(?:every|each|monthly|weekly|yearly)\b|$)/i, textNoAmount))
      || 'Recurring expense';
    return { intent: 'task', taskType: 'create_recurring', title, amount, interval, transactionType: /\b(salary|income|receive)\b/.test(lower) ? 'income' : 'expense' };
  }

  // Overview
  if (/\b(overview|summary|snapshot|how am i doing|how'?s my|where do i stand|financial health|my finances)\b/.test(lower)) {
    return { intent: 'overview' };
  }

  // Queries
  const catMatch = lower.match(/\b(food|groceries|transport|health|entertainment|shopping|education|utilities|housing|travel|rent|fuel|petrol)\b/);
  const category = catMatch ? catMatch[1].charAt(0).toUpperCase() + catMatch[1].slice(1) : undefined;
  if (/\bgoal/.test(lower) && /\b(progress|how|status|far|much|show)\b/.test(lower)) return { intent: 'query', queryType: 'GOALS_PROGRESS' };
  if (/\bbudget/.test(lower) && /\b(status|how|left|remaining|over|show|my)\b/.test(lower)) return { intent: 'query', queryType: 'BUDGET_STATUS' };
  if (/\b(invest|portfolio|sip|stocks?|mutual)\b/.test(lower) && /\b(how|worth|value|show|my|doing)\b/.test(lower) && !amount) return { intent: 'query', queryType: 'INVESTMENT_SUMMARY' };
  if (/\b(upcoming|due|bills? due|subscriptions?|recurring)\b/.test(lower) && !amount) return { intent: 'query', queryType: 'UPCOMING_RECURRING' };
  if (/\b(income|earn|salary)\b/.test(lower) && /\b(how much|total|this month|show)\b/.test(lower) && !amount) return { intent: 'query', queryType: 'INCOME_SUMMARY' };
  if (/\bwho owes\b|\bowes me\b|\bwhat do i owe\b|\bloans?\b.*\b(status|summary|show|my)\b/.test(lower) && !amount) return { intent: 'query', queryType: 'LOANS_SUMMARY' };
  if (/\b(owe|lent|borrowed)\b/.test(lower) && !amount) {
    const person = nameAfter(/\b(?:owe|lent|borrowed|from|to)\s+(?:by|to|from)?\s*([A-Z][a-z]+)/);
    return person ? { intent: 'query', queryType: 'PERSON_BALANCE', person } : { intent: 'query', queryType: 'LOANS_SUMMARY' };
  }
  if (/\b(how much|total spent|spending|spend this|spent this|expenses this)\b/.test(lower) && !/\b(spent|paid)\s+\d/.test(lower)) {
    return { intent: 'query', queryType: 'SUM_EXPENSES', category };
  }
  if (/\btop categor|\bbreakdown\b|\bwhere (?:is|did) my money\b/.test(lower)) return { intent: 'query', queryType: 'DATE_RANGE_SUMMARY' };
  if (/\bbalance\b|\bmoney (?:do i have|available)\b/.test(lower)) return { intent: 'query', queryType: 'ACCOUNT_BALANCE' };
  if (/\b(last|recent|latest)\b/.test(lower) && /\btransaction/.test(lower)) {
    const numMatch = lower.match(/\d+/);
    return { intent: 'query', queryType: 'RECENT_TRANSACTIONS', limit: numMatch ? parseInt(numMatch[0], 10) : 5 };
  }

  // Records
  if (amount) {
    if (/\b(me and|split|group expense|shared with|we spent)\b/.test(lower)) {
      const members = (message.match(/\b(?:me and|with|between|among)\s+([A-Za-z][A-Za-z\s,&]+?)(?:\s+(?:spent|paid|had|went|on|for)|[,.]|$)/i)?.[1] || '')
        .split(/,|\band\b|&/i).map((s) => s.trim()).filter((s) => s.length > 1 && !/^(me|we|us|i)$/i.test(s));
      return { intent: 'record_group_expense', amount, description: nameAfter(/\b(?:on|for)\s+([a-z][a-z\s]{2,30})/i) || 'Group expense', members, date: dateHint, confidence: 0.6 };
    }
    if (/\b(subscription|netflix|spotify|hotstar|prime|monthly plan|yearly plan)\b/.test(lower)) {
      return { intent: 'record_subscription', amount, description: nameAfter(/\b(?:for|on)\s+([a-z][a-z\s]{2,30})/i) || 'Subscription', recurrence: /year/.test(lower) ? 'yearly' : 'monthly', category: 'Entertainment', date: dateHint, confidence: 0.6 };
    }
    if (/\b(invest|sip|mutual fund|stocks?|shares?|gold|fd|fixed deposit)\b/.test(lower)) {
      return { intent: 'record_investment', amount, description: nameAfter(/\b(?:in|into)\s+([a-z][a-z\s]{2,30})/i) || 'Investment', assetType: /gold/.test(lower) ? 'gold' : /sip|mutual/.test(lower) ? 'mutual_fund' : /fd|fixed/.test(lower) ? 'fd' : /stock|share/.test(lower) ? 'stock' : 'other', date: dateHint, confidence: 0.6 };
    }
    if (/\b(lent|gave|give)\b/.test(lower)) {
      return { intent: 'record_loan_lend', amount, person: nameAfter(/\b(?:to)\s+([A-Z][a-z]+)/), description: 'Loan given', date: dateHint, confidence: 0.55 };
    }
    if (/\b(borrowed|borrow|took loan|took)\b/.test(lower)) {
      return { intent: 'record_loan_borrow', amount, person: nameAfter(/\b(?:from)\s+([A-Z][a-z]+)/), description: 'Loan taken', date: dateHint, confidence: 0.55 };
    }
    if (/\b(transferred|transfer|sent|moved)\b/.test(lower) && /\b(to)\b/.test(lower)) {
      return { intent: 'record_transfer', amount, person: nameAfter(/\bto\s+(?:my\s+)?([A-Za-z][A-Za-z\s]{1,30})/i), description: 'Transfer', date: dateHint, confidence: 0.55 };
    }
    if (/\b(saved|put aside|set aside)\b/.test(lower) && /\bfor\b/.test(lower)) {
      return { intent: 'record_goal', amount, description: nameAfter(/\bfor\s+(?:my\s+|the\s+)?([a-z][a-z\s]{2,30})/i) || 'Savings', date: dateHint, confidence: 0.55 };
    }
    if (/\b(received|earned|salary|income|got paid|credited)\b/.test(lower)) {
      return { intent: 'record_income', amount, description: /salary/.test(lower) ? 'Salary' : 'Income', category: /salary/.test(lower) ? 'Salary' : 'Other Income', date: dateHint, confidence: 0.6 };
    }
    if (/\b(spent|paid|bought|purchase|purchased|expense|cost)\b/.test(lower)) {
      const desc = nameAfter(/\b(?:on|for)\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z\s]{2,30})/i);
      return { intent: 'record_expense', amount, description: desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : 'Expense', category, date: dateHint, confidence: 0.6 };
    }
  }

  // Advice
  if (/\b(should i|how (?:can|do|should) i|advice|advise|tips?|suggest|recommend|improve|better|is it (?:good|wise|ok)|what is|what'?s a|explain|plan|strategy|reduce|cut|invest|save more)\b/.test(lower)) {
    return { intent: 'advice', question: message.trim() };
  }

  return { intent: 'out_of_scope' };
}

async function classifyIntent(
  message: string,
  history: ChatMessage[],
): Promise<{ classified: ClassifiedIntent; parser: ChatParser }> {
  const result = await completeWithLLM(buildClassificationPrompt(message, history), { json: true, maxTokens: 512 });
  if (result) {
    try {
      const parsed = JSON.parse(stripJsonFence(result.text));
      if (parsed && typeof parsed === 'object' && typeof parsed.intent === 'string') {
        return { classified: parsed as ClassifiedIntent, parser: result.parser };
      }
      logger.warn('Chat: LLM classification had no intent, using offline', { preview: result.text.slice(0, 120) });
    } catch (err) {
      logger.warn('Chat: LLM classification JSON parse failed, using offline', { preview: result.text.slice(0, 120) });
    }
  }
  return { classified: classifyOffline(message), parser: 'offline' };
}

// ─── Intent Handlers ──────────────────────────────────────────────────────────

type Handled = Omit<ChatResponse, 'conversationId' | 'parser'>;

const DEFAULT_CATEGORY_BY_TYPE: Record<string, string> = {
  income: 'Other Income',
  transfer: 'Transfer',
  loan_lend: 'Loans',
  loan_borrow: 'Loans',
  investment: 'Investment',
  goal: 'Savings',
  group_expense: 'Food & Dining',
  subscription: 'Entertainment',
};

async function handleRecordIntent(userId: string, c: ClassifiedIntent): Promise<Handled> {
  const type = RECORD_INTENT_TO_TYPE[c.intent] ?? 'expense';
  const amount = cleanAmount(c.amount);
  const description = clean(c.description) ?? clean(c.merchant) ?? (type === 'expense' ? 'Expense' : type.replace('_', ' '));
  const person = clean(c.person);
  const merchant = clean(c.merchant);
  const members = Array.isArray(c.members)
    ? c.members.map((m) => clean(m)).filter((m): m is string => Boolean(m) && !/^(me|i|we|us)$/i.test(m as string)).slice(0, 20)
    : undefined;

  let category = clean(c.category);
  if (!category) {
    category = type === 'expense'
      ? await suggestCategory(userId, `${description} ${merchant ?? ''}`)
      : DEFAULT_CATEGORY_BY_TYPE[type] ?? 'General';
  }

  if (!amount) {
    return {
      reply: 'I couldn\'t catch the amount. Could you repeat it with the number? (e.g. "I spent ₹500 on groceries")',
      intent: c.intent,
      requiresConfirmation: false,
    };
  }

  const money = INR(amount);
  const replyByType: Record<string, string> = {
    expense: `Got it — ${money} for **${description}** under ${category}${merchant ? ` at ${merchant}` : ''}. Confirm below to save it.`,
    income: `Nice — ${money} income for **${description}** (${category}). Confirm below to record it.`,
    transfer: `Transfer of ${money}${person ? ` to **${person}**` : ''}. Confirm below and I'll move it between your accounts.`,
    loan_lend: `You lent ${money}${person ? ` to **${person}**` : ''}. Confirm below and I'll track it as money owed to you.`,
    loan_borrow: `You borrowed ${money}${person ? ` from **${person}**` : ''}. Confirm below and I'll track it as a loan you owe.`,
    investment: `Investment of ${money} in **${description}**${c.assetType ? ` (${String(c.assetType).replace('_', ' ')})` : ''}. Confirm below to add it to your portfolio.`,
    goal: `Adding ${money} towards **${description}**. Confirm below and I'll record the contribution (or create the goal if it doesn't exist).`,
    group_expense: `Group expense of ${money} for **${description}**${members?.length ? ` split with ${members.join(', ')}` : ''}. Confirm below to create the split.`,
    subscription: `${money} **${description}** subscription (${c.recurrence ?? 'monthly'}). Confirm below to record it.`,
  };

  const recurrence = (['monthly', 'yearly', 'weekly', 'daily'] as const).find((r) => r === String(c.recurrence ?? '').toLowerCase());

  return {
    reply: replyByType[type] ?? replyByType.expense,
    intent: c.intent,
    requiresConfirmation: true,
    action: {
      type,
      entities: {
        amount,
        category,
        description,
        merchant,
        person,
        members: members?.length ? members : undefined,
        date: cleanDate(c.date),
        paymentMethod: clean(c.paymentMethod),
        recurrence: recurrence ?? (type === 'subscription' ? 'monthly' : undefined),
        assetType: type === 'investment' ? (clean(c.assetType) ?? 'other') : undefined,
      },
      confidence: typeof c.confidence === 'number' ? Math.min(1, Math.max(0, c.confidence)) : 0.85,
      requiresConfirmation: true,
    },
  };
}

async function handleQueryIntent(userId: string, c: ClassifiedIntent): Promise<Handled> {
  const requested = String(c.queryType ?? 'SUM_EXPENSES').toUpperCase() as QueryIntent;
  const intent: QueryIntent = QUERY_TYPES.includes(requested) ? requested : 'SUM_EXPENSES';

  const params: QueryParams = {
    intent,
    category: clean(c.category),
    person: clean(c.person),
    keyword: clean(c.keyword),
    limit: typeof c.limit === 'number' ? c.limit : undefined,
  };
  const start = cleanDate(c.startDate);
  const end = cleanDate(c.endDate);
  if (start) params.startDate = new Date(start);
  if (end) params.endDate = new Date(`${end}T23:59:59`);

  const result = await executeFinancialQuery(userId, params);
  return {
    reply: result.summary,
    intent: 'query',
    requiresConfirmation: false,
    transactions: result.transactions,
  };
}

async function handleOverview(userId: string): Promise<Handled> {
  const snapshot = await buildFinancialSnapshot(userId);
  return { reply: renderOverview(snapshot), intent: 'overview', requiresConfirmation: false };
}

const ADVICE_SYSTEM = `You are Kanaku's money coach for people in India. Give practical, specific guidance in plain
language. Use the user's real numbers when they are relevant (₹ with Indian grouping, e.g. ₹1,20,000).
Be concise: 3–6 short bullet points, each starting with "• ", and bold the single most important
action with **…**. Prefer widely accepted personal-finance principles (emergency fund of 3–6 months,
20% savings rate, index SIPs, clearing high-interest debt first, 50/30/20). Never recommend a
specific stock, fund house, insurer or lender. If the question needs a professional (tax filing
specifics, legal, insurance claims), say so in one line. End with one line offering a concrete
follow-up the app can do (a budget, a goal, a reminder). Do not use headings or tables.`;

async function handleAdvice(userId: string, c: ClassifiedIntent, message: string, history: ChatMessage[]): Promise<Handled & { parserOverride?: ChatParser }> {
  const snapshot = await buildFinancialSnapshot(userId);
  const question = clean(c.question) ?? message;
  const historyStr = history.slice(-4).map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join('\n');
  const prompt = `USER'S CURRENT FINANCES (from their Kanaku data):
${snapshotForPrompt(snapshot)}

RECENT CONVERSATION:
${historyStr || '(none)'}

TODAY: ${TODAY()}
QUESTION: ${question}`;

  const result = await completeWithLLM(prompt, { system: ADVICE_SYSTEM, maxTokens: 900, temperature: 0.4 });
  if (result && result.text.trim()) {
    return { reply: result.text.trim(), intent: 'advice', requiresConfirmation: false, parserOverride: result.parser };
  }
  return { reply: offlineAdvice(snapshot, question), intent: 'advice', requiresConfirmation: false, parserOverride: 'offline' };
}

function handleTask(c: ClassifiedIntent): Handled {
  const taskType = TASK_TYPES.find((t) => t === String(c.taskType ?? '').toLowerCase());
  if (!taskType) {
    return { reply: 'I can set up a goal, a budget, a to-do reminder, or a recurring transaction. Which one would you like?', intent: 'task', requiresConfirmation: false };
  }

  const amount = cleanAmount(c.amount);
  const date = cleanDate(c.date);
  const category = clean(c.category);
  const title = clean(c.title) ?? category ?? 'Untitled';
  const period = (['weekly', 'monthly', 'yearly'] as const).find((p) => p === String(c.period ?? '').toLowerCase()) ?? 'monthly';
  const interval = (['weekly', 'monthly', 'yearly'] as const).find((p) => p === String(c.interval ?? '').toLowerCase()) ?? 'monthly';
  const priority = (['low', 'medium', 'high'] as const).find((p) => p === String(c.priority ?? '').toLowerCase()) ?? 'medium';
  const transactionType = (['expense', 'income', 'transfer'] as const).find((t) => t === String(c.transactionType ?? '').toLowerCase()) ?? 'expense';

  const task: ChatTask = { type: taskType, title, amount, category, date, period, interval, priority, transactionType };
  let reply: string;

  switch (taskType) {
    case 'create_goal': {
      if (!amount) return { reply: `How much do you want to save for **${title}**? (e.g. "₹50,000 by March")`, intent: 'task', requiresConfirmation: false };
      reply = `I'll create the goal **${title}** with a target of ${INR(amount)}${date ? ` by ${date}` : ' (target date one year from now)'}. Confirm below.`;
      break;
    }
    case 'create_budget': {
      if (!amount) return { reply: `What monthly limit should the **${title}** budget have?`, intent: 'task', requiresConfirmation: false };
      task.category = category ?? title;
      reply = `I'll set a ${period} budget of ${INR(amount)} for **${task.category}** and alert you at 85%. Confirm below.`;
      break;
    }
    case 'add_todo': {
      reply = `I'll add the to-do **${title}**${date ? ` due ${date}` : ''} (${priority} priority). Confirm below.`;
      break;
    }
    case 'create_recurring': {
      if (!amount) return { reply: `How much is **${title}** each ${interval === 'weekly' ? 'week' : interval === 'yearly' ? 'year' : 'month'}?`, intent: 'task', requiresConfirmation: false };
      reply = `I'll track **${title}** as a ${interval} ${transactionType} of ${INR(amount)}${date ? `, next due ${date}` : ''}. Confirm below.`;
      break;
    }
  }

  return {
    reply,
    intent: 'task',
    requiresConfirmation: true,
    action: {
      type: 'task',
      entities: { task, amount, description: title, category: task.category },
      confidence: 0.9,
      requiresConfirmation: true,
    },
  };
}

const HELP_REPLY = `I'm your Kanaku assistant. Try:
• "I spent ₹500 on groceries" / "lent ₹5,000 to Arun" / "invested ₹10k in SIP"
• "How much did I spend on food this month?" / "Who owes me money?"
• "Give me an overview of my finances"
• "How can I save more every month?"
• "Set a food budget of ₹8,000" / "Remind me to pay rent on the 1st"`;

// ─── Main Handler ─────────────────────────────────────────────────────────────

export const handleChatMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const { message, conversationId: incomingConvId } = req.body as {
    message?: string;
    conversationId?: string;
  };

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const quota = await incrementAIUsage(userId);
  if (!quota.allowed) {
    audit({ event: 'ai.quota_exceeded', userId, meta: { current: quota.current, limit: quota.limit } });
    res.status(429).json({ error: 'Daily AI limit reached. Please try again tomorrow.', limit: quota.limit });
    return;
  }

  const { sanitized: cleanMessage, flagged } = sanitizeAIInput(message.trim().slice(0, 1000));
  if (flagged) {
    audit({ event: 'ai.prompt_injection', userId, resource: 'chat', meta: { inputLength: message.length } });
    logger.warn('Prompt injection detected in chat input', { userId });
  }

  const conversationId = typeof incomingConvId === 'string' && incomingConvId.trim()
    ? incomingConvId.trim().slice(0, 80)
    : `${userId}-${Date.now()}`;
  const history = getContext(conversationId);

  audit({ event: 'ai.chat_request', userId, meta: { conversationId } });

  let payload: Handled;
  let parser: ChatParser = 'offline';

  try {
    const { classified, parser: usedParser } = await classifyIntent(cleanMessage, history);
    parser = usedParser;

    if (Object.prototype.hasOwnProperty.call(RECORD_INTENT_TO_TYPE, classified.intent)) {
      payload = await handleRecordIntent(userId, classified);
    } else if (classified.intent === 'query') {
      payload = await handleQueryIntent(userId, classified);
    } else if (classified.intent === 'overview') {
      payload = await handleOverview(userId);
    } else if (classified.intent === 'advice') {
      const { parserOverride, ...rest } = await handleAdvice(userId, classified, cleanMessage, history);
      payload = rest;
      if (parserOverride) parser = parserOverride;
    } else if (classified.intent === 'task') {
      payload = handleTask(classified);
    } else {
      payload = { reply: HELP_REPLY, intent: 'out_of_scope', requiresConfirmation: false };
    }
  } catch (err) {
    logger.error('Chat: failed to process message', { err, userId });
    payload = {
      reply: 'Sorry, I had trouble with that one. Please try rephrasing.',
      intent: 'error',
      requiresConfirmation: false,
    };
  }

  appendContext(conversationId, { role: 'user', content: cleanMessage, timestamp: Date.now() });
  appendContext(conversationId, { role: 'assistant', content: payload.reply, timestamp: Date.now() });

  const response: ChatResponse = { conversationId, parser, ...payload };
  res.json(response);
};

// ─── Categories Handler ───────────────────────────────────────────────────────

export const handleGetCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const categories = await getUserTopCategories(userId);
    res.json({ categories });
  } catch (err) {
    logger.error('Chat: failed to fetch categories', { err });
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};
