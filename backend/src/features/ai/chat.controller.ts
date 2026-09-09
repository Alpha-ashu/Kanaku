/**
 * Conversational AI Chat Controller
 *
 * POST /api/v1/ai/chat
 *   Body: { message: string; conversationId?: string }
 *
 * Flow:
 *  1. Classify intent via LLM (Gemini primary, Groq fallback).
 *  2a. record_*  → extract entities → suggest category → return FinancialAction for frontend confirmation.
 *  2b. query     → call FinancialQueryEngine with structured params → return answer + optional transactions.
 *  2c. out_of_scope → friendly redirect message.
 *  3. Maintain a short-term context window (last 6 turns) in memory.
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatAction {
  type: string;
  entities: {
    amount?: number;
    category?: string;
    description?: string;
    date?: string;
    person?: string;
    merchant?: string;
    paymentMethod?: string;
  };
  confidence: number;
  requiresConfirmation: boolean;
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
  intent: string;
  action?: ChatAction;
  transactions?: TransactionSummaryRow[];
  requiresConfirmation: boolean;
  parser: 'gemini' | 'groq' | 'offline';
}

// ─── Short-term Context Store ─────────────────────────────────────────────────
// In-memory conversation context (last 6 turns per conversationId).
// Sufficient for multi-turn clarification without DB persistence.

const CTX_MAX_TURNS = 6;
const CTX_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface ContextEntry {
  turns: ChatMessage[];
  lastAccess: number;
}

const conversationStore = new Map<string, ContextEntry>();

// Evict stale conversations every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of conversationStore.entries()) {
    if (now - entry.lastAccess > CTX_TTL_MS) conversationStore.delete(id);
  }
}, 10 * 60 * 1000);

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

function buildClassificationPrompt(message: string, history: ChatMessage[]): string {
  const historyStr = history
    .slice(-4)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  return `You are a financial assistant for an Indian personal finance app called Kanaku.
Your job is to classify the user's intent and extract financial entities.

CONVERSATION HISTORY (last turns):
${historyStr || '(none)'}

USER MESSAGE: "${message}"
TODAY: ${TODAY()}

Classify the intent and respond with a SINGLE JSON object (no markdown):

For expense/income/transfer/loan recording:
{
  "intent": "record_expense" | "record_income" | "record_transfer" | "record_loan_lend" | "record_loan_borrow",
  "amount": <number>,
  "description": <short noun phrase 1-5 words>,
  "merchant": <merchant name or null>,
  "person": <person name for loans/transfers, else null>,
  "date": <"YYYY-MM-DD" or null — use today if "today" said, yesterday if "yesterday" said>,
  "paymentMethod": <"cash" | "upi" | "card" | "bank" | null>,
  "confidence": <0.0 to 1.0>
}

For financial queries:
{
  "intent": "query",
  "queryType": "SUM_EXPENSES" | "DATE_RANGE_SUMMARY" | "MERCHANT_LOOKUP" | "PERSON_BALANCE" | "ACCOUNT_BALANCE" | "RECENT_TRANSACTIONS",
  "category": <category name or null>,
  "person": <person name or null>,
  "keyword": <search keyword or null>,
  "startDate": <"YYYY-MM-DD" or null>,
  "endDate": <"YYYY-MM-DD" or null>,
  "limit": <number or null>
}

For greetings / help / out-of-scope:
{ "intent": "out_of_scope" }

EXAMPLES:
"I spent 382 on Zomato" → {"intent":"record_expense","amount":382,"description":"Zomato order","merchant":"Zomato","person":null,"date":null,"paymentMethod":null,"confidence":0.96}
"How much did I spend on food this month?" → {"intent":"query","queryType":"SUM_EXPENSES","category":"Food","person":null,"keyword":null,"startDate":null,"endDate":null,"limit":null}
"Who owes me money?" → {"intent":"query","queryType":"PERSON_BALANCE","category":null,"person":null,"keyword":null,"startDate":null,"endDate":null,"limit":null}
"What's my balance?" → {"intent":"query","queryType":"ACCOUNT_BALANCE","category":null,"person":null,"keyword":null,"startDate":null,"endDate":null,"limit":null}
"Show last 5 transactions" → {"intent":"query","queryType":"RECENT_TRANSACTIONS","category":null,"person":null,"keyword":null,"startDate":null,"endDate":null,"limit":5}

Return ONLY the JSON object, nothing else.`;
}

interface ClassifiedIntent {
  intent: string;
  amount?: number;
  description?: string;
  merchant?: string;
  person?: string;
  date?: string;
  paymentMethod?: string;
  confidence?: number;
  queryType?: string;
  category?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

async function classifyWithGemini(
  message: string,
  history: ChatMessage[],
): Promise<ClassifiedIntent> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 512 },
  });
  const result = await model.generateContent(buildClassificationPrompt(message, history));
  const text = result.response.text().trim();
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, ''));
}

async function classifyWithGroq(
  message: string,
  history: ChatMessage[],
): Promise<ClassifiedIntent> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq API key not configured');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: buildClassificationPrompt(message, history) }],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`Groq API error ${res.status}`);
  const data: any = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(text);
}

/**
 * Offline heuristic classifier — works without any LLM call.
 * Minimal but covers the most common cases.
 */
function classifyOffline(message: string): ClassifiedIntent {
  const lower = message.toLowerCase();

  // Query patterns
  if (/how much|total spent|spending|spend this|spent this/.test(lower)) {
    const catMatch = lower.match(/\b(food|groceries|transport|health|entertainment|shopping|education|utilities|housing)\b/);
    return {
      intent: 'query',
      queryType: 'SUM_EXPENSES',
      category: catMatch ? catMatch[1].charAt(0).toUpperCase() + catMatch[1].slice(1) : undefined,
    };
  }
  if (/balance|account|money available/.test(lower)) {
    return { intent: 'query', queryType: 'ACCOUNT_BALANCE' };
  }
  if (/last|recent|latest/.test(lower) && /transaction/.test(lower)) {
    const numMatch = lower.match(/\d+/);
    return { intent: 'query', queryType: 'RECENT_TRANSACTIONS', limit: numMatch ? parseInt(numMatch[0]) : 5 };
  }
  if (/owe|loan|lent|borrowed/.test(lower)) {
    const personMatch = lower.match(/(?:owe|lent|borrowed)\s+(?:by|to|from)?\s*([a-z]+)/i);
    return { intent: 'query', queryType: 'PERSON_BALANCE', person: personMatch?.[1] };
  }

  // Record patterns — extract amount
  const amountMatch = message.match(/(?:₹|rs\.?\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined;

  if (/spent|paid|bought|purchase|expense/.test(lower) && amount) {
    return { intent: 'record_expense', amount, description: 'Expense', confidence: 0.6 };
  }
  if (/received|earned|salary|income|got paid/.test(lower) && amount) {
    return { intent: 'record_income', amount, description: 'Income', confidence: 0.6 };
  }
  if (/lent|gave|give/.test(lower) && amount) {
    return { intent: 'record_loan_lend', amount, description: 'Loan given', confidence: 0.55 };
  }
  if (/borrowed|borrow|took loan/.test(lower) && amount) {
    return { intent: 'record_loan_borrow', amount, description: 'Loan taken', confidence: 0.55 };
  }

  return { intent: 'out_of_scope' };
}

async function classifyIntent(
  message: string,
  history: ChatMessage[],
): Promise<{ classified: ClassifiedIntent; parser: 'gemini' | 'groq' | 'offline' }> {
  // Try Gemini
  if (process.env.GOOGLE_API_KEY) {
    try {
      const classified = await classifyWithGemini(message, history);
      return { classified, parser: 'gemini' };
    } catch (err) {
      logger.warn('Chat: Gemini classification failed, trying Groq', { err });
    }
  }

  // Try Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const classified = await classifyWithGroq(message, history);
      return { classified, parser: 'groq' };
    } catch (err) {
      logger.warn('Chat: Groq classification failed, using offline', { err });
    }
  }

  // Offline fallback
  return { classified: classifyOffline(message), parser: 'offline' };
}

// ─── Intent Handlers ──────────────────────────────────────────────────────────

const RECORD_INTENTS = new Set([
  'record_expense', 'record_income', 'record_transfer', 'record_loan_lend', 'record_loan_borrow',
]);

function intentToActionType(intent: string): string {
  const map: Record<string, string> = {
    record_expense: 'expense',
    record_income: 'income',
    record_transfer: 'transfer',
    record_loan_lend: 'loan_lend',
    record_loan_borrow: 'loan_borrow',
  };
  return map[intent] ?? 'expense';
}

async function handleRecordIntent(
  userId: string,
  classified: ClassifiedIntent,
  conversationId: string,
): Promise<Omit<ChatResponse, 'conversationId' | 'parser'>> {
  const description = classified.description ?? classified.merchant ?? 'Expense';
  const category = await suggestCategory(userId, `${description} ${classified.merchant ?? ''}`);
  const amount = classified.amount ?? 0;
  const confidence = classified.confidence ?? 0.85;

  const typeName = intentToActionType(classified.intent);

  const reply = amount > 0
    ? `Got it! I'll record ₹${amount.toLocaleString('en-IN')} for "${description}" under ${category}. Please confirm below.`
    : `I couldn't extract the amount. Could you please repeat with the amount? (e.g., "I spent ₹500 on groceries")`;

  return {
    reply,
    intent: classified.intent,
    requiresConfirmation: amount > 0,
    action: amount > 0 ? {
      type: typeName,
      entities: {
        amount,
        category,
        description,
        merchant: classified.merchant ?? undefined,
        person: classified.person ?? undefined,
        date: classified.date ?? undefined,
        paymentMethod: classified.paymentMethod ?? undefined,
      },
      confidence,
      requiresConfirmation: true,
    } : undefined,
  };
}

async function handleQueryIntent(
  userId: string,
  classified: ClassifiedIntent,
): Promise<Omit<ChatResponse, 'conversationId' | 'parser'>> {
  const intent = (classified.queryType ?? 'SUM_EXPENSES') as QueryIntent;

  const params: QueryParams = {
    intent,
    category: classified.category ?? undefined,
    person: classified.person ?? undefined,
    keyword: classified.keyword ?? undefined,
    limit: classified.limit ?? undefined,
  };

  // Parse date strings if provided
  if (classified.startDate) params.startDate = new Date(classified.startDate);
  if (classified.endDate) params.endDate = new Date(classified.endDate);

  const result = await executeFinancialQuery(userId, params);

  return {
    reply: result.summary,
    intent: 'query',
    requiresConfirmation: false,
    transactions: result.transactions,
  };
}

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

  // AI quota enforcement
  const quota = await incrementAIUsage(userId);
  if (!quota.allowed) {
    audit({ event: 'ai.quota_exceeded', userId, meta: { current: quota.current, limit: quota.limit } });
    res.status(429).json({ error: 'Daily AI limit reached. Please try again tomorrow.', limit: quota.limit });
    return;
  }

  // Sanitise
  const { sanitized: cleanMessage, flagged } = sanitizeAIInput(message.trim());
  if (flagged) {
    audit({ event: 'ai.prompt_injection', userId, resource: 'chat', meta: { inputLength: message.length } });
    logger.warn('Prompt injection detected in chat input', { userId });
  }

  // Conversation context
  const conversationId = incomingConvId ?? `${userId}-${Date.now()}`;
  const history = getContext(conversationId);

  audit({ event: 'ai.chat_request', userId, meta: { conversationId } });

  let responsePayload: Omit<ChatResponse, 'conversationId' | 'parser'>;
  let parser: ChatResponse['parser'] = 'gemini';

  try {
    const { classified, parser: usedParser } = await classifyIntent(cleanMessage, history);
    parser = usedParser;

    if (RECORD_INTENTS.has(classified.intent)) {
      responsePayload = await handleRecordIntent(userId, classified, conversationId);
    } else if (classified.intent === 'query') {
      responsePayload = await handleQueryIntent(userId, classified);
    } else {
      responsePayload = {
        reply: "I'm your Kanaku financial assistant! You can say things like:\n• \"I spent ₹500 on groceries\"\n• \"How much did I spend this month?\"\n• \"What's my balance?\"\n• \"Who owes me money?\"",
        intent: 'out_of_scope',
        requiresConfirmation: false,
      };
    }
  } catch (err) {
    logger.error('Chat: failed to process message', { err, userId });
    responsePayload = {
      reply: 'Sorry, I had trouble understanding that. Please try again.',
      intent: 'error',
      requiresConfirmation: false,
    };
  }

  // Update context
  appendContext(conversationId, { role: 'user', content: cleanMessage, timestamp: Date.now() });
  appendContext(conversationId, { role: 'assistant', content: responsePayload.reply, timestamp: Date.now() });

  const response: ChatResponse = {
    conversationId,
    parser,
    ...responsePayload,
  };

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
